-- purge_retention + mark_kyc_purged (DATA-MODEL §16, P1-11): KYC files 30 days after the decision are
-- enqueued as kyc_purge (dispatcher deletes via the Storage API, then mark_kyc_purged); expired
-- operational rows are deleted; pg_cron job fs_purge is scheduled. service_role / cron only.
begin;
\ir ../_helpers.psql

select plan(25);

select results_eq($$select schedule, command from cron.job where jobname = 'fs_purge'$$,
  $$values ('30 19 * * *'::text, 'select public.purge_retention()'::text)$$,
  'pg_cron fs_purge at 02:30 Vietnam time');

-- ---- privileges ----
select tests.as_anon();
select throws_ok('select public.purge_retention()', '42501', null, 'anon has no EXECUTE on purge_retention');
select tests.authenticate_as('admin', 'aal2');
select throws_ok('select public.purge_retention()', '42501', null, 'authenticated (admin) has no EXECUTE on purge_retention');
select throws_ok('select public.mark_kyc_purged(gen_random_uuid())', '42501', null, 'authenticated has no EXECUTE on mark_kyc_purged');
select tests.clear_auth();

-- ---- KYC: approval sets purge_after; time travel 31 days; purge enqueues ----
update public.organizations set status = 'submitted', submitted_at = now() where id = tests.id('draft_c');
insert into public.org_documents (id, org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values ('dddddddd-0000-4000-8000-000000000001', tests.id('draft_c'), 'business_license',
        tests.id('draft_c') || '/business_license/44444444-4444-4444-8444-444444444441.pdf',
        'application/pdf', 1000, repeat('a', 64), tests.id('draft_owner'));
insert into storage.objects (bucket_id, name, owner_id)
values ('kyc', tests.id('draft_c') || '/business_license/44444444-4444-4444-8444-444444444441.pdf', tests.id('draft_owner')::text);
-- a document that is not due yet, and one already purged
insert into public.org_documents (id, org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by, purge_after, file_deleted_at)
values ('dddddddd-0000-4000-8000-000000000002', tests.id('store_a'), 'business_license', tests.id('store_a') || '/business_license/b.pdf',
        'application/pdf', 1000, repeat('b', 64), tests.id('store_owner'), now() + interval '60 days', null),
       ('dddddddd-0000-4000-8000-000000000003', tests.id('store_x'), 'business_license', tests.id('store_x') || '/business_license/c.pdf',
        'application/pdf', 1000, repeat('c', 64), tests.id('other_owner'), now() - interval '90 days', now() - interval '60 days');

select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.review_organization(%L, 'approve', null, gen_random_uuid())$$, tests.id('draft_c')),
  'admin approves draft_c (purge_after = now + 30 days)');
select tests.clear_auth();

select tests.as_service();
select is(public.purge_retention() ->> 'kyc_purge_enqueued', '0', 'nothing is due today');
select tests.clear_auth();

select set_config('fs.clock', (now() + interval '31 days')::text, true);
select tests.as_service();
select is(public.purge_retention() ->> 'kyc_purge_enqueued', '1', '31 days later the approved org document is enqueued');
select is(public.purge_retention() ->> 'kyc_purge_enqueued', '0', 'running again enqueues nothing new (dedupe)');
select tests.clear_auth();
select results_eq(
  $$select event, aggregate_id, payload from public.notification_outbox where event = 'kyc_purge'$$,
  $$values ('kyc_purge'::public.notification_event, 'dddddddd-0000-4000-8000-000000000001'::uuid,
            jsonb_build_object('document_id', 'dddddddd-0000-4000-8000-000000000001', 'bucket', 'kyc',
                               'path', tests.id('draft_c') || '/business_license/44444444-4444-4444-8444-444444444441.pdf'))$$,
  'kyc_purge job carries document id, bucket and path (no PII)');

-- ---- mark_kyc_purged ----
select tests.as_service();
select throws_ok($$select public.mark_kyc_purged('dddddddd-0000-4000-8000-000000000001')$$,
  'PT409', 'invalid_state', 'refused while the storage object still exists');
select throws_ok($$select public.mark_kyc_purged('dddddddd-0000-4000-8000-000000000002')$$,
  'PT409', 'invalid_state', 'refused before purge_after');
select throws_ok($$select public.mark_kyc_purged(gen_random_uuid())$$, 'PT404', 'not_found', 'unknown document');
select tests.clear_auth();

-- the dispatcher removes the object through the Storage API (simulated)
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'kyc'
   and name = tests.id('draft_c') || '/business_license/44444444-4444-4444-8444-444444444441.pdf';
select set_config('storage.allow_delete_query', 'false', true);

select tests.as_service();
select lives_ok($$select public.mark_kyc_purged('dddddddd-0000-4000-8000-000000000001')$$, 'service role marks it purged');
select lives_ok($$select public.mark_kyc_purged('dddddddd-0000-4000-8000-000000000001')$$, 'idempotent');
select tests.clear_auth();
select isnt((select file_deleted_at from public.org_documents where id = 'dddddddd-0000-4000-8000-000000000001'), null::timestamptz,
  'file_deleted_at set, metadata kept');
select results_eq(
  $$select actor_kind, count(*)::int from public.audit_logs where action = 'document.purge' group by actor_kind$$,
  $$values ('service'::text, 1)$$, 'purge audited once as service');
select tests.as_service();
select is(public.purge_retention() ->> 'kyc_purge_enqueued', '0', 'purged documents are not enqueued again');
select tests.clear_auth();
select set_config('fs.clock', '', true);

-- ---- operational retention ----
insert into public.rate_limits (key, window_start, count) values
  ('t:user:old', now() - interval '25 hours', 3), ('t:user:new', now() - interval '1 hour', 3);
insert into public.rpc_idempotency (client_op_id, actor_id, rpc_name, request_hash, response, created_at) values
  (gen_random_uuid(), tests.id('outsider'), 'old_rpc', repeat('a', 64), 'null', now() - interval '8 days'),
  (gen_random_uuid(), tests.id('outsider'), 'new_rpc', repeat('a', 64), 'null', now() - interval '1 day');
insert into public.notification_outbox (event, aggregate_type, aggregate_id, dedupe_key, status, created_at) values
  ('org_reviewed', 'organization', gen_random_uuid(), 't:old:done', 'done', now() - interval '91 days'),
  ('org_reviewed', 'organization', gen_random_uuid(), 't:old:pending', 'pending', now() - interval '91 days');
insert into public.org_change_requests (org_id, status, changes, previous, submitted_by, reviewed_at, review_note, client_op_id)
values (tests.id('store_x'), 'rejected', '{"tax_code":"0312345679"}', '{"tax_code":"0312345678"}', tests.id('other_owner'),
        now() - interval '13 months', 'cũ', gen_random_uuid());
update public.organizations set status = 'closed', closed_at = now() - interval '13 months' where id = tests.id('store_x');
insert into public.audit_logs (at, actor_kind, action, entity_type) values (now() - interval '25 months', 'system', 'test.old', 'test');

select tests.as_service();
select results_eq(
  $$select r ->> 'rate_limits', r ->> 'rpc_idempotency', r ->> 'notification_outbox', r ->> 'org_change_requests_scrubbed',
           r ->> 'org_sensitive_scrubbed', r ->> 'audit_logs'
    from (select public.purge_retention() as r) x$$,
  $$values ('1'::text, '1'::text, '1'::text, '1'::text, '1'::text, '1'::text)$$,
  'one expired row of each kind handled');
select tests.clear_auth();

select is((select array_agg(key order by key) from public.rate_limits where key like 't:user:%'), array['t:user:new'],
  'rate_limits older than 24 h deleted');
select is((select array_agg(rpc_name) from public.rpc_idempotency where rpc_name in ('old_rpc', 'new_rpc')), array['new_rpc'],
  'rpc_idempotency older than 7 days deleted');
select is((select array_agg(dedupe_key) from public.notification_outbox where dedupe_key like 't:old:%'), array['t:old:pending'],
  'only processed outbox rows older than 90 days are deleted');
select results_eq(
  $$select changes, previous from public.org_change_requests where org_id = tests.id('store_x')$$,
  $$values ('{"tax_code":null}'::jsonb, '{"tax_code":null}'::jsonb)$$,
  'change request values dropped after 12 months, keys kept');
select results_eq(
  $$select legal_name, tax_code, representative_id_last4, contact_email from public.org_sensitive where org_id = tests.id('store_x')$$,
  $$values (null::text, null::text, null::char(4), null::text)$$,
  'org_sensitive of an org closed > 12 months ago is wiped');
select is((select count(*)::int from public.audit_logs where action = 'test.old'), 0, 'audit rows older than 24 months deleted');
select results_eq($$select after from public.audit_logs where action = 'audit.purge'$$,
  $$values ('{"deleted":1}'::jsonb)$$, 'the audit purge is itself audited');

select * from finish();
rollback;

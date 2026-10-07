-- submit_org_change_request / review_org_change_request (DATA-MODEL §2.1, §6.8, TESTING §2.2):
-- org stays approved while pending; legal columns locked for direct UPDATE; approve applies the
-- values (new representative clears id_verified_*), reject keeps the old ones; one pending per org.
begin;
\ir ../_helpers.psql

select plan(37);

-- ======================= submit =======================
select tests.as_anon();
select throws_ok(format($$select public.submit_org_change_request(%L, '{"tax_code":"0312345679"}', null, gen_random_uuid())$$, tests.id('store_a')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.submit_org_change_request(%L, '{"tax_code":"0312345679"}', null, gen_random_uuid())$$, tests.id('store_a')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.submit_org_change_request(%L, '{"tax_code":"0312345679"}', null, gen_random_uuid())$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'manager cannot submit (owner only)');
select tests.authenticate_as('draft_owner');
select throws_ok(format($$select public.submit_org_change_request(%L, '{"tax_code":"0312345679"}', null, gen_random_uuid())$$, tests.id('draft_c')),
  'PT409', 'invalid_state', 'draft org edits legal fields directly, not by request');

select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.submit_org_change_request(%L, '{}', null, gen_random_uuid())$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'empty changes');
select is(tests.error_of(format($$select public.submit_org_change_request(%L, '{"contact_email":"a@b.vn","tax_code":"12"}', null, gen_random_uuid())$$, tests.id('store_a'))) ->> 'detail',
  '{"tax_code": "format", "contact_email": "not_allowed"}', 'non-legal key and bad tax code are reported');
select throws_ok(format($$select public.submit_org_change_request(%L, '{"legal_name": 5}', null, gen_random_uuid())$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'values must be strings');

-- direct UPDATE of a legal column of an approved org is blocked (trigger org_sensitive_lock)
select throws_ok(format($$update public.org_sensitive set tax_code = '0312345679' where org_id = %L$$, tests.id('store_a')),
  'PT409', 'invalid_state', 'direct legal-field UPDATE is blocked once approved');
select is(tests.affected(format($$update public.org_sensitive set contact_phone = '0909000111' where org_id = %L$$, tests.id('store_a'))),
  1::bigint, 'contact fields stay directly editable (no request)');

select lives_ok(format($$select public.submit_org_change_request(%L, '{"tax_code":" 0312345679 ","legal_name":"Công ty Bánh Mới"}',
                                                                'Đổi tên theo giấy phép mới', 'd0000000-0000-4000-8000-000000000001')$$,
                       tests.id('store_a')),
  'owner submits a change request');
select tests.clear_auth();

select results_eq(
  $$select status, changes, previous, reason, submitted_by, client_op_id from public.org_change_requests
    where org_id = tests.id('store_a')$$,
  $$values ('pending'::public.org_change_status,
            '{"tax_code":"0312345679","legal_name":"Công ty Bánh Mới"}'::jsonb,
            '{"tax_code":"0312345678","legal_name":"Công ty store_a"}'::jsonb,
            'Đổi tên theo giấy phép mới'::text, tests.id('store_owner'), 'd0000000-0000-4000-8000-000000000001'::uuid)$$,
  'pending request stores trimmed new values and a snapshot of the old ones');
select is((select status from public.organizations where id = tests.id('store_a')), 'approved'::public.org_status,
  'org stays approved while the request is pending');
select is((select tax_code from public.org_sensitive where org_id = tests.id('store_a')), '0312345678',
  'old value still in force');
select is((select count(*)::int from public.notification_outbox where event = 'org_change_submitted'), 1, 'outbox org_change_submitted');
select results_eq(
  $$select action, after from public.audit_logs where action = 'org.change_submit'$$,
  $$values ('org.change_submit'::text, '{"keys":["legal_name","tax_code"],"status":"pending"}'::jsonb)$$,
  'audited with keys only (no values)');

select tests.authenticate_as('store_owner');
select is(public.submit_org_change_request(tests.id('store_a'), '{"tax_code":" 0312345679 ","legal_name":"Công ty Bánh Mới"}',
                                           'Đổi tên theo giấy phép mới', 'd0000000-0000-4000-8000-000000000001'),
  (select id from public.org_change_requests where org_id = tests.id('store_a')),
  'replay returns the same request id');
select throws_ok(format($$select public.submit_org_change_request(%L, '{"registration_no":"GP-1"}', null, gen_random_uuid())$$, tests.id('store_a')),
  'PT409', 'invalid_state', 'only one pending request per org');
-- a document attached to the pending request
select lives_ok(format($$insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, change_request_id)
                         values (%1$L, 'business_license', %1$L || '/change/' || %2$L || '/f.pdf', 'application/pdf', 10, repeat('a', 64), %2$L)$$,
                       tests.id('store_a'), (select id from public.org_change_requests where org_id = tests.id('store_a'))),
  'owner attaches a document to the pending request');
select tests.clear_auth();

-- ======================= review =======================
select tests.as_anon();
select throws_ok($$select public.review_org_change_request(gen_random_uuid(), 'approve', null, gen_random_uuid())$$,
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('store_owner', 'aal2');
select throws_ok(format($$select public.review_org_change_request(%L, 'approve', null, gen_random_uuid())$$,
                        (select id from public.org_change_requests where org_id = tests.id('store_a'))),
  'PT403', 'not_authorized', 'owner cannot approve their own request');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.review_org_change_request(%L, 'approve', null, gen_random_uuid())$$,
                        (select id from public.org_change_requests where org_id = tests.id('store_a'))),
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.review_org_change_request(%L, 'reject', ' ', gen_random_uuid())$$,
                        (select id from public.org_change_requests where org_id = tests.id('store_a'))),
  'PT422', 'validation_failed', 'reject needs a note');
select throws_ok($$select public.review_org_change_request(gen_random_uuid(), 'approve', null, gen_random_uuid())$$,
  'PT404', 'not_found', 'unknown request => not_found');
select lives_ok(format($$select public.review_org_change_request(%L, 'approve', null, 'd0000000-0000-4000-8000-000000000002')$$,
                       (select id from public.org_change_requests where org_id = tests.id('store_a'))),
  'admin aal2 approves');
select lives_ok(format($$select public.review_org_change_request(%L, 'approve', null, 'd0000000-0000-4000-8000-000000000002')$$,
                       (select id from public.org_change_requests where org_id = tests.id('store_a'))),
  'replay is a no-op');
select throws_ok(format($$select public.review_org_change_request(%L, 'reject', 'muộn', gen_random_uuid())$$,
                        (select id from public.org_change_requests where org_id = tests.id('store_a'))),
  'PT409', 'invalid_state', 'a decided request cannot be reviewed again');
select tests.clear_auth();

select results_eq(
  $$select legal_name, tax_code from public.org_sensitive where org_id = tests.id('store_a')$$,
  $$values ('Công ty Bánh Mới'::text, '0312345679'::text)$$,
  'approved values applied to org_sensitive');
select results_eq(
  $$select status, reviewed_by, applied_at is not null from public.org_change_requests where org_id = tests.id('store_a')$$,
  $$values ('approved'::public.org_change_status, tests.id('admin'), true)$$,
  'request approved and applied');
select isnt((select purge_after from public.org_documents where change_request_id is not null), null::timestamptz,
  'attached document scheduled for purge');
select is((select count(*)::int from public.audit_logs where action = 'org.change_review'), 1, 'one review audit row');

-- ---- new representative clears id verification; reject keeps old values ----
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.verify_representative_id(%L, '1234', 'manual_document')$$, tests.id('store_a')),
  'admin verifies the representative');
select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.submit_org_change_request(%L, '{"representative_name":"Trần Thị B"}', null, gen_random_uuid())$$, tests.id('store_a')),
  'request to change the representative');
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.review_org_change_request(%L, 'approve', 'OK', gen_random_uuid())$$,
                       (select id from public.org_change_requests where org_id = tests.id('store_a') and status = 'pending')),
  'approve the new representative');
select tests.clear_auth();
select results_eq(
  $$select representative_name, id_verified_at, id_verified_by from public.org_sensitive where org_id = tests.id('store_a')$$,
  $$values ('Trần Thị B'::text, null::timestamptz, null::uuid)$$,
  'new representative => previous identity verification cleared');

select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.submit_org_change_request(%L, '{"registration_no":"GP-999"}', null, gen_random_uuid())$$, tests.id('store_a')),
  'another request');
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.review_org_change_request(%L, 'reject', 'Số giấy phép không khớp', gen_random_uuid())$$,
                       (select id from public.org_change_requests where org_id = tests.id('store_a') and status = 'pending')),
  'admin rejects with a note');
select tests.clear_auth();
select is((select registration_no from public.org_sensitive where org_id = tests.id('store_a')), null,
  'rejected request leaves org_sensitive unchanged');

select * from finish();
rollback;

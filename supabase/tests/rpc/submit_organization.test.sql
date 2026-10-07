-- submit_organization (DATA-MODEL §6.8, P1-08): owner only; draft|needs_changes -> submitted; needs an
-- active site, the mandatory document of the kind and an active terms consent; outbox + audit;
-- idempotent on client_op_id (UAT P1-16: double submit => one submission).
begin;
\ir ../_helpers.psql

select plan(21);

-- draft_c: draft store of draft_owner with active site_c. store_staff becomes its manager.
select tests.add_member('draft_c', 'store_staff', 'manager');

-- ---- privileges ----
select tests.as_anon();
select throws_ok($$select public.submit_organization(tests.id('draft_c'), gen_random_uuid())$$,
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok($$select public.submit_organization(tests.id('draft_c'), gen_random_uuid())$$,
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_owner');
select throws_ok($$select public.submit_organization(tests.id('draft_c'), gen_random_uuid())$$,
  'PT404', 'not_found', 'owner of another org => not_found');
select tests.authenticate_as('store_staff');
select throws_ok($$select public.submit_organization(tests.id('draft_c'), gen_random_uuid())$$,
  'PT403', 'not_authorized', 'manager cannot submit (owner only)');
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.submit_organization(tests.id('draft_c'), gen_random_uuid())$$,
  'PT403', 'not_authorized', 'admin cannot submit for the owner');

-- ---- preconditions ----
select tests.authenticate_as('draft_owner');
select is(tests.error_of(format('select public.submit_organization(%L, gen_random_uuid())', tests.id('draft_c'))),
  jsonb_build_object('sqlstate', 'PT422', 'message', 'validation_failed',
                     'detail', '{"consent": "terms", "documents": "business_license"}', 'hint', null),
  'missing document and terms consent are listed in detail');
select tests.clear_auth();

insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values (tests.id('draft_c'), 'food_safety_cert', tests.id('draft_c') || '/food_safety_cert/a.pdf',
        'application/pdf', 1000, repeat('a', 64), tests.id('draft_owner'));
select tests.authenticate_as('draft_owner');
select lives_ok($$select public.grant_consent('terms', '2026-10-v1', repeat('b', 64), 'web')$$, 'owner grants terms');
select throws_ok(format('select public.submit_organization(%L, gen_random_uuid())', tests.id('draft_c')),
  'PT422', 'validation_failed', 'a food safety cert alone is not enough for a store');
select tests.clear_auth();

insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values (tests.id('draft_c'), 'business_license', tests.id('draft_c') || '/business_license/b.pdf',
        'application/pdf', 1000, repeat('c', 64), tests.id('draft_owner'));

-- ---- happy path ----
select tests.authenticate_as('draft_owner');
select lives_ok(format($$select public.submit_organization(%L, 'b0000000-0000-4000-8000-000000000001')$$, tests.id('draft_c')),
  'owner submits');
select tests.clear_auth();
select results_eq(
  $$select status, submitted_at is not null from public.organizations where id = tests.id('draft_c')$$,
  $$values ('submitted'::public.org_status, true)$$,
  'draft -> submitted with submitted_at');
select results_eq(
  $$select event, aggregate_id, payload ->> 'kind' from public.notification_outbox where event = 'org_submitted'$$,
  $$values ('org_submitted'::public.notification_event, tests.id('draft_c'), 'store'::text)$$,
  'outbox org_submitted enqueued (ids only)');
select results_eq(
  $$select action, actor_id, before, after, client_op_id from public.audit_logs where action = 'org.submit'$$,
  $$values ('org.submit'::text, tests.id('draft_owner'), '{"status":"draft"}'::jsonb, '{"status":"submitted"}'::jsonb,
            'b0000000-0000-4000-8000-000000000001'::uuid)$$,
  'audited (org.submit)');

-- ---- idempotency + state machine ----
select tests.authenticate_as('draft_owner');
select lives_ok(format($$select public.submit_organization(%L, 'b0000000-0000-4000-8000-000000000001')$$, tests.id('draft_c')),
  'double submit with the same client_op_id is a no-op');
select throws_ok(format('select public.submit_organization(%L, gen_random_uuid())', tests.id('draft_c')),
  'PT409', 'invalid_state', 'a new submit of a submitted org => invalid_state');
select tests.clear_auth();
select is((select count(*)::int from public.audit_logs where action = 'org.submit'), 1, 'one audit row');
select is((select count(*)::int from public.notification_outbox where event = 'org_submitted'), 1, 'one outbox row');

select tests.authenticate_as('store_owner');
select throws_ok(format('select public.submit_organization(%L, gen_random_uuid())', tests.id('store_a')),
  'PT409', 'invalid_state', 'approved org cannot be submitted');
select tests.clear_auth();

-- ---- charity: needs establishment_decision or operating_license + a site; needs_changes -> submitted ----
select tests.create_org('ch_nc', 'charity', 'outsider', 'needs_changes');
select tests.authenticate_as('outsider');
select lives_ok($$select public.grant_consent('terms', '2026-10-v1', repeat('d', 64), 'web')$$, 'consent');
select is(tests.error_of(format('select public.submit_organization(%L, gen_random_uuid())', tests.id('ch_nc'))) ->> 'detail',
  '{"sites": "at_least_one_site", "documents": "establishment_decision_or_operating_license"}',
  'charity without site and legal document');
select tests.clear_auth();
select tests.create_site('ch_nc_site', 'ch_nc', 'hidden', 10.80, 106.65);
insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values (tests.id('ch_nc'), 'operating_license', tests.id('ch_nc') || '/operating_license/c.pdf',
        'application/pdf', 1000, repeat('e', 64), tests.id('outsider'));
select tests.authenticate_as('outsider');
select lives_ok(format('select public.submit_organization(%L, gen_random_uuid())', tests.id('ch_nc')),
  'needs_changes -> submitted after fixing');
select tests.clear_auth();
select is((select status from public.organizations where id = tests.id('ch_nc')), 'submitted'::public.org_status,
  'charity resubmitted');

select * from finish();
rollback;

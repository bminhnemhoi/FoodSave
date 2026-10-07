-- suspend_organization / reinstate_organization / close_organization (DATA-MODEL §6.8):
-- admin aal2 (not self) suspends/reinstates with a reason; owner or admin aal2 closes
-- approved|suspended orgs; pending change requests are rejected on close; idempotent; audited.
begin;
\ir ../_helpers.psql

select plan(30);

-- ======================= suspend =======================
select tests.as_anon();
select throws_ok(format($$select public.suspend_organization(%L, 'x', gen_random_uuid())$$, tests.id('store_a')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('store_owner', 'aal2');
select throws_ok(format($$select public.suspend_organization(%L, 'x', gen_random_uuid())$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'owner cannot suspend');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.suspend_organization(%L, 'x', gen_random_uuid())$$, tests.id('store_a')),
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.suspend_organization(%L, '', gen_random_uuid())$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'reason required');
select throws_ok(format($$select public.suspend_organization(%L, 'x', gen_random_uuid())$$, tests.id('draft_c')),
  'PT409', 'invalid_state', 'draft org cannot be suspended');
select lives_ok(format($$select public.suspend_organization(%L, 'Vi phạm an toàn thực phẩm', 'e0000000-0000-4000-8000-000000000001')$$,
                       tests.id('store_a')),
  'admin aal2 suspends');
select lives_ok(format($$select public.suspend_organization(%L, 'Vi phạm an toàn thực phẩm', 'e0000000-0000-4000-8000-000000000001')$$,
                       tests.id('store_a')),
  'replay is a no-op');
select throws_ok(format($$select public.suspend_organization(%L, 'lần 2', gen_random_uuid())$$, tests.id('store_a')),
  'PT409', 'invalid_state', 'already suspended');
select tests.clear_auth();

select is((select status from public.organizations where id = tests.id('store_a')), 'suspended'::public.org_status, 'suspended');
select results_eq(
  $$select a.reason, a.before, a.after from public.audit_logs a where a.action = 'org.suspend'$$,
  $$values ('Vi phạm an toàn thực phẩm'::text, '{"status":"approved"}'::jsonb, '{"status":"suspended"}'::jsonb)$$,
  'suspension audited once with the reason');
select is((select (payload ->> 'audit_id')::bigint from public.notification_outbox where event = 'org_suspended'),
  (select id from public.audit_logs where action = 'org.suspend'),
  'outbox org_suspended points to the audit row (reason stays out of the payload)');

-- suspended members lose access to approved-only data (helpers use status = approved)
select tests.authenticate_as('store_owner');
select is(private.is_active_org_member(tests.id('store_a')), false, 'suspended org is not active');
select tests.clear_auth();

-- ======================= reinstate =======================
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.reinstate_organization(%L, null, gen_random_uuid())$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'note required');
select throws_ok(format($$select public.reinstate_organization(%L, 'x', gen_random_uuid())$$, tests.id('store_x')),
  'PT409', 'invalid_state', 'approved org cannot be reinstated');
select lives_ok(format($$select public.reinstate_organization(%L, 'Đã khắc phục', gen_random_uuid())$$, tests.id('store_a')),
  'admin aal2 reinstates');
select tests.clear_auth();
select is((select status from public.organizations where id = tests.id('store_a')), 'approved'::public.org_status, 'approved again');
select is((select count(*)::int from public.notification_outbox where event = 'org_reinstated'), 1, 'outbox org_reinstated');

-- self-dealing
select tests.create_org('adm_org', 'store', 'admin');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.suspend_organization(%L, 'x', gen_random_uuid())$$, tests.id('adm_org')),
  'PT403', 'self_dealing', 'admin cannot suspend their own org');
select tests.clear_auth();

-- ======================= close =======================
insert into public.org_change_requests (org_id, changes, previous, submitted_by, client_op_id)
values (tests.id('store_x'), '{"legal_name":"Mới"}', '{"legal_name":"Cũ"}', tests.id('other_owner'), gen_random_uuid());

select tests.as_anon();
select throws_ok(format($$select public.close_organization(%L, gen_random_uuid())$$, tests.id('store_x')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.close_organization(%L, gen_random_uuid())$$, tests.id('store_x')),
  'PT404', 'not_found', 'owner of another org => not_found');
select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.close_organization(%L, gen_random_uuid())$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'manager cannot close');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.close_organization(%L, gen_random_uuid())$$, tests.id('store_x')),
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');
select tests.authenticate_as('draft_owner');
select throws_ok(format($$select public.close_organization(%L, gen_random_uuid())$$, tests.id('draft_c')),
  'PT409', 'invalid_state', 'draft org cannot be closed (only approved|suspended)');

select tests.authenticate_as('other_owner');
select lives_ok(format($$select public.close_organization(%L, 'e0000000-0000-4000-8000-000000000009')$$, tests.id('store_x')),
  'owner closes');
select lives_ok(format($$select public.close_organization(%L, 'e0000000-0000-4000-8000-000000000009')$$, tests.id('store_x')),
  'replay is a no-op');
select throws_ok(format($$select public.close_organization(%L, gen_random_uuid())$$, tests.id('store_x')),
  'PT409', 'invalid_state', 'already closed');
select tests.clear_auth();

select results_eq(
  $$select status, closed_at is not null from public.organizations where id = tests.id('store_x')$$,
  $$values ('closed'::public.org_status, true)$$,
  'closed with closed_at');
select results_eq(
  $$select status, review_note from public.org_change_requests where org_id = tests.id('store_x')$$,
  $$values ('rejected'::public.org_change_status, 'org_closed'::text)$$,
  'pending change request rejected with org_closed');
select is((select count(*)::int from public.audit_logs where action = 'org.close'), 1, 'close audited once');

select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.close_organization(%L, gen_random_uuid())$$, tests.id('charity_b')),
  'admin aal2 can close an org');
select tests.clear_auth();

select * from finish();
rollback;

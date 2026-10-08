-- resolve_incident (DATA-MODEL §2.3 incidents, §2.6 trust "phản ánh được xác nhận −5", §8.5): admin aal2,
-- not a member of either org; open → in_review → resolved (upheld, −5 subject) | dismissed.
begin;
\ir ../_helpers.psql

select plan(20);

select tests.make_offer('o1', 'site_a', 'bread', 10);
insert into public.incidents (id, kind, reporter_org_id, subject_org_id, offer_id, description, reported_by)
values ('c7000000-0000-4000-8000-000000000001', 'quality', tests.id('charity_b'), tests.id('store_a'), tests.id('o1'), 'Bánh bị mốc một phần', tests.id('charity_owner')),
       ('c7000000-0000-4000-8000-000000000002', 'conduct', tests.id('store_a'), tests.id('charity_b'), tests.id('o1'), 'Thái độ không phù hợp', tests.id('store_owner')),
       ('c7000000-0000-4000-8000-000000000003', 'other', tests.id('charity_b'), null, null, 'Ứng dụng chậm khi mở', tests.id('charity_owner'));
select tests.create_user('admin2');
select tests.make_admin('admin2');
select tests.add_member('store_a', 'admin2', 'staff');

-- ==== who may call ====
select tests.as_anon();
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'resolved', 'x', gen_random_uuid())$$, '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'resolved', 'x', gen_random_uuid())$$, 'PT403', 'not_authorized',
  'a member cannot resolve');
select tests.authenticate_as('admin', 'aal1');
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'resolved', 'x', gen_random_uuid())$$, 'PT403', 'mfa_required',
  'admin aal1: mfa_required');
select tests.authenticate_as('admin2', 'aal2');
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'resolved', 'x', gen_random_uuid())$$, 'PT403', 'self_dealing',
  'admin member of the subject org: self_dealing');

-- ==== validation ====
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', null, 'x', gen_random_uuid())$$, 'PT422', 'validation_failed',
  'NULL status refused');
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'open', 'x', gen_random_uuid())$$, 'PT422', 'validation_failed',
  'cannot re-open');
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'resolved', '  ', gen_random_uuid())$$, 'PT422', 'validation_failed',
  'resolution required to resolve');
select throws_ok($$select public.resolve_incident(gen_random_uuid(), 'in_review', null, gen_random_uuid())$$, 'PT404', 'not_found', 'unknown incident');

-- ==== open → in_review → resolved (upheld) ====
select lives_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'in_review', null, gen_random_uuid())$$, 'in review (no resolution needed)');
select lives_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'resolved', 'Cửa hàng xác nhận lô bị mốc; đã nhắc nhở', 'c7100000-0000-4000-8000-000000000001')$$,
  'resolved (upheld)');
select lives_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'resolved', 'Cửa hàng xác nhận lô bị mốc; đã nhắc nhở', 'c7100000-0000-4000-8000-000000000001')$$,
  'replay is a no-op');
select throws_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000001', 'in_review', null, gen_random_uuid())$$, 'PT409', 'invalid_state',
  'resolved is final');
select tests.clear_auth();
select results_eq($$select status::text, resolution, resolved_by, resolved_at is not null from public.incidents where id = 'c7000000-0000-4000-8000-000000000001'$$,
  format($$values ('resolved', 'Cửa hàng xác nhận lô bị mốc; đã nhắc nhở', %L::uuid, true)$$, tests.id('admin')), 'resolved fields');
select results_eq(format($$select delta, reason, ref_type from public.trust_events where org_id = %L$$, tests.id('store_a')),
  $$values (-5.00::numeric, 'incident_upheld', 'incident')$$, 'upheld: subject store −5 (incident_upheld)');
select is((select trust_score from public.organizations where id = tests.id('store_a')), 45.00::numeric, 'trust_score = 50 − 5');
select is((select count(*)::int from public.trust_events where ref_id = 'c7000000-0000-4000-8000-000000000001'), 1, 'replay did not double the penalty');
select results_eq($$select action, reason from public.audit_logs where entity_id = 'c7000000-0000-4000-8000-000000000001' order by id$$,
  $$values ('incident.resolve', null::text), ('incident.resolve', 'Cửa hàng xác nhận lô bị mốc; đã nhắc nhở')$$, 'both steps audited');

-- ==== dismissed: no penalty; no subject: nothing to apply ====
select tests.authenticate_as('admin', 'aal2');
select lives_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000002', 'dismissed', 'Không đủ căn cứ', gen_random_uuid())$$, 'dismissed');
select lives_ok($$select public.resolve_incident('c7000000-0000-4000-8000-000000000003', 'resolved', 'Đã sửa lỗi hiển thị', gen_random_uuid())$$,
  'resolved without a subject org');
select tests.clear_auth();
select is((select count(*)::int from public.trust_events where org_id = tests.id('charity_b')), 0, 'dismissed / no subject: no trust change');

select * from finish();
rollback;

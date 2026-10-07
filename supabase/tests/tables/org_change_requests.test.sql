-- org_change_requests: S owner/manager of the org + admin aal2; writes RPC only (§9.2).
begin;
\ir ../_helpers.psql

select plan(13);

select ok((select relrowsecurity from pg_class where oid = 'public.org_change_requests'::regclass), 'RLS enabled');
select policies_are('public', 'org_change_requests', array['org_change_requests_select']);

insert into public.org_change_requests (org_id, changes, previous, reason, submitted_by, client_op_id)
values (tests.id('store_a'), '{"legal_name":"Mới"}', '{"legal_name":"Cũ"}', 'Đổi tên pháp lý',
        tests.id('store_owner'), gen_random_uuid());

select tests.as_anon();
select throws_ok('select id from public.org_change_requests', '42501', null, 'anon: no access');
select tests.authenticate_as('store_owner');
select is((select count(*)::int from public.org_change_requests), 1, 'owner sees the request of their org');
select tests.authenticate_as('store_manager');
select is((select count(*)::int from public.org_change_requests), 1, 'manager sees it');
select tests.authenticate_as('store_staff');
select is_empty('select id from public.org_change_requests', 'staff: 0 rows');
select tests.authenticate_as('other_owner');
select is_empty('select id from public.org_change_requests', 'other org owner: 0 rows');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select id from public.org_change_requests', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.org_change_requests), 1, 'admin aal2 sees it');
select throws_ok($$update public.org_change_requests set status = 'approved'$$, '42501', null,
  'admin cannot decide by direct UPDATE (review RPC only)');

select tests.authenticate_as('store_owner');
select throws_ok(format($$insert into public.org_change_requests (org_id, changes, previous, submitted_by, client_op_id)
                          values (%L, '{}', '{}', auth.uid(), gen_random_uuid())$$, tests.id('store_a')),
  '42501', null, 'owner cannot insert directly (submit RPC only)');
select tests.clear_auth();

select throws_ok(format($$insert into public.org_change_requests (org_id, changes, previous, submitted_by, client_op_id)
                          values (%L, '{}', '{}', %L, gen_random_uuid())$$, tests.id('store_a'), tests.id('store_owner')),
  '23505', null, 'at most one pending request per org');
select throws_ok($$update public.org_change_requests set status = 'rejected', reviewed_by = tests.id('admin'), reviewed_at = now()$$,
  '23514', null, 'rejecting requires review_note (CHECK)');

select * from finish();
rollback;

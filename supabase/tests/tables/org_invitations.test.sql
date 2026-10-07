-- org_invitations: S owner/manager of approved org + admin aal2; token_hash never selectable;
-- writes RPC only (§9.2).
begin;
\ir ../_helpers.psql

select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.org_invitations'::regclass), 'RLS enabled');
select policies_are('public', 'org_invitations', array['org_invitations_select']);

insert into public.org_invitations (org_id, email, role, token_hash, invited_by)
values (tests.id('store_a'), 'moi@test.local', 'staff', extensions.digest('token-1', 'sha256'), tests.id('store_owner')),
       (tests.id('draft_c'), 'nhap@test.local', 'manager', extensions.digest('token-2', 'sha256'), tests.id('draft_owner'));

select tests.as_anon();
select throws_ok('select id from public.org_invitations', '42501', null, 'anon: no access');
select tests.authenticate_as('store_owner');
select results_eq('select email from public.org_invitations', $$values ('moi@test.local'::text)$$,
  'owner sees invitations of their approved org');
select throws_ok('select token_hash from public.org_invitations', '42501', null, 'token_hash is never selectable');
select throws_ok(format($$insert into public.org_invitations (org_id, email, role, token_hash, invited_by)
                          values (%L, 'x@test.local', 'owner', '\x00', auth.uid())$$, tests.id('store_a')),
  '42501', null, 'no direct INSERT (invite_member RPC)');
select tests.authenticate_as('store_manager');
select is((select count(*)::int from public.org_invitations), 1, 'manager sees them too');
select tests.authenticate_as('store_staff');
select is_empty('select id from public.org_invitations', 'staff: 0 rows');
select tests.authenticate_as('draft_owner');
select is_empty('select id from public.org_invitations', 'owner of a draft org (U): 0 rows');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select id from public.org_invitations', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.org_invitations), 2, 'admin aal2 sees all');
select tests.clear_auth();

select throws_ok(format($$insert into public.org_invitations (org_id, email, role, token_hash, invited_by)
                          values (%L, 'moi@test.local', 'manager', extensions.digest('token-3', 'sha256'), %L)$$,
                        tests.id('store_a'), tests.id('store_owner')),
  '23505', null, 'one open invitation per (org, email)');

select * from finish();
rollback;

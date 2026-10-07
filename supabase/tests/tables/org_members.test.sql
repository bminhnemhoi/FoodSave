-- org_members: S own rows / colleagues (owner/manager/staff of approved org) / admin aal2;
-- writes RPC only; invariants (volunteer only in charity, site_ids in org, ≥ 1 active owner).
begin;
\ir ../_helpers.psql

select plan(16);

select ok((select relrowsecurity from pg_class where oid = 'public.org_members'::regclass), 'RLS enabled');
select policies_are('public', 'org_members', array['org_members_select']);

select tests.as_anon();
select throws_ok('select user_id from public.org_members', '42501', null, 'anon: no access');
select tests.authenticate_as('outsider');
select is_empty('select user_id from public.org_members', 'user without org: 0 rows');
select tests.authenticate_as('draft_owner');
select results_eq('select user_id from public.org_members', $$values (tests.id('draft_owner'))$$,
  'draft org owner (U) sees only their own row');
select tests.authenticate_as('store_staff');
select is((select count(*)::int from public.org_members), 3, 'staff of approved org sees the 3 members of store_a');
select tests.authenticate_as('charity_volunteer');
select results_eq('select user_id from public.org_members', $$values (tests.id('charity_volunteer'))$$,
  'volunteer sees only their own row');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select user_id from public.org_members', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.org_members), 7, 'admin aal2 sees every membership');

select tests.authenticate_as('store_owner');
select throws_ok(format($$delete from public.org_members where org_id = %L and user_id = %L$$,
                        tests.id('store_a'), tests.id('store_staff')),
  '42501', null, 'owner cannot delete members directly (remove_member RPC)');
select tests.clear_auth();

-- ---- invariants (trigger, as postgres) ----
select throws_ok($$select tests.add_member('store_a', 'outsider', 'volunteer')$$,
  'PT422', 'validation_failed', 'volunteer role only for charities');
select throws_ok(format($$update public.org_members set site_ids = array[%L::uuid] where org_id = %L and user_id = %L$$,
                        tests.id('site_b'), tests.id('store_a'), tests.id('store_staff')),
  'PT422', 'validation_failed', 'site_ids must belong to the same org');
select lives_ok(format($$update public.org_members set site_ids = array[%L::uuid] where org_id = %L and user_id = %L$$,
                       tests.id('site_a'), tests.id('store_a'), tests.id('store_staff')),
  'site_ids of the same org are accepted');

set constraints public.org_members_owner_guard immediate;
select throws_ok(format($$update public.org_members set status = 'removed' where org_id = %L and user_id = %L$$,
                        tests.id('store_a'), tests.id('store_owner')),
  'PT409', 'invalid_state', 'cannot remove the last active owner');
select lives_ok(format($$update public.org_members set role = 'owner' where org_id = %1$L and user_id = %2$L;
                         update public.org_members set role = 'manager' where org_id = %1$L and user_id = %3$L$$,
                       tests.id('store_a'), tests.id('store_manager'), tests.id('store_owner')),
  'ownership can be transferred (new owner first)');
select is((select count(*)::int from public.org_members where org_id = tests.id('store_a') and role = 'owner'), 1,
  'store_a still has exactly one owner');

select * from finish();
rollback;

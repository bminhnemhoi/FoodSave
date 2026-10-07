-- site_closures: S whenever the parent site is visible; I/U/D owner/manager of the approved org
-- with access to the site (private.can_access_site).
begin;
\ir ../_helpers.psql

select plan(11);

select ok((select relrowsecurity from pg_class where oid = 'public.site_closures'::regclass), 'RLS enabled');
select policies_are('public', 'site_closures', array['site_closures_select', 'site_closures_insert_owner_manager',
                                                     'site_closures_update_owner_manager', 'site_closures_delete_owner_manager']);

select tests.authenticate_as('store_manager');
select lives_ok(format($$insert into public.site_closures (site_id, closed_on, reason) values (%L, '2026-10-20', 'Nghỉ lễ')$$, tests.id('site_a')),
  'manager adds a closure day');
select tests.authenticate_as('store_staff');
select throws_ok(format($$insert into public.site_closures (site_id, closed_on) values (%L, '2026-10-21')$$, tests.id('site_a')),
  '42501', null, 'staff cannot add closures');
select tests.authenticate_as('other_owner');
select throws_ok(format($$insert into public.site_closures (site_id, closed_on) values (%L, '2026-10-21')$$, tests.id('site_a')),
  '42501', null, 'owner of another org cannot add closures');
select tests.authenticate_as('draft_owner');
select throws_ok(format($$insert into public.site_closures (site_id, closed_on) values (%L, '2026-10-21')$$, tests.id('site_c')),
  '42501', null, 'draft org (not approved) cannot add closures');
select tests.clear_auth();

-- manager restricted to another site
update public.org_members set site_ids = array[tests.id('site_a_off')]
where org_id = tests.id('store_a') and user_id = tests.id('store_manager');
select tests.authenticate_as('store_manager');
select throws_ok(format($$insert into public.site_closures (site_id, closed_on) values (%L, '2026-10-22')$$, tests.id('site_a')),
  '42501', null, 'manager without access to that site cannot add closures');

select tests.as_anon();
select is((select count(*)::int from public.site_closures), 1, 'anon sees closures of visible sites');

select tests.authenticate_as('store_owner');
select is(tests.affected($$update public.site_closures set reason = 'Bảo trì'$$), 1::bigint, 'owner updates a closure');
select is(tests.affected($$delete from public.site_closures$$), 1::bigint, 'owner deletes a closure');
select tests.authenticate_as('outsider');
select is(tests.affected($$delete from public.site_closures$$), 0::bigint, 'unrelated user deletes nothing');
select tests.clear_auth();

select * from finish();
rollback;

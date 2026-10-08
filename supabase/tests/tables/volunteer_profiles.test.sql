-- volunteer_profiles (DATA-MODEL §2.1, §9.2, §9.4; SECURITY-PRIVACY §2.3 "nơi ở của TNV"; ROADMAP P3-08)
-- RLS: own row S/I/U; coordinators (owner/manager/staff) of an approved charity the volunteer belongs
-- to read it; admin aal2 reads all; stores / other orgs / anon never. base_area always snapped 0.01°.
begin;
\ir ../_helpers.psql

select plan(29);

select ok((select relrowsecurity from pg_class where oid = 'public.volunteer_profiles'::regclass), 'RLS enabled');
select policies_are('public', 'volunteer_profiles',
  array['volunteer_profiles_select', 'volunteer_profiles_insert_own', 'volunteer_profiles_update_own']);
select ok(not has_table_privilege('anon', 'public.volunteer_profiles', 'SELECT')
          and not has_table_privilege('authenticated', 'public.volunteer_profiles', 'DELETE')
          and not has_column_privilege('authenticated', 'public.volunteer_profiles', 'user_id', 'UPDATE')
          and not has_column_privilege('authenticated', 'public.volunteer_profiles', 'user_id', 'INSERT')
          and not has_column_privilege('authenticated', 'public.volunteer_profiles', 'created_at', 'UPDATE')
          and has_column_privilege('authenticated', 'public.volunteer_profiles', 'capacity_kg', 'UPDATE')
          and has_column_privilege('authenticated', 'public.volunteer_profiles', 'base_area', 'INSERT'),
  'allow-list grants: no anon, no delete, user_id/created_at never writable');
select has_index('public', 'volunteer_profiles', 'volunteer_profiles_base_area_gix', 'GIST index on base_area (§3)');

select tests.create_user('charity_staff');
select tests.add_member('charity_b', 'charity_staff', 'staff');
select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_user('vz');
select tests.add_member('charity_z', 'vz', 'volunteer');
select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_user('vp');
select tests.add_member('charity_p', 'vp', 'volunteer');
select tests.create_user('v_removed');
select tests.add_member('charity_b', 'v_removed', 'volunteer', 'removed');

insert into public.volunteer_profiles (user_id, vehicle, capacity_kg, base_area, base_area_label)
values (tests.id('charity_volunteer'), 'motorbike', 25,
        extensions.st_setsrid(extensions.st_makepoint(106.693, 10.7762), 4326)::extensions.geography, 'Phường Bàn Cờ'),
       (tests.id('vz'), 'bicycle', 10, null, null),
       (tests.id('vp'), 'car', 100, null, null),
       (tests.id('v_removed'), 'on_foot', 5, null, null);

select results_eq(format($$select extensions.st_y(base_area::extensions.geometry), extensions.st_x(base_area::extensions.geometry)
                           from public.volunteer_profiles where user_id = %L$$, tests.id('charity_volunteer')),
  $$values (10.78::float8, 106.69::float8)$$, 'base_area snapped to the 0.01° grid (~1.1 km), whatever the write path');

create view tests.my_vp with (security_invoker = true) as
  select (select n.name from tests.ids n where n.id = v.user_id) as who from public.volunteer_profiles v;
grant select on tests.my_vp to anon, authenticated;

select tests.as_anon();
select throws_ok('select user_id from public.volunteer_profiles', '42501', null, 'anon: no access');
select tests.authenticate_as('charity_volunteer');
select set_eq('select who from tests.my_vp', array['charity_volunteer'], 'volunteer: own row only (not other volunteers)');
select tests.authenticate_as('charity_owner');
select set_eq('select who from tests.my_vp', array['charity_volunteer'], 'charity owner: volunteers of the org (active members only)');
select tests.authenticate_as('charity_staff');
select set_eq('select who from tests.my_vp', array['charity_volunteer'], 'charity staff (coordinator) too');
select tests.authenticate_as('ch2_owner');
select set_eq('select who from tests.my_vp', array['vz'], 'another charity: only its own volunteers');
select tests.authenticate_as('pending_owner');
select is_empty('select who from tests.my_vp', 'unapproved charity: nothing (B8)');
select tests.authenticate_as('store_owner');
select is_empty('select who from tests.my_vp', 'store: nothing');
select tests.authenticate_as('outsider');
select is_empty('select who from tests.my_vp', 'outsider: nothing');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select who from tests.my_vp', 'admin aal1: nothing');
select tests.authenticate_as('admin', 'aal2');
select set_eq('select who from tests.my_vp', array['charity_volunteer', 'vz', 'vp', 'v_removed'], 'admin aal2: all');

-- writes: own row only, allow-listed columns
select tests.authenticate_as('outsider');
select lives_ok($$insert into public.volunteer_profiles (vehicle, capacity_kg, base_area)
                  values ('bicycle', 8, extensions.st_setsrid(extensions.st_makepoint(106.70123, 10.77777), 4326)::extensions.geography)$$,
  'any user creates their own profile (user_id = auth.uid() by default)');
select results_eq($$select vehicle::text, capacity_kg, extensions.st_astext(base_area::extensions.geometry) from public.volunteer_profiles$$,
  $$values ('bicycle', 8.0::numeric, 'POINT(106.7 10.78)')$$, 'own row readable; area snapped');
select throws_ok(format($$insert into public.volunteer_profiles (user_id, vehicle) values (%L, 'car')$$, tests.id('admin')),
  '42501', null, 'cannot create a profile for someone else (user_id not insertable)');
select is(tests.affected($$update public.volunteer_profiles set capacity_kg = 12$$), 1::bigint, 'own row updatable');
select tests.authenticate_as('charity_owner');
select is(tests.affected(format($$update public.volunteer_profiles set capacity_kg = 499 where user_id = %L$$, tests.id('charity_volunteer'))),
  0::bigint, 'coordinators read but never edit a volunteer profile');
select throws_ok('delete from public.volunteer_profiles', '42501', null, 'no DELETE grant');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$update public.volunteer_profiles set user_id = %L$$, tests.id('outsider')), '42501', null,
  'user_id is not updatable');
select tests.clear_auth();

select throws_ok(format($$insert into public.volunteer_profiles (user_id, capacity_kg) values (%L, 0)$$, tests.id('store_owner')),
  '23514', null, 'capacity_kg 1–500');
select throws_ok(format($$insert into public.volunteer_profiles (user_id, base_area_label) values (%L, %L)$$, tests.id('store_owner'), repeat('x', 121)),
  '23514', null, 'base_area_label ≤ 120');
select throws_ok(format($$insert into public.volunteer_profiles (user_id, availability_note) values (%L, %L)$$, tests.id('store_owner'), repeat('x', 301)),
  '23514', null, 'availability_note ≤ 300');
select results_eq(format($$select vehicle::text, capacity_kg from public.volunteer_profiles where user_id = %L$$, tests.id('outsider')),
  $$values ('bicycle', 12.0::numeric)$$, 'defaults + own update kept');
select ok((select updated_at >= created_at from public.volunteer_profiles where user_id = tests.id('outsider')), 'updated_at maintained');

-- profile deleted with the account (cascade from profiles)
select tests.create_user('v_lone');
insert into public.volunteer_profiles (user_id) values (tests.id('v_lone'));
delete from auth.users where id = tests.id('v_lone');
select is((select count(*)::int from public.volunteer_profiles where user_id = tests.id('v_lone')), 0, 'deleted with the account');
select is((select count(*)::int from public.volunteer_profiles where user_id = tests.id('charity_volunteer')), 1, 'others untouched');

select * from finish();
rollback;

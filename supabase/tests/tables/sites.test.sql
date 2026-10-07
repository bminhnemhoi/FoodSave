-- sites: RLS matrix, column grants hiding exact location/address, generated public columns.
begin;
\ir ../_helpers.psql

select plan(20);

select ok((select relrowsecurity from pg_class where oid = 'public.sites'::regclass), 'RLS enabled');
select policies_are('public', 'sites', array['sites_select_anon', 'sites_select']);
select hasnt_column('public', 'sites', 'district', 'no district column (2-level administration)');
select has_index('public', 'sites', 'sites_location_gix', 'GIST index on location');
select is((select am.amname::text from pg_class c join pg_am am on am.oid = c.relam
           where c.oid = 'public.sites_public_location_gix'::regclass), 'gist', 'public_location index is GIST');
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'sites' and grantee = 'anon' and privilege_type = 'SELECT'$$,
  array['id', 'org_id', 'name', 'ward', 'city', 'public_location', 'public_address', 'visibility', 'is_active'],
  'anon SELECT columns are the public ones');
select is_empty(
  $$select column_name from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'sites' and grantee in ('anon', 'authenticated')
      and column_name in ('location', 'address_line')$$,
  'location / address_line granted to nobody');

-- ---- generated public columns ----
select is((select public_location from public.sites where id = tests.id('site_x')), null,
  'hidden: public_location is null');
select ok((select extensions.st_distance(public_location, location) between 1 and 600
           from public.sites where id = tests.id('site_b')),
  'approximate: public_location is snapped (moved, but < 600 m)');
select ok((select extensions.st_equals(public_location::extensions.geometry, location::extensions.geometry)
           from public.sites where id = tests.id('site_a')),
  'public: public_location = location');
select is((select public_address from public.sites where id = tests.id('site_b')),
  'Phường Bến Thành, Thành phố Hồ Chí Minh', 'approximate: public_address = ward, city');
select is((select public_address from public.sites where id = tests.id('site_a')),
  '12 Hẻm 34 Lê Lợi', 'public: public_address = address_line');

-- ---- SELECT ----
select tests.as_anon();
select set_eq('select id from public.sites',
  $$values (tests.id('site_a')), (tests.id('site_b')), (tests.id('site_x'))$$,
  'anon: active sites of approved orgs only (no draft org, no inactive site)');
select tests.authenticate_as('outsider');
select is((select count(*)::int from public.sites), 3, 'unrelated user: same as anon');
select tests.authenticate_as('draft_owner');
select is((select count(*)::int from public.sites), 4, 'draft owner also sees own draft-org site');
select tests.authenticate_as('store_staff');
select ok(exists (select 1 from public.sites where id = tests.id('site_a_off')), 'member sees own inactive site');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.sites), 5, 'admin aal2 sees all sites');

-- ---- writes: RPC only ----
select tests.authenticate_as('store_owner');
select throws_ok(format($$update public.sites set name = 'Đổi tên' where id = %L$$, tests.id('site_a')),
  '42501', null, 'owner cannot UPDATE sites directly (upsert_site RPC)');
select throws_ok(format($$insert into public.sites (org_id, name, address_line, location)
                          values (%L, 'Mới', 'x', 'SRID=4326;POINT(106.7 10.77)')$$, tests.id('store_a')),
  '42501', null, 'owner cannot INSERT sites directly');
select throws_ok(format($$delete from public.sites where id = %L$$, tests.id('site_a')),
  '42501', null, 'owner cannot DELETE sites');
select tests.clear_auth();

select * from finish();
rollback;

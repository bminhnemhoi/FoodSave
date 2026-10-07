-- get_site_location (DATA-MODEL §8.2, C6, P1-05): exact pin/address only for members of the site's
-- org and admin aal2; everyone else gets not_found (hidden/approximate never leak).
begin;
\ir ../_helpers.psql

select plan(11);

select tests.as_anon();
select throws_ok(format('select * from public.get_site_location(%L)', tests.id('site_x')), '42501', null, 'anon has no EXECUTE');

select tests.authenticate_as('outsider');
select throws_ok(format('select * from public.get_site_location(%L)', tests.id('site_b')), 'PT404', 'not_found',
  'unrelated user cannot read an approximate site');
select tests.authenticate_as('store_owner');
select throws_ok(format('select * from public.get_site_location(%L)', tests.id('site_x')), 'PT404', 'not_found',
  'another store cannot read a hidden site');
select throws_ok(format('select * from public.get_site_location(%L)', tests.id('site_b')), 'PT404', 'not_found',
  'a store without a running allocation cannot read the charity pin');
select tests.authenticate_as('charity_owner');
select throws_ok(format('select * from public.get_site_location(%L)', tests.id('site_x')), 'PT404', 'not_found',
  'a charity cannot read a hidden store site');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format('select * from public.get_site_location(%L)', tests.id('site_x')), 'PT404', 'not_found', 'admin aal1');
select throws_ok('select * from public.get_site_location(gen_random_uuid())', 'PT404', 'not_found', 'unknown site');

select tests.authenticate_as('other_owner');
select results_eq(format('select round(lat::numeric, 6), round(lng::numeric, 6), address_line from public.get_site_location(%L)', tests.id('site_x')),
  $$values (10.776889::numeric, 106.700806::numeric, '12 Hẻm 34 Lê Lợi'::text)$$,
  'owner reads the exact pin of their hidden site');
select tests.authenticate_as('charity_volunteer');
select results_eq(format('select round(lat::numeric, 6), round(lng::numeric, 6) from public.get_site_location(%L)', tests.id('site_b')),
  $$values (10.762622::numeric, 106.660172::numeric)$$,
  'volunteer of the charity reads its receiving point');
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format('select * from public.get_site_location(%L)', tests.id('site_x')), 'admin aal2 reads any site');

select tests.authenticate_as('store_owner');
select throws_ok('select location from public.sites', '42501', null, 'sites.location is still not selectable directly');
select tests.clear_auth();

select * from finish();
rollback;

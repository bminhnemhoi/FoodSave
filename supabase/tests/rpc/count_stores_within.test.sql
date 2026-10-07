-- count_stores_within (P1-05, DATA-MODEL §8.2): active sites of approved stores (same is_demo) within
-- the radius of a site, geodesic ST_DWithin; members of the site's org and admin aal2 only.
-- Reference point in former Bình Dương (11.00, 106.65), > 20 km from the shared fixture sites.
-- 1° of latitude ≈ 110.6 km there: +0.01° ≈ 1.1 km, +0.03° ≈ 3.3 km, +0.06° ≈ 6.6 km.
begin;
\ir ../_helpers.psql

select plan(17);

select tests.create_user('cs_owner');
select tests.create_org('cs_charity', 'charity', 'cs_owner');
select tests.create_site('cs_site', 'cs_charity', 'approximate', 11.00, 106.65);

select tests.create_org('cs_store1', 'store', 'cs_owner');
select tests.create_org('cs_store2', 'store', 'cs_owner');
select tests.create_site('cs_s1', 'cs_store1', 'public', 11.01, 106.65);   -- ~1.1 km
select tests.create_site('cs_s2', 'cs_store1', 'public', 11.03, 106.65);   -- ~3.3 km (same store, 2nd branch)
select tests.create_site('cs_s3', 'cs_store2', 'hidden', 11.06, 106.65);   -- ~6.6 km (hidden still counts)
-- noise that must never be counted (all within 1 km)
select tests.create_org('cs_draft', 'store', 'cs_owner', 'draft');
select tests.create_site('cs_n1', 'cs_draft', 'public', 11.002, 106.65);   -- store not approved
select tests.create_site('cs_n2', 'cs_store1', 'public', 11.003, 106.65, false); -- inactive site
select tests.create_org('cs_other_ch', 'charity', 'cs_owner');
select tests.create_site('cs_n3', 'cs_other_ch', 'public', 11.004, 106.65); -- a charity, not a store
select tests.create_org('cs_demo', 'store', 'cs_owner');
update public.organizations set is_demo = true where id = tests.id('cs_demo');
select tests.create_site('cs_n4', 'cs_demo', 'public', 11.005, 106.65);    -- demo store vs real charity

-- distances are what the comments say (geodesic)
select ok((select extensions.st_distance(a.location, b.location) between 1100 and 1112
           from public.sites a, public.sites b where a.id = tests.id('cs_site') and b.id = tests.id('cs_s1')), 'cs_s1 ≈ 1.1 km');
select ok((select extensions.st_distance(a.location, b.location) between 3310 and 3330
           from public.sites a, public.sites b where a.id = tests.id('cs_site') and b.id = tests.id('cs_s2')), 'cs_s2 ≈ 3.3 km');
select ok((select extensions.st_distance(a.location, b.location) between 6620 and 6650
           from public.sites a, public.sites b where a.id = tests.id('cs_site') and b.id = tests.id('cs_s3')), 'cs_s3 ≈ 6.6 km');

-- ---- privileges ----
select tests.as_anon();
select throws_ok(format('select public.count_stores_within(%L, 5)', tests.id('cs_site')), '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select public.count_stores_within(%L, 5)', tests.id('cs_site')), 'PT404', 'not_found', 'unrelated user');
select tests.authenticate_as('store_owner');
select throws_ok(format('select public.count_stores_within(%L, 5)', tests.id('cs_site')), 'PT404', 'not_found', 'member of another org');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format('select public.count_stores_within(%L, 5)', tests.id('cs_site')), 'PT404', 'not_found', 'admin aal1');

-- ---- counts ----
select tests.authenticate_as('cs_owner');
select is(public.count_stores_within(tests.id('cs_site'), 0.5), 0, '0.5 km: none (noise excluded)');
select is(public.count_stores_within(tests.id('cs_site'), 1.0), 0, '1 km: none (1.1 km is outside)');
select is(public.count_stores_within(tests.id('cs_site'), 2.0), 1, '2 km: 1');
select is(public.count_stores_within(tests.id('cs_site'), 5.0), 2, '5 km: 2 (branches count separately)');
select is(public.count_stores_within(tests.id('cs_site'), 8.0), 3, '8 km: 3 (hidden store site counts)');
select is(public.count_stores_within(tests.id('cs_site'), 20), 3, '20 km: fixture stores ~25 km away are still outside');
select throws_ok(format('select public.count_stores_within(%L, 0.4)', tests.id('cs_site')), 'PT422', 'validation_failed', 'radius < 0.5');
select throws_ok(format('select public.count_stores_within(%L, 31)', tests.id('cs_site')), 'PT422', 'validation_failed', 'radius > 30');

select tests.authenticate_as('admin', 'aal2');
select is(public.count_stores_within(tests.id('cs_site'), 8), 3, 'admin aal2 can count');

-- draft charity member (onboarding wizard) can use it on their own site
select tests.authenticate_as('draft_owner');
select ok(public.count_stores_within(tests.id('site_c'), 1) >= 2,
  'draft org member counts approved store sites around their pin (site_a, site_x; not inactive site_a_off)');
select tests.clear_auth();

select * from finish();
rollback;

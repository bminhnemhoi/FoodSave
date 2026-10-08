-- marketplace_offers (DATA-MODEL §4.7, §8.3; PRD US-CHA-05/06/07; B8). Only feasible open lots of
-- approved, unpaused stores (same is_demo) inside the receiving radius and accepted categories;
-- store coordinates are public_location only. The shared local DB may hold other open lots, so
-- assertions are restricted to the fixture lots.
begin;
\ir ../_helpers.psql

select plan(26);

-- extra stores: approximate site 2 km away, a far store (~23 km), a paused store, a demo store
select tests.create_user('appr_owner');
select tests.create_org('store_appr', 'store', 'appr_owner');
select tests.create_site('site_appr', 'store_appr', 'approximate', 10.7712, 106.6781);
select tests.create_user('far_owner');
select tests.create_org('store_far', 'store', 'far_owner');
select tests.create_site('site_far', 'store_far', 'public', 10.95, 106.80);
select tests.create_user('paused_owner');
select tests.create_org('store_paused', 'store', 'paused_owner');
select tests.create_site('site_paused', 'store_paused', 'public', 10.7712, 106.6781);
update public.organizations set is_paused = true where id = tests.id('store_paused');
select tests.create_user('demo_owner');
select tests.create_org('store_demo', 'store', 'demo_owner');
select tests.create_site('site_demo', 'store_demo', 'public', 10.7712, 106.6781);
update public.organizations set is_demo = true where id = tests.id('store_demo');
select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_p', 'charity_p', 'approximate', 10.762622, 106.660172);

-- lots (cooked bread): green (window 14 h), red (2 h left), red but unreachable (20 min left)
select tests.make_offer('m_green', 'site_a', 'bread', 10, now() - interval '5 minutes', now() + interval '14 hours', now() + interval '2 days');
select tests.make_offer('m_red', 'site_appr', 'bread', 10, now() - interval '5 minutes', now() + interval '2 hours');
select tests.make_offer('m_red_far_in_time', 'site_a', 'bread', 10, now() - interval '1 hour', now() + interval '20 minutes');
select tests.make_offer('m_hidden', 'site_x', 'vegetables', 5, now() - interval '5 minutes', now() + interval '10 hours');
select tests.make_offer('m_far', 'site_far', 'bread', 10);
select tests.make_offer('m_paused', 'site_paused', 'bread', 10);
select tests.make_offer('m_demo', 'site_demo', 'bread', 10);
select tests.make_offer('m_draft', 'site_a', 'bread', 10, p_status => 'draft');
select tests.make_offer('m_full', 'site_a', 'bread', 2);
select tests.request('charity_owner', tests.id('m_full'), 2);

create view tests.market with (security_invoker = true) as
  select i.name, m.*
  from public.marketplace_offers(tests.id('site_b')) m
  join tests.ids i on i.id = m.offer_id;
grant select on tests.market to authenticated;
create function tests.market_names(p_labels public.freshness_label[] default null, p_max_km numeric default null,
                                   p_max_travel_min integer default null, p_categories text[] default null)
returns setof text language sql as $$
  select i.name from public.marketplace_offers(tests.id('site_b'), p_labels, p_max_km, p_max_travel_min, p_categories) m
  join tests.ids i on i.id = m.offer_id;
$$;
grant execute on function tests.market_names(public.freshness_label[], numeric, integer, text[]) to authenticated;

-- ---- who may call (B8) ----
select tests.as_anon();
select throws_ok(format($$select * from public.marketplace_offers(%L)$$, tests.id('site_b')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select * from public.marketplace_offers(%L)$$, tests.id('site_b')), 'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select * from public.marketplace_offers(%L)$$, tests.id('site_b')), 'PT404', 'not_found',
  'a store cannot browse as a charity');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select * from public.marketplace_offers(%L)$$, tests.id('site_b')), 'PT403', 'not_authorized',
  'volunteer cannot browse the marketplace');
select tests.authenticate_as('pending_owner');
select is_empty(format($$select 1 from public.marketplace_offers(%L)$$, tests.id('site_p')),
  'B8: a submitted charity gets an empty marketplace');

-- ---- content ----
select tests.authenticate_as('charity_owner');
select set_eq('select name from tests.market', array['m_green', 'm_red', 'm_hidden'],
  'only feasible open lots of approved, unpaused, same-demo stores inside the radius');
select is((select array_agg(i.name order by m.ordinality)
           from public.marketplace_offers(tests.id('site_b')) with ordinality m join tests.ids i on i.id = m.offer_id),
  array['m_red', 'm_hidden', 'm_green'], 'ordered red → yellow → green (then distance)');
select results_eq($$select label::text, distance_km, travel_min from tests.market where name = 'm_green'$$,
  $$values ('green'::text, 4.7::numeric, 32::numeric)$$, 'm_green: label, distance 4.7 km, ≈32 min (×1.4 ÷ 18 km/h + 10)');
select results_eq($$select site_lat, site_lng, site_is_approximate, store_name from tests.market where name = 'm_green'$$,
  $$values (10.776889::float8, 106.700806::float8, false, 'Org store_a'::text)$$, 'public store site: exact public pin');
select ok((select site_is_approximate and abs(site_lat - 10.77) < 1e-9 and abs(site_lng - 106.68) < 1e-9
           from tests.market where name = 'm_red'),
  'approximate store site: snapped grid point, never the exact pin');
select results_eq($$select site_lat, site_lng from tests.market where name = 'm_hidden'$$,
  $$values (null::float8, null::float8)$$, 'hidden store site: no coordinates');
select ok((select distance_km = round(distance_km) and distance_km >= 1 and travel_min % 5 = 0
                   and extract(epoch from eta_pickup)::bigint % 300 = 0
           from tests.market where name = 'm_hidden'),
  'hidden store site: distance in whole km, travel and ETA in 5-min steps (no triangulation)');
select ok((select distance_km <> round(distance_km) or travel_min % 5 <> 0 from tests.market where name = 'm_green') is not null,
  'public store site keeps precise distance');
select ok((select eta_pickup >= now() and qty_available = 10 and unit::text = 'loaf' from tests.market where name = 'm_green'),
  'eta_pickup and quantities returned');

-- ---- filters ----
select set_eq($$select tests.market_names('{red}')$$, array['m_red', 'm_hidden'], 'filter: labels (fresh vegetables 10 h left are red too)');
select set_eq($$select tests.market_names(null, 3)$$, array['m_red'], 'filter: ≤ 3 km');
select set_eq($$select tests.market_names(null, null, 25)$$, array['m_red'], 'filter: ≤ 25 travel minutes');
select set_eq($$select tests.market_names(null, null, null, '{vegetables}')$$, array['m_hidden'], 'filter: categories');
select throws_ok($$select tests.market_names(null, 0)$$, 'PT422', 'validation_failed', 'p_max_km must be > 0');

-- receiving site settings: accepted categories and radius
select tests.clear_auth();
update public.sites set accepted_categories = '{bread}' where id = tests.id('site_b');
select tests.authenticate_as('charity_owner');
select set_eq('select name from tests.market', array['m_green', 'm_red'], 'accepted_categories of the receiving site applied');
select tests.clear_auth();
update public.sites set accepted_categories = null, radius_km = 3 where id = tests.id('site_b');
select tests.authenticate_as('charity_owner');
select set_eq('select name from tests.market', array['m_red'], 'radius of the receiving site applied (3 km)');
select tests.clear_auth();
update public.sites set radius_km = 30 where id = tests.id('site_b');
select tests.authenticate_as('charity_owner');
select ok(exists (select 1 from tests.market where name = 'm_far'), '30 km radius reaches the far store');
select tests.clear_auth();
update public.sites set radius_km = 5 where id = tests.id('site_b');

-- after approval the pending charity sees lots (B8 is about status, not data)
select tests.approve_org('charity_p');
select tests.authenticate_as('pending_owner');
select ok(exists (select 1 from public.marketplace_offers(tests.id('site_p')) m where m.offer_id = tests.id('m_green')),
  'B8: once approved, the same charity sees the open lots');

-- admin aal2 may inspect any receiving site; aal1 may not
select tests.authenticate_as('admin', 'aal2');
select ok(exists (select 1 from public.marketplace_offers(tests.id('site_b')) m where m.offer_id = tests.id('m_green')),
  'admin aal2 can inspect a charity marketplace');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select * from public.marketplace_offers(%L)$$, tests.id('site_b')), 'PT404', 'not_found',
  'admin aal1 => not_found');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select * from public.marketplace_offers(%L)$$, tests.id('site_a')), 'PT404', 'not_found',
  'cannot browse with a site of another org');
select tests.clear_auth();

select * from finish();
rollback;

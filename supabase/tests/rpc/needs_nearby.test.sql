-- needs_nearby (PRD US-STO-20 AC1–AC3; DATA-MODEL §8.4, §9.2; SECURITY-PRIVACY §2.3; ROADMAP P3-07):
-- live needs of approved, unpaused charities (same is_demo) whose receiving-site radius covers one of
-- the caller's store sites; categories filtered by the store site and the caller; public precision only
-- (approximate = grid, hidden = no coordinates and no distance); never the caller's own orgs.
begin;
\ir ../_helpers.psql

select plan(54);

-- ---- fixture world around site_a (store_a, public, 10.776889, 106.700806) ----
-- site_b (charity_b, approximate, 10.762622, 106.660172, radius 5) is ~4.7 km away.
select tests.create_user('pub_owner');
select tests.create_org('charity_pub', 'charity', 'pub_owner');
select tests.create_site('site_pub', 'charity_pub', 'public', 10.7700, 106.6950);          -- ~1.0 km
select tests.create_site('site_pub_off', 'charity_pub', 'public', 10.7710, 106.6960, false); -- inactive
select tests.create_user('hid_owner');
select tests.create_org('charity_hid', 'charity', 'hid_owner');
select tests.create_site('site_hid', 'charity_hid', 'hidden', 10.7800, 106.7100);          -- ~1.1 km
select tests.create_user('far_owner');
select tests.create_org('charity_far', 'charity', 'far_owner');
select tests.create_site('site_far5', 'charity_far', 'approximate', 10.8512, 106.7013);    -- ~8.3 km, radius 5
select tests.create_site('site_far10', 'charity_far', 'approximate', 10.8512, 106.7063);   -- ~8.3 km, radius 10 (off the 0.005° grid)
update public.sites set radius_km = 10 where id = tests.id('site_far10');
select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_p', 'charity_p', 'approximate');
select tests.create_user('paused_owner');
select tests.create_org('charity_paused', 'charity', 'paused_owner');
update public.organizations set is_paused = true where id = tests.id('charity_paused');
select tests.create_site('site_paused', 'charity_paused', 'public', 10.7750, 106.7000);
select tests.create_user('cdemo_owner');
select tests.create_org('charity_demo', 'charity', 'cdemo_owner');
update public.organizations set is_demo = true where id = tests.id('charity_demo');
select tests.create_site('site_cdemo', 'charity_demo', 'public', 10.7760, 106.7020);
select tests.create_user('demo_owner');
select tests.create_org('store_demo', 'store', 'demo_owner');
update public.organizations set is_demo = true where id = tests.id('store_demo');
select tests.create_site('site_sdemo', 'store_demo', 'public', 10.7765, 106.7015);
-- store_manager (manager of store_a) also owns a charity nearby: never listed for them (self-dealing)
select tests.create_org('charity_self', 'charity', 'store_manager');
select tests.create_site('site_self', 'charity_self', 'public', 10.7740, 106.6990);

select tests.make_need('n_open', 'site_b', '{bread}', 'loaf', 50);
select tests.make_need('n_partial', 'site_pub', '{bread,pastry}', 'loaf', 30, now() + interval '5 hours');
update public.needs set status = 'partially_matched', qty_in_flight = 12 where id = tests.id('n_partial');
select tests.make_need('n_matched', 'site_hid', '{bread}', 'loaf', 10, now() + interval '3 hours');
update public.needs set status = 'matched', qty_in_flight = 10 where id = tests.id('n_matched');
select tests.make_need('n_dairy', 'site_pub', '{dairy}', 'bottle', 20);
update public.needs set people_to_serve = 45, note = 'Gọi chị Lan 0901234567' where id = tests.id('n_dairy');
select tests.make_need('n_far10', 'site_far10', '{bread}', 'loaf', 5);
select tests.make_need('n_far5', 'site_far5', '{bread}', 'loaf', 5);
select tests.make_need('n_done', 'site_b', '{bread}', 'loaf', 5);
update public.needs set status = 'fulfilled', qty_delivered = 5, closed_at = now() where id = tests.id('n_done');
select tests.make_need('n_cancel', 'site_b', '{bread}', 'loaf', 5);
update public.needs set status = 'cancelled', closed_at = now(), cancel_reason = 'x' where id = tests.id('n_cancel');
select tests.make_need('n_exp', 'site_pub', '{bread}', 'loaf', 5);
update public.needs set status = 'expired', closed_at = now() where id = tests.id('n_exp');
select tests.make_need('n_cpart', 'site_pub', '{bread}', 'loaf', 5);
update public.needs set status = 'closed_partial', qty_delivered = 2, closed_at = now() where id = tests.id('n_cpart');
select tests.make_need('n_pending', 'site_p', '{bread}', 'loaf', 5);
select tests.make_need('n_paused', 'site_paused', '{bread}', 'loaf', 5);
select tests.make_need('n_demo', 'site_cdemo', '{bread}', 'loaf', 5);
select tests.make_need('n_off', 'site_pub_off', '{bread}', 'loaf', 5);
select tests.make_need('n_self', 'site_self', '{bread}', 'loaf', 5);

create table tests.nn (need_id uuid, charity_org_id uuid, charity_name text, charity_subtype text, category_codes text[],
  unit public.unit_code, quantity numeric, qty_in_flight numeric, qty_delivered numeric, qty_remaining numeric,
  needed_by timestamptz, people_to_serve integer, status public.need_status, store_site_id uuid, distance_km numeric,
  site_visibility public.site_visibility, site_ward text, site_city text, site_lat float8, site_lng float8);
grant insert, select, delete on tests.nn to authenticated;

-- ==== contract ====
select is(pg_get_function_result('public.needs_nearby(uuid, text[])'::regprocedure),
  'TABLE(need_id uuid, charity_org_id uuid, charity_name text, charity_subtype text, category_codes text[], unit unit_code, quantity numeric, qty_in_flight numeric, qty_delivered numeric, qty_remaining numeric, needed_by timestamp with time zone, people_to_serve integer, status need_status, store_site_id uuid, distance_km numeric, site_visibility site_visibility, site_ward text, site_city text, site_lat double precision, site_lng double precision)',
  'returns exactly the documented columns');
select is((select provolatile::text || prosecdef::text from pg_proc where oid = 'public.needs_nearby(uuid, text[])'::regprocedure),
  'strue', 'stable + security definer');
select ok((select exists (select 1 from unnest(proconfig) c where c = 'search_path=""') from pg_proc
           where oid = 'public.needs_nearby(uuid, text[])'::regprocedure), 'search_path = ''''');
select ok(not has_function_privilege('anon', 'public.needs_nearby(uuid, text[])', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.needs_nearby(uuid, text[])', 'EXECUTE'),
  'EXECUTE: authenticated only');
select is_empty($$select a from unnest(string_to_array(pg_get_function_result('public.needs_nearby(uuid, text[])'::regprocedure), ', ')) a
                  where a ~* '(note|address|phone|email|contact|location|created_by|representative)'$$,
  'no PII / exact-location column in the result (no note, address, contact, pin)');
select ok((select prosrc ~* 'st_dwithin\(cs\.location, ms\.location, 30000' from pg_proc
           where oid = 'public.needs_nearby(uuid, text[])'::regprocedure),
  'constant 30 km pre-filter on the indexed column (GIST sites_location_gix) before the per-site radius');

-- ==== who may call ====
select tests.as_anon();
select throws_ok('select * from public.needs_nearby()', '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select is_empty('select * from public.needs_nearby()', 'user without a store: nothing');
select throws_ok(format('select * from public.needs_nearby(%L)', tests.id('site_a')), 'PT404', 'not_found',
  'someone else''s store site: not_found (no existence leak)');
select tests.authenticate_as('charity_owner');
select is_empty('select * from public.needs_nearby()', 'charity member: no store site => nothing');
select is((tests.error_of(format('select * from public.needs_nearby(%L)', tests.id('site_b'))) ->> 'detail')::jsonb,
  '{"p_store_site_id":"not_a_store_site"}'::jsonb, 'own charity site is not a store site (PT422)');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select * from public.needs_nearby(%L)', tests.id('site_a')), 'PT404', 'not_found',
  'volunteer of a charity: store site not_found');
select tests.authenticate_as('draft_owner');
select throws_ok(format('select * from public.needs_nearby(%L)', tests.id('site_c')), 'PT403', 'org_not_active',
  'unapproved store: org_not_active (B8)');
select is_empty('select * from public.needs_nearby()', 'unapproved store: nothing without a site either');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format('select * from public.needs_nearby(%L)', tests.id('site_a')), 'PT403', 'not_authorized',
  'admin (not a member): not_authorized');
select tests.clear_auth();

-- staff limited to another (inactive) site of store_a
update public.org_members set site_ids = array[tests.id('site_a_off')]
 where org_id = tests.id('store_a') and user_id = tests.id('store_staff');
select tests.authenticate_as('store_staff');
select throws_ok(format('select * from public.needs_nearby(%L)', tests.id('site_a')), 'PT403', 'not_authorized',
  'staff outside their site scope: not_authorized');
select is_empty('select * from public.needs_nearby()', 'staff whose only site is inactive: nothing');
select tests.clear_auth();
update public.org_members set site_ids = null
 where org_id = tests.id('store_a') and user_id = tests.id('store_staff');

-- ==== which needs (store_a owner, every site) ====
select tests.authenticate_as('store_owner');
insert into tests.nn select * from public.needs_nearby();
select set_eq('select need_id from tests.nn',
  format('values (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid)',
         tests.id('n_open'), tests.id('n_partial'), tests.id('n_matched'), tests.id('n_dairy'), tests.id('n_far10'),
         tests.id('n_self')),
  'live needs (open, partially_matched, matched) of approved charities whose radius covers a store site');
select is_empty(format('select 1 from tests.nn where need_id in (%L, %L, %L, %L)', tests.id('n_done'), tests.id('n_cancel'),
                       tests.id('n_exp'), tests.id('n_cpart')),
  'fulfilled / cancelled / expired / closed_partial needs are not listed');
select is_empty(format('select 1 from tests.nn where need_id in (%L, %L, %L, %L)', tests.id('n_pending'), tests.id('n_paused'),
                       tests.id('n_demo'), tests.id('n_off')),
  'unapproved charity, paused charity, demo charity (is_demo mismatch) and inactive receiving site are left out');
select ok(exists (select 1 from tests.nn where need_id = tests.id('n_far10'))
          and not exists (select 1 from tests.nn where need_id = tests.id('n_far5')),
  'the CHARITY''s radius decides: 8.3 km away is in for a 10 km site, out for a 5 km site');
select is((select count(*)::int from tests.nn), (select count(distinct need_id)::int from tests.nn), 'one row per need');
select is((select array_agg(need_id) from public.needs_nearby()),
          (select array_agg(need_id order by (qty_remaining > 0) desc, needed_by, distance_km nulls last, need_id) from tests.nn),
  'still-missing needs first, then the most urgent needed_by');
select results_eq(format('select qty_remaining, status::text from tests.nn where need_id in (%L, %L, %L) order by qty_remaining',
                         tests.id('n_matched'), tests.id('n_partial'), tests.id('n_open')),
  $$values (0::numeric, 'matched'), (18::numeric, 'partially_matched'), (50::numeric, 'open')$$,
  'qty_remaining = quantity − in flight − delivered (matched => 0, still listed: US-STO-21 AC3)');
select results_eq(format('select charity_name, charity_subtype, people_to_serve from tests.nn where need_id = %L', tests.id('n_dairy')),
  $$values ('Org charity_pub'::text, 'soup_kitchen'::text, 45)$$, 'public charity card: name, subtype, people served');
select is_empty(format($$select 1 from tests.nn n, lateral (select to_jsonb(n) as j) x
                         where n.need_id = %L and x.j::text ~ '0901234567|Lan'$$, tests.id('n_dairy')),
  'the free-text note (may hold personal data) never leaves the function');

-- ==== privacy of the receiving site (checked as postgres against the exact pins) ====
select tests.clear_auth();
select results_eq(format('select site_visibility::text, site_lat, site_lng from tests.nn where need_id = %L', tests.id('n_open')),
  format($$select 'approximate'::text, extensions.st_y(public_location::extensions.geometry), extensions.st_x(public_location::extensions.geometry)
           from public.sites where id = %L$$, tests.id('site_b')),
  'approximate site: the ~550 m grid point (public_location)');
select ok((select site_lat <> 10.762622 or site_lng <> 106.660172 from tests.nn where need_id = tests.id('n_open')),
  'approximate site: never the exact pin');
select is((select distance_km from tests.nn where need_id = tests.id('n_open')), 5::numeric,
  'approximate site: whole km (4.7 km => 5), capped by the radius');
select results_eq(format('select site_visibility::text, site_lat, site_lng, distance_km, site_ward from tests.nn where need_id = %L', tests.id('n_matched')),
  $$values ('hidden'::text, null::float8, null::float8, null::numeric, 'Phường Bến Thành'::text)$$,
  'hidden site: no coordinates, no distance, only the ward');
select results_eq(format('select site_lat, site_lng, distance_km = round(distance_km, 1), distance_km between 0.9 and 1.1 from tests.nn where need_id = %L', tests.id('n_partial')),
  $$values (10.77::float8, 106.695::float8, true, true)$$, 'public site: exact coordinates, km to 0.1');
select is_empty($$select 1 from tests.nn n join public.needs x on x.id = n.need_id join public.sites s on s.id = x.site_id
                  where s.visibility <> 'public'
                    and (n.site_lat = extensions.st_y(s.location::extensions.geometry)
                         or n.site_lng = extensions.st_x(s.location::extensions.geometry))$$,
  'no row of a non-public site carries a coordinate of its exact pin');
select is_empty($$select 1 from tests.nn n join public.needs x on x.id = n.need_id join public.sites s on s.id = x.site_id
                  where s.visibility = 'approximate' and n.distance_km <> trunc(n.distance_km)$$,
  'approximate sites never get a fractional distance');

-- ==== categories (store site + caller filter), NULL logic ====
select tests.authenticate_as('store_owner');
select set_eq($$select need_id from public.needs_nearby(null, '{dairy}')$$, format('values (%L::uuid)', tests.id('n_dairy')),
  'p_category_codes {dairy}: dairy needs only');
select set_eq($$select need_id from public.needs_nearby(null, '{pastry,beverage}')$$, format('values (%L::uuid)', tests.id('n_partial')),
  'p_category_codes overlap: a need with any of the codes');
select is((select count(*)::int from public.needs_nearby(null, '{}')), 6, 'p_category_codes {} = no filter');
select is((select count(*)::int from public.needs_nearby(null, array[null]::text[])), 6, 'p_category_codes {NULL} = no filter');
select is((select count(*)::int from public.needs_nearby(null, null)), 6, 'NULL arguments = every site, no filter');
select is((tests.error_of($$select * from public.needs_nearby(null, array(select 'c' || g from generate_series(1, 21) g))$$) ->> 'detail')::jsonb,
  '{"p_category_codes":"≤ 20 codes"}'::jsonb, 'p_category_codes bounded');
select tests.clear_auth();

update public.sites set accepted_categories = '{bread}' where id = tests.id('site_a');
select tests.authenticate_as('store_owner');
select ok(not exists (select 1 from public.needs_nearby() where need_id = tests.id('n_dairy'))
          and exists (select 1 from public.needs_nearby() where need_id = tests.id('n_partial')),
  'store site usual categories {bread}: the dairy need is hidden, bread/pastry stays');
select tests.clear_auth();
update public.sites set accepted_categories = '{}' where id = tests.id('site_a');
select tests.authenticate_as('store_owner');
select is_empty('select 1 from public.needs_nearby()',
  'store site with an empty category list overlaps nothing (same rule as need_published notifications)');
select tests.clear_auth();
update public.sites set accepted_categories = null where id = tests.id('site_a');

-- ==== one site, other members, demo ====
select tests.authenticate_as('store_owner');
select is((select count(*)::int from public.needs_nearby(tests.id('site_a'))), 6, 'p_store_site_id narrows to that site');
select is_empty(format('select 1 from public.needs_nearby(%L)', tests.id('site_a_off')), 'inactive store site: nothing');
select tests.authenticate_as('store_manager');
select ok(not exists (select 1 from public.needs_nearby() where need_id = tests.id('n_self'))
          and (select count(*)::int from public.needs_nearby()) = 5,
  'a store member never sees the needs of a charity they also belong to');
select tests.authenticate_as('other_owner');
select ok(exists (select 1 from public.needs_nearby(tests.id('site_x')) where need_id = tests.id('n_open')),
  'another approved store (hidden store site) sees the same needs');
select tests.authenticate_as('demo_owner');
select set_eq('select need_id from public.needs_nearby()', format('values (%L::uuid)', tests.id('n_demo')),
  'demo store: demo needs only');
select tests.clear_auth();

-- ==== time: needed_by passed (cron has not closed them yet) ====
select tests.set_clock(now() + interval '2 days');
select tests.authenticate_as('store_owner');
select is_empty('select 1 from public.needs_nearby()', 'past needed_by: not listed even before the cron closes the need');
select tests.clear_auth();
select tests.clear_clock();
select tests.set_clock(now() + interval '4 hours');
select tests.authenticate_as('store_owner');
select ok(not exists (select 1 from public.needs_nearby() where need_id = tests.id('n_matched'))
          and exists (select 1 from public.needs_nearby() where need_id = tests.id('n_partial')),
  'clock + 4 h: the need due in 3 h drops, the one due in 5 h stays');
select tests.clear_auth();
select tests.clear_clock();

-- ==== nearest store site ====
select tests.create_site('site_a2', 'store_a', 'public', 10.7650, 106.6650);     -- ~0.6 km from site_b
select tests.authenticate_as('store_owner');
delete from tests.nn;
insert into tests.nn select * from public.needs_nearby();
select results_eq(format('select store_site_id, distance_km from tests.nn where need_id = %L', tests.id('n_open')),
  format('values (%L::uuid, 1::numeric)', tests.id('site_a2')),
  'measured from the nearest store site (approximate: ≥ 1 km)');
select is((select store_site_id from tests.nn where need_id = tests.id('n_partial')), tests.id('site_a'),
  'each need picks its own nearest store site');
select is((select count(*)::int from tests.nn), 6, 'still one row per need with two store sites in range');
select tests.clear_auth();

-- people_to_serve NULL / note NULL are fine; matched needs keep their status for the disabled CTA
select is((select people_to_serve from tests.nn where need_id = tests.id('n_open')), null::integer, 'people_to_serve may be NULL');
select is((select status::text from tests.nn where need_id = tests.id('n_matched')), 'matched', 'matched need listed with its status');

-- a store member of an unapproved second store keeps the approved store's needs only
select tests.add_member('draft_c', 'store_owner', 'staff');
select tests.authenticate_as('store_owner');
select is((select count(*)::int from public.needs_nearby()), 6, 'an unapproved store membership adds no site');
select tests.clear_auth();

select * from finish();
rollback;

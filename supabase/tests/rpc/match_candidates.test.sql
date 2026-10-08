-- match_candidates (DATA-MODEL §4.7, §8.4; ADR-007 §1; ROADMAP P3-02): radius (GIST), category,
-- unit, available > 0, approved unpaused store of the same is_demo, no self-dealing, feasibility,
-- ≤ 15 rows by pre_score; coordinates/distances of non-public store sites are coarse.
begin;
\ir ../_helpers.psql

select plan(37);

-- ---- fixture world: 20+ lots around charity_b / site_b (10.762622, 106.660172, radius 5 km) ----
select tests.create_user('n_owner');
select tests.create_org('store_n', 'store', 'n_owner');
select tests.create_site('site_n1', 'store_n', 'public', 10.7700, 106.6650);            -- ~1 km
select tests.create_site('site_n2', 'store_n', 'approximate', 10.7512, 106.6713);       -- ~1.8 km, snapped (10.75, 106.67)
select tests.create_site('site_far', 'store_n', 'public', 10.8000, 106.7500);           -- ~10 km (outside)
select tests.create_user('demo_owner');
select tests.create_org('store_demo', 'store', 'demo_owner');
update public.organizations set is_demo = true where id = tests.id('store_demo');
select tests.create_site('site_demo', 'store_demo', 'public', 10.7650, 106.6610);
select tests.create_user('paused_owner');
select tests.create_org('store_paused', 'store', 'paused_owner');
update public.organizations set is_paused = true where id = tests.id('store_paused');
select tests.create_site('site_paused', 'store_paused', 'public', 10.7650, 106.6620);
select tests.create_user('self_owner');
select tests.create_org('store_self', 'store', 'self_owner');
select tests.add_member('store_self', 'charity_owner', 'staff');                         -- charity_owner also works here
select tests.create_site('site_self', 'store_self', 'public', 10.7640, 106.6630);
select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_p', 'charity_p', 'approximate');

select tests.make_offer('o_a1', 'site_a', 'bread', 10);                                  -- public, ~4.7 km
select tests.make_offer('o_x1', 'site_x', 'bread', 8);                                   -- hidden
select tests.make_offer('o_n2', 'site_n2', 'bread', 6);                                  -- approximate
do $$ begin
  for i in 1..14 loop
    perform tests.make_offer('o_n1_' || i, 'site_n1', 'bread', i);
  end loop;
end $$;
select tests.make_offer('o_pastry', 'site_n1', 'pastry', 20, now() - interval '10 minutes', now() + interval '2 hours');  -- kg need only, urgent
select tests.make_offer('o_dairy', 'site_n1', 'dairy', 5);                               -- category never asked
select tests.make_offer('o_box', 'site_n1', 'bread', 5, now() - interval '10 minutes', now() + interval '2 hours',
                        p_unit => 'box', p_unit_weight => 0.5);                                          -- unit ≠ loaf, urgent
select tests.make_offer('o_full', 'site_n1', 'bread', 5);
update public.offers set qty_committed = 5, status = 'fully_allocated' where id = tests.id('o_full');
select tests.make_offer('o_far', 'site_far', 'bread', 5);
select tests.make_offer('o_demo', 'site_demo', 'bread', 5);
select tests.make_offer('o_paused', 'site_paused', 'bread', 5);
select tests.make_offer('o_self', 'site_self', 'bread', 5);
select tests.make_offer('o_draft', 'site_n1', 'bread', 5, p_status => 'draft');
select tests.make_offer('o_late', 'site_a', 'bread', 5, now() - interval '10 minutes', now() + interval '20 minutes');  -- travel ≈ 32 min
select tests.make_offer('o_dead', 'site_n1', 'bread', 5, now() - interval '3 hours', now() - interval '1 hour', now() + interval '1 day');

select tests.make_need('n_loaf', 'site_b', '{bread}', 'loaf', 50);
select tests.make_need('n_kg', 'site_b', '{bread,pastry}', 'kg', 5);
select tests.make_need('n_p', 'site_p', '{bread}', 'loaf', 5);

create table tests.mc (offer_id uuid, store_org_id uuid, site_id uuid, category_code text, unit public.unit_code,
  unit_weight_kg numeric, qty_available numeric, available_need_units numeric, effective_deadline timestamptz,
  perishability public.perishability, label public.freshness_label, distance_km numeric, travel_min numeric,
  eta_pickup timestamptz, eta_dropoff timestamptz, pickup_window tstzrange, trust_score numeric, pre_score numeric,
  site_lat float8, site_lng float8);
grant insert, select, delete on tests.mc to authenticated;

-- ==== contract ====
select is(pg_get_function_result('public.match_candidates(uuid, numeric, uuid[], timestamptz)'::regprocedure),
  'TABLE(offer_id uuid, store_org_id uuid, site_id uuid, category_code text, unit unit_code, unit_weight_kg numeric, qty_available numeric, available_need_units numeric, effective_deadline timestamp with time zone, perishability perishability, label freshness_label, distance_km numeric, travel_min numeric, eta_pickup timestamp with time zone, eta_dropoff timestamp with time zone, pickup_window tstzrange, trust_score numeric, pre_score numeric, site_lat double precision, site_lng double precision)',
  'returns exactly the documented columns (DATA-MODEL §8.4)');
select is((select provolatile::text || prosecdef::text from pg_proc where oid = 'public.match_candidates(uuid, numeric, uuid[], timestamptz)'::regprocedure),
  'strue', 'stable + security definer');

-- ==== who may call ====
select tests.as_anon();
select throws_ok(format('select * from public.match_candidates(%L)', tests.id('n_loaf')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select * from public.match_candidates(%L)', tests.id('n_loaf')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_owner');
select throws_ok(format('select * from public.match_candidates(%L)', tests.id('n_loaf')), 'PT404', 'not_found',
  'store member: not_found (no existence leak across orgs)');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select * from public.match_candidates(%L)', tests.id('n_loaf')), 'PT403', 'not_authorized',
  'volunteer: not_authorized');
select tests.authenticate_as('pending_owner');
select throws_ok(format('select * from public.match_candidates(%L)', tests.id('n_p')), 'PT403', 'org_not_active',
  'unapproved charity: org_not_active (B8)');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format('select * from public.match_candidates(%L)', tests.id('n_loaf')), 'PT404', 'not_found',
  'admin aal1: not_found');
select tests.authenticate_as('charity_owner');
select throws_ok('select * from public.match_candidates(null)', 'PT404', 'not_found', 'null need id: not_found');

-- ==== candidates for 50 loaves ====
insert into tests.mc select * from public.match_candidates(tests.id('n_loaf'));
select is((select count(*)::int from tests.mc), 15, 'at most matching_candidate_limit (15) rows');
select is_empty(format($$select offer_id from tests.mc where offer_id in (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)$$,
                       tests.id('o_pastry'), tests.id('o_dairy'), tests.id('o_box'), tests.id('o_full'), tests.id('o_far'),
                       tests.id('o_demo'), tests.id('o_paused'), tests.id('o_self'), tests.id('o_draft'), tests.id('o_late'),
                       tests.id('o_dead')),
  'excluded: other category, unit mismatch, nothing available, out of radius, demo, paused store, own store (self-dealing), draft, infeasible, past deadline');
select is_empty(format($$select 1 from tests.mc where offer_id in (%L, %L)$$, tests.id('o_a1'), tests.id('o_x1')),
  '17 eligible lots: the two lowest pre_scores (farthest) fall past the limit');
select is((select array_agg(pre_score) from public.match_candidates(tests.id('n_loaf'))),
          (select array_agg(pre_score order by pre_score desc) from public.match_candidates(tests.id('n_loaf'))),
  'ordered by pre_score desc');
select ok((select bool_and(category_code = 'bread' and unit = 'loaf' and available_need_units = qty_available and qty_available > 0
                           and label in ('green', 'yellow', 'red') and eta_pickup <= effective_deadline
                           and distance_km <= 5 and eta_dropoff > eta_pickup and trust_score = 50) from tests.mc),
  'every row: in category, same unit, available, labelled, feasible, inside the radius');

-- the three farther sites (site_n1 excluded): public / approximate / hidden store sites
delete from tests.mc;
insert into tests.mc select * from public.match_candidates(tests.id('n_loaf'), null, array[tests.id('site_n1')]);
select set_eq('select offer_id from tests.mc', format('values (%L::uuid), (%L::uuid), (%L::uuid)', tests.id('o_a1'), tests.id('o_x1'), tests.id('o_n2')),
  'p_exclude_site_ids drops store sites (re-match of the shortfall)');
-- public store site: exact pin, decimal km, whole minutes
select results_eq(format($$select site_lat, site_lng, distance_km = round(distance_km, 1), travel_min = round(travel_min) from tests.mc where offer_id = %L$$, tests.id('o_a1')),
  $$values (10.776889::float8, 106.700806::float8, true, true)$$, 'public store site: exact coordinates, km to 0.1, whole minutes');
-- approximate store site: snapped coordinates only
select results_eq(format($$select site_lat, site_lng from tests.mc where offer_id = %L$$, tests.id('o_n2')),
  $$values (10.75::float8, 106.67::float8)$$, 'approximate store site: ~550 m grid coordinates, never the pin');
-- hidden store site: no coordinates, whole km, 5-minute steps
select results_eq(format($$select site_lat, site_lng, distance_km = trunc(distance_km), travel_min::int %% 5,
                                  extract(minute from eta_pickup)::int %% 5, extract(second from eta_pickup)::int,
                                  extract(minute from eta_dropoff)::int %% 5
                           from tests.mc where offer_id = %L$$, tests.id('o_x1')),
  $$values (null::float8, null::float8, true, 0, 0, 0, 0)$$,
  'hidden store site: null coordinates, whole-km distance, travel and ETAs in 5-minute steps');
select is((select pre_score from tests.mc where offer_id = tests.id('o_x1')),
  (select round(0.4 * greatest(0, least(1, 1 - (extract(epoch from (o.effective_deadline - now())) / 3600.0) / 12))
                + 0.3 * greatest(0, least(1, 1 - (select distance_km from tests.mc where offer_id = tests.id('o_x1')) / 5.0))
                + 0.1 * 0.5, 4)
   from public.offers o where o.id = tests.id('o_x1')),
  'pre_score = 0.4·urgency + 0.3·proximity (coarse km for non-public sites) + 0.1·trust');
select ok((select pre_score from tests.mc where offer_id = tests.id('o_n2')) > (select pre_score from tests.mc where offer_id = tests.id('o_a1')),
  'closer lot ranks higher at equal urgency and trust');

-- ==== kg need: counted units are converted (§4.6) ====
delete from tests.mc;
insert into tests.mc select * from public.match_candidates(tests.id('n_kg'));
select results_eq(format($$select unit::text, available_need_units from tests.mc where offer_id = %L$$, tests.id('o_pastry')),
  $$values ('piece', 2.000::numeric)$$, 'kg need: 20 pieces × 0.1 kg = 2 kg');
select results_eq(format($$select unit::text, available_need_units from tests.mc where offer_id = %L$$, tests.id('o_box')),
  $$values ('box', 2.500::numeric)$$, 'kg need: another unit is fine once converted (5 boxes × 0.5 kg)');

-- ==== inputs ====
select is((tests.error_of(format('select * from public.match_candidates(%L, 0)', tests.id('n_loaf'))) ->> 'detail')::jsonb,
  '{"p_remaining":"> 0"}'::jsonb, 'p_remaining must be > 0');
select is((tests.error_of(format($$select * from public.match_candidates(%L, null, '{}', now() + interval '8 days')$$, tests.id('n_loaf'))) ->> 'detail')::jsonb,
  '{"p_at":"now .. now + 7 days"}'::jsonb, 'p_at bounded');
select lives_ok(format('select * from public.match_candidates(%L, null, null, null)', tests.id('n_loaf')),
  'NULL exclude list / time default to {} / now');
select ok(exists (select 1 from public.match_candidates(tests.id('n_loaf'), null, array[tests.id('site_n1')])
                  where offer_id = tests.id('o_a1'))
          and not exists (select 1 from public.match_candidates(tests.id('n_loaf'), null, array[tests.id('site_n1')],
                                                                now() + interval '4 hours 50 minutes')
                          where offer_id = tests.id('o_a1')),
  'feasibility is evaluated at p_at (a far lot is no longer reachable 10 minutes before its deadline)');
select tests.clear_auth();

-- covered need => no rows; terminal / past needs refused
update public.needs set qty_in_flight = 50 where id = tests.id('n_loaf');
select tests.authenticate_as('charity_owner');
select is_empty(format('select 1 from public.match_candidates(%L)', tests.id('n_loaf')), 'nothing remaining => no candidates');
select isnt_empty(format('select 1 from public.match_candidates(%L, 12)', tests.id('n_loaf')),
  'explicit p_remaining overrides the cache (UI re-match of a shortfall)');
select tests.clear_auth();
update public.needs set status = 'fulfilled', closed_at = now() where id = tests.id('n_kg');
select tests.authenticate_as('charity_owner');
select throws_ok(format('select * from public.match_candidates(%L)', tests.id('n_kg')), 'PT409', 'invalid_state', 'terminal need: invalid_state');
select tests.clear_auth();
select tests.set_clock(now() + interval '2 days');
select tests.authenticate_as('charity_owner');
select throws_ok(format('select * from public.match_candidates(%L, 10)', tests.id('n_loaf')), 'PT409', 'deadline_passed',
  'need past needed_by: deadline_passed');
select tests.clear_auth();
select tests.clear_clock();

-- admin aal2 reads every candidate (not a member of store_self => no self-dealing exclusion)
update public.needs set qty_in_flight = 0 where id = tests.id('n_loaf');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.match_candidates(tests.id('n_loaf'))), 15, 'admin aal2 may inspect candidates');
select isnt_empty(format('select 1 from public.match_candidates(%L, null, array[%L]::uuid[]) where offer_id = %L',
                         tests.id('n_loaf'), tests.id('site_n1'), tests.id('o_self')),
  'the own-store exclusion depends on the caller (admin sees store_self)');
select tests.authenticate_as('charity_owner');
select is_empty(format('select 1 from public.match_candidates(%L, null, array[%L]::uuid[]) where offer_id = %L',
                       tests.id('n_loaf'), tests.id('site_n1'), tests.id('o_self')),
  'a charity member who also works for a store never gets that store''s lots');
select tests.clear_auth();

-- demo charity only meets demo stores
update public.organizations set is_demo = true where id = tests.id('charity_b');
select tests.authenticate_as('charity_owner');
select ok(exists (select 1 from public.match_candidates(tests.id('n_loaf')) where offer_id = tests.id('o_demo'))
          and (select bool_and(o.is_demo) from public.match_candidates(tests.id('n_loaf')) m
               join public.organizations o on o.id = m.store_org_id),
  'is_demo charity: only is_demo stores');
select tests.clear_auth();
update public.organizations set is_demo = false where id = tests.id('charity_b');

-- ==== index use (EXPLAIN): the radius predicate runs on the GIST index ====
create function tests.plan_of(p_sql text) returns text language plpgsql as $$
declare r record; v text := '';
begin
  for r in execute 'explain ' || p_sql loop v := v || r."QUERY PLAN" || E'\n'; end loop;
  return v;
end $$;
set local enable_seqscan = off;
select matches(tests.plan_of(format($$select s.id from public.sites s
                                      where extensions.st_dwithin(s.location, (select c.location from public.sites c where c.id = %L), 5000)$$,
                                    tests.id('site_b'))),
  'sites_location_gix', 'ST_DWithin(sites.location, point, m) is served by the GIST index sites_location_gix');
reset enable_seqscan;
select ok((select prosrc ~* 'st_dwithin\(s\.location, v_cs\.location' from pg_proc
           where oid = 'public.match_candidates(uuid, numeric, uuid[], timestamptz)'::regprocedure),
  'match_candidates filters by radius with the indexed column first (same predicate as above)');
select ok((select prosrc ~* 'st\.id <> all \(v_mine\)' from pg_proc
           where oid = 'public.match_candidates(uuid, numeric, uuid[], timestamptz)'::regprocedure),
  'self-dealing guard present (caller''s orgs excluded)');

select * from finish();
rollback;

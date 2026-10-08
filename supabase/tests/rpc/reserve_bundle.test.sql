-- reserve_bundle (DATA-MODEL §6.3, §6.4, §8.4 — 8 steps; PRD US-CHA-10…12; ROADMAP P3-04)
-- "Cần 50 bánh: A 20 + B 18 + C 12", partial confirmation, shortfall re-match, atomicity, lazy expiry,
-- every per-line check, idempotency, who-may-call and the need_bundles privacy rule.
begin;
\ir ../_helpers.psql

select plan(72);

-- ---- fixture ----
select tests.create_user('c_owner');
select tests.create_org('store_c', 'store', 'c_owner');
select tests.create_site('site_c2', 'store_c', 'public', 10.7660, 106.6630);
update public.sites set auto_accept_mode = 'all' where id = tests.id('site_c2');
select tests.create_user('d_owner');
select tests.create_org('store_d', 'store', 'd_owner');
select tests.create_site('site_d', 'store_d', 'public', 10.7580, 106.6580);
select tests.create_site('site_far', 'store_d', 'public', 10.8500, 106.8000);
do $$ begin
  for i in 1..6 loop
    perform tests.create_site('site_s' || i, 'store_d', 'public', 10.7560 + i * 0.001, 106.6560);
    perform tests.make_offer('o_s' || i, 'site_s' || i, 'bread', 1);
  end loop;
end $$;
select tests.create_user('self_owner');
select tests.create_org('store_self', 'store', 'self_owner');
select tests.add_member('store_self', 'charity_owner', 'staff');
select tests.create_site('site_self', 'store_self', 'public', 10.7640, 106.6630);
select tests.create_user('demo_owner');
select tests.create_org('store_demo', 'store', 'demo_owner');
update public.organizations set is_demo = true where id = tests.id('store_demo');
select tests.create_site('site_demo', 'store_demo', 'public', 10.7650, 106.6610);
select tests.create_user('pending_owner');
select tests.create_org('store_pending', 'store', 'pending_owner', 'submitted');
select tests.create_site('site_pending', 'store_pending', 'public', 10.7650, 106.6620);
select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_site('site_z', 'charity_z', 'approximate', 10.77, 106.69);

select tests.make_offer('oA', 'site_a', 'bread', 20);
select tests.make_offer('oB', 'site_x', 'bread', 18);
select tests.make_offer('oC', 'site_c2', 'bread', 12);
select tests.make_offer('oD', 'site_d', 'bread', 18);
select tests.make_offer('oE', 'site_d', 'bread', 5);
select tests.make_offer('o_pastry', 'site_d', 'pastry', 5);
select tests.make_offer('o_box', 'site_d', 'bread', 5, p_unit => 'box', p_unit_weight => 0.5);
select tests.make_offer('o_far', 'site_far', 'bread', 5);
select tests.make_offer('o_late', 'site_a', 'bread', 5, now() - interval '10 minutes', now() + interval '20 minutes');
select tests.make_offer('o_self', 'site_self', 'bread', 5);
select tests.make_offer('o_demo', 'site_demo', 'bread', 5);
select tests.make_offer('o_pending', 'site_pending', 'bread', 5);
select tests.make_offer('o_draft', 'site_d', 'bread', 5, p_status => 'draft');

select tests.make_need('n50', 'site_b', '{bread}', 'loaf', 50);
select tests.make_need('n_z', 'site_z', '{bread}', 'loaf', 5);

create function tests.rb(p_need text, p_lines jsonb, p_meta jsonb default '{}'::jsonb, p_op text default null) returns text
language sql stable as $$
  select format('select public.reserve_bundle(%L, %L, %s, %L)', tests.id(p_need), p_lines,
                coalesce(quote_literal(p_op) || '::uuid', 'gen_random_uuid()'), p_meta);
$$;
create function tests.ln(p_offer text, p_qty numeric) returns jsonb language sql stable as $$
  select jsonb_build_object('offer_id', tests.id(p_offer), 'qty', p_qty);
$$;
grant execute on function tests.rb(text, jsonb, jsonb, text), tests.ln(text, numeric) to authenticated, anon;

-- ==== who may call ====
select tests.as_anon();
select throws_ok(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1))), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1))), 'PT404', 'not_found', 'outsider: not_found');
select throws_ok(tests.rb('n50', '[{"offer_id":"nope"}]'), 'PT404', 'not_found',
  'authorization (step 2) comes before line validation (step 3): outsiders learn nothing');
select tests.authenticate_as('store_owner');
select throws_ok(tests.rb('n50', jsonb_build_array(tests.ln('oD', 1))), 'PT404', 'not_found', 'store member: not_found (no existence leak)');
select tests.authenticate_as('charity_volunteer');
select throws_ok(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1))), 'PT403', 'not_authorized', 'volunteer: not_authorized');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1))), 'PT403', 'not_authorized', 'admin aal2 cannot reserve for a charity');
select tests.authenticate_as('ch2_owner');
select throws_ok(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1))), 'PT404', 'not_found', 'another charity: not_found');
select tests.clear_auth();
update public.organizations set is_paused = true where id = tests.id('charity_b');
select tests.authenticate_as('charity_owner');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1)))) ->> 'detail', 'paused', 'paused charity: org_not_active / paused');
select tests.clear_auth();
update public.organizations set is_paused = false where id = tests.id('charity_b');

-- ==== input validation (step 3, before any row is read) ====
select tests.authenticate_as('charity_owner');
select is((tests.error_of(format('select public.reserve_bundle(%L, null, gen_random_uuid())', tests.id('n50'))) ->> 'detail')::jsonb,
  '{"p_lines":"non-empty array"}'::jsonb, 'NULL p_lines refused');
select is((tests.error_of(tests.rb('n50', '[]')) ->> 'detail')::jsonb, '{"p_lines":"non-empty array"}'::jsonb, 'empty lines refused');
select is((tests.error_of(tests.rb('n50', '[{"offer_id":"nope","qty":1}]')) ->> 'detail')::jsonb,
  '{"p_lines":"line_format","index":0}'::jsonb, 'offer_id must be a uuid');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1), tests.ln('oB', 0)))) ->> 'detail')::jsonb,
  '{"p_lines":"line_format","index":1}'::jsonb, 'qty must be > 0');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(jsonb_build_object('offer_id', tests.id('oA'), 'qty', '3')))) ->> 'detail')::jsonb,
  '{"p_lines":"line_format","index":0}'::jsonb, 'qty must be a JSON number');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(jsonb_build_object('offer_id', tests.id('oA'))))) ->> 'detail')::jsonb,
  '{"p_lines":"line_format","index":0}'::jsonb, 'qty missing (NULL) refused');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1) || '{"price":1}'))) ->> 'detail')::jsonb,
  '{"p_lines":"line_format","index":0}'::jsonb, 'unknown line keys refused');
select is((tests.error_of(format('select public.reserve_bundle(%L, %L, null)', tests.id('n50'), jsonb_build_array(tests.ln('oA', 1)))) ->> 'detail')::jsonb,
  '{"p_client_op_id":"required"}'::jsonb, 'client_op_id required');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1)), '{"option_rank":4,"color":"red","score":2}')) ->> 'detail')::jsonb,
  '{"unknown_keys":["color"],"option_rank":"1|2|3","score":"0..1"}'::jsonb, 'p_meta validated (every error)');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1)), '{"route_geojson":{"type":"Point","coordinates":[106,10]},"route_provider":"fake"}')) ->> 'detail')::jsonb,
  '{"route_geojson":"LineString with route_provider goong|ors|aws|fake"}'::jsonb, 'route must be a LineString');
select is((tests.error_of(format('select public.reserve_bundle(%L, %L, gen_random_uuid(), null)', tests.id('n50'), jsonb_build_array(tests.ln('oA', 21)))) ->> 'message'),
  'insufficient_quantity', 'NULL p_meta = defaults (reaches the per-line checks)');
select is((tests.error_of(format('select public.reserve_bundle(null, %L, gen_random_uuid())', jsonb_build_array(tests.ln('oA', 1))))) ->> 'message',
  'not_found', 'NULL need id: not_found');
select is((tests.error_of(tests.rb('n50', (select jsonb_agg(jsonb_build_object('offer_id', gen_random_uuid(), 'qty', 1)) from generate_series(1, 16)))) ->> 'detail')::jsonb,
  '{"p_lines":"too_many_offers","max":15}'::jsonb, 'at most 15 lots per bundle');

-- ==== per-line checks (step 6), each one all-or-nothing ====
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 21)))) - 'hint',
  jsonb_build_object('sqlstate', 'PT409', 'message', 'insufficient_quantity',
                     'detail', jsonb_build_object('offer_id', tests.id('oA'), 'available', 20.000)::text),
  'qty above qty_available: insufficient_quantity {offer_id, available}');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_pastry', 1)))) ->> 'detail')::jsonb,
  jsonb_build_object('p_lines', 'category_not_in_need', 'offer_id', tests.id('o_pastry')), 'category must be one of the need''s');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_box', 1)))) ->> 'message', 'unit_mismatch',
  'counted need: same unit only (unit_mismatch)');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oD', 2.5)))) ->> 'detail')::jsonb,
  jsonb_build_object('p_lines', 'integer_required', 'offer_id', tests.id('oD')), 'counted unit: integer quantity');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_far', 1)))) ->> 'message', 'out_of_radius',
  'store site outside the receiving radius: out_of_radius');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_late', 1)))) ->> 'message', 'infeasible_timing',
  'lot the charity cannot reach before its deadline: infeasible_timing');
select ok(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_late', 1)))) ->> 'detail' !~ 'eta',
  'infeasible_timing detail carries no ETA (hidden/approximate sites)');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_self', 1)))) ->> 'message', 'self_dealing',
  'a lot of the caller''s own store: self_dealing');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_demo', 1)))) ->> 'detail')::jsonb,
  jsonb_build_object('p_lines', 'demo_mismatch', 'offer_id', tests.id('o_demo')), 'demo and real data never mix');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_pending', 1)))) ->> 'message', 'not_found',
  'lot of an unapproved store: not_found');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('o_draft', 1)))) ->> 'message', 'not_found', 'draft lot: not_found');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(jsonb_build_object('offer_id', gen_random_uuid(), 'qty', 1)))) ->> 'message',
  'not_found', 'unknown lot: not_found');
select is((tests.error_of(tests.rb('n50', (select jsonb_agg(tests.ln('o_s' || i, 1)) from generate_series(1, 6) i))) ->> 'detail')::jsonb,
  '{"p_lines":"too_many_stops","max":5}'::jsonb, 'at most 5 store sites (stops) per bundle');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 20), tests.ln('oD', 18), tests.ln('oC', 12), tests.ln('oE', 1)))) ->> 'detail')::jsonb,
  '{"p_lines":"exceeds_need","remaining":50.000}'::jsonb, 'never more than the remaining need');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1)), jsonb_build_object('stop_count', 2))) ->> 'detail')::jsonb,
  '{"stop_count":"mismatch","expected":1}'::jsonb, 'p_meta.stop_count must match the lines');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 1)), jsonb_build_object('rematch_of', gen_random_uuid()))) ->> 'detail')::jsonb,
  '{"rematch_of":"not_a_bundle_of_this_need"}'::jsonb, 'rematch_of must be a bundle of the same need');
select tests.clear_auth();
update public.organizations set is_paused = true where id = tests.id('store_d');
select tests.authenticate_as('charity_owner');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oD', 1)))) ->> 'detail')::jsonb ->> 'reason', 'store_paused',
  'paused store: invalid_state / store_paused');
select tests.clear_auth();
update public.organizations set is_paused = false where id = tests.id('store_d');

-- atomicity: one bad line => nothing reserved anywhere
select tests.authenticate_as('charity_owner');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oA', 5), tests.ln('oD', 5), tests.ln('oE', 6)))) ->> 'message',
  'insufficient_quantity', 'last line short => the whole bundle fails');
select tests.clear_auth();
select results_eq(format($$select (select count(*)::int from public.allocations where need_id = %L),
                                  (select count(*)::int from public.need_bundles where need_id = %L),
                                  (select sum(qty_committed) from public.offers where id in (%L, %L, %L))$$,
                         tests.id('n50'), tests.id('n50'), tests.id('oA'), tests.id('oD'), tests.id('oE')),
  $$values (0, 0, 0.000::numeric)$$, 'all-or-nothing: no allocation, no bundle, no committed quantity');

-- ==== 50 bánh: A 20 + B 18 (hidden store) + C 12 (auto-accept) ====
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select tests.set_var('r1', public.reserve_bundle(%L, %L, 'c4000000-0000-4000-8000-000000000001',
                         '{"option_rank":1,"score":0.8123,"stop_count":3,"est_distance_m":9100,"est_duration_s":2400,
                           "algorithm_version":"match-v1","inputs_snapshot":{"candidates":3},
                           "route_geojson":{"type":"LineString","coordinates":[[106.66,10.76],[106.70,10.77],[106.66,10.76]]},
                           "route_provider":"fake"}')::text)$$,
                       tests.id('n50'), jsonb_build_array(tests.ln('oA', 15), tests.ln('oB', 18), tests.ln('oC', 12), tests.ln('oA', 5))),
  'charity owner reserves the 3-store plan (duplicate lot lines merged)');
select is(public.reserve_bundle(tests.id('n50'), jsonb_build_array(tests.ln('oA', 15), tests.ln('oB', 18), tests.ln('oC', 12), tests.ln('oA', 5)),
                                'c4000000-0000-4000-8000-000000000001',
                                '{"option_rank":1,"score":0.8123,"stop_count":3,"est_distance_m":9100,"est_duration_s":2400,
                                  "algorithm_version":"match-v1","inputs_snapshot":{"candidates":3},
                                  "route_geojson":{"type":"LineString","coordinates":[[106.66,10.76],[106.70,10.77],[106.66,10.76]]},
                                  "route_provider":"fake"}')::text,
  tests.var('r1'), 'replay returns the stored response');
select throws_ok(format($$select public.reserve_bundle(%L, %L, 'c4000000-0000-4000-8000-000000000001')$$, tests.id('n50'),
                        jsonb_build_array(tests.ln('oA', 1))),
  'PT409', 'idempotency_conflict', 'same client_op_id, other lines: idempotency_conflict');
select tests.clear_auth();
select tests.set_var('b1', tests.var('r1')::jsonb ->> 'bundle_id');
select results_eq(format($$select x ->> 'offer_id', x ->> 'status' from jsonb_array_elements(%L::jsonb -> 'allocations') x
                           order by x ->> 'offer_id'$$, tests.var('r1')),
  format($$select id::text, case when id = %L then 'confirmed' else 'requested' end from public.offers where id in (%L, %L, %L) order by id::text$$,
         tests.id('oC'), tests.id('oA'), tests.id('oB'), tests.id('oC')),
  'response {bundle_id, allocations:[{id, offer_id, status}]}: store C auto-accepts, A and B wait');
select results_eq(format($$select status::text, option_rank::int, qty_target, score, stop_count::int, est_distance_m, algorithm_version,
                                  inputs_snapshot, route_provider, extensions.geometrytype(route), rematch_of, client_op_id, created_by
                           from public.need_bundles where id = %L$$, tests.var('b1')),
  format($$values ('partially_confirmed', 1, 50.000::numeric, 0.8123::numeric, 3, 9100, 'match-v1', '{"candidates":3}'::jsonb, 'fake',
                   'LINESTRING', null::uuid, 'c4000000-0000-4000-8000-000000000001'::uuid, %L::uuid)$$, tests.id('charity_owner')),
  'bundle stored: partially_confirmed (one ok, two live), qty_target = remaining at selection');
select results_eq(format($$select o.id, o.qty_committed, o.status::text from public.offers o where o.id in (%L, %L, %L) order by o.qty_committed$$,
                         tests.id('oA'), tests.id('oB'), tests.id('oC')),
  format($$values (%L::uuid, 12.000::numeric, 'fully_allocated'), (%L::uuid, 18.000::numeric, 'fully_allocated'), (%L::uuid, 20.000::numeric, 'fully_allocated')$$,
         tests.id('oC'), tests.id('oB'), tests.id('oA')),
  'quantities committed under the lot locks (all three lots now fully allocated)');
select results_eq(format($$select status::text, qty_in_flight from public.needs where id = %L$$, tests.id('n50')),
  $$values ('matched', 50.000::numeric)$$, 'need matched (R = 50)');
select results_eq(format($$select count(*)::int, count(*) filter (where reserved_until is not null)::int, bool_and(need_id = %L and charity_site_id = %L)
                           from public.allocations where bundle_id = %L$$, tests.id('n50'), tests.id('site_b'), tests.var('b1')),
  $$values (3, 2, true)$$, '3 allocations; requested ones carry reserved_until');
select is((select count(*)::int from public.notification_outbox o join public.allocations a on a.id = o.aggregate_id
           where a.bundle_id = tests.var('b1')::uuid and o.event in ('allocation_requested', 'allocation_confirmed')), 4,
  'outbox: 3 allocation_requested + 1 allocation_confirmed (auto)');
select results_eq(format($$select action, count(*)::int from public.audit_logs where client_op_id = 'c4000000-0000-4000-8000-000000000001'
                           group by action order by action$$),
  $$values ('allocation.request', 3), ('bundle.reserve', 1)$$, 'audited: one bundle.reserve + one allocation.request per lot');
select ok(not exists (select 1 from public.audit_logs where client_op_id = 'c4000000-0000-4000-8000-000000000001' and after::text ~ '106\.|10\.7'),
  'no coordinate in audit_logs');

-- privacy: only the charity reads need_bundles (route / inputs_snapshot reveal its site)
select tests.authenticate_as('store_staff');
select is_empty(format('select 1 from public.need_bundles where id = %L', tests.var('b1')), 'supplying store cannot read the bundle (route)');
select isnt_empty(format('select 1 from public.needs where id = %L', tests.id('n50')), 'supplying store still reads the need context');
select tests.authenticate_as('charity_owner');
select isnt_empty(format('select route, inputs_snapshot from public.need_bundles where id = %L', tests.var('b1')), 'the charity reads its bundle');
select tests.clear_auth();

-- covered need: no further bundle
select tests.authenticate_as('charity_owner');
select is(tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oD', 1)))) ->> 'detail', 'need_already_covered',
  'matched need: invalid_state / need_already_covered');
select tests.clear_auth();

-- A and B confirm => bundle confirmed (+ bundle_confirmed once)
select tests.confirm('store_staff', (select a.id from public.allocations a where a.bundle_id = tests.var('b1')::uuid and a.offer_id = tests.id('oA')));
select is((select status::text from public.need_bundles where id = tests.var('b1')::uuid), 'partially_confirmed', 'B still pending');

-- ==== US-CHA-12: the hidden store B rejects 18 => shortfall, re-match only 18 ====
select tests.authenticate_as('other_owner');
select public.reject_allocation((select a.id from public.allocations a where a.bundle_id = tests.var('b1')::uuid and a.offer_id = tests.id('oB')),
                                'Hết hàng', gen_random_uuid());
select tests.clear_auth();
select results_eq(format($$select n.status::text, n.qty_in_flight, b.status::text from public.needs n, public.need_bundles b
                           where n.id = %L and b.id = %L$$, tests.id('n50'), tests.var('b1')),
  $$values ('partially_matched', 32.000::numeric, 'confirmed')$$, 'need back to partially_matched (32/50); bundle confirmed with the rest');
select is((select count(*)::int from public.notification_outbox where event = 'bundle_shortfall' and aggregate_id = tests.var('b1')::uuid), 1,
  'bundle_shortfall enqueued for the charity');
select is((select count(*)::int from public.notification_outbox where event = 'bundle_confirmed' and aggregate_id = tests.var('b1')::uuid), 1,
  'bundle_confirmed enqueued once');
select tests.authenticate_as('charity_owner');
select is((tests.error_of(tests.rb('n50', jsonb_build_array(tests.ln('oD', 18), tests.ln('oE', 1)))) ->> 'detail')::jsonb,
  '{"p_lines":"exceeds_need","remaining":18.000}'::jsonb, 're-match is capped to the shortfall (18)');
select lives_ok(format($$select tests.set_var('r2', public.reserve_bundle(%L, %L, gen_random_uuid(), %L)::text)$$, tests.id('n50'),
                       jsonb_build_array(tests.ln('oD', 18)), jsonb_build_object('rematch_of', tests.var('b1'), 'option_rank', 1)),
  'shortfall re-matched at store D with rematch_of');
select tests.clear_auth();
select results_eq(format($$select rematch_of::text, qty_target, stop_count::int from public.need_bundles where id = %L$$, tests.var('r2')::jsonb ->> 'bundle_id'),
  format($$values (%L, 18.000::numeric, 1)$$, tests.var('b1')), 'new bundle: rematch_of, qty_target = 18 (only the shortfall)');
select results_eq(format($$select status::text, qty_in_flight from public.needs where id = %L$$, tests.id('n50')),
  $$values ('matched', 50.000::numeric)$$, 'need matched again (A + C + D)');

-- ==== lazy expiry (step 5): a stale request on the lot is expired and released first ====
select tests.make_need('n_lazy', 'site_b', '{bread}', 'loaf', 5);
select tests.set_var('stale', tests.request('ch2_owner', tests.id('oE'), 5, 'site_z')::text);
update public.allocations set reserved_until = now() - interval '1 minute' where id = tests.var('stale')::uuid;
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select public.reserve_bundle(%L, %L, gen_random_uuid())$$, tests.id('n_lazy'), jsonb_build_array(tests.ln('oE', 5))),
  'lot held by a stale request is reservable');
select tests.clear_auth();
select results_eq(format($$select status::text, qty_released from public.allocations where id = %L$$, tests.var('stale')),
  $$values ('expired', 5.000::numeric)$$, 'stale request expired and released inside reserve_bundle (no cron)');
select is((select qty_committed from public.offers where id = tests.id('oE')), 5.000::numeric, 'qty_committed = new reservation only');

-- ==== kg need: counted lots convert through unit_weight_kg, overshoot < 1 unit (ADR-007 P2) ====
select tests.make_offer('o_loaves', 'site_d', 'bread', 100);
select tests.make_need('n_kg', 'site_b', '{bread}', 'kg', 2.95);
select tests.authenticate_as('charity_owner');
select is((tests.error_of(tests.rb('n_kg', jsonb_build_array(tests.ln('o_loaves', 26)))) ->> 'detail')::jsonb,
  '{"p_lines":"exceeds_need","remaining":2.950}'::jsonb, '26 × 0.12 kg = 3.12 kg overshoots by a full unit: refused');
select lives_ok(format($$select public.reserve_bundle(%L, %L, gen_random_uuid())$$, tests.id('n_kg'), jsonb_build_array(tests.ln('o_loaves', 25))),
  '25 × 0.12 kg = 3.0 kg (overshoot < one loaf) accepted');
select tests.clear_auth();
select results_eq(format($$select status::text, qty_in_flight from public.needs where id = %L$$, tests.id('n_kg')),
  $$values ('matched', 3.000::numeric)$$, 'kg need matched (3.0 kg in flight)');

-- ==== need states ====
select tests.make_need('n_old', 'site_b', '{bread}', 'loaf', 5, now() + interval '2 hours');
update public.needs set status = 'cancelled', closed_at = now() where id = tests.id('n_z');
select tests.authenticate_as('ch2_owner');
select throws_ok(tests.rb('n_z', jsonb_build_array(tests.ln('o_loaves', 1))), 'PT409', 'invalid_state', 'cancelled need: invalid_state');
select tests.clear_auth();
select tests.set_clock(now() + interval '3 hours');
select tests.authenticate_as('charity_owner');
select is(tests.error_of(tests.rb('n_old', jsonb_build_array(tests.ln('o_loaves', 1)))) ->> 'message', 'deadline_passed',
  'need past needed_by: deadline_passed');
select tests.clear_auth();
select tests.clear_clock();

-- ==== rate limit 60 / hour / org ====
insert into public.rate_limits (key, window_start, count)
values ('reserve_bundle:org:' || tests.id('charity_b'), date_bin('1 hour', now(), '2000-01-01 00:00+07'), 60)
on conflict (key, window_start) do update set count = 60;
select tests.make_need('n_rl', 'site_b', '{bread}', 'loaf', 5);
select tests.authenticate_as('charity_owner');
select is(tests.error_of(tests.rb('n_rl', jsonb_build_array(tests.ln('o_loaves', 1)))) ->> 'message', 'rate_limited',
  'the 61st reservation of the hour: rate_limited');
select tests.clear_auth();

select * from finish();
rollback;

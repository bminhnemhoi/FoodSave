-- assign_pickup (DATA-MODEL §6.4 confirmed -> assigned, §6.5, §8.5; P2 default = self pickup).
begin;
\ir ../_helpers.psql

select plan(26);

select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_site('site_z', 'charity_z', 'approximate', 10.77, 106.69);
select tests.create_site('site_b2', 'charity_b', 'approximate', 10.765, 106.665);

select tests.make_offer('o_a', 'site_a', 'bread', 20, now() - interval '5 minutes', now() + interval '6 hours');
select tests.make_offer('o_x', 'site_x', 'bread', 20, now() - interval '5 minutes', now() + interval '3 hours');
select tests.set_var('a1', tests.request('charity_owner', tests.id('o_a'), 3)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o_x'), 2)::text);
select tests.set_var('a3', tests.request('charity_owner', tests.id('o_a'), 1)::text);   -- stays requested
select tests.set_var('z1', tests.request('ch2_owner', tests.id('o_a'), 1, 'site_z')::text);
select tests.set_var('b2', tests.request('charity_owner', tests.id('o_a'), 1, 'site_b2')::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.confirm('other_owner', tests.var('a2')::uuid);
select tests.confirm('store_staff', tests.var('z1')::uuid);
select tests.confirm('store_staff', tests.var('b2')::uuid);

create function tests.plan(p_ids text[], p_extra jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('allocation_ids', (select jsonb_agg(tests.var(x)) from unnest(p_ids) x),
                            'mode', 'self', 'charity_site_id', tests.id('site_b')) || p_extra;
$$;
grant execute on function tests.plan(text[], jsonb) to authenticated;

-- ---- who ----
select tests.as_anon();
select throws_ok($$select public.assign_pickup(tests.plan('{a1}'), gen_random_uuid())$$, '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('store_staff');
select throws_ok($$select public.assign_pickup(tests.plan('{a1}'), gen_random_uuid())$$, 'PT404', 'not_found', 'store => not_found');
select tests.authenticate_as('charity_volunteer');
select throws_ok($$select public.assign_pickup(tests.plan('{a1}'), gen_random_uuid())$$, 'PT403', 'not_authorized',
  'volunteer cannot plan trips');
select tests.authenticate_as('ch2_owner');
select throws_ok($$select public.assign_pickup(tests.plan('{a1}'), gen_random_uuid())$$, 'PT404', 'not_found',
  'another charity => not_found');

-- ---- validation ----
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.assign_pickup(tests.plan('{a3}'), gen_random_uuid())$$, 'PT409', 'invalid_state',
  'a requested (unconfirmed) allocation cannot be planned');
select throws_ok($$select public.assign_pickup(tests.plan('{a1,z1}'), gen_random_uuid())$$, 'PT404', 'not_found',
  'allocation of another charity => not_found');
select is((tests.error_of($$select public.assign_pickup(tests.plan('{a1,b2}'), gen_random_uuid())$$) ->> 'detail')::jsonb ->> 'allocation_ids',
  'other_receiving_site', 'one trip delivers to one receiving site');
select is((tests.error_of($$select public.assign_pickup(tests.plan('{a1}', '{"pickup_id": "00000000-0000-4000-8000-000000000000"}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"pickup_id":"not_supported_yet"}'::jsonb, 're-planning an existing trip is P3');
select is((tests.error_of($$select public.assign_pickup(tests.plan('{a1}', '{"speed": 1}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"unknown_keys":["speed"]}'::jsonb, 'unknown keys refused');
select throws_ok($$select public.assign_pickup(tests.plan('{a1}', '{"mode": "drone"}'), gen_random_uuid())$$, 'PT422', 'validation_failed',
  'mode volunteer|self');
select is((tests.error_of($$select public.assign_pickup(tests.plan('{a1}') - 'allocation_ids', gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"allocation_ids":"non-empty uuid array"}'::jsonb, 'missing allocation_ids refused (3VL: no empty trip)');
select throws_ok(format($$select public.assign_pickup(tests.plan('{a1}', jsonb_build_object('mode', 'volunteer', 'assignee_user_id', %L)), gen_random_uuid())$$,
                        tests.id('outsider')),
  'PT422', 'validation_failed', 'assignee must be a member of the charity');
select throws_ok($$select public.assign_pickup(tests.plan('{a1,a2}', '{"stops": [{"site_id": "00000000-0000-4000-8000-000000000000", "seq": 1, "kind": "pickup"}]}'), gen_random_uuid())$$,
  'PT422', 'validation_failed', 'explicit stops must match the store sites + one dropoff');

-- ---- self pickup (P2 default), generated stops ----
select lives_ok($$select tests.set_var('p1', public.assign_pickup(tests.plan('{a1,a2}'), 'f6000000-0000-4000-8000-000000000001')::text)$$,
  'charity owner plans a self pickup for two lots');
select is(public.assign_pickup(tests.plan('{a1,a2}'), 'f6000000-0000-4000-8000-000000000001')::text, tests.var('p1'),
  'replay returns the same trip');
select tests.clear_auth();
select results_eq(format($$select mode::text, status::text, charity_site_id, assignee_user_id, created_by from public.pickups where id = %L$$, tests.var('p1')),
  format($$values ('self', 'planned', %L::uuid, null::uuid, %L::uuid)$$, tests.id('site_b'), tests.id('charity_owner')),
  'self trip without assignee is planned');
select results_eq(format($$select seq::int, kind::text, site_id, status::text from public.pickup_stops where pickup_id = %L order by seq$$, tests.var('p1')),
  format($$values (1, 'pickup', %L::uuid, 'pending'), (2, 'pickup', %L::uuid, 'pending'), (3, 'dropoff', %L::uuid, 'pending')$$,
         tests.id('site_x'), tests.id('site_a'), tests.id('site_b')),
  'generated stops: earliest deadline first (site_x 3 h, site_a 6 h), dropoff last');
select results_eq(format($$select status::text, pickup_id::text, stop_id = (select id from public.pickup_stops where pickup_id = %L and site_id = %L),
                          assigned_at is not null from public.allocations where id = %L$$, tests.var('p1'), tests.id('site_a'), tests.var('a1')),
  format($$values ('assigned', %L, true, true)$$, tests.var('p1')), 'allocations assigned to their stop');
select is((select count(*)::int from public.audit_logs where entity_id = tests.var('p1')::uuid and action = 'pickup.assign'), 1, 'audited once');
select ok(not exists (select 1 from public.notification_outbox where aggregate_id = tests.var('p1')::uuid), 'no assignee => no pickup_assigned');
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.assign_pickup(tests.plan('{a1}'), gen_random_uuid())$$, 'PT409', 'invalid_state',
  'an allocation already on a trip cannot be planned again');

-- ---- volunteer mode with assignee, explicit stops and route ----
select tests.clear_auth();
select tests.make_offer('o_c', 'site_a', 'bread', 5);
select tests.set_var('c1', tests.request('charity_owner', tests.id('o_c'), 2)::text);
select tests.confirm('store_staff', tests.var('c1')::uuid);
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select tests.set_var('p2', public.assign_pickup(tests.plan('{c1}', jsonb_build_object(
      'mode', 'volunteer', 'assignee_user_id', %L,
      'stops', jsonb_build_array(jsonb_build_object('site_id', %L, 'seq', 1, 'kind', 'pickup', 'eta', '2030-01-01T10:00:00+07:00'),
                                 jsonb_build_object('site_id', %L, 'seq', 2, 'kind', 'dropoff')),
      'route', jsonb_build_object('geojson', jsonb_build_object('type', 'LineString', 'coordinates', '[[106.70,10.77],[106.66,10.76]]'::jsonb),
                                  'distance_m', 5200, 'duration_s', 900, 'provider', 'fake'))), gen_random_uuid())::text)$$,
                       tests.id('charity_volunteer'), tests.id('site_a'), tests.id('site_b')),
  'volunteer trip with explicit stops and a route');
select tests.clear_auth();
select results_eq(format($$select mode::text, status::text, assignee_user_id, route_distance_m, route_provider, extensions.geometrytype(route)
                          from public.pickups where id = %L$$, tests.var('p2')),
  format($$values ('volunteer', 'assigned', %L::uuid, 5200, 'fake', 'LINESTRING')$$, tests.id('charity_volunteer')),
  'volunteer trip with assignee is assigned; route stored');
select is((select eta from public.pickup_stops where pickup_id = tests.var('p2')::uuid and seq = 1), '2030-01-01 10:00+07'::timestamptz,
  'stop ETA stored');
select results_eq(format($$select event::text, payload ->> 'assignee_user_id' from public.notification_outbox where aggregate_id = %L$$, tests.var('p2')),
  format($$values ('pickup_assigned', %L)$$, tests.id('charity_volunteer')), 'volunteer notified (pickup_assigned)');

-- lot past its deadline cannot be planned
select tests.make_offer('o_late', 'site_a', 'bread', 5, now() - interval '3 hours', now() + interval '1 hour');
select tests.set_var('l1', tests.request('charity_owner', tests.id('o_late'), 1)::text);
select tests.confirm('store_staff', tests.var('l1')::uuid);
update public.offers set pickup_window = tstzrange(now() - interval '3 hours', now() - interval '1 minute'),
                         effective_deadline = now() - interval '1 minute' where id = tests.id('o_late');
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.assign_pickup(tests.plan('{l1}'), gen_random_uuid())$$, 'PT409', 'deadline_passed',
  'lot past its effective deadline');
select tests.clear_auth();

select * from finish();
rollback;

-- assign_pickup re-planning (DATA-MODEL §6.5 planned → assigned "assign_pickup gán TNV", §8.5 p_plan.pickup_id;
-- PRD US-CHA-16 AC1/AC4; ROADMAP P3-09): change the allocation set, the stops and the volunteer of a
-- trip that has not started; one bundle split across two volunteers.
begin;
\ir ../_helpers.psql

select plan(32);

select tests.create_user('v2');
select tests.add_member('charity_b', 'v2', 'volunteer');
select tests.create_user('c_owner');
select tests.create_org('store_c', 'store', 'c_owner');
select tests.create_site('site_c2', 'store_c', 'public', 10.7660, 106.6630);
select tests.create_site('site_b2', 'charity_b', 'approximate', 10.765, 106.665);
select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_site('site_z', 'charity_z', 'approximate', 10.77, 106.69);

select tests.make_offer('oA', 'site_a', 'bread', 30);
select tests.make_offer('oX', 'site_x', 'bread', 30);
select tests.make_offer('oC', 'site_c2', 'bread', 30);
create function tests.alloc(p_offer text, p_qty numeric, p_user text default 'charity_owner', p_site text default 'site_b',
                            p_confirmer text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := tests.request(p_user, tests.id(p_offer), p_qty, p_site);
  perform tests.confirm(coalesce(p_confirmer, case p_offer when 'oX' then 'other_owner' when 'oC' then 'c_owner' else 'store_staff' end), v);
  return v;
end $$;
select tests.set_var('a1', tests.alloc('oA', 20)::text);
select tests.set_var('ax', tests.alloc('oX', 18)::text);
select tests.set_var('ac', tests.alloc('oC', 12)::text);
select tests.set_var('az', tests.alloc('oA', 1, 'ch2_owner', 'site_z')::text);
select tests.set_var('p', tests.pickup('charity_owner', array[tests.var('a1')::uuid, tests.var('ax')::uuid], 'site_b', 'volunteer', 'charity_volunteer')::text);
select tests.set_var('pz', tests.pickup('ch2_owner', array[tests.var('az')::uuid], 'site_z')::text);
select tests.set_var('stop_a', (select id::text from public.pickup_stops where pickup_id = tests.var('p')::uuid and site_id = tests.id('site_a')));
select tests.set_var('stop_x', (select id::text from public.pickup_stops where pickup_id = tests.var('p')::uuid and site_id = tests.id('site_x')));
select tests.set_var('a1_assigned_at', (select assigned_at::text from public.allocations where id = tests.var('a1')::uuid));
select tests.authenticate_as('charity_volunteer');
select public.respond_pickup(tests.var('p')::uuid, true, null, gen_random_uuid());
select tests.clear_auth();
update public.pickups set route = extensions.st_geomfromtext('LINESTRING(106.66 10.76, 106.70 10.77)', 4326), route_provider = 'fake',
                          route_distance_m = 9000 where id = tests.var('p')::uuid;

create function tests.replan(p_ids text[], p_extra jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('pickup_id', tests.var('p'), 'allocation_ids', (select jsonb_agg(tests.var(x)) from unnest(p_ids) x),
                            'mode', 'volunteer', 'charity_site_id', tests.id('site_b')) || p_extra;
$$;
grant execute on function tests.replan(text[], jsonb) to authenticated;

-- ==== refusals ====
select tests.authenticate_as('charity_owner');
select is((tests.error_of($$select public.assign_pickup(tests.replan('{a1}', '{"pickup_id":"nope"}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"pickup_id":"uuid"}'::jsonb, 'pickup_id must be a uuid');
select throws_ok($$select public.assign_pickup(tests.replan('{a1}', '{"pickup_id":"00000000-0000-4000-8000-000000000000"}'), gen_random_uuid())$$,
  'PT404', 'not_found', 'unknown trip: not_found');
select throws_ok(format($$select public.assign_pickup(tests.replan('{a1}', jsonb_build_object('pickup_id', %L)), gen_random_uuid())$$, tests.var('pz')),
  'PT404', 'not_found', 'another charity''s trip: not_found');
select is((tests.error_of($$select public.assign_pickup(tests.replan('{a1}') || jsonb_build_object('charity_site_id', tests.id('site_b2')), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"pickup_id":"other_receiving_site"}'::jsonb, 'trip of another receiving site refused');
select tests.authenticate_as('charity_volunteer');
select throws_ok($$select public.assign_pickup(tests.replan('{a1}'), gen_random_uuid())$$, 'PT403', 'not_authorized', 'volunteer cannot re-plan');

-- ==== re-plan: drop the hidden store X, add store C, hand over to v2, explicit order C → A ====
select tests.authenticate_as('charity_owner');
select is(public.assign_pickup(tests.replan('{a1,ac}', jsonb_build_object(
            'assignee_user_id', tests.id('v2'),
            'stops', jsonb_build_array(jsonb_build_object('site_id', tests.id('site_c2'), 'seq', 1, 'kind', 'pickup'),
                                       jsonb_build_object('site_id', tests.id('site_a'), 'seq', 2, 'kind', 'pickup', 'eta', '2030-01-01T10:00:00+07:00'),
                                       jsonb_build_object('site_id', tests.id('site_b'), 'seq', 3, 'kind', 'dropoff')))),
          'c8000000-0000-4000-8000-000000000001')::text,
  tests.var('p'), 're-plan returns the same trip');
select is(public.assign_pickup(tests.replan('{a1,ac}', jsonb_build_object(
            'assignee_user_id', tests.id('v2'),
            'stops', jsonb_build_array(jsonb_build_object('site_id', tests.id('site_c2'), 'seq', 1, 'kind', 'pickup'),
                                       jsonb_build_object('site_id', tests.id('site_a'), 'seq', 2, 'kind', 'pickup', 'eta', '2030-01-01T10:00:00+07:00'),
                                       jsonb_build_object('site_id', tests.id('site_b'), 'seq', 3, 'kind', 'dropoff')))),
          'c8000000-0000-4000-8000-000000000001')::text,
  tests.var('p'), 'replay returns the same trip');
select tests.clear_auth();
select results_eq(format($$select status::text, assignee_user_id, accepted_at, route, route_distance_m from public.pickups where id = %L$$, tests.var('p')),
  format($$values ('assigned', %L::uuid, null::timestamptz, null::extensions.geometry, null::int)$$, tests.id('v2')),
  'new volunteer, acceptance reset, stale route cleared');
select results_eq(format($$select seq::int, kind::text, site_id, status::text from public.pickup_stops where pickup_id = %L order by seq$$, tests.var('p')),
  format($$values (1, 'pickup', %L::uuid, 'pending'), (2, 'pickup', %L::uuid, 'pending'), (3, 'dropoff', %L::uuid, 'pending')$$,
         tests.id('site_c2'), tests.id('site_a'), tests.id('site_b')),
  'stops rebuilt in the planned order (deferred seq uniqueness)');
select is((select id::text from public.pickup_stops where pickup_id = tests.var('p')::uuid and site_id = tests.id('site_a')), tests.var('stop_a'),
  'the kept store stop keeps its id (handover tokens stay attached)');
select is((select eta from public.pickup_stops where id = tests.var('stop_a')::uuid), '2030-01-01 10:00+07'::timestamptz, 'stop ETA updated');
select is((select count(*)::int from public.pickup_stops where id = tests.var('stop_x')::uuid), 0, 'the dropped store stop is deleted');
select results_eq(format($$select id::text, status::text, pickup_id::text, (stop_id = (select st.id from public.pickup_stops st where st.pickup_id = %L and st.site_id = store_site_id))
                           from public.allocations where id in (%L, %L, %L) order by id$$,
                         tests.var('p'), tests.var('a1'), tests.var('ax'), tests.var('ac')),
  format($$select x.id::text, x.s, x.p, x.ok from (values (%L::uuid, 'assigned', %L, true), (%L::uuid, 'confirmed', null, null), (%L::uuid, 'assigned', %L, true)) x(id, s, p, ok) order by x.id$$,
         tests.var('a1'), tests.var('p'), tests.var('ax'), tests.var('ac'), tests.var('p')),
  'A kept, C added on its new stop, X back to confirmed off the trip');
select is((select assigned_at::text from public.allocations where id = tests.var('a1')::uuid), tests.var('a1_assigned_at'), 'kept allocation keeps assigned_at');
select is((select qty_committed from public.offers where id = tests.id('oX')), 18.000::numeric, 'X keeps its reservation (only off the trip)');
select results_eq(format($$select
    (select count(*)::int from public.notification_outbox where aggregate_id = %L and event = 'pickup_assigned'
       and payload ->> 'assignee_user_id' = %L and dedupe_key like '%%c8000000-0000-4000-8000-000000000001'),
    (select count(*)::int from public.notification_outbox where aggregate_id = %L and event = 'pickup_cancelled'
       and payload ->> 'scope' = 'unassigned' and payload ->> 'user_id' = %L),
    (select count(*)::int from public.notification_outbox where aggregate_id = %L and event = 'pickup_cancelled'
       and payload ->> 'scope' = 'stop' and payload ->> 'site_id' = %L)$$,
    tests.var('p'), tests.id('v2'), tests.var('p'), tests.id('charity_volunteer'), tests.var('p'), tests.id('site_x')),
  $$values (1, 1, 1)$$, 'outbox: the new volunteer is assigned, the old one unassigned, the dropped store told');
select results_eq(format($$select action, (after ->> 'detached')::int, (after ->> 'assignee_changed')::boolean from public.audit_logs
                           where entity_id = %L and action = 'pickup.replan'$$, tests.var('p')),
  $$values ('pickup.replan', 1, true)$$, 'audited pickup.replan');

-- ==== unassign (back to planned), then re-assign the same volunteer with a route ====
select tests.authenticate_as('charity_owner');
select lives_ok($$select public.assign_pickup(tests.replan('{a1,ac}'), gen_random_uuid())$$, 'no assignee => planned');
select tests.clear_auth();
select results_eq(format($$select status::text, assignee_user_id from public.pickups where id = %L$$, tests.var('p')),
  $$values ('planned', null::uuid)$$, 'trip planned again (waiting for a volunteer)');
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select public.assign_pickup(tests.replan('{a1,ac}', jsonb_build_object('assignee_user_id', %L, 'planned_start_at', '2030-01-01T09:00:00+07:00',
                  'route', jsonb_build_object('geojson', jsonb_build_object('type', 'LineString', 'coordinates', '[[106.66,10.76],[106.70,10.77]]'::jsonb),
                                              'distance_m', 8000, 'duration_s', 1500, 'provider', 'fake'))), gen_random_uuid())$$, tests.id('v2')),
  'planned → assigned with a route (§6.5 "assign_pickup gán TNV")');
select lives_ok(format($$select public.assign_pickup(tests.replan('{a1,ac}', jsonb_build_object('assignee_user_id', %L, 'planned_start_at', '2030-01-01T09:30:00+07:00')),
                         'c8000000-0000-4000-8000-000000000009')$$, tests.id('v2')),
  'same volunteer, new start time');
select tests.clear_auth();
select results_eq(format($$select status::text, planned_start_at, route_distance_m, route_provider from public.pickups where id = %L$$, tests.var('p')),
  $$values ('assigned', '2030-01-01 09:30+07'::timestamptz, 8000, 'fake')$$, 'unchanged stops keep the route; start time updated');
select is((select (payload ->> 'replanned')::boolean from public.notification_outbox where dedupe_key like 'pickup_assigned:%c8000000-0000-4000-8000-000000000009'),
  true, 'same volunteer gets a "trip updated" pickup_assigned');

-- ==== split one bundle across two volunteers (US-CHA-16 AC1) ====
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select tests.set_var('p2', public.assign_pickup(jsonb_build_object('allocation_ids', jsonb_build_array(%L), 'mode', 'volunteer',
                         'charity_site_id', %L, 'assignee_user_id', %L), gen_random_uuid())::text)$$, tests.var('ax'), tests.id('site_b'), tests.id('charity_volunteer')),
  'the dropped store X becomes a second trip for the first volunteer');
select tests.clear_auth();
select results_eq(format($$select count(*)::int, count(distinct a.pickup_id)::int, count(distinct p.assignee_user_id)::int from public.allocations a
                           join public.pickups p on p.id = a.pickup_id where a.id in (%L, %L, %L)$$, tests.var('a1'), tests.var('ac'), tests.var('ax')),
  $$values (3, 2, 2)$$, '3 allocations on 2 trips with 2 volunteers');

-- ==== limits ====
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.assign_pickup(tests.replan('{a1,ax}'), gen_random_uuid())$$), 'PT409', 'invalid_state',
  'an allocation of another trip cannot be pulled in');
select tests.clear_auth();
select tests.authenticate_as('v2');
select public.start_pickup(tests.var('p')::uuid, gen_random_uuid());
select tests.authenticate_as('charity_owner');
select is(tests.error_of($$select public.assign_pickup(tests.replan('{a1}'), gen_random_uuid())$$) ->> 'detail', 'trip_started',
  'a started trip cannot be re-planned');
select tests.clear_auth();

-- ==== self trip: an issued (unconsumed) handover of a dropped stop is discarded ====
select tests.set_var('s1', tests.alloc('oA', 2)::text);
select tests.set_var('s2', tests.alloc('oX', 2)::text);
select tests.set_var('ps', tests.pickup('charity_owner', array[tests.var('s1')::uuid, tests.var('s2')::uuid])::text);
select tests.set_var('ps_x', (select id::text from public.pickup_stops where pickup_id = tests.var('ps')::uuid and site_id = tests.id('site_x')));
select tests.issue('charity_owner', tests.var('ps_x')::uuid, 'hx');
select is((select count(*)::int from public.handovers where stop_id = tests.var('ps_x')::uuid), 1, 'token issued at the X stop');
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select public.assign_pickup(jsonb_build_object('pickup_id', %L, 'allocation_ids', jsonb_build_array(%L), 'mode', 'self',
                         'charity_site_id', %L), gen_random_uuid())$$, tests.var('ps'), tests.var('s1'), tests.id('site_b')),
  'self trip re-planned without X');
select tests.clear_auth();
select is((select count(*)::int from public.handovers where stop_id = tests.var('ps_x')::uuid), 0, 'its unconsumed handover is discarded');
select is((select count(*)::int from public.pickup_stops where pickup_id = tests.var('ps')::uuid), 2, 'one store stop + dropoff left');
select tests.authenticate_as('store_staff');
select is(tests.error_of(format($$select public.consume_handover_token(%L, '[]', gen_random_uuid())$$, tests.var('hx_token'))) ->> 'message',
  'token_invalid', 'the old QR no longer works');
select tests.clear_auth();

select * from finish();
rollback;

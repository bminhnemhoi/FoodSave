-- check_in_stop (DATA-MODEL §6.5 stops pending → arrived, §8.5; PRD US-VOL-06; SECURITY-PRIVACY §5 row 10):
-- geofence 100 m against the EXACT site location (server side), manual check-in with a reason,
-- no-location check-in; only a flag is stored, never a coordinate.
begin;
\ir ../_helpers.psql

select plan(27);

select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.set_var('p2', tests.volunteer_trip('o2')::text);
select tests.set_var('p3', tests.volunteer_trip('o3')::text);
select tests.set_var('p4', tests.volunteer_trip('o4')::text);
-- a trip to the HIDDEN store site_x (same pin as site_a): the geofence still uses the exact location
select tests.make_offer('ox', 'site_x', 'bread', 10);
select tests.set_var('ax', tests.request('charity_owner', tests.id('ox'), 2)::text);
select tests.confirm('other_owner', tests.var('ax')::uuid);
select tests.set_var('px', tests.pickup('charity_owner', array[tests.var('ax')::uuid], 'site_b', 'volunteer', 'charity_volunteer')::text);
select tests.authenticate_as('charity_volunteer');
select public.start_pickup(x::uuid, gen_random_uuid()) from (values (tests.var('p1')), (tests.var('p2')), (tests.var('p3')), (tests.var('px'))) v(x);
select tests.clear_auth();
select tests.set_var(v.t || '_' || st.kind, st.id::text)
from (values ('p1'), ('p2'), ('p3'), ('p4'), ('px')) v(t)
join public.pickup_stops st on st.pickup_id = tests.var(v.t)::uuid;
create function tests.pstop(p_trip text, p_kind text default 'pickup') returns uuid language sql stable as $$
  select tests.var(p_trip || '_' || p_kind)::uuid;
$$;
grant execute on function tests.pstop(text, text) to authenticated, anon;

-- ==== who may call ====
select tests.as_anon();
select throws_ok(format('select public.check_in_stop(%L, 10.7772, 106.7010, gen_random_uuid())', tests.pstop('p1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select public.check_in_stop(%L, 10.7772, 106.7010, gen_random_uuid())', tests.pstop('p1')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format('select public.check_in_stop(%L, 10.7772, 106.7010, gen_random_uuid())', tests.pstop('p1')), 'PT403', 'not_authorized',
  'store of the stop sees it but cannot check in');
select tests.authenticate_as('charity_owner');
select throws_ok(format('select public.check_in_stop(%L, 10.7772, 106.7010, gen_random_uuid())', tests.pstop('p1')), 'PT403', 'not_authorized',
  'coordinator is not the carrier of a volunteer trip');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select public.check_in_stop(%L, 10.7772, null, gen_random_uuid())', tests.pstop('p1')), 'PT422', 'validation_failed',
  'lat without lng refused');
select throws_ok(format('select public.check_in_stop(%L, null, null, gen_random_uuid(), %L)', tests.pstop('p1'), repeat('x', 201)), 'PT422', 'validation_failed',
  'reason ≤ 200 chars');
select throws_ok(format('select public.check_in_stop(%L, 10.7772, 106.7010, gen_random_uuid())', tests.pstop('p4')), 'PT409', 'invalid_state',
  'trip not started: invalid_state (trip_not_started)');
select throws_ok('select public.check_in_stop(null, 10.7772, 106.7010, gen_random_uuid())', 'PT404', 'not_found', 'NULL stop: not_found');

-- ==== outside the fence without a reason: nothing changes, the app asks for one ====
select lives_ok(format($$select tests.set_var('out1', public.check_in_stop(%L, 10.7800, 106.7008, 'c6200000-0000-4000-8000-000000000001')::text)$$, tests.pstop('p1')),
  'check-in 350 m away');
select results_eq(format($$select (%L::jsonb ->> 'arrived')::boolean, (%L::jsonb ->> 'distance_m')::int between 300 and 400, (%L::jsonb ->> 'reason_required')::boolean$$,
                         tests.var('out1'), tests.var('out1'), tests.var('out1')),
  $$values (false, true, true)$$, '{arrived:false, distance_m ≈ 346, reason_required:true}');
select is(public.check_in_stop(tests.pstop('p1'), 10.7800, 106.7008, 'c6200000-0000-4000-8000-000000000001')::text, tests.var('out1'),
  'replay returns the same answer');
select tests.clear_auth();
select is((select status::text from public.pickup_stops where id = tests.pstop('p1')), 'pending', 'stop still pending');
-- with a reason: manual check-in, flagged
select tests.authenticate_as('charity_volunteer');
select lives_ok(format($$select tests.set_var('man1', public.check_in_stop(%L, 10.7800, 106.7008, gen_random_uuid(), 'GPS không chính xác')::text)$$, tests.pstop('p1')),
  'outside with a reason');
select tests.clear_auth();
select results_eq(format($$select status::text, arrived_at is not null, arrival_check, arrival_note from public.pickup_stops where id = %L$$, tests.pstop('p1')),
  $$values ('arrived', true, 'manual', 'GPS không chính xác')$$, 'arrived, flagged manual with the reason (coordinator sees the flag)');
select is((tests.var('man1')::jsonb ->> 'check'), 'manual', 'response check = manual');

-- ==== inside the fence ====
select tests.authenticate_as('charity_volunteer');
select lives_ok(format($$select tests.set_var('in2', public.check_in_stop(%L, 10.7772, 106.7010, gen_random_uuid())::text)$$, tests.pstop('p2')),
  'check-in ~40 m from the store pin');
select tests.clear_auth();
select results_eq(format($$select (%L::jsonb ->> 'arrived')::boolean, (%L::jsonb ->> 'distance_m')::int < 100, %L::jsonb ->> 'check'$$,
                         tests.var('in2'), tests.var('in2'), tests.var('in2')),
  $$values (true, true, 'geofence')$$, '{arrived:true, distance_m < 100, check: geofence}');
select results_eq(format($$select status::text, arrival_check, arrival_note from public.pickup_stops where id = %L$$, tests.pstop('p2')),
  $$values ('arrived', 'geofence', null::text)$$, 'stop arrived (geofence)');
select ok((select eta from public.pickup_stops where id = tests.pstop('p2', 'dropoff')) is not null, 'next stop ETA recomputed from the store');
select results_eq(format($$select payload - 'pickup_id' - 'stop_id' - 'site_id' - 'charity_org_id' from public.notification_outbox
                           where event = 'volunteer_checked_in' and payload ->> 'stop_id' = %L$$, tests.pstop('p2')),
  $$values ('{"kind":"pickup","verified":true}'::jsonb)$$, 'outbox volunteer_checked_in (N-16): ids + verified flag, no coordinate');
select ok(not exists (select 1 from public.audit_logs where entity_id = tests.pstop('p2') and after::text ~ '10\.77|106\.70'),
  'no coordinate in audit_logs (only the check method)');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select public.check_in_stop(%L, 10.7772, 106.7010, gen_random_uuid())', tests.pstop('p2')), 'PT409', 'invalid_state',
  'arrived twice: invalid_state');

-- ==== no location: manual, flagged no_location ====
select lives_ok(format('select public.check_in_stop(%L, null, null, gen_random_uuid())', tests.pstop('p3')), 'check-in without GPS');
select throws_ok(format('select public.check_in_stop(%L, 10.762622, 106.660172, gen_random_uuid())', tests.pstop('p3', 'dropoff')),
  'PT409', 'invalid_state', 'dropoff check-in while a pickup stop is still open: invalid_state (pickups_pending)');
select tests.clear_auth();
select results_eq(format($$select arrival_check from public.pickup_stops where id = %L$$, tests.pstop('p3')),
  $$values ('no_location')$$, 'flag no_location ("không xác minh vị trí")');

-- ==== hidden store site: the fence is computed server-side on the exact pin ====
select tests.authenticate_as('charity_volunteer');
select is((public.check_in_stop(tests.pstop('px'), 10.7772, 106.7010, gen_random_uuid()) ->> 'check'), 'geofence',
  'hidden store site: geofence against its exact location (never sent to the client)');
select tests.clear_auth();
select tests.authenticate_as('other_owner');
select results_eq(format($$select status::text, arrival_check from public.pickup_stops where id = %L$$, tests.pstop('px')),
  $$values ('arrived', 'geofence')$$, 'the hidden store sees arrival + flag on its stop');
select tests.clear_auth();

select * from finish();
rollback;

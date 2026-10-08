-- update_pickup_progress (DATA-MODEL §2.3 pickups.last_location, §8.5, §11 location_trip; SECURITY-PRIVACY §2.3,
-- C9; PRD US-VOL-02, US-VOL-12, US-STO-22 AC2): assignee only, consent required, ≥ 30 s apart,
-- 4 decimals, only the latest point, ETAs recomputed, never visible to stores, never logged.
begin;
\ir ../_helpers.psql

select plan(27);

select tests.create_user('v2');
select tests.add_member('charity_b', 'v2', 'volunteer');
select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.set_var('p2', tests.volunteer_trip('o2')::text);
select tests.authenticate_as('charity_volunteer');
select public.start_pickup(tests.var('p1')::uuid, gen_random_uuid());
select tests.clear_auth();

-- ==== who may call ====
select tests.as_anon();
select throws_ok(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p1')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p1')), 'PT404', 'not_found',
  'store: not_found (a store never touches the volunteer position)');
select tests.authenticate_as('v2');
select throws_ok(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p1')), 'PT404', 'not_found',
  'another volunteer: not_found');
select tests.authenticate_as('charity_owner');
select throws_ok(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p1')), 'PT403', 'not_authorized',
  'coordinator cannot send a position for the volunteer');

-- ==== consent / state / input ====
select tests.authenticate_as('charity_volunteer');
select is(tests.error_of(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p1'))) - 'hint',
  '{"sqlstate":"PT403","message":"not_authorized","detail":"consent_required"}'::jsonb, 'no location_trip consent: refused');
select tests.clear_auth();
select tests.grant_location('charity_volunteer');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p2')), 'PT409', 'invalid_state',
  'trip not started: invalid_state');
select throws_ok(format('select public.update_pickup_progress(%L, null, 106.66, 10)', tests.var('p1')), 'PT422', 'validation_failed', 'NULL lat refused');
select throws_ok(format('select public.update_pickup_progress(%L, 91, 106.66, 10)', tests.var('p1')), 'PT422', 'validation_failed', 'lat out of range');
select throws_ok(format($$select public.update_pickup_progress(%L, 'NaN', 106.66, 10)$$, tests.var('p1')), 'PT422', 'validation_failed', 'NaN refused');
select throws_ok(format('select public.update_pickup_progress(%L, 10.76, 106.66, -1)', tests.var('p1')), 'PT422', 'validation_failed', 'negative accuracy refused');

-- ==== first point ====
select lives_ok(format($$select tests.set_var('r1', public.update_pickup_progress(%L, 10.762345678, 106.660987654, 15)::text)$$, tests.var('p1')),
  'assignee with consent sends a point');
select tests.clear_auth();
select results_eq(format($$select extensions.st_y(last_location::extensions.geometry), extensions.st_x(last_location::extensions.geometry),
                                  last_location_at = now(), last_location_accuracy_m from public.pickups where id = %L$$, tests.var('p1')),
  $$values (10.7623::float8, 106.6610::float8, true, 15)$$, 'only the latest point, rounded to 4 decimals (~11 m)');
select results_eq(format($$select (x ->> 'stop_id')::uuid, (x ->> 'eta')::timestamptz from jsonb_array_elements(%L::jsonb -> 'etas') x$$, tests.var('r1')),
  format($$select id, eta from public.pickup_stops where pickup_id = %L order by seq$$, tests.var('p1')),
  'returns {etas:[{stop_id, eta}]} = pickup_stops.eta of the pending stops, in order');
select is((select eta from public.pickup_stops where pickup_id = tests.var('p1')::uuid and kind = 'pickup'),
  (select date_trunc('minute', t) + case when t > date_trunc('minute', t) then interval '1 minute' else interval '0' end
   from (select now() + private.travel_min(extensions.st_distance(
                  extensions.st_setsrid(extensions.st_makepoint(106.6610, 10.7623), 4326)::extensions.geography, s.location))::float8
                * interval '1 minute' as t
         from public.sites s where s.id = tests.id('site_a')) x),
  'pickup ETA = now + travel_min(distance to the EXACT store pin), rounded up to the minute (§4.7)');
select ok((select eta from public.pickup_stops where pickup_id = tests.var('p1')::uuid and kind = 'dropoff')
          > (select eta from public.pickup_stops where pickup_id = tests.var('p1')::uuid and kind = 'pickup'),
  'dropoff ETA chained after the pickup');

-- ==== rate limit: one point per location_min_interval_seconds ====
select tests.authenticate_as('charity_volunteer');
select is((tests.error_of(format('select public.update_pickup_progress(%L, 10.765, 106.67, 15)', tests.var('p1'))) ->> 'message'),
  'rate_limited', 'a second point within 30 s: PT429 rate_limited');
select ok((tests.error_of(format('select public.update_pickup_progress(%L, 10.765, 106.67, 15)', tests.var('p1'))) ->> 'hint')::int between 1 and 30,
  'hint = seconds to wait');
select tests.clear_auth();
select tests.set_clock(now() + interval '31 seconds');
select tests.authenticate_as('charity_volunteer');
select lives_ok(format('select public.update_pickup_progress(%L, 10.77012, 106.69034, null)', tests.var('p1')), 'next point after 31 s');
select tests.clear_auth();
select results_eq(format($$select extensions.st_astext(last_location::extensions.geometry), last_location_accuracy_m from public.pickups where id = %L$$, tests.var('p1')),
  $$values ('POINT(106.6903 10.7701)', null::int)$$, 'the previous point is overwritten (no history)');
select tests.clear_clock();

-- ==== privacy ====
select tests.authenticate_as('store_staff');
select is_empty(format('select last_location from public.pickups where id = %L', tests.var('p1')), 'store cannot read pickups (no position)');
select isnt_empty(format($$select eta from public.pickup_stops where pickup_id = %L and site_id = %L$$, tests.var('p1'), tests.id('site_a')),
  'store reads only the ETA of its stop');
select tests.authenticate_as('charity_owner');
select isnt_empty(format('select last_location from public.pickups where id = %L and last_location is not null', tests.var('p1')),
  'coordinator reads the latest position (C9)');
select tests.clear_auth();
select ok(not exists (select 1 from public.audit_logs where entity_id = tests.var('p1')::uuid and (after::text ~ '106\.6|10\.76|10\.77' or action like '%progress%')),
  'positions are never written to audit_logs');
select ok(not exists (select 1 from public.notification_outbox where aggregate_id = tests.var('p1')::uuid and payload::text ~ '106\.6|10\.76'),
  'positions are never written to the outbox');

-- withdrawing consent clears the point and stops further updates
select tests.authenticate_as('charity_volunteer');
select public.withdraw_consent('location_trip');
select tests.clear_auth();
select is((select last_location from public.pickups where id = tests.var('p1')::uuid), null::extensions.geography,
  'withdrawing location_trip clears the stored point');
select tests.set_clock(now() + interval '2 minutes');
select tests.authenticate_as('charity_volunteer');
select is(tests.error_of(format('select public.update_pickup_progress(%L, 10.76, 106.66, 10)', tests.var('p1'))) ->> 'detail', 'consent_required',
  'and no new point is accepted');
select tests.clear_auth();
select tests.clear_clock();

select * from finish();
rollback;

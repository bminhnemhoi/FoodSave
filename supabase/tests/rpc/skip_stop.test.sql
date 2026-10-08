-- skip_stop (DATA-MODEL §6.4 assigned → confirmed, §6.5 stops → skipped, §7 C6; PRD US-VOL-13)
begin;
\ir ../_helpers.psql

select plan(19);

-- two-store volunteer trip: site_a (o1, 3) + hidden site_x (ox, 2)
select tests.make_offer('o1', 'site_a', 'bread', 10);
select tests.make_offer('ox', 'site_x', 'bread', 10);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 3)::text);
select tests.set_var('ax', tests.request('charity_owner', tests.id('ox'), 2)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.confirm('other_owner', tests.var('ax')::uuid);
select tests.set_var('p', tests.pickup('charity_owner', array[tests.var('a1')::uuid, tests.var('ax')::uuid], 'site_b', 'volunteer',
                                       'charity_volunteer')::text);
select tests.set_var('s_a', (select id::text from public.pickup_stops where pickup_id = tests.var('p')::uuid and site_id = tests.id('site_a')));
select tests.set_var('s_x', (select id::text from public.pickup_stops where pickup_id = tests.var('p')::uuid and site_id = tests.id('site_x')));
select tests.set_var('s_d', (select id::text from public.pickup_stops where pickup_id = tests.var('p')::uuid and kind = 'dropoff'));
select tests.set_var('p2', tests.volunteer_trip('o2')::text);
select tests.set_var('s2', (select id::text from public.pickup_stops where pickup_id = tests.var('p2')::uuid and kind = 'pickup'));

-- ==== who may call ====
select tests.as_anon();
select throws_ok(format($$select public.skip_stop(%L, 'x', gen_random_uuid())$$, tests.var('s_x')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.skip_stop(%L, 'x', gen_random_uuid())$$, tests.var('s_x')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.skip_stop(%L, 'x', gen_random_uuid())$$, tests.var('s_a')), 'PT403', 'not_authorized',
  'store of the stop sees it but cannot skip it');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.skip_stop(%L, '  ', gen_random_uuid())$$, tests.var('s_x')), 'PT422', 'validation_failed', 'reason required');
select throws_ok($$select public.skip_stop(null, 'x', gen_random_uuid())$$, 'PT404', 'not_found', 'NULL stop: not_found');
select throws_ok(format($$select public.skip_stop(%L, 'x', gen_random_uuid())$$, tests.var('s_d')), 'PT409', 'invalid_state',
  'the dropoff stop cannot be skipped');

-- ==== C6: the volunteer skips the hidden store's stop ====
select lives_ok(format($$select public.skip_stop(%L, 'Cửa hàng đóng cửa', 'c6300000-0000-4000-8000-000000000001')$$, tests.var('s_x')),
  'carrier skips a stop');
select lives_ok(format($$select public.skip_stop(%L, 'Cửa hàng đóng cửa', 'c6300000-0000-4000-8000-000000000001')$$, tests.var('s_x')),
  'replay is a no-op');
select throws_ok(format($$select public.skip_stop(%L, 'Lại', gen_random_uuid())$$, tests.var('s_x')), 'PT409', 'invalid_state',
  'skipping twice: invalid_state');
select tests.clear_auth();
select results_eq(format($$select status::text, pickup_id, stop_id, assigned_at from public.allocations where id = %L$$, tests.var('ax')),
  $$values ('confirmed', null::uuid, null::uuid, null::timestamptz)$$, 'allocation back to confirmed, off the trip');
select is((select qty_committed from public.offers where id = tests.id('ox')), 2.000::numeric, 'quantity kept (C6: giữ nguyên)');
select results_eq(format($$select status::text, skip_reason from public.pickup_stops where id = %L$$, tests.var('s_x')),
  $$values ('skipped', 'Cửa hàng đóng cửa')$$, 'stop skipped with the reason');
select results_eq(format($$select status::text from public.pickups where id = %L$$, tests.var('p')),
  $$values ('assigned')$$, 'trip goes on with the other stop');
select results_eq(format($$select payload ->> 'scope', payload ->> 'site_id', payload ->> 'reason' from public.notification_outbox
                           where event = 'pickup_cancelled' and aggregate_id = %L$$, tests.var('p')),
  format($$values ('stop', %L, 'stop_skipped')$$, tests.id('site_x')), 'outbox pickup_cancelled scope stop (store + coordinators told)');
select results_eq(format($$select action, reason, (after ->> 'allocations_back_to_confirmed')::int from public.audit_logs where entity_id = %L$$, tests.var('s_x')),
  $$values ('stop.skip', 'Cửa hàng đóng cửa', 1)$$, 'audited');

-- ==== a coordinator skips the only stop: the trip has nothing left => cancelled ====
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select public.skip_stop(%L, 'Lô không còn', gen_random_uuid())$$, tests.var('s2')), 'coordinator may skip too');
select tests.clear_auth();
select results_eq(format($$select status::text, cancel_reason from public.pickups where id = %L$$, tests.var('p2')),
  $$values ('cancelled', 'no_allocations')$$, 'emptied trip cancelled by refresh_pickup');
select is((select status::text from public.allocations where id = tests.var('o2_alloc')::uuid), 'confirmed', 'its allocation is confirmed again');

-- a stop already handed over cannot be skipped
select tests.set_var('p3', tests.volunteer_trip('o3')::text);
select tests.set_var('s3', (select id::text from public.pickup_stops where pickup_id = tests.var('p3')::uuid and kind = 'pickup'));
select tests.issue('charity_volunteer', tests.var('s3')::uuid, 'h3');
select tests.set_var('l3', tests.full_lines(tests.var('s3')::uuid)::text);
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('h3_token'), tests.var('l3')::jsonb, gen_random_uuid());
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.skip_stop(%L, 'x', gen_random_uuid())$$, tests.var('s3')), 'PT409', 'invalid_state',
  'a stop already handed over cannot be skipped');
select tests.clear_auth();

select * from finish();
rollback;

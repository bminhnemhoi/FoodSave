-- cancel_pickup (DATA-MODEL §6.5 → cancelled, §7 C5 / C10; PRD US-CHA-23; SECURITY-PRIVACY C9)
begin;
\ir ../_helpers.psql

select plan(23);

select tests.create_user('charity_staff');
select tests.add_member('charity_b', 'charity_staff', 'staff');
select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.set_var('p2', tests.volunteer_trip('o2')::text);
select tests.set_var('p3', tests.volunteer_trip('o3')::text);
select tests.grant_location('charity_volunteer');
select tests.authenticate_as('charity_volunteer');
select public.start_pickup(tests.var('p1')::uuid, gen_random_uuid());
select public.update_pickup_progress(tests.var('p1')::uuid, 10.765, 106.67, 20);
select tests.clear_auth();

-- ==== who may call ====
select tests.as_anon();
select throws_ok(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p1')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p1')), 'PT404', 'not_found',
  'store: not_found (reports a no-show through report_incident)');
select tests.authenticate_as('charity_staff');
select throws_ok(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p1')), 'PT403', 'not_authorized',
  'staff: owner/manager only');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p1')), 'PT403', 'not_authorized',
  'the volunteer cannot cancel the trip (respond_pickup / skip_stop instead)');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p1')), 'PT403', 'mfa_required', 'admin aal1: mfa_required');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.cancel_pickup(%L, null, gen_random_uuid())$$, tests.var('p1')), 'PT422', 'validation_failed', 'reason required');
select throws_ok($$select public.cancel_pickup(null, 'x', gen_random_uuid())$$, 'PT404', 'not_found', 'NULL trip: not_found');

-- ==== C5: volunteer no-show on a running trip ====
select lives_ok(format($$select public.cancel_pickup(%L, 'TNV không đến', 'c6400000-0000-4000-8000-000000000001')$$, tests.var('p1')),
  'owner cancels the running trip');
select lives_ok(format($$select public.cancel_pickup(%L, 'TNV không đến', 'c6400000-0000-4000-8000-000000000001')$$, tests.var('p1')),
  'replay is a no-op');
select throws_ok(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p1')), 'PT409', 'invalid_state',
  'cancelled twice: invalid_state');
select tests.clear_auth();
select results_eq(format($$select status::text, cancel_reason, cancelled_at is not null, last_location, last_location_at
                           from public.pickups where id = %L$$, tests.var('p1')),
  $$values ('cancelled', 'TNV không đến', true, null::extensions.geography, null::timestamptz)$$,
  'trip cancelled, the volunteer position cleared (C9)');
select results_eq(format($$select status::text, pickup_id, stop_id from public.allocations where id = %L$$, tests.var('o1_alloc')),
  $$values ('confirmed', null::uuid, null::uuid)$$, 'allocation back to confirmed (C5)');
select is((select qty_committed from public.offers where id = tests.id('o1')), 4.000::numeric, 'quantity still reserved (giữ nguyên chỗ)');
select is((select array_agg(distinct status::text || ':' || skip_reason) from public.pickup_stops where pickup_id = tests.var('p1')::uuid),
  array['skipped:trip_cancelled'], 'every open stop skipped');
select results_eq(format($$select urgency, payload ->> 'reason', payload ->> 'cancel_actor' from public.notification_outbox
                           where event = 'pickup_cancelled' and aggregate_id = %L$$, tests.var('p1')),
  $$values ('urgent', 'cancelled', 'charity')$$, 'outbox pickup_cancelled (urgent: the trip was running)');
select results_eq(format($$select action, reason from public.audit_logs where entity_id = %L and action = 'pickup.cancel'$$, tests.var('p1')),
  $$values ('pickup.cancel', 'TNV không đến')$$, 'audited with the reason');
-- re-assign after C5
select tests.set_var('p1b', tests.pickup('charity_owner', array[tests.var('o1_alloc')::uuid], 'site_b', 'self')::text);
select is((select status::text from public.allocations where id = tests.var('o1_alloc')::uuid), 'assigned',
  'the confirmed allocation can be re-planned (self pickup)');

-- ==== admin aal2 may cancel (actor admin) ====
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.cancel_pickup(%L, 'Hỗ trợ vận hành', gen_random_uuid())$$, tests.var('p2')), 'admin aal2 cancels');
select tests.clear_auth();
select results_eq(format($$select urgency, payload ->> 'cancel_actor' from public.notification_outbox where event = 'pickup_cancelled' and aggregate_id = %L$$, tests.var('p2')),
  $$values ('normal', 'admin')$$, 'not running => normal urgency; actor admin');

-- ==== C10: once goods left the store the trip cannot be cancelled ====
select tests.set_var('s3', (select id::text from public.pickup_stops where pickup_id = tests.var('p3')::uuid and kind = 'pickup'));
select tests.issue('charity_volunteer', tests.var('s3')::uuid, 'h3');
select tests.set_var('l3', tests.full_lines(tests.var('s3')::uuid)::text);
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('h3_token'), tests.var('l3')::jsonb, gen_random_uuid());
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p3'))) ->> 'detail', 'goods_picked_up',
  'after a pickup handover: invalid_state / goods_picked_up');
select throws_ok(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid())$$, tests.var('o3_alloc')), 'PT409', 'invalid_state',
  'picked_up allocation cannot be cancelled either (C10)');
select lives_ok(format($$select public.report_incident('quantity_dispute', 'Thiếu 1 ổ bánh khi nhận', jsonb_build_object('allocation_id', %L), gen_random_uuid())$$,
                       tests.var('o3_alloc')),
  'only an incident remains possible');
select tests.clear_auth();

select * from finish();
rollback;

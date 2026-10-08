-- respond_pickup (DATA-MODEL §6.5 assigned (nhận) / assigned → planned; PRD US-VOL-04, US-CHA-16 AC4)
begin;
\ir ../_helpers.psql

select plan(22);

select tests.create_user('v2');
select tests.add_member('charity_b', 'v2', 'volunteer');
select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.set_var('p2', tests.volunteer_trip('o2')::text);

-- ==== who may call ====
select tests.as_anon();
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), 'PT404', 'not_found',
  'outsider: not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), 'PT404', 'not_found',
  'store of a stop: not_found (stores never see trips)');
select tests.authenticate_as('v2');
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), 'PT404', 'not_found',
  'another volunteer of the charity: not_found');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), 'PT403', 'not_authorized',
  'coordinator cannot answer for the volunteer');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), 'PT403', 'not_authorized',
  'admin aal2: not_authorized');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.respond_pickup(%L, null, null, gen_random_uuid())$$, tests.var('p1')), 'PT422', 'validation_failed',
  'NULL p_accept refused');
select throws_ok($$select public.respond_pickup(null, true, null, gen_random_uuid())$$, 'PT404', 'not_found', 'NULL trip: not_found');

-- ==== accept ====
select lives_ok(format($$select public.respond_pickup(%L, true, null, 'c6000000-0000-4000-8000-000000000001')$$, tests.var('p1')),
  'assignee accepts');
select lives_ok(format($$select public.respond_pickup(%L, true, null, 'c6000000-0000-4000-8000-000000000001')$$, tests.var('p1')),
  'replay is a no-op');
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), 'PT409', 'invalid_state',
  'accepting twice: invalid_state (already_accepted)');
select tests.clear_auth();
select results_eq(format($$select status::text, accepted_at is not null, assignee_user_id from public.pickups where id = %L$$, tests.var('p1')),
  format($$values ('assigned', true, %L::uuid)$$, tests.id('charity_volunteer')), 'accepted_at set, still assigned');
select results_eq(format($$select event::text, payload from public.notification_outbox where aggregate_id = %L and event = 'volunteer_accepted'$$, tests.var('p1')),
  format($$values ('volunteer_accepted', jsonb_build_object('pickup_id', %L::uuid, 'charity_org_id', %L::uuid, 'assignee_user_id', %L::uuid))$$,
         tests.var('p1'), tests.id('charity_b'), tests.id('charity_volunteer')),
  'outbox volunteer_accepted (N-15), ids only');
select is((select count(*)::int from public.audit_logs where entity_id = tests.var('p1')::uuid and action = 'pickup.accept'), 1, 'audited once');

-- ==== decline (after accepting is still allowed while assigned) ====
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.respond_pickup(%L, false, '  ', gen_random_uuid())$$, tests.var('p1')), 'PT422', 'validation_failed',
  'declining needs a reason');
select lives_ok(format($$select public.respond_pickup(%L, false, 'Xe hỏng', gen_random_uuid())$$, tests.var('p1')), 'assignee declines');
select throws_ok(format($$select public.respond_pickup(%L, true, null, gen_random_uuid())$$, tests.var('p1')), 'PT404', 'not_found',
  'after declining the trip is no longer theirs');
select tests.clear_auth();
select results_eq(format($$select status::text, assignee_user_id, accepted_at from public.pickups where id = %L$$, tests.var('p1')),
  $$values ('planned', null::uuid, null::timestamptz)$$, 'trip back to planned, unassigned (US-CHA-16 AC4)');
select is((select status::text from public.allocations where id = tests.var('o1_alloc')::uuid), 'assigned',
  'allocations stay on the planned trip (quantities kept)');
select results_eq(format($$select payload ? 'reason', (select reason from public.audit_logs where entity_id = %L and action = 'pickup.decline')
                           from public.notification_outbox where aggregate_id = %L and event = 'volunteer_declined'$$, tests.var('p1'), tests.var('p1')),
  $$values (false, 'Xe hỏng')$$, 'volunteer_declined in the outbox; the reason only in audit_logs');

-- not assigned any more / not in a state to answer
select tests.authenticate_as('charity_volunteer');
select lives_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p2')), 'second trip started');
select throws_ok(format($$select public.respond_pickup(%L, false, 'Muộn', gen_random_uuid())$$, tests.var('p2')), 'PT409', 'invalid_state',
  'a started trip cannot be declined (cancel_pickup instead)');
select tests.clear_auth();

select * from finish();
rollback;

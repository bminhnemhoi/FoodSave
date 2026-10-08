-- start_pickup (DATA-MODEL §6.5 → in_progress; consent NOT required; outbox pickup_started)
begin;
\ir ../_helpers.psql

select plan(15);

select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.make_offer('o_self', 'site_a', 'bread', 10);
select tests.set_var('a_self', tests.request('charity_owner', tests.id('o_self'), 2)::text);
select tests.confirm('store_staff', tests.var('a_self')::uuid);
select tests.set_var('p_self', tests.pickup('charity_owner', array[tests.var('a_self')::uuid])::text);

select tests.as_anon();
select throws_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p1')), 'PT404', 'not_found', 'store: not_found');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p1')), 'PT403', 'not_authorized',
  'coordinator cannot start a volunteer''s trip');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p_self')), 'PT404', 'not_found',
  'volunteer cannot start a self pickup of the charity');
select tests.clear_auth();
select ok(not private.has_consent(tests.id('charity_volunteer'), 'location_trip'), 'volunteer has no location consent');
select tests.authenticate_as('charity_volunteer');
select lives_ok(format($$select public.start_pickup(%L, 'c6100000-0000-4000-8000-000000000001')$$, tests.var('p1')),
  'assignee starts without location consent (§6.5: consent not required)');
select lives_ok(format($$select public.start_pickup(%L, 'c6100000-0000-4000-8000-000000000001')$$, tests.var('p1')), 'replay is a no-op');
select throws_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p1')), 'PT409', 'invalid_state',
  'starting twice: invalid_state');
select tests.clear_auth();
select results_eq(format($$select status::text, started_at is not null, accepted_at is not null, last_location from public.pickups where id = %L$$, tests.var('p1')),
  $$values ('in_progress', true, true, null::extensions.geography)$$, 'in_progress; accepted_at defaulted; no location stored');
select results_eq(format($$select event::text, payload from public.notification_outbox where aggregate_id = %L and event = 'pickup_started'$$, tests.var('p1')),
  format($$values ('pickup_started', jsonb_build_object('pickup_id', %L::uuid, 'charity_org_id', %L::uuid))$$, tests.var('p1'), tests.id('charity_b')),
  'outbox pickup_started (ids only)');
select results_eq(format($$select action, after ->> 'status' from public.audit_logs where entity_id = %L and action = 'pickup.start'$$, tests.var('p1')),
  $$values ('pickup.start', 'in_progress')$$, 'audited');

-- self pickup: any coordinator of the receiving site starts a planned self trip
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p_self')), 'coordinator starts a planned self pickup');
select tests.clear_auth();
select is((select status::text from public.pickups where id = tests.var('p_self')::uuid), 'in_progress', 'self pickup in progress');

-- planned volunteer trip (declined) cannot be started
select tests.set_var('p3', tests.volunteer_trip('o3')::text);
update public.pickups set status = 'planned', assignee_user_id = null where id = tests.var('p3')::uuid;
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.start_pickup(%L, gen_random_uuid())$$, tests.var('p3')), 'PT403', 'not_authorized',
  'unassigned volunteer trip: nobody is the carrier');
select tests.clear_auth();
select throws_ok($$select public.start_pickup(null, gen_random_uuid())$$, 'PT401', 'not_authenticated', 'no JWT: not_authenticated');

select * from finish();
rollback;

-- reveal_trip_contact (B1 "Gọi trong chuyến"; DATA-MODEL §8.5; SECURITY-PRIVACY §6): the full phone of the
-- trip volunteer, only for the trip parties (coordinator side, store of a pickup stop), only while the trip
-- is live, only with the volunteer's active trip_contact consent; every reveal audited; 10/hour per caller.
begin;
\ir ../_helpers.psql

select plan(26);

update public.profiles set phone = '0912345678', full_name = 'Lê Minh Khoa' where id = tests.id('charity_volunteer');
select tests.set_var('p1', tests.volunteer_trip('o1')::text);

-- ---- callers that are not parties ----
select tests.as_anon();
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT404', 'not_found', 'outsider: not_found');
select throws_ok('select * from public.reveal_trip_contact(null)', 'PT422', 'validation_failed', 'NULL pickup id: validation_failed');
select throws_ok('select * from public.reveal_trip_contact(gen_random_uuid())', 'PT404', 'not_found', 'unknown trip: not_found');
select tests.authenticate_as('other_owner');
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT404', 'not_found',
  'a store that is not a stop of the trip: not_found');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT404', 'not_found',
  'admin is not a party of the trip: not_found');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT404', 'not_found',
  'the volunteer (role volunteer) is not a coordinator: not_found');

-- ---- trip not accepted yet ----
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format('select * from public.reveal_trip_contact(%L)', tests.var('p1'))) ->> 'detail', 'trip_not_active',
  'assigned but not accepted: PT409 trip_not_active');
select tests.authenticate_as('charity_volunteer');
select public.respond_pickup(tests.var('p1')::uuid, true, '', gen_random_uuid());

-- ---- no consent ----
select tests.authenticate_as('charity_owner');
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT403', 'not_authorized',
  'volunteer did not opt in: not_authorized');
select is(tests.error_of(format('select * from public.reveal_trip_contact(%L)', tests.var('p1'))) ->> 'detail', 'no_consent',
  'detail no_consent (UI offers the coordinator hotline)');
select tests.authenticate_as('charity_volunteer');
select lives_ok($$select public.grant_consent('trip_contact', '2026-10-v2', repeat('e', 64), 'web')$$,
  'volunteer opts in (grant_consent trip_contact)');
select lives_ok($$select public.grant_consent('location_trip', '2026-10-v2', repeat('f', 64), 'web')$$,
  'location consent is independent');
select tests.clear_auth();

-- ---- parties read the number ----
select tests.authenticate_as('charity_owner');
select results_eq(format('select volunteer_name, phone from public.reveal_trip_contact(%L)', tests.var('p1')),
  $$values ('Lê Minh Khoa'::text, '0912345678'::text)$$, 'coordinator reads the full number');
select tests.authenticate_as('store_staff');
select results_eq(format('select phone from public.reveal_trip_contact(%L)', tests.var('p1')),
  $$values ('0912345678'::text)$$, 'staff of the store of a pickup stop reads it');
select tests.clear_auth();

select results_eq($$select actor_id, org_id, entity_id, after ->> 'side' from public.audit_logs where action = 'contact.reveal' order by id$$,
  format($$values (%L::uuid, %L::uuid, %L::uuid, 'charity'::text), (%L::uuid, %L::uuid, %L::uuid, 'store'::text)$$,
    tests.id('charity_owner'), tests.id('charity_b'), tests.var('p1'),
    tests.id('store_staff'), tests.id('store_a'), tests.var('p1')),
  'each reveal audited: actor, side org, trip');
select is_empty($$select id from public.audit_logs where action = 'contact.reveal' and (after::text ~ '0912345678' or after::text ~ '345678')$$,
  'the number never enters the audit trail');

-- ---- consent withdrawn ----
select tests.authenticate_as('charity_volunteer');
select public.withdraw_consent('trip_contact');
select tests.authenticate_as('store_staff');
select is(tests.error_of(format('select * from public.reveal_trip_contact(%L)', tests.var('p1'))) ->> 'detail', 'no_consent',
  'after withdrawal: no_consent again');
select tests.authenticate_as('charity_volunteer');
select public.grant_consent('trip_contact', '2026-10-v2', repeat('e', 64), 'web');

-- ---- in progress, then no phone ----
select public.start_pickup(tests.var('p1')::uuid, gen_random_uuid());
select tests.clear_auth();
update public.profiles set phone = null where id = tests.id('charity_volunteer');
select tests.authenticate_as('charity_owner');
select results_eq(format('select volunteer_name, phone from public.reveal_trip_contact(%L)', tests.var('p1')),
  $$values ('Lê Minh Khoa'::text, null::text)$$, 'in_progress, volunteer without a phone: phone null');
select tests.clear_auth();
update public.profiles set phone = '0912345678' where id = tests.id('charity_volunteer');

-- ---- rate limit 10/hour per caller ----
insert into public.rate_limits (key, window_start, count)
values ('reveal_trip_contact:user:' || tests.id('store_manager'),
        date_bin(interval '1 hour', now(), timestamptz '2000-01-01 00:00:00+07'), 10);
select tests.authenticate_as('store_manager');
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT429', 'rate_limited',
  '11th reveal within the hour: rate_limited');
select tests.authenticate_as('store_owner');
select lives_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'the limit is per caller');
select tests.clear_auth();
select is((select count(*)::int from public.audit_logs where action = 'contact.reveal'), 4,
  'refused calls are not audited (4 successful reveals)');

-- ---- finished trip ----
select tests.authenticate_as('charity_owner');
select public.cancel_pickup(tests.var('p1')::uuid, 'Đổi kế hoạch', gen_random_uuid());
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT409', 'invalid_state',
  'finished trip: invalid_state');
select is(tests.error_of(format('select * from public.reveal_trip_contact(%L)', tests.var('p1'))) ->> 'detail', 'trip_not_active',
  'detail trip_not_active');
select tests.authenticate_as('store_staff');
select throws_ok(format('select * from public.reveal_trip_contact(%L)', tests.var('p1')), 'PT409', 'invalid_state',
  'finished trip: the store no longer sees it either');
select tests.clear_auth();

-- ---- self pickup: there is no volunteer ----
select tests.make_offer('o_self', 'site_a', 'bread', 5);
select tests.set_var('a_self', tests.request('charity_owner', tests.id('o_self'), 1)::text);
select tests.confirm('store_staff', tests.var('a_self')::uuid);
select tests.set_var('p_self', tests.pickup('charity_owner', array[tests.var('a_self')::uuid], 'site_b', 'self', 'charity_owner')::text);
select tests.authenticate_as('charity_owner');
select public.start_pickup(tests.var('p_self')::uuid, gen_random_uuid());
select is(tests.error_of(format('select * from public.reveal_trip_contact(%L)', tests.var('p_self'))) ->> 'detail', 'no_volunteer',
  'self pickup: PT409 no_volunteer');
select tests.clear_auth();

select ok(not has_function_privilege('anon', 'public.reveal_trip_contact(uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.reveal_trip_contact(uuid)', 'EXECUTE'),
  'EXECUTE granted to authenticated only');

select * from finish();
rollback;

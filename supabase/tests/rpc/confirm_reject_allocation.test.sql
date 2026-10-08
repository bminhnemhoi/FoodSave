-- confirm_allocation + reject_allocation (DATA-MODEL §6.4, §7 C3, §8.4; PRD US-STO-13).
begin;
\ir ../_helpers.psql

select plan(27);

select tests.create_user('branch_staff');
select tests.create_site('site_a2', 'store_a', 'public', 10.78, 106.69);
insert into public.org_members (org_id, user_id, role, status, site_ids, joined_at)
values (tests.id('store_a'), tests.id('branch_staff'), 'staff', 'active', array[tests.id('site_a2')], now());

select tests.make_offer('o1', 'site_a', 'bread', 10);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 4)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o1'), 6)::text);

-- ==== confirm_allocation ====
select tests.as_anon();
select throws_ok(format($$select public.confirm_allocation(%L, gen_random_uuid())$$, tests.var('a1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.confirm_allocation(%L, gen_random_uuid())$$, tests.var('a1')),
  'PT404', 'not_found', 'the charity cannot confirm its own request');
select tests.authenticate_as('other_owner');
select throws_ok(format($$select public.confirm_allocation(%L, gen_random_uuid())$$, tests.var('a1')),
  'PT404', 'not_found', 'another store => not_found');
select tests.authenticate_as('branch_staff');
select throws_ok(format($$select public.confirm_allocation(%L, gen_random_uuid())$$, tests.var('a1')),
  'PT403', 'not_authorized', 'staff of another branch => not_authorized');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.confirm_allocation(%L, gen_random_uuid())$$, tests.var('a1')),
  'PT403', 'not_authorized', 'admin does not confirm for the store');
select tests.authenticate_as('store_staff');
select throws_ok($$select public.confirm_allocation(gen_random_uuid(), gen_random_uuid())$$, 'PT404', 'not_found', 'unknown allocation');

select lives_ok(format($$select public.confirm_allocation(%L, 'f2000000-0000-4000-8000-000000000001')$$, tests.var('a1')),
  'store staff confirms (AC2)');
select lives_ok(format($$select public.confirm_allocation(%L, 'f2000000-0000-4000-8000-000000000001')$$, tests.var('a1')),
  'replay with the same client_op_id is a no-op');
select throws_ok(format($$select public.confirm_allocation(%L, gen_random_uuid())$$, tests.var('a1')),
  'PT409', 'invalid_state', 'confirming a confirmed allocation => invalid_state');
select tests.clear_auth();
select results_eq(format($$select status::text, confirmed_by, confirmed_at is not null, auto_confirmed from public.allocations where id = %L$$, tests.var('a1')),
  format($$values ('confirmed', %L::uuid, true, false)$$, tests.id('store_staff')), 'requested -> confirmed (who/when)');
select is((select count(*)::int from public.notification_outbox where aggregate_id = tests.var('a1')::uuid and event = 'allocation_confirmed'), 1,
  'charity notified once (allocation_confirmed)');
select is((select count(*)::int from public.audit_logs where entity_id = tests.var('a1')::uuid and action = 'allocation.confirm'), 1,
  'audited once');

-- reserved_until passed (lazy expiry semantics): confirm refused
select tests.set_clock(now() + interval '3 hours');
select tests.authenticate_as('store_staff');
select is(tests.error_of(format($$select public.confirm_allocation(%L, gen_random_uuid())$$, tests.var('a2'))),
  '{"sqlstate":"PT409","message":"deadline_passed","detail":"reserved_until","hint":null}'::jsonb,
  'AC4: after reserved_until the store can no longer confirm');
select tests.clear_auth();
select tests.clear_clock();

-- ==== reject_allocation (C3) ====
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.reject_allocation(%L, '  ', gen_random_uuid())$$, tests.var('a2')),
  'PT422', 'validation_failed', 'AC3: a reason is required');
select throws_ok(format($$select public.reject_allocation(%L, 'Hết hàng', gen_random_uuid())$$, tests.var('a1')),
  'PT409', 'invalid_state', 'a confirmed allocation is cancelled, not rejected');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.reject_allocation(%L, 'x', gen_random_uuid())$$, tests.var('a2')),
  'PT404', 'not_found', 'the charity cannot reject');
select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.reject_allocation(%L, 'Hàng đã hết', 'f2000000-0000-4000-8000-000000000002')$$, tests.var('a2')),
  'store owner rejects with a reason');
select lives_ok(format($$select public.reject_allocation(%L, 'Hàng đã hết', 'f2000000-0000-4000-8000-000000000002')$$, tests.var('a2')),
  'replay is a no-op');
select tests.clear_auth();
select results_eq(format($$select status::text, qty_released, cancel_actor, cancel_reason, cancelled_by, closed_at is not null
                          from public.allocations where id = %L$$, tests.var('a2')),
  format($$values ('rejected', 6.000::numeric, 'store', 'Hàng đã hết', %L::uuid, true)$$, tests.id('store_owner')),
  'requested -> rejected, the full quantity goes back');
select results_eq(format($$select status::text, qty_committed, qty_available from public.offers where id = %L$$, tests.id('o1')),
  $$values ('open', 4.000::numeric, 6.000::numeric)$$, 'lot back from fully_allocated to open with 6 available');
select is((select count(*)::int from public.notification_outbox where aggregate_id = tests.var('a2')::uuid and event = 'allocation_rejected'), 1,
  'charity notified (allocation_rejected)');
select results_eq(format($$select action, reason from public.audit_logs where entity_id = %L and action = 'allocation.reject'$$, tests.var('a2')),
  $$values ('allocation.reject'::text, 'Hàng đã hết'::text)$$, 'audited with the reason');

-- bundle allocation rejected => bundle_shortfall (C3)
insert into public.needs (id, org_id, site_id, category_codes, unit, quantity, needed_by, created_by)
values ('a2000000-0000-4000-8000-000000000001', tests.id('charity_b'), tests.id('site_b'), '{bread}', 'loaf', 5,
        now() + interval '1 day', tests.id('charity_owner'));
insert into public.need_bundles (id, need_id, option_rank, qty_target, score, stop_count, est_distance_m, est_duration_s,
                                 algorithm_version, inputs_snapshot, client_op_id, created_by)
values ('b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 1, 5, 0.5, 1, 1, 1, 'match-v1', '{}',
        gen_random_uuid(), tests.id('charity_owner'));
select tests.set_var('a3', tests.request('charity_owner', tests.id('o1'), 5)::text);
update public.allocations set need_id = 'a2000000-0000-4000-8000-000000000001', bundle_id = 'b2000000-0000-4000-8000-000000000001'
 where id = tests.var('a3')::uuid;
select tests.authenticate_as('store_staff');
select lives_ok(format($$select public.reject_allocation(%L, 'Không đủ', gen_random_uuid())$$, tests.var('a3')), 'reject a bundle allocation');
select tests.clear_auth();
select ok(exists (select 1 from public.notification_outbox where event = 'bundle_shortfall'
                  and aggregate_id = 'b2000000-0000-4000-8000-000000000001'), 'bundle_shortfall enqueued for the charity');
select results_eq($$select status::text, qty_in_flight from public.needs where id = 'a2000000-0000-4000-8000-000000000001'$$,
  $$values ('open', 0.000::numeric)$$, 'need re-derived (nothing in flight)');
select is((select status::text from public.need_bundles where id = 'b2000000-0000-4000-8000-000000000001'), 'cancelled',
  'bundle with only dead allocations => cancelled');
select is((select qty_committed from public.offers where id = tests.id('o1')),
          (select sum(qty_reserved - qty_released) from public.allocations where offer_id = tests.id('o1')),
  '§4.4 invariant holds');

select * from finish();
rollback;

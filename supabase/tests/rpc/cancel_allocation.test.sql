-- cancel_allocation — cancellation matrix (DATA-MODEL §7: C1, C2, C4, C10, C13; ambiguous_actor).
begin;
\ir ../_helpers.psql

select plan(35);

select tests.make_offer('o1', 'site_a', 'bread', 40);
create function tests.req(p_qty numeric) returns uuid language sql as $$
  select tests.request('charity_owner', tests.id('o1'), p_qty);
$$;
select tests.create_user('charity_manager');
select tests.add_member('charity_b', 'charity_manager', 'manager');
select tests.create_user('charity_staff');
select tests.add_member('charity_b', 'charity_staff', 'staff');
-- managers scoped to ANOTHER site of the same org (org_members.site_ids)
select tests.create_site('site_a2', 'store_a', 'public', 10.7769, 106.7009);
select tests.create_site('site_b2', 'charity_b', 'approximate', 10.765, 106.665);
select tests.create_user('store_mgr_a2');
select tests.create_user('charity_mgr_b2');
insert into public.org_members (org_id, user_id, role, status, joined_at, site_ids)
values (tests.id('store_a'), tests.id('store_mgr_a2'), 'manager', 'active', now(), array[tests.id('site_a2')]),
       (tests.id('charity_b'), tests.id('charity_mgr_b2'), 'manager', 'active', now(), array[tests.id('site_b2')]);

-- ---- who ----
select tests.set_var('c1', tests.req(2)::text);
select tests.as_anon();
select throws_ok(format($$select public.cancel_allocation(%L, null, gen_random_uuid())$$, tests.var('c1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.cancel_allocation(%L, null, gen_random_uuid())$$, tests.var('c1')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('charity_staff');
select throws_ok(format($$select public.cancel_allocation(%L, null, gen_random_uuid())$$, tests.var('c1')),
  'PT403', 'not_authorized', 'charity staff cannot cancel (owner/manager)');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid())$$, tests.var('c1')),
  'PT403', 'not_authorized', 'store staff cannot cancel (owner/manager)');
select tests.authenticate_as('charity_mgr_b2');
select throws_ok(format($$select public.cancel_allocation(%L, null, gen_random_uuid())$$, tests.var('c1')),
  'PT403', 'not_authorized', 'charity manager scoped to another receiving site cannot cancel');
select tests.authenticate_as('store_mgr_a2');
select throws_ok(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid())$$, tests.var('c1')),
  'PT403', 'not_authorized', 'store manager scoped to another site cannot cancel');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid(), 'neutral')$$, tests.var('c1')),
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');

-- ---- C1: charity cancels a request (reason optional, full release, no trust) ----
select tests.authenticate_as('charity_manager');
select lives_ok(format($$select public.cancel_allocation(%L, null, 'f3000000-0000-4000-8000-000000000001')$$, tests.var('c1')),
  'C1: charity manager cancels its request without a reason');
select lives_ok(format($$select public.cancel_allocation(%L, null, 'f3000000-0000-4000-8000-000000000001')$$, tests.var('c1')),
  'replay is a no-op');
select tests.clear_auth();
select results_eq(format($$select status::text, cancel_actor, qty_released, shortfall_reason from public.allocations where id = %L$$, tests.var('c1')),
  $$values ('cancelled', 'charity', 2.000::numeric, null::public.shortfall_reason)$$, 'C1: cancelled, released in full');
select is((select count(*)::int from public.notification_outbox where aggregate_id = tests.var('c1')::uuid and event = 'allocation_cancelled'), 1,
  'store notified once');
select is((select trust_score from public.organizations where id = tests.id('charity_b')), 50.00::numeric, 'C1: no trust penalty');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.cancel_allocation(%L, null, gen_random_uuid())$$, tests.var('c1')),
  'PT409', 'invalid_state', 'a cancelled allocation cannot be cancelled again');

-- ---- C2: charity cancels after confirmation; −2 only when already packed ----
select tests.clear_auth();
select tests.set_var('c2', tests.req(3)::text);
select tests.set_var('c2p', tests.req(4)::text);
select tests.confirm('store_staff', tests.var('c2')::uuid);
select tests.confirm('store_staff', tests.var('c2p')::uuid);
select tests.authenticate_as('store_staff');
select public.mark_allocation_packed(tests.var('c2p')::uuid, gen_random_uuid());
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select public.cancel_allocation(%L, 'Xe hỏng', gen_random_uuid())$$, tests.var('c2')), 'C2: cancel confirmed');
select is((select trust_score from public.organizations where id = tests.id('charity_b')), 50.00::numeric, 'C2: not packed => no penalty');
select lives_ok(format($$select public.cancel_allocation(%L, 'Xe hỏng', gen_random_uuid())$$, tests.var('c2p')), 'C2: cancel packed');
select tests.clear_auth();
select results_eq(format($$select status::text, qty_released from public.allocations where id in (%L, %L) order by qty_reserved$$,
                         tests.var('c2'), tests.var('c2p')),
  $$values ('cancelled', 3.000::numeric), ('cancelled', 4.000::numeric)$$, 'C2: released in full (before the deadline)');
select results_eq(format($$select trust_score, (select reason from public.trust_events where org_id = %L order by id desc limit 1)
                          from public.organizations where id = %L$$, tests.id('charity_b'), tests.id('charity_b')),
  $$values (48.00::numeric, 'charity_cancel_after_packed'::text)$$, 'C2: −2 after the store packed (charity_cancel_after_packed)');

-- ---- C4: store cancels after confirmation (reason, store_short, no release, −5, detached) ----
select tests.set_var('c4', tests.req(5)::text);
select tests.set_var('c3', tests.req(1)::text);
select tests.confirm('store_staff', tests.var('c4')::uuid);
select tests.set_var('p4', tests.pickup('charity_owner', array[tests.var('c4')::uuid])::text);
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.cancel_allocation(%L, null, gen_random_uuid())$$, tests.var('c4')),
  'PT422', 'validation_failed', 'C4: the store must give a reason');
select is(tests.error_of(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid())$$, tests.var('c3'))),
  '{"sqlstate":"PT409","message":"invalid_state","detail":"use_reject_allocation","hint":null}'::jsonb,
  'C3: a store answers a request with reject_allocation');
select lives_ok(format($$select public.cancel_allocation(%L, 'Hàng hỏng', gen_random_uuid())$$, tests.var('c4')),
  'C4: store owner cancels an assigned allocation');
select tests.clear_auth();
select results_eq(format($$select status::text, cancel_actor, shortfall_reason::text, qty_released, pickup_id, stop_id
                          from public.allocations where id = %L$$, tests.var('c4')),
  $$values ('cancelled', 'store', 'store_short', 0.000::numeric, null::uuid, null::uuid)$$,
  'C4: store_short, nothing released (written off), detached from the trip');
select results_eq(format($$select status::text, cancel_reason from public.pickups where id = %L$$, tests.var('p4')),
  $$values ('cancelled', 'no_allocations')$$, 'emptied trip is cancelled');
select is((select string_agg(status::text, ',' order by kind) from public.pickup_stops where pickup_id = tests.var('p4')::uuid),
  'skipped,skipped', 'its stops are skipped');
select is((select trust_score from public.organizations where id = tests.id('store_a')), 45.00::numeric, 'C4: −5 for the store');
select is((select urgency from public.notification_outbox where aggregate_id = tests.var('c4')::uuid and event = 'allocation_cancelled'),
  'urgent', 'cancellation of an assigned allocation is urgent');

-- ---- C13: admin with attribution ----
select tests.set_var('c13s', tests.req(2)::text);
select tests.set_var('c13n', tests.req(2)::text);
select tests.confirm('store_staff', tests.var('c13s')::uuid);
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.cancel_allocation(%L, 'Vi phạm', gen_random_uuid())$$, tests.var('c13s')),
  'PT422', 'validation_failed', 'C13: admin must give an attribution');
select lives_ok(format($$select public.cancel_allocation(%L, 'Cửa hàng vi phạm', gen_random_uuid(), 'store')$$, tests.var('c13s')),
  'C13: admin cancels, attributed to the store');
select lives_ok(format($$select public.cancel_allocation(%L, 'Sự cố chung', gen_random_uuid(), 'neutral')$$, tests.var('c13n')),
  'C13: admin cancels, neutral');
select tests.clear_auth();
select results_eq(format($$select cancel_actor, shortfall_reason::text, qty_released from public.allocations where id = %L$$, tests.var('c13s')),
  $$values ('admin', 'store_short', 0.000::numeric)$$, 'attributed to the store => like C4 (not released)');
select results_eq(format($$select cancel_actor, shortfall_reason::text, qty_released from public.allocations where id = %L$$, tests.var('c13n')),
  $$values ('admin', null::text, 2.000::numeric)$$, 'neutral => released');
select is((select trust_score from public.organizations where id = tests.id('store_a')), 40.00::numeric, 'store attribution => −5');

-- ---- member of both sides => ambiguous_actor; picked_up => no cancellation (C10) ----
insert into public.org_members (org_id, user_id, role, status, joined_at)
values (tests.id('charity_b'), tests.id('store_manager'), 'manager', 'active', now());
select tests.set_var('amb', tests.req(1)::text);
select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid())$$, tests.var('amb')),
  'PT403', 'ambiguous_actor', 'member of both organizations => ambiguous_actor');
select tests.clear_auth();
update public.allocations set status = 'picked_up', qty_picked = qty_reserved, picked_at = now(), reserved_until = null
 where id = tests.var('amb')::uuid;
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid())$$, tests.var('amb')),
  'PT409', 'invalid_state', 'C10: picked_up cannot be cancelled (incident instead)');
select tests.clear_auth();

select is((select qty_committed from public.offers where id = tests.id('o1')),
          (select sum(qty_reserved - qty_released) from public.allocations where offer_id = tests.id('o1')),
  '§4.4 invariant holds after the whole matrix');

select * from finish();
rollback;

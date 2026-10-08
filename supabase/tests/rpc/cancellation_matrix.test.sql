-- Cancellation matrix (DATA-MODEL §7, C1–C14; PRD F-29, US-STO-19, US-CHA-22/23; ROADMAP P3-12): one block
-- per cell — resulting status, quantity returned or written off, trust, and the follow-up event.
begin;
\ir ../_helpers.psql

select plan(36);

select tests.make_need('n', 'site_b', '{bread}', 'loaf', 200);
create function tests.st(p_alloc text) returns table (status text, actor text, released numeric, shortfall text) language sql stable as $$
  select a.status::text, a.cancel_actor, a.qty_released, a.shortfall_reason::text from public.allocations a where a.id = tests.var(p_alloc)::uuid;
$$;
create function tests.trust(p_org text) returns numeric language sql stable as $$
  select coalesce(sum(delta), 0) from public.trust_events where org_id = tests.id(p_org);
$$;
create function tests.bundle_alloc(p_offer text, p_qty numeric) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := tests.reserve('charity_owner', tests.id('n'), jsonb_build_array(jsonb_build_array(p_offer, p_qty)));
  return (r -> 'allocations' -> 0 ->> 'id')::uuid;
end $$;

-- ==== C1: charity cancels a request ====
select tests.make_offer('c1', 'site_a', 'bread', 10);
select tests.set_var('c1', tests.request('charity_owner', tests.id('c1'), 4)::text);
select tests.authenticate_as('charity_owner');
select public.cancel_allocation(tests.var('c1')::uuid, null, gen_random_uuid());
select tests.clear_auth();
select results_eq($$select * from tests.st('c1')$$, $$values ('cancelled', 'charity', 4.000::numeric, null::text)$$,
  'C1: cancelled by the charity, everything released');
select is((select qty_committed from public.offers where id = tests.id('c1')), 0.000::numeric, 'C1: lot back to full availability');
select is(tests.trust('charity_b'), 0::numeric, 'C1: no trust change');

-- ==== C2: charity cancels a packed allocation on a trip ====
select tests.set_var('p2', tests.volunteer_trip('c2', 4)::text);
select tests.authenticate_as('store_staff');
select public.mark_allocation_packed(tests.var('c2_alloc')::uuid, gen_random_uuid());
select tests.authenticate_as('charity_owner');
select public.cancel_allocation(tests.var('c2_alloc')::uuid, 'Không còn cần', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select * from tests.st('c2_alloc')$$, $$values ('cancelled', 'charity', 4.000::numeric, null::text)$$,
  'C2: cancelled, released (always before the deadline)');
select is(tests.trust('charity_b'), -2::numeric, 'C2: −2 because the store had packed');
select results_eq(format($$select status::text from public.pickups where id = %L$$, tests.var('p2')), $$values ('cancelled')$$,
  'C2: detached; the emptied trip ends');

-- ==== C3: store rejects a bundle request ====
select tests.make_offer('c3', 'site_x', 'bread', 10);
select tests.set_var('c3', tests.bundle_alloc('c3', 5)::text);
select tests.authenticate_as('other_owner');
select public.reject_allocation(tests.var('c3')::uuid, 'Hết hàng', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select * from tests.st('c3')$$, $$values ('rejected', 'store', 5.000::numeric, null::text)$$, 'C3: rejected, released');
select is((select count(*)::int from public.notification_outbox where event = 'bundle_shortfall' and payload ->> 'allocation_id' = tests.var('c3')),
  1, 'C3: bundle_shortfall for the charity');

-- ==== C4: store cancels after confirming (bundle) ====
select tests.make_offer('c4', 'site_a', 'bread', 10);
select tests.set_var('c4', tests.bundle_alloc('c4', 6)::text);
select tests.confirm('store_staff', tests.var('c4')::uuid);
select tests.authenticate_as('store_owner');
select is(tests.error_of(format($$select public.cancel_allocation(%L, null, gen_random_uuid())$$, tests.var('c4'))) ->> 'message',
  'validation_failed', 'C4: the reason is mandatory');
select public.cancel_allocation(tests.var('c4')::uuid, 'Hàng bị hỏng', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select * from tests.st('c4')$$, $$values ('cancelled', 'store', 0.000::numeric, 'store_short')$$,
  'C4: cancelled store_short, nothing returned to the lot (written off)');
select is((select qty_committed from public.offers where id = tests.id('c4')), 6.000::numeric, 'C4: lot quantity stays committed');
select is(tests.trust('store_a'), -5::numeric, 'C4: store −5');
select is((select count(*)::int from public.notification_outbox where event = 'bundle_shortfall' and payload ->> 'allocation_id' = tests.var('c4')),
  1, 'C4: bundle_shortfall => re-match proposal for the shortfall');
select is((select payload ->> 'cancel_actor' from public.notification_outbox where event = 'allocation_cancelled' and aggregate_id = tests.var('c4')::uuid),
  'store', 'C4: charity (+ volunteer, admins) told');

-- ==== C5: volunteer no-show => cancel_pickup ====
select tests.set_var('p5', tests.volunteer_trip('c5', 3)::text);
select tests.authenticate_as('charity_owner');
select public.cancel_pickup(tests.var('p5')::uuid, 'TNV không đến', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select status, released from tests.st('c5_alloc')$$, $$values ('confirmed', 0.000::numeric)$$, 'C5: allocation back to confirmed');
select is((select qty_committed from public.offers where id = tests.id('c5')), 3.000::numeric, 'C5: reservation kept');
select is((select status::text from public.pickups where id = tests.var('p5')::uuid), 'cancelled', 'C5: trip cancelled');

-- ==== C6: volunteer skips one stop ====
select tests.set_var('p6', tests.volunteer_trip('c6', 3)::text);
select tests.authenticate_as('charity_volunteer');
select public.skip_stop((select id from public.pickup_stops where pickup_id = tests.var('p6')::uuid and kind = 'pickup'), 'Cửa hàng đóng', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select status, released from tests.st('c6_alloc')$$, $$values ('confirmed', 0.000::numeric)$$, 'C6: allocation back to confirmed');
select is((select qty_committed from public.offers where id = tests.id('c6')), 3.000::numeric, 'C6: reservation kept');

-- ==== C7: request expires (cron or lazily) ====
select tests.make_offer('c7', 'site_x', 'bread', 10);
select tests.set_var('c7', tests.bundle_alloc('c7', 2)::text);
update public.allocations set reserved_until = now() - interval '1 minute' where id = tests.var('c7')::uuid;
select public.expire_stale_requests();
select results_eq($$select * from tests.st('c7')$$, $$values ('expired', null::text, 2.000::numeric, null::text)$$, 'C7: expired, released');
select is((select count(*)::int from public.notification_outbox where event = 'bundle_shortfall' and payload ->> 'allocation_id' = tests.var('c7')),
  1, 'C7: bundle_shortfall');

-- ==== C9: short pickup at the counter ====
select tests.set_var('p9a', tests.volunteer_trip('c9a', 4)::text);
select tests.set_var('s9a', (select id::text from public.pickup_stops where pickup_id = tests.var('p9a')::uuid and kind = 'pickup'));
select tests.issue('charity_volunteer', tests.var('s9a')::uuid, 'h9a');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('h9a_token'),
  jsonb_build_array(jsonb_build_object('allocation_id', tests.var('c9a_alloc'), 'qty', 3, 'reason', 'capacity')), gen_random_uuid());
select tests.clear_auth();
select results_eq($$select status, released, shortfall from tests.st('c9a_alloc')$$, $$values ('picked_up', 1.000::numeric, 'capacity')$$,
  'C9 capacity: picked 3/4, 1 returned before the deadline');
select tests.set_var('p9b', tests.volunteer_trip('c9b', 4)::text);
select tests.set_var('s9b', (select id::text from public.pickup_stops where pickup_id = tests.var('p9b')::uuid and kind = 'pickup'));
select tests.issue('charity_volunteer', tests.var('s9b')::uuid, 'h9b');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('h9b_token'),
  jsonb_build_array(jsonb_build_object('allocation_id', tests.var('c9b_alloc'), 'qty', 2, 'reason', 'store_short')), gen_random_uuid());
select tests.clear_auth();
select results_eq($$select status, released, shortfall from tests.st('c9b_alloc')$$, $$values ('picked_up', 0.000::numeric, 'store_short')$$,
  'C9 store_short: nothing returned');
select is(tests.trust('store_a'), -6::numeric, 'C9 store_short: store −1 (−5 from C4 before)');

-- ==== C10: after pickup only an incident ====
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.cancel_allocation(%L, 'x', gen_random_uuid())$$, tests.var('c9a_alloc')), 'PT409', 'invalid_state',
  'C10: picked_up cannot be cancelled');
select is(tests.error_of(format($$select public.cancel_pickup(%L, 'x', gen_random_uuid())$$, tests.var('p9a'))) ->> 'detail', 'goods_picked_up',
  'C10: the trip cannot be cancelled either');
select lives_ok(format($$select public.report_incident('quantity_dispute', 'Thiếu một ổ so với phiếu', jsonb_build_object('allocation_id', %L), gen_random_uuid())$$,
                       tests.var('c9a_alloc')), 'C10: report_incident');
select tests.clear_auth();

-- ==== C11: store cancels the whole lot ====
select tests.make_offer('c11', 'site_a', 'bread', 10);
select tests.set_var('c11r', tests.request('charity_owner', tests.id('c11'), 2)::text);
select tests.set_var('c11c', tests.request('charity_owner', tests.id('c11'), 3)::text);
select tests.confirm('store_staff', tests.var('c11c')::uuid);
select tests.authenticate_as('store_owner');
select public.cancel_offer(tests.id('c11'), 'Tủ lạnh hỏng', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select (select status from tests.st('c11r')), (select status from tests.st('c11c')), (select shortfall from tests.st('c11c'))$$,
  $$values ('rejected', 'cancelled', 'store_short')$$, 'C11: requested => rejected, confirmed => cancelled as C4');
select is(tests.trust('store_a'), -11::numeric, 'C11: −5 per confirmed allocation');

-- ==== C12: charity cancels the need ====
select tests.make_offer('c12', 'site_x', 'bread', 10);
select tests.set_var('c12', tests.bundle_alloc('c12', 4)::text);
select tests.authenticate_as('charity_owner');
select public.cancel_need(tests.id('n'), 'Đã đủ hàng từ nguồn khác', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select * from tests.st('c12')$$, $$values ('cancelled', 'charity', 4.000::numeric, null::text)$$, 'C12: like C1/C2, released');
select is((select status::text from public.needs where id = tests.id('n')), 'cancelled', 'C12: need cancelled');

-- ==== C13: admin cancels with an attribution ====
select tests.make_offer('c13', 'site_x', 'bread', 10);
select tests.set_var('c13s', tests.request('charity_owner', tests.id('c13'), 2)::text);
select tests.set_var('c13c', tests.request('charity_owner', tests.id('c13'), 3)::text);
select tests.confirm('other_owner', tests.var('c13s')::uuid);
select tests.confirm('other_owner', tests.var('c13c')::uuid);
select tests.authenticate_as('admin', 'aal2');
select public.cancel_allocation(tests.var('c13s')::uuid, 'Vi phạm an toàn', gen_random_uuid(), 'store');
select public.cancel_allocation(tests.var('c13c')::uuid, 'Hỗ trợ tổ chức', gen_random_uuid(), 'charity');
select tests.clear_auth();
select results_eq($$select (select released from tests.st('c13s')), (select released from tests.st('c13c')), (select actor from tests.st('c13s'))$$,
  $$values (0.000::numeric, 3.000::numeric, 'admin')$$, 'C13: store attribution writes off, charity attribution releases');
select is(tests.trust('store_x'), -5::numeric, 'C13: store attribution costs the store −5');

-- ==== C14: a charity is suspended ====
select tests.create_user('cz_owner');
select tests.create_org('charity_cz', 'charity', 'cz_owner');
select tests.create_site('site_cz', 'charity_cz', 'approximate', 10.77, 106.69);
select tests.make_offer('c14', 'site_a', 'bread', 10);
select tests.set_var('c14', tests.request('cz_owner', tests.id('c14'), 4, 'site_cz')::text);
select tests.confirm('store_staff', tests.var('c14')::uuid);
select tests.authenticate_as('admin', 'aal2');
select public.suspend_organization(tests.id('charity_cz'), 'Vi phạm điều khoản', gen_random_uuid());
select tests.clear_auth();
select results_eq($$select * from tests.st('c14')$$, $$values ('cancelled', 'admin', 4.000::numeric, null::text)$$,
  'C14: suspended charity => allocations cancelled by admin, released');

-- ==== C8: the lot deadline passes with a confirmed allocation (no_show, written off) ====
select tests.make_offer('c8', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '1 hour');
select tests.set_var('c8', tests.request('charity_owner', tests.id('c8'), 3)::text);
select tests.confirm('store_staff', tests.var('c8')::uuid);
select tests.set_clock(now() + interval '2 hours');
select public.close_expired_offers();
select tests.clear_clock();
select results_eq($$select * from tests.st('c8')$$, $$values ('expired', null::text, 0.000::numeric, 'no_show')$$,
  'C8: expired no_show after the deadline, nothing returned');
select is((select status::text from public.offers where id = tests.id('c8')), 'expired', 'C8: lot expired');

select * from finish();
rollback;

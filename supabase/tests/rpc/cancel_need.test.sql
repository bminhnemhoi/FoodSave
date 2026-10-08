-- cancel_need (DATA-MODEL §6.2 → cancelled, §7 C12 = C1/C2 per allocation; PRD US-CHA-13 AC2)
begin;
\ir ../_helpers.psql

select plan(24);

select tests.create_user('charity_staff');
select tests.add_member('charity_b', 'charity_staff', 'staff');
select tests.create_user('c_owner');
select tests.create_org('store_c', 'store', 'c_owner');
select tests.create_site('site_c2', 'store_c', 'public', 10.7660, 106.6630);
update public.sites set auto_accept_mode = 'all' where id = tests.id('site_c2');

select tests.make_offer('oA', 'site_a', 'bread', 20);          -- stays requested
select tests.make_offer('oC', 'site_c2', 'bread', 20);         -- auto-accepted
select tests.make_offer('oD', 'site_a', 'bread', 20, p_window_end => now() + interval '6 hours');  -- confirmed, packed, on a trip
select tests.make_offer('oE', 'site_x', 'bread', 20);          -- picked up already
select tests.make_need('n', 'site_b', '{bread}', 'loaf', 50);
select tests.set_var('r', tests.reserve('charity_owner', tests.id('n'), '[["oA", 10], ["oC", 10], ["oD", 10], ["oE", 10]]')::text);
create function tests.alloc_of(p_offer text) returns uuid language sql stable as $$
  select id from public.allocations where offer_id = tests.id(p_offer) and need_id = tests.id('n');
$$;
grant execute on function tests.alloc_of(text) to authenticated;
select tests.confirm('store_staff', tests.alloc_of('oD'));
select tests.confirm('other_owner', tests.alloc_of('oE'));
select tests.set_var('trip', tests.pickup('charity_owner', array[tests.alloc_of('oD')])::text);
select tests.authenticate_as('store_staff');
select public.mark_allocation_packed(tests.alloc_of('oD'), gen_random_uuid());
select tests.clear_auth();
-- fixture shortcut: E was handed over at the store (picked_up, 10 picked)
update public.allocations set status = 'picked_up', qty_picked = 10, picked_at = now() where id = tests.alloc_of('oE');
select private.refresh_need(tests.id('n'));

-- ==== who may call ====
select tests.as_anon();
select throws_ok(format($$select public.cancel_need(%L, 'x', gen_random_uuid())$$, tests.id('n')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.cancel_need(%L, 'x', gen_random_uuid())$$, tests.id('n')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.cancel_need(%L, 'x', gen_random_uuid())$$, tests.id('n')), 'PT404', 'not_found',
  'supplying store: not_found (cannot cancel a charity''s need)');
select tests.authenticate_as('charity_staff');
select throws_ok(format($$select public.cancel_need(%L, 'x', gen_random_uuid())$$, tests.id('n')), 'PT403', 'not_authorized',
  'staff cannot cancel (owner/manager only)');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.cancel_need(%L, 'x', gen_random_uuid())$$, tests.id('n')), 'PT403', 'not_authorized',
  'volunteer cannot cancel');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.cancel_need(%L, 'x', gen_random_uuid())$$, tests.id('n')), 'PT403', 'not_authorized',
  'admin aal2 cannot cancel a charity''s need');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.cancel_need(%L, '   ', gen_random_uuid())$$, tests.id('n')), 'PT422', 'validation_failed',
  'blank reason refused');
select throws_ok(format($$select public.cancel_need(%L, null, gen_random_uuid())$$, tests.id('n')), 'PT422', 'validation_failed',
  'NULL reason refused');
select throws_ok($$select public.cancel_need(null, 'x', gen_random_uuid())$$, 'PT404', 'not_found', 'NULL need id: not_found');

-- ==== C12 ====
select lives_ok(format($$select public.cancel_need(%L, 'Bếp đóng cửa đột xuất', 'c5000000-0000-4000-8000-000000000001')$$, tests.id('n')),
  'charity owner cancels the need');
select lives_ok(format($$select public.cancel_need(%L, 'Bếp đóng cửa đột xuất', 'c5000000-0000-4000-8000-000000000001')$$, tests.id('n')),
  'replay is a no-op');
select throws_ok(format($$select public.cancel_need(%L, 'Lý do khác', 'c5000000-0000-4000-8000-000000000001')$$, tests.id('n')),
  'PT409', 'idempotency_conflict', 'same op, other reason: idempotency_conflict');
select throws_ok(format($$select public.cancel_need(%L, 'Lần nữa', gen_random_uuid())$$, tests.id('n')),
  'PT409', 'invalid_state', 'already cancelled: invalid_state');
select tests.clear_auth();

select results_eq(format($$select status::text, cancel_reason, closed_at is not null, qty_in_flight from public.needs where id = %L$$, tests.id('n')),
  $$values ('cancelled', 'Bếp đóng cửa đột xuất', true, 10.000::numeric)$$,
  'need cancelled; caches keep the picked-up 10 in flight');
select results_eq(format($$select o.id, a.status::text, a.cancel_actor, a.qty_released, o.qty_committed
                           from public.allocations a join public.offers o on o.id = a.offer_id
                           where a.need_id = %L order by o.id$$, tests.id('n')),
  format($$select o.id, s, c, r, q from (values (%L::uuid, 'cancelled', 'charity', 10.000::numeric, 0.000::numeric),
                                               (%L::uuid, 'cancelled', 'charity', 10.000::numeric, 0.000::numeric),
                                               (%L::uuid, 'cancelled', 'charity', 10.000::numeric, 0.000::numeric),
                                               (%L::uuid, 'picked_up', null, 0.000::numeric, 10.000::numeric)) v(id, s, c, r, q)
           join public.offers o on o.id = v.id order by o.id$$, tests.id('oA'), tests.id('oC'), tests.id('oD'), tests.id('oE')),
  'requested/confirmed/assigned allocations cancelled by the charity and released (C1/C2); picked_up untouched (C10)');
select results_eq(format($$select pickup_id, stop_id from public.allocations where id = %L$$, tests.alloc_of('oD')),
  $$values (null::uuid, null::uuid)$$, 'assigned allocation detached from its trip');
select results_eq(format($$select status::text, cancel_reason from public.pickups where id = %L$$, tests.var('trip')),
  $$values ('cancelled', 'no_allocations')$$, 'emptied trip cancelled');
select results_eq(format($$select delta, reason from public.trust_events where org_id = %L and ref_id = %L$$, tests.id('charity_b'), tests.alloc_of('oD')),
  $$values (-2.00::numeric, 'charity_cancel_after_packed')$$, 'packed allocation: charity −2 (C2)');
select is((select count(*)::int from public.trust_events where org_id = tests.id('charity_b')), 1, 'no other trust change');
select is((select count(*)::int from public.notification_outbox where event = 'allocation_cancelled'
           and aggregate_id in (tests.alloc_of('oA'), tests.alloc_of('oC'), tests.alloc_of('oD'))
           and payload ->> 'cancel_actor' = 'charity' and payload ->> 'cause' = 'need_cancelled'), 3,
  'stores told (allocation_cancelled, actor charity, cause need_cancelled)');
select is((select urgency from public.notification_outbox where event = 'allocation_cancelled' and aggregate_id = tests.alloc_of('oD')),
  'urgent', 'the allocation that was on a trip is urgent for the store/volunteer');
select results_eq(format($$select action, (after ->> 'allocations_cancelled')::int, reason from public.audit_logs
                           where entity_id = %L and action like 'need.%%'$$, tests.id('n')),
  $$values ('need.cancel', 3, 'Bếp đóng cửa đột xuất')$$, 'audited need.cancel with the reason');
select is((select count(*)::int from public.audit_logs where action = 'allocation.cancel'
           and client_op_id = 'c5000000-0000-4000-8000-000000000001'), 3, 'one allocation.cancel per cancelled allocation');
select results_eq(format($$select o.status::text from public.offers o where o.id = %L$$, tests.id('oA')),
  $$values ('open')$$, 'released lot is open again for others');

select * from finish();
rollback;

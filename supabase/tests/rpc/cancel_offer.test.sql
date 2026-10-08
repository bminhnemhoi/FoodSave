-- cancel_offer (DATA-MODEL §6.1, §7 C11; PRD US-STO-12 AC3/AC4).
begin;
\ir ../_helpers.psql

select plan(23);

select tests.make_offer('o1', 'site_a', 'bread', 30);
select tests.set_var('req', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.set_var('conf', tests.request('charity_owner', tests.id('o1'), 6)::text);
select tests.set_var('ass', tests.request('charity_owner', tests.id('o1'), 7)::text);
select tests.confirm('store_staff', tests.var('conf')::uuid);
select tests.confirm('store_staff', tests.var('ass')::uuid);
select tests.set_var('trip', tests.pickup('charity_owner', array[tests.var('ass')::uuid])::text);

-- ---- who ----
select tests.as_anon();
select throws_ok(format($$select public.cancel_offer(%L, 'x', gen_random_uuid())$$, tests.id('o1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.cancel_offer(%L, 'x', gen_random_uuid())$$, tests.id('o1')),
  'PT404', 'not_found', 'charity => not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.cancel_offer(%L, 'x', gen_random_uuid())$$, tests.id('o1')),
  'PT403', 'not_authorized', 'staff cannot cancel a lot (owner/manager)');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.cancel_offer(%L, 'x', gen_random_uuid())$$, tests.id('o1')),
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');
select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.cancel_offer(%L, '', gen_random_uuid())$$, tests.id('o1')),
  'PT422', 'validation_failed', 'AC3: reason required');

-- ---- happy path (C11) ----
select is(public.cancel_offer(tests.id('o1'), 'Tủ lạnh hỏng', 'f5000000-0000-4000-8000-000000000001'),
  '{"status": "cancelled"}'::jsonb, 'store manager cancels the lot');
select is(public.cancel_offer(tests.id('o1'), 'Tủ lạnh hỏng', 'f5000000-0000-4000-8000-000000000001'),
  '{"status": "cancelled"}'::jsonb, 'replay returns the stored result');
select throws_ok(format($$select public.cancel_offer(%L, 'lần nữa', gen_random_uuid())$$, tests.id('o1')),
  'PT409', 'invalid_state', 'a cancelled lot cannot be cancelled again');
select tests.clear_auth();

select results_eq(format($$select status::text, cancel_actor, qty_released from public.allocations where id = %L$$, tests.var('req')),
  $$values ('rejected', 'store', 5.000::numeric)$$, 'requested => rejected, released');
select results_eq(format($$select status::text, cancel_actor, shortfall_reason::text, qty_released from public.allocations where id in (%L, %L)
                          order by qty_reserved$$, tests.var('conf'), tests.var('ass')),
  $$values ('cancelled', 'store', 'store_short', 0.000::numeric), ('cancelled', 'store', 'store_short', 0.000::numeric)$$,
  'confirmed/assigned => cancelled store_short, not released (C4)');
select results_eq(format($$select status::text, closed_at is not null, cancel_reason, qty_unclaimed from public.offers where id = %L$$, tests.id('o1')),
  $$values ('cancelled', true, 'Tủ lạnh hỏng', 17.000::numeric)$$, 'lot cancelled with reason; qty_unclaimed = what was still available');
select is((select status::text from public.pickups where id = tests.var('trip')::uuid), 'cancelled', 'the emptied trip is cancelled');
select is((select trust_score from public.organizations where id = tests.id('store_a')), 40.00::numeric,
  'C11: −5 for each confirmed allocation (2)');
select set_eq(format($$select event::text from public.notification_outbox where aggregate_id in (%L, %L, %L)$$,
                     tests.var('req'), tests.var('conf'), tests.var('ass')),
  array['allocation_requested', 'allocation_rejected', 'allocation_confirmed', 'allocation_cancelled'],
  'charity told about every allocation');
select is((select count(*)::int from public.audit_logs where entity_id = tests.id('o1') and action = 'offer.cancel'), 1, 'audited once (offer.cancel)');
select is((select qty_committed from public.offers where id = tests.id('o1')),
          (select sum(qty_reserved - qty_released) from public.allocations where offer_id = tests.id('o1')), '§4.4 invariant holds');

-- ---- something already picked => completed (early close) ----
select tests.make_offer('o2', 'site_a', 'bread', 10);
select tests.set_var('p1', tests.request('charity_owner', tests.id('o2'), 4)::text);
select tests.set_var('p2', tests.request('charity_owner', tests.id('o2'), 3)::text);
update public.allocations set status = 'picked_up', qty_picked = 4, picked_at = now(), reserved_until = null
 where id = tests.var('p1')::uuid;
select tests.authenticate_as('store_owner');
select is(public.cancel_offer(tests.id('o2'), 'Đóng sớm', gen_random_uuid()), '{"status": "completed"}'::jsonb,
  'a lot with picked goods ends completed, not cancelled (AC4)');
select tests.clear_auth();
select results_eq(format($$select status::text from public.allocations where id in (%L, %L) order by qty_reserved$$, tests.var('p2'), tests.var('p1')),
  $$values ('rejected'), ('picked_up')$$, 'picked_up allocation untouched, pending request rejected');
select is((select qty_unclaimed from public.offers where id = tests.id('o2')), 6.000::numeric, 'qty_unclaimed recorded');

-- ---- admin aal2 may cancel (no trust penalty), drafts cannot be cancelled ----
select tests.make_offer('o3', 'site_x', 'bread', 10);
select tests.set_var('x1', tests.request('charity_owner', tests.id('o3'), 2)::text);
select tests.confirm('other_owner', tests.var('x1')::uuid);
select tests.authenticate_as('admin', 'aal2');
select is(public.cancel_offer(tests.id('o3'), 'Vi phạm chính sách', gen_random_uuid()), '{"status": "cancelled"}'::jsonb,
  'admin aal2 cancels a lot');
select tests.clear_auth();
select results_eq(format($$select cancel_actor, shortfall_reason::text from public.allocations where id = %L$$, tests.var('x1')),
  $$values ('admin', 'store_short')$$, 'admin cancellation recorded as actor admin');
select is((select trust_score from public.organizations where id = tests.id('store_x')), 50.00::numeric, 'no automatic trust penalty for admin cancellations');
select tests.make_offer('o4', 'site_a', 'bread', 10, p_status => 'draft');
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.cancel_offer(%L, 'x', gen_random_uuid())$$, tests.id('o4')),
  'PT409', 'invalid_state', 'drafts are deleted, not cancelled');
select tests.clear_auth();

select * from finish();
rollback;

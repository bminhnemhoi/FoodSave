-- Cron RPCs (DATA-MODEL §6.1, §6.2, §6.4, §7 C7/C8, §8.3, §8.4; ADR-005): expire_stale_requests,
-- close_expired_offers, notify_turned_red. Executable by service_role (and the postgres cron job)
-- only. The shared local DB may contain other rows, so only fixture rows are asserted.
begin;
\ir ../_helpers.psql

select plan(37);

-- ---- privileges ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok('select public.expire_stale_requests()', '42501', null, 'authenticated (even admin) cannot run expire_stale_requests');
select throws_ok('select public.close_expired_offers()', '42501', null, 'authenticated cannot run close_expired_offers');
select throws_ok('select public.notify_turned_red()', '42501', null, 'authenticated cannot run notify_turned_red');
select tests.as_service();
select lives_ok('select public.notify_turned_red()', 'service_role may run the jobs');
select tests.clear_auth();
select ok(exists (select 1 from cron.job where jobname = 'fs_expire_requests' and command like '%expire_stale_requests%')
          and exists (select 1 from cron.job where jobname = 'fs_close_offers' and command like '%close_expired_offers%')
          and exists (select 1 from cron.job where jobname = 'fs_turned_red' and command like '%notify_turned_red%'),
  'pg_cron jobs scheduled');

-- ==== expire_stale_requests (C7 + needs past needed_by) ====
select tests.make_offer('o1', 'site_a', 'bread', 10);
select tests.set_var('req', tests.request('charity_owner', tests.id('o1'), 3)::text);
select tests.set_var('conf', tests.request('charity_owner', tests.id('o1'), 2)::text);
select tests.confirm('store_staff', tests.var('conf')::uuid);

insert into public.needs (id, org_id, site_id, category_codes, unit, quantity, needed_by, created_by) values
  ('a3000000-0000-4000-8000-000000000001', tests.id('charity_b'), tests.id('site_b'), '{bread}', 'loaf', 5, now() + interval '1 hour', tests.id('charity_owner')),
  ('a3000000-0000-4000-8000-000000000002', tests.id('charity_b'), tests.id('site_b'), '{bread}', 'loaf', 5, now() + interval '1 hour', tests.id('charity_owner')),
  ('a3000000-0000-4000-8000-000000000003', tests.id('charity_b'), tests.id('site_b'), '{bread}', 'loaf', 5, now() + interval '9 hours', tests.id('charity_owner'));
select tests.make_offer('o_n', 'site_a', 'bread', 10);
insert into public.allocations (offer_id, store_org_id, store_site_id, charity_org_id, charity_site_id, need_id, unit,
                                unit_weight_kg_snapshot, qty_reserved, qty_picked, qty_delivered, status, requested_by,
                                delivered_at, proof_due_at, closed_at)
values (tests.id('o_n'), tests.id('store_a'), tests.id('site_a'), tests.id('charity_b'), tests.id('site_b'),
        'a3000000-0000-4000-8000-000000000002', 'loaf', 0.12, 2, 2, 2, 'delivered', tests.id('charity_owner'), now(), now(), now());
update public.offers set qty_committed = 2 where id = tests.id('o_n');

select tests.set_clock(now() + interval '3 hours');
select ok(public.expire_stale_requests() >= 1, 'expire_stale_requests returns the number expired');
select results_eq(format($$select status::text, qty_released, closed_at is not null from public.allocations where id = %L$$, tests.var('req')),
  $$values ('expired', 3.000::numeric, true)$$, 'stale request => expired, released');
select is((select status::text from public.allocations where id = tests.var('conf')::uuid), 'confirmed', 'confirmed allocation untouched');
select results_eq(format($$select qty_committed, status::text from public.offers where id = %L$$, tests.id('o1')),
  $$values (2.000::numeric, 'open')$$, 'lot gets the quantity back');
select ok(exists (select 1 from public.notification_outbox where aggregate_id = tests.var('req')::uuid and event = 'allocation_expired'),
  'charity notified (allocation_expired)');
select is((select actor_kind from public.audit_logs where entity_id = tests.var('req')::uuid and action = 'allocation.expire'), 'system',
  'audited as system');
select results_eq($$select right(id::text, 1), status::text, closed_at is not null from public.needs where id::text like 'a3000000-%' order by id$$,
  $$values ('1', 'expired', true), ('2', 'closed_partial', true), ('3', 'open', false)$$,
  'needs past needed_by: expired (nothing delivered) / closed_partial (something delivered); future need untouched');
select is((select count(*)::int from public.notification_outbox where event = 'need_closed' and aggregate_id::text like 'a3000000-%'), 2,
  'need_closed enqueued for each closed need');
select lives_ok('select public.expire_stale_requests()', 'second run is harmless');
select is((select count(*)::int from public.audit_logs where entity_id = tests.var('req')::uuid and action = 'allocation.expire'), 1,
  'no double expiry');
select tests.clear_clock();

-- ==== close_expired_offers (C8) ====
-- lots with a deadline 1 hour from now
create function tests.lot(p_name text, p_site text default 'site_a') returns uuid language sql as $$
  select tests.make_offer(p_name, p_site, 'bread', 10, now() - interval '1 hour', now() + interval '1 hour');
$$;
select tests.lot('c_req');
select tests.set_var('c_req_a', tests.request('charity_owner', tests.id('c_req'), 3)::text);
select tests.lot('c_conf');
select tests.set_var('c_conf_a', tests.request('charity_owner', tests.id('c_conf'), 4)::text);
select tests.confirm('store_staff', tests.var('c_conf_a')::uuid);
select tests.lot('c_picked');
select tests.set_var('c_picked_a', tests.request('charity_owner', tests.id('c_picked'), 5)::text);
select tests.set_var('c_picked_b', tests.request('charity_owner', tests.id('c_picked'), 1)::text);
update public.allocations set status = 'picked_up', qty_picked = 5, picked_at = now(), reserved_until = null
 where id = tests.var('c_picked_a')::uuid;
select tests.lot('c_self');
select tests.set_var('c_self_a', tests.request('charity_owner', tests.id('c_self'), 2)::text);
select tests.confirm('store_staff', tests.var('c_self_a')::uuid);
select tests.set_var('c_self_p', tests.pickup('charity_owner', array[tests.var('c_self_a')::uuid])::text);
select tests.lot('c_vol');
select tests.set_var('c_vol_a', tests.request('charity_owner', tests.id('c_vol'), 2)::text);
select tests.confirm('store_staff', tests.var('c_vol_a')::uuid);
select tests.set_var('c_vol_p', tests.pickup('charity_owner', array[tests.var('c_vol_a')::uuid], 'site_b', 'volunteer', 'charity_volunteer')::text);
select tests.make_offer('c_future', 'site_a', 'bread', 10);

-- 10 minutes after the deadline: inside the 30-minute grace for the self trip
select tests.set_clock(now() + interval '70 minutes');
select ok(public.close_expired_offers() >= 4, 'close_expired_offers closes the lots past their deadline');
select results_eq(format($$select status::text, qty_unclaimed from public.offers where id = %L$$, tests.id('c_req')),
  $$values ('expired', 10.000::numeric)$$, 'nothing picked => expired, everything unclaimed');
select results_eq(format($$select status::text, qty_released from public.allocations where id = %L$$, tests.var('c_req_a')),
  $$values ('expired', 3.000::numeric)$$, 'requested => expired (released)');
select results_eq(format($$select status::text, shortfall_reason::text, qty_released from public.allocations where id = %L$$, tests.var('c_conf_a')),
  $$values ('expired', 'no_show', 0.000::numeric)$$, 'C8: confirmed => expired no_show, not released');
select is((select qty_unclaimed from public.offers where id = tests.id('c_conf')), 6.000::numeric, 'written-off quantity is not "unclaimed"');
select results_eq(format($$select status::text from public.offers where id = %L$$, tests.id('c_picked')),
  $$values ('completed')$$, 'something picked => completed');
select results_eq(format($$select status::text from public.allocations where id in (%L, %L) order by qty_reserved$$,
                         tests.var('c_picked_b'), tests.var('c_picked_a')),
  $$values ('expired'), ('picked_up')$$, 'pending request expired, picked_up untouched');
select is((select status::text from public.offers where id = tests.id('c_self')), 'open', 'self trip inside the grace window: lot stays open');
select is((select status::text from public.allocations where id = tests.var('c_self_a')::uuid), 'assigned', '... and its allocation stays assigned');
select is((select status::text from public.offers where id = tests.id('c_vol')), 'expired',
  'volunteer trip not started: no grace, lot expired');
select results_eq(format($$select a.status::text, a.pickup_id, p.status::text from public.allocations a, public.pickups p
                          where a.id = %L and p.id = %L$$, tests.var('c_vol_a'), tests.var('c_vol_p')),
  $$values ('expired', null::uuid, 'cancelled')$$, 'expired allocation detached, empty trip cancelled');
select is((select status::text from public.offers where id = tests.id('c_future')), 'open', 'lot before its deadline untouched');
select ok(exists (select 1 from public.notification_outbox where aggregate_id = tests.id('c_req') and event = 'offer_expired'),
  'store notified (offer_expired, N-22)');
select ok(not exists (select 1 from public.notification_outbox where aggregate_id = tests.id('c_picked') and event = 'offer_expired'),
  'no offer_expired for a completed lot');
select is((select actor_kind from public.audit_logs where entity_id = tests.id('c_req') and action = 'offer.expire'), 'system',
  'audited (offer.expire, system)');

-- 31 minutes after the deadline: grace over
select tests.set_clock(now() + interval '91 minutes');
select lives_ok('select public.close_expired_offers()', 'second run after the grace window');
select results_eq(format($$select o.status::text, a.status::text, a.shortfall_reason::text, p.status::text
                          from public.offers o, public.allocations a, public.pickups p
                          where o.id = %L and a.id = %L and p.id = %L$$, tests.id('c_self'), tests.var('c_self_a'), tests.var('c_self_p')),
  $$values ('expired', 'expired', 'no_show', 'cancelled')$$, 'after the grace: lot expired, allocation no_show, trip cancelled');
select is((select count(*)::int from public.audit_logs where entity_id = tests.id('c_req') and action = 'offer.expire'), 1,
  'closed lots are not processed twice');
select tests.clear_clock();

-- ==== notify_turned_red ====
select tests.make_offer('r_soon', 'site_a', 'bread', 10, now() - interval '5 minutes', now() + interval '3 hours');
select tests.make_offer('r_later', 'site_a', 'bread', 10, now() - interval '5 minutes', now() + interval '6 hours');
select tests.make_offer('r_done', 'site_a', 'bread', 10, now() - interval '5 minutes', now() + interval '2 hours');
update public.offers set red_notified_at = now() where id = tests.id('r_done');
select lives_ok('select public.notify_turned_red()', 'notify_turned_red runs');
select results_eq(format($$select o.red_notified_at is not null, n.urgency, n.event::text from public.offers o
                          join public.notification_outbox n on n.aggregate_id = o.id where o.id = %L$$, tests.id('r_soon')),
  $$values (true, 'urgent'::text, 'offer_turned_red'::text)$$, 'red lot => offer_turned_red (urgent), red_notified_at set');
select ok(not exists (select 1 from public.notification_outbox where aggregate_id in (tests.id('r_later'), tests.id('r_done'))),
  'yellow lot and already-notified lot skipped');
select tests.set_clock(now() + interval '3 hours');
select public.notify_turned_red();
select is((select count(*)::int from public.notification_outbox where aggregate_id in (tests.id('r_soon'), tests.id('r_later'))), 2,
  'the yellow lot turning red later is notified once; nothing is sent twice');
select tests.clear_clock();

select * from finish();
rollback;

-- request_offer (DATA-MODEL §4.4, §4.7, §4.8, §6.4, §8.4; PRD US-CHA-08, US-STO-14; ROADMAP P2-09
-- "request_allocation"). site_a ↔ site_b ≈ 4.7 km => travel ≈ 32 min.
begin;
\ir ../_helpers.psql

select plan(40);

select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_site('site_z', 'charity_z', 'approximate', 10.77, 106.69);
select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_p', 'charity_p', 'approximate', 10.77, 106.69);
select tests.create_user('far_owner');
select tests.create_org('charity_far', 'charity', 'far_owner');
select tests.create_site('site_far', 'charity_far', 'approximate', 10.95, 106.80);

select tests.make_offer('o30', 'site_a', 'bread', 30);

-- ---- permissions (B8 for requests) ----
select tests.as_anon();
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_b')),
  '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_b')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_b')),
  'PT404', 'not_found', 'store member cannot request for a charity site');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_b')),
  'PT403', 'not_authorized', 'volunteer cannot request (owner/manager/staff only)');
select tests.authenticate_as('pending_owner');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_p')),
  'PT403', 'org_not_active', 'B8: unapproved charity cannot request');
select tests.clear_auth();
update public.organizations set is_paused = true where id = tests.id('charity_b');
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_b'))),
  '{"sqlstate":"PT403","message":"org_not_active","detail":"paused","hint":null}'::jsonb, 'paused charity cannot request');
select tests.clear_auth();
update public.organizations set is_paused = false where id = tests.id('charity_b');

-- ---- happy path ----
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select tests.set_var('r1', public.request_offer(%L, 20, %L, 'f1000000-0000-4000-8000-000000000001')::text)$$,
                       tests.id('o30'), tests.id('site_b')), 'charity requests 20 of 30');
select tests.clear_auth();
select tests.set_var('a1', tests.var('r1')::jsonb ->> 'allocation_id');
select is(tests.var('r1')::jsonb ->> 'status', 'requested', 'manual store => requested');
select results_eq(
  format($$select status::text, qty_reserved, unit::text, unit_weight_kg_snapshot, store_org_id, charity_site_id, requested_by,
                  abs(extract(epoch from reserved_until - (now() + interval '120 minutes'))) < 2
           from public.allocations where id = %L$$, tests.var('a1')),
  format($$values ('requested', 20.000::numeric, 'loaf', 0.120::numeric, %L::uuid, %L::uuid, %L::uuid, true)$$,
         tests.id('store_a'), tests.id('site_b'), tests.id('charity_owner')),
  'allocation snapshot (unit, kg/unit, store) and reserved_until = now + request_ttl_minutes');
select results_eq(format($$select qty_committed, qty_available, status::text from public.offers where id = %L$$, tests.id('o30')),
  $$values (20.000::numeric, 10.000::numeric, 'open')$$, 'AC1: available drops to 10 immediately');
select results_eq(format($$select event::text, payload ->> 'offer_id' from public.notification_outbox where aggregate_id = %L$$, tests.var('a1')),
  format($$values ('allocation_requested', %L)$$, tests.id('o30')), 'store notified (allocation_requested)');
select results_eq(format($$select action, client_op_id from public.audit_logs where entity_id = %L$$, tests.var('a1')),
  $$values ('allocation.request'::text, 'f1000000-0000-4000-8000-000000000001'::uuid)$$, 'audited (allocation.request)');

select tests.authenticate_as('charity_owner');
select is(public.request_offer(tests.id('o30'), 20, tests.id('site_b'), 'f1000000-0000-4000-8000-000000000001'),
  tests.var('r1')::jsonb, 'same client_op_id => same allocation (no second reservation)');
select throws_ok(format($$select public.request_offer(%L, 5, %L, 'f1000000-0000-4000-8000-000000000001')$$, tests.id('o30'), tests.id('site_b')),
  'PT409', 'idempotency_conflict', 'same client_op_id, other quantity => idempotency_conflict');
select tests.clear_auth();
select is((select qty_committed from public.offers where id = tests.id('o30')), 20.000::numeric, 'still 20 committed');

-- ---- AC2: second charity asks for more than what is left ----
select tests.authenticate_as('ch2_owner');
select is(tests.error_of(format($$select public.request_offer(%L, 20, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_z'))),
  '{"sqlstate":"PT409","message":"insufficient_quantity","detail":"{\"available\": 10.000}","hint":null}'::jsonb,
  'AC2: "Chỉ còn 10" (insufficient_quantity, detail.available = 10)');
select lives_ok(format($$select tests.set_var('a2', (public.request_offer(%L, 10, %L, gen_random_uuid()) ->> 'allocation_id'))$$,
                       tests.id('o30'), tests.id('site_z')), 'takes the remaining 10');
select is(tests.error_of(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_z'))) ->> 'detail',
  '{"available": 0.000}', 'nothing left => insufficient_quantity');
select tests.clear_auth();
select results_eq(format($$select status::text, qty_committed, quantity from public.offers where id = %L$$, tests.id('o30')),
  $$values ('fully_allocated', 30.000::numeric, 30.000::numeric)$$, 'fully_allocated, never over-allocated');

-- ---- lazy expiry on the locked lot (C7) frees quantity for a new request ----
update public.allocations set reserved_until = now() - interval '1 minute' where id = tests.var('a2')::uuid;
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select public.request_offer(%L, 10, %L, gen_random_uuid())$$, tests.id('o30'), tests.id('site_b')),
  'a stale request is expired inside request_offer, its 10 units become available');
select tests.clear_auth();
select results_eq(format($$select status::text, qty_released from public.allocations where id = %L$$, tests.var('a2')),
  $$values ('expired', 10.000::numeric)$$, 'stale request expired and released');
select ok(exists (select 1 from public.notification_outbox where aggregate_id = tests.var('a2')::uuid and event = 'allocation_expired'),
  'charity notified of the expiry');
select is((select qty_committed from public.offers where id = tests.id('o30')),
          (select sum(qty_reserved - qty_released) from public.allocations where offer_id = tests.id('o30')),
  '§4.4: qty_committed = Σ(qty_reserved − qty_released)');

-- ---- validation ----
select tests.make_offer('o10', 'site_a', 'bread', 10);
select tests.authenticate_as('charity_owner');
select is((tests.error_of(format($$select public.request_offer(%L, 2.5, %L, gen_random_uuid())$$, tests.id('o10'), tests.id('site_b'))) ->> 'detail')::jsonb,
  '{"p_qty":"integer_required"}'::jsonb, 'counted unit: integer quantity');
select is((tests.error_of(format($$select public.request_offer(%L, 0, %L, gen_random_uuid())$$, tests.id('o10'), tests.id('site_b'))) ->> 'detail')::jsonb,
  '{"p_qty":"> 0"}'::jsonb, 'quantity must be positive');
select tests.authenticate_as('far_owner');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o10'), tests.id('site_far')),
  'PT422', 'out_of_radius', 'store outside the receiving radius');
select tests.clear_auth();
update public.sites set accepted_categories = '{dairy}' where id = tests.id('site_b');
select tests.authenticate_as('charity_owner');
select is((tests.error_of(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o10'), tests.id('site_b'))) ->> 'detail')::jsonb,
  '{"category_code":"not_accepted_by_site"}'::jsonb, 'category not accepted by the receiving site');
select tests.clear_auth();
update public.sites set accepted_categories = null where id = tests.id('site_b');

-- US-CHA-07: red lot 20 minutes before its deadline, 32 minutes away => infeasible
select tests.make_offer('o_red', 'site_a', 'bread', 10, now() - interval '1 hour', now() + interval '20 minutes');
select tests.make_offer('o_past', 'site_a', 'bread', 10, now() - interval '2 hours', now() - interval '1 hour');
select tests.make_offer('o_draft', 'site_a', 'bread', 10, p_status => 'draft');
select tests.make_offer('o_cancelled', 'site_a', 'bread', 10);
update public.offers set status = 'cancelled', closed_at = now() where id = tests.id('o_cancelled');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o_red'), tests.id('site_b')),
  'PT422', 'infeasible_timing', 'US-CHA-07: cannot arrive before the deadline');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o_past'), tests.id('site_b')),
  'PT409', 'deadline_passed', 'deadline passed (even before the cron closed the lot)');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o_draft'), tests.id('site_b')),
  'PT404', 'not_found', 'draft lots are invisible');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o_cancelled'), tests.id('site_b')),
  'PT409', 'invalid_state', 'closed lot');

-- receiving hours: drop-off ETA outside the charity's receiving hours => infeasible (US-CHA-07 AC3)
select tests.clear_auth();
insert into public.site_hours (site_id, dow, opens, closes, closes_next_day)
select tests.id('site_b'), d,
       ((now() at time zone 'Asia/Ho_Chi_Minh') + interval '5 hours')::time,
       ((now() at time zone 'Asia/Ho_Chi_Minh') + interval '6 hours')::time, false
from generate_series(0, 6) d
where ((now() at time zone 'Asia/Ho_Chi_Minh') + interval '5 hours')::time < ((now() at time zone 'Asia/Ho_Chi_Minh') + interval '6 hours')::time;
select tests.authenticate_as('charity_owner');
select is(case when exists (select 1 from public.site_hours where site_id = tests.id('site_b'))
               then tests.error_of(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o10'), tests.id('site_b'))) ->> 'message'
               else 'infeasible_timing' end,
  'infeasible_timing', 'charity closed at the drop-off ETA => infeasible');
select tests.clear_auth();
delete from public.site_hours where site_id = tests.id('site_b');

-- self-dealing, demo separation, paused store
insert into public.org_members (org_id, user_id, role, status, joined_at)
values (tests.id('charity_b'), tests.id('store_owner'), 'staff', 'active', now());
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o10'), tests.id('site_b')),
  'PT403', 'self_dealing', '§4.8: a member of the store cannot request its lot');
select tests.clear_auth();
select tests.make_offer('o_x', 'site_x', 'bread', 10);
update public.organizations set is_demo = true where id = tests.id('store_x');
select tests.authenticate_as('charity_owner');
select is((tests.error_of(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o_x'), tests.id('site_b'))) ->> 'detail')::jsonb,
  '{"p_offer_id":"demo_mismatch"}'::jsonb, '§4.8: demo data never matches real data');
select tests.clear_auth();
update public.organizations set is_demo = false, is_paused = true where id = tests.id('store_x');
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o_x'), tests.id('site_b'))) ->> 'detail',
  'store_paused', 'paused store does not take requests');
select tests.clear_auth();
update public.organizations set is_paused = false where id = tests.id('store_x');

-- ---- auto-accept (US-STO-14) ----
update public.sites set auto_accept_mode = 'all' where id = tests.id('site_a');
select tests.authenticate_as('charity_owner');
select tests.set_var('auto', (public.request_offer(tests.id('o10'), 2, tests.id('site_b'), gen_random_uuid()) ->> 'allocation_id'));
select tests.clear_auth();
select results_eq(format($$select status::text, auto_confirmed, confirmed_at is not null, confirmed_by, reserved_until from public.allocations where id = %L$$, tests.var('auto')),
  $$values ('confirmed', true, true, null::uuid, null::timestamptz)$$, 'AC1: mode all => confirmed in the same transaction');
select set_eq(format($$select event::text from public.notification_outbox where aggregate_id = %L$$, tests.var('auto')),
  array['allocation_requested', 'allocation_confirmed'], 'store told "đã tự động chấp nhận", charity told confirmed');
update public.sites set auto_accept_mode = 'trusted', auto_accept_min_trust = 60 where id = tests.id('site_a');
select tests.authenticate_as('charity_owner');
select is(public.request_offer(tests.id('o10'), 1, tests.id('site_b'), gen_random_uuid()) ->> 'status', 'requested',
  'AC2: trusted mode, charity trust 50 < 60 => manual queue');
select tests.clear_auth();
update public.sites set auto_accept_mode = 'all' where id = tests.id('site_a');
update public.app_settings set value = 'false' where key = 'auto_accept_enabled';
select tests.authenticate_as('charity_owner');
select is(public.request_offer(tests.id('o10'), 1, tests.id('site_b'), gen_random_uuid()) ->> 'status', 'requested',
  'feature switch auto_accept_enabled = false => manual queue');
select tests.clear_auth();

-- ---- rate limit 60/h/org ----
insert into public.rate_limits (key, window_start, count)
values ('request_offer:org:' || tests.id('charity_b'), date_bin('1 hour', now(), '2000-01-01 00:00+07'), 60)
on conflict (key, window_start) do update set count = 60;
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('o10'), tests.id('site_b')),
  'PT429', 'rate_limited', 'rate limit 60 requests / hour / org');
select tests.clear_auth();

select * from finish();
rollback;

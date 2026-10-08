-- mark_allocation_packed (DATA-MODEL §6.4 "Đã đóng gói"; PRD US-STO-16).
begin;
\ir ../_helpers.psql

select plan(14);

select tests.make_offer('o1', 'site_a', 'bread', 10);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 4)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o1'), 2)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);

select tests.as_anon();
select throws_ok(format($$select public.mark_allocation_packed(%L, gen_random_uuid())$$, tests.var('a1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.mark_allocation_packed(%L, gen_random_uuid())$$, tests.var('a1')),
  'PT404', 'not_found', 'charity cannot mark packed');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.mark_allocation_packed(%L, gen_random_uuid())$$, tests.var('a2')),
  'PT409', 'invalid_state', 'requested (not yet confirmed) cannot be packed');
select lives_ok(format($$select public.mark_allocation_packed(%L, 'f4000000-0000-4000-8000-000000000001')$$, tests.var('a1')),
  'AC1: staff marks a confirmed allocation packed');
select lives_ok(format($$select public.mark_allocation_packed(%L, 'f4000000-0000-4000-8000-000000000001')$$, tests.var('a1')),
  'replay is a no-op');
select is(tests.error_of(format($$select public.mark_allocation_packed(%L, gen_random_uuid())$$, tests.var('a1'))),
  '{"sqlstate":"PT409","message":"invalid_state","detail":"already_packed","hint":null}'::jsonb, 'packing twice refused');
select tests.clear_auth();
select results_eq(format($$select packed_at is not null, packed_by, status::text from public.allocations where id = %L$$, tests.var('a1')),
  format($$values (true, %L::uuid, 'confirmed')$$, tests.id('store_staff')), 'packed_at/by set, status unchanged');
select is((select count(*)::int from public.notification_outbox where aggregate_id = tests.var('a1')::uuid and event = 'allocation_packed'), 1,
  'charity (and volunteer) notified once: allocation_packed');

-- undo within 2 minutes
select tests.authenticate_as('store_staff');
select lives_ok(format($$select public.mark_allocation_packed(%L, gen_random_uuid(), false)$$, tests.var('a1')), 'AC2: undo within 2 minutes');
select tests.clear_auth();
select results_eq(format($$select packed_at, packed_by from public.allocations where id = %L$$, tests.var('a1')),
  $$values (null::timestamptz, null::uuid)$$, 'packed_at cleared');
-- pack again: no second notification (dedupe)
select tests.authenticate_as('store_staff');
select public.mark_allocation_packed(tests.var('a1')::uuid, gen_random_uuid());
select tests.clear_auth();
select is((select count(*)::int from public.notification_outbox where aggregate_id = tests.var('a1')::uuid and event = 'allocation_packed'), 1,
  're-packing after an undo does not notify again');
-- undo after 2 minutes refused
select tests.set_clock(now() + interval '3 minutes');
select tests.authenticate_as('store_staff');
select is(tests.error_of(format($$select public.mark_allocation_packed(%L, gen_random_uuid(), false)$$, tests.var('a1'))),
  '{"sqlstate":"PT409","message":"invalid_state","detail":"undo_window_passed","hint":null}'::jsonb, 'undo after 2 minutes refused');
select tests.clear_auth();
select tests.clear_clock();
select is((select count(*)::int from public.audit_logs where entity_id = tests.var('a1')::uuid and action in ('allocation.pack', 'allocation.unpack')), 3,
  'pack, unpack and pack audited');
select throws_ok(format($$select public.mark_allocation_packed(%L, gen_random_uuid(), null)$$, tests.var('a1')),
  'PT401', 'not_authenticated', 'requires a signed-in user');

select * from finish();
rollback;

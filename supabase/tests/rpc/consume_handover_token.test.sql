-- consume_handover_token (DATA-MODEL §2.3 "Hiệu lực token", §6.4 assigned -> picked_up | cancelled,
-- §6.6, §7 C9, §8.5; SECURITY-PRIVACY C10; TESTING §3): the store scans the carrier's QR at a pickup
-- stop. Valid only when unconsumed, within the 15-min TTL, within the pickup window ± 30 min and not
-- locked; the scanner must be a store member of the stop site and not the issuer.
begin;
\ir ../_helpers.psql

select plan(48);

-- dual: staff of the store AND of the charity (dual-control probe)
select tests.create_user('dual');
select tests.add_member('store_a', 'dual', 'staff');
select tests.add_member('charity_b', 'dual', 'staff');

-- self trip of charity_b with two pickup stops: site_a (a1 = 5 loaves) and site_x (a2 = 2 loaves)
select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.make_offer('o2', 'site_x', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 2)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.confirm('other_owner', tests.var('a2')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid, tests.var('a2')::uuid])::text);
select tests.set_var('s1', tests.stop_of(tests.var('a1')::uuid)::text);
select tests.set_var('s2', tests.stop_of(tests.var('a2')::uuid)::text);
select tests.set_var('l1', tests.full_lines(tests.var('s1')::uuid)::text);
select tests.issue('charity_owner', tests.var('s1')::uuid);   -- h_token / h_code / h_id

-- one-line p_lines [{allocation_id, qty, reason?, note?}] for the allocation stored under p_alloc
create function tests.line(p_alloc text, p_qty numeric, p_reason text default null, p_note text default null)
returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'allocation_id', tests.var(p_alloc), 'qty', p_qty, 'reason', p_reason, 'note', p_note)));
$$;
-- PT422 detail (jsonb) of consuming token h with p_lines
create function tests.lines_error(p_lines jsonb) returns jsonb language sql as $$
  select (tests.error_of(format('select public.consume_handover_token(%L, %L, gen_random_uuid())',
                                tests.var('h_token'), p_lines)) ->> 'detail')::jsonb;
$$;
grant execute on function tests.line(text, numeric, text, text), tests.lines_error(jsonb) to anon, authenticated;

-- ---- who ----
select tests.as_anon();
select throws_ok($$select public.consume_handover_token(tests.var('h_token'), tests.var('l1')::jsonb, gen_random_uuid())$$,
  '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select is(tests.error_of($$select public.consume_handover_token(tests.var('h_token'), tests.var('l1')::jsonb, gen_random_uuid())$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_store","hint":null}'::jsonb, 'unrelated user => wrong_store');
select tests.authenticate_as('other_owner');
select is(tests.error_of($$select public.consume_handover_token(tests.var('h_token'), tests.var('l1')::jsonb, gen_random_uuid())$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_store","hint":null}'::jsonb,
  'store of another stop of the same trip => wrong_store');
select tests.authenticate_as('charity_owner');
select is(tests.error_of($$select public.consume_handover_token(tests.var('h_token'), tests.var('l1')::jsonb, gen_random_uuid())$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_store","hint":null}'::jsonb,
  'the carrier cannot scan its own QR');
select tests.authenticate_as('charity_volunteer');
select throws_ok($$select public.consume_handover_token(tests.var('h_token'), tests.var('l1')::jsonb, gen_random_uuid())$$,
  'PT403', 'not_authorized', 'charity volunteer => not_authorized');
select tests.clear_auth();
select throws_ok($$select public.consume_handover_token(tests.var('h_token'), tests.var('l1')::jsonb, gen_random_uuid())$$,
  'PT401', 'not_authenticated', 'no JWT subject => not_authenticated');

-- ---- token / client_op_id ----
select tests.authenticate_as('store_staff');
select throws_ok($$select public.consume_handover_token(null, tests.var('l1')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_invalid', 'NULL token => token_invalid');
select throws_ok($$select public.consume_handover_token('abc', tests.var('l1')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_invalid', 'malformed token => token_invalid');
select throws_ok(format($$select public.consume_handover_token(%L, tests.var('l1')::jsonb, gen_random_uuid())$$, repeat('A', 43)),
  'PT422', 'token_invalid', 'well-formed but unknown token => token_invalid');
select is((tests.error_of($$select public.consume_handover_token(tests.var('h_token'), tests.var('l1')::jsonb, null)$$) ->> 'detail')::jsonb,
  '{"p_client_op_id":"required"}'::jsonb, 'client_op_id required');

-- ---- lines (C10 e; §8.5: cover exactly the allocations of the stop) ----
select is(tests.lines_error(null), '{"p_lines":"array_required"}'::jsonb, 'p_lines NULL => array_required');
select is(tests.lines_error('{}'), '{"p_lines":"array_required"}'::jsonb, 'p_lines object => array_required');
select is(tests.lines_error('"x"'), '{"p_lines":"array_required"}'::jsonb, 'p_lines scalar => array_required');
select is(tests.lines_error('[]'), jsonb_build_object('p_lines', 'missing_allocation', 'allocation_id', tests.var('a1')),
  'empty lines must still cover the allocation of the stop');
select is(tests.lines_error('[5]'), '{"p_lines":"line_format"}'::jsonb, 'a line must be an object');
select is(tests.lines_error(tests.line('a1', 6)),
  jsonb_build_object('p_lines', 'qty_out_of_range', 'allocation_id', tests.var('a1'), 'max', 5),
  'qty above the reserved quantity refused');
select is(tests.lines_error(tests.line('a1', 4)), jsonb_build_object('p_lines', 'reason_required', 'allocation_id', tests.var('a1')),
  'a shortfall needs a reason');
select is(tests.lines_error(tests.line('a1', 4.5, 'capacity')),
  jsonb_build_object('p_lines', 'integer_required', 'allocation_id', tests.var('a1')), 'loaves are whole units (4.5 refused)');
select is(tests.lines_error(tests.line('a1', 4, 'quality_reject')),
  jsonb_build_object('p_lines', 'note_required', 'allocation_id', tests.var('a1')), 'quality_reject needs a note');
select is(tests.lines_error(jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a1'), 'reason', 'capacity'))),
  jsonb_build_object('p_lines', 'qty_required', 'allocation_id', tests.var('a1')),
  'a line without qty is refused (missing key => NULL must not skip the check)');
select is(tests.lines_error(tests.line('a2', 2)), jsonb_build_object('p_lines', 'unknown_allocation', 'allocation_id', tests.var('a2')),
  'allocation of another stop refused');
select is(tests.lines_error(tests.line('a1', 4, 'late')), jsonb_build_object('p_lines', 'reason_not_allowed', 'allocation_id', tests.var('a1')),
  'unknown shortfall reason refused');
select tests.clear_auth();
select results_eq(
  $$select h.consumed_at, h.failed_attempts, (select count(*) from public.handover_lines l where l.handover_id = h.id)
    from public.handovers h where h.id = tests.var('h_id')::uuid$$,
  $$values (null::timestamptz, 0::smallint, 0::bigint)$$,
  'refused scans leave the handover open: not consumed, no attempt counted, no line');

-- ---- scan: 4 of 5 picked (capacity) ----
select tests.authenticate_as('store_staff');
create table tests.r1 as
  select public.consume_handover_token(tests.var('h_token'), tests.line('a1', 4, 'capacity'), 'f8000000-0000-4000-8000-000000000001') as r;
select tests.clear_auth();
select results_eq($$select (r ->> 'ok')::boolean, r ->> 'handover_id', r ->> 'pickup_id', r -> 'allocations', r -> 'dropoff' from tests.r1$$,
  format($$values (true, %L, %L, jsonb_build_array(jsonb_build_object('allocation_id', %L, 'status', 'picked_up', 'qty_picked', 4)), 'null'::jsonb)$$,
         tests.var('h_id'), tests.var('p1'), tests.var('a1')),
  'ok: 4 picked up; no dropoff yet (another stop is pending)');
select results_eq(format($$select consumed_at is not null, scanned_by, method::text, client_op_id from public.handovers where id = %L$$, tests.var('h_id')),
  format($$values (true, %L::uuid, 'qr', 'f8000000-0000-4000-8000-000000000001'::uuid)$$, tests.id('store_staff')),
  'handover consumed: scanned_by the store member, method qr, client_op_id kept');
select results_eq(format($$select allocation_id, expected_qty, qty, reason::text from public.handover_lines where handover_id = %L$$, tests.var('h_id')),
  format($$values (%L::uuid, 5.000::numeric, 4.000::numeric, 'capacity')$$, tests.var('a1')),
  'one reconciliation line: expected 5, picked 4 (capacity)');
select results_eq(format($$select status::text, qty_picked, qty_released, shortfall_reason::text, picked_at is not null
                          from public.allocations where id = %L$$, tests.var('a1')),
  $$values ('picked_up', 4.000::numeric, 1.000::numeric, 'capacity', true)$$,
  'allocation picked_up (4); the capacity shortfall is released (C9, before the deadline)');
select is((select qty_committed from public.offers where id = tests.id('o1')), 4.000::numeric, 'lot: qty_committed 5 -> 4');
select results_eq(format($$select s.status::text, s.completed_at is not null, (select status::text from public.pickup_stops where id = %L),
                                 p.status::text, p.started_at is not null
                          from public.pickup_stops s join public.pickups p on p.id = s.pickup_id where s.id = %L$$,
                         tests.var('s2'), tests.var('s1')),
  $$values ('done', true, 'pending', 'in_progress', true)$$,
  'stop done; self trip planned -> in_progress; the other stop still pending');
select is((select count(*)::int from public.impact_ledger where allocation_id = tests.var('a1')::uuid), 0,
  'no impact credit at pickup (credited only at dropoff)');
select is((select count(*)::int from public.notification_outbox
           where event = 'pickup_handover_done' and payload ->> 'handover_id' = tests.var('h_id')), 1, 'outbox pickup_handover_done');
select ok((select count(*) = 1 from public.audit_logs where entity_id = tests.var('h_id')::uuid and action = 'handover.pickup')
          and not exists (select 1 from public.audit_logs
                          where position(tests.var('h_token') in coalesce(before::text, '') || coalesce(after::text, '')) > 0)
          and not exists (select 1 from public.rpc_idempotency where position(tests.var('h_token') in coalesce(response::text, '')) > 0),
  'audited once (handover.pickup); the token never reaches audit_logs or rpc_idempotency');

-- ---- idempotency / single use ----
select tests.authenticate_as('store_staff');
select is(public.consume_handover_token(tests.var('h_token'), tests.line('a1', 4, 'capacity'), 'f8000000-0000-4000-8000-000000000001'),
  (select r from tests.r1), 'replay with the same client_op_id returns the stored result');
select throws_ok($$select public.consume_handover_token(tests.var('h_token'), tests.line('a1', 5), 'f8000000-0000-4000-8000-000000000001')$$,
  'PT409', 'idempotency_conflict', 'same client_op_id with other lines => idempotency_conflict');
select throws_ok($$select public.consume_handover_token(tests.var('h_token'), tests.line('a1', 4, 'capacity'), gen_random_uuid())$$,
  'PT409', 'token_consumed', 'second scan (new client_op_id) => token_consumed');
select tests.clear_auth();
select results_eq(format($$select (select count(*) from public.handover_lines where handover_id = %L),
                                 (select count(*) from public.audit_logs where entity_id = %L and action = 'handover.pickup')$$,
                         tests.var('h_id'), tests.var('h_id')),
  $$values (1::bigint, 1::bigint)$$, 'replays add no line and no audit row');

-- ---- last stop of a self trip => automatic dropoff ----
select tests.issue('charity_owner', tests.var('s2')::uuid, 'x');
select tests.authenticate_as('other_owner');
create table tests.r2 as select public.consume_handover_token(tests.var('x_token'), tests.line('a2', 2), gen_random_uuid()) as r;
select tests.clear_auth();
select results_eq(format($$select p.status::text, (select h.method::text from public.handovers h where h.pickup_id = p.id and h.kind = 'dropoff'),
                                 ((select r from tests.r2) -> 'dropoff' ->> 'kg')::numeric
                          from public.pickups p where p.id = %L$$, tests.var('p1')),
  $$values ('completed', 'auto', 0.720::numeric)$$,
  'self trip: last pickup => automatic dropoff (method auto), trip completed, (4 + 2) × 0.12 kg');
select results_eq(format($$select a.status::text, a.qty_delivered, il.kg from public.allocations a
                          join public.impact_ledger il on il.allocation_id = a.id and il.entry_type = 'credit'
                          where a.pickup_id = %L order by a.qty_delivered desc$$, tests.var('p1')),
  $$values ('delivered', 4.000::numeric, 0.480::numeric), ('delivered', 2.000::numeric, 0.240::numeric)$$,
  'delivered as picked; one credit each with kg = qty × unit_weight snapshot');

-- ---- TTL and pickup window ± 30 min (time travel) ----
select tests.make_offer('o3', 'site_a', 'bread', 20);
select tests.set_var('a3', tests.request('charity_owner', tests.id('o3'), 2)::text);
select tests.confirm('store_staff', tests.var('a3')::uuid);
select tests.pickup('charity_owner', array[tests.var('a3')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('a3')::uuid), 'e');
select tests.set_clock(now() + interval '16 minutes');
select tests.authenticate_as('store_staff');
select is(tests.error_of($$select public.consume_handover_token(tests.var('e_token'), tests.line('a3', 2), gen_random_uuid())$$),
  '{"sqlstate":"PT422","message":"token_expired","detail":null,"hint":null}'::jsonb, '16 min after issue (TTL 15) => token_expired');
select tests.clear_auth();
select tests.clear_clock();
update public.offers set pickup_window = tstzrange(now() + interval '50 minutes', now() + interval '5 hours') where id = tests.id('o3');
select tests.authenticate_as('store_staff');
select is(tests.error_of($$select public.consume_handover_token(tests.var('e_token'), tests.line('a3', 2), gen_random_uuid())$$),
  '{"sqlstate":"PT422","message":"token_expired","detail":"outside_pickup_window","hint":null}'::jsonb,
  'within TTL but more than 30 min before the pickup window => refused');
select tests.clear_auth();
update public.offers set pickup_window = tstzrange(now() - interval '3 hours', now() - interval '20 minutes') where id = tests.id('o3');
select tests.set_clock(now() + interval '14 minutes');
select tests.authenticate_as('store_staff');
select is(tests.error_of($$select public.consume_handover_token(tests.var('e_token'), tests.line('a3', 2), gen_random_uuid())$$),
  '{"sqlstate":"PT422","message":"token_expired","detail":"outside_pickup_window","hint":null}'::jsonb,
  'within TTL but more than 30 min after the pickup window => refused');
select tests.clear_auth();
select tests.set_clock(now() + interval '5 minutes');
select tests.authenticate_as('store_staff');
select lives_ok($$select public.consume_handover_token(tests.var('e_token'), tests.line('a3', 2), gen_random_uuid())$$,
  '25 min after the window (inside the grace) and within TTL => accepted');
select tests.clear_auth();
select tests.clear_clock();

-- ---- locked (condition 4 applies to the QR too) ----
select tests.make_offer('o4', 'site_a', 'bread', 20);
select tests.set_var('a4', tests.request('charity_owner', tests.id('o4'), 1)::text);
select tests.confirm('store_staff', tests.var('a4')::uuid);
select tests.pickup('charity_owner', array[tests.var('a4')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('a4')::uuid), 'k');
update public.handovers set failed_attempts = 5 where id = tests.var('k_id')::uuid;
select tests.authenticate_as('store_staff');
select throws_ok($$select public.consume_handover_token(tests.var('k_token'), tests.line('a4', 1), gen_random_uuid())$$,
  'PT422', 'token_locked', 'after 5 wrong codes the QR is locked too (re-issue needed)');
select tests.clear_auth();

-- ---- dual control, then nothing handed over (store_short) ----
select tests.make_offer('o5', 'site_a', 'bread', 20);
select tests.set_var('a5', tests.request('charity_owner', tests.id('o5'), 3)::text);
select tests.confirm('store_staff', tests.var('a5')::uuid);
select tests.set_var('p5', tests.pickup('charity_owner', array[tests.var('a5')::uuid])::text);
select tests.issue('dual', tests.stop_of(tests.var('a5')::uuid), 'z');
select tests.authenticate_as('dual');
select throws_ok($$select public.consume_handover_token(tests.var('z_token'), tests.line('a5', 3), gen_random_uuid())$$,
  'PT403', 'self_dealing', 'dual control: the issuer cannot scan its own QR, even as a store member');
select tests.authenticate_as('store_staff');
select lives_ok($$select public.consume_handover_token(tests.var('z_token'), tests.line('a5', 0, 'store_short'), gen_random_uuid())$$,
  'store hands over nothing (store_short)');
select tests.clear_auth();
select results_eq(format($$select status::text, cancel_actor, qty_picked, qty_released, shortfall_reason::text
                          from public.allocations where id = %L$$, tests.var('a5')),
  $$values ('cancelled', 'system', 0.000::numeric, 0.000::numeric, 'store_short')$$,
  'qty 0 => allocation cancelled by the system; store_short is not returned to the lot (C9)');
select results_eq(format($$select org_id, delta, reason from public.trust_events where ref_id = %L$$, tests.var('z_id')),
  format($$values (%L::uuid, -1.00::numeric, 'store_short')$$, tests.id('store_a')), 'store_short: trust −1 for the store');
select is((select status::text from public.pickups where id = tests.var('p5')::uuid), 'cancelled',
  'nothing left to carry => the trip is cancelled');

select * from finish();
rollback;

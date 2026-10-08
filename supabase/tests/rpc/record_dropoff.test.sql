-- record_dropoff (DATA-MODEL §2.3 "Hiệu lực token" 1, 2, 4, §6.4 picked_up -> delivered, §6.5
-- in_progress -> completed, §6.6, §8.5, §13; SECURITY-PRIVACY C9, C10; TESTING §3): the receiving
-- charity (owner/manager/staff of the receiving site, ≠ issuer) confirms a volunteer trip with the
-- carrier's QR or 6-digit code. Delivers, credits the impact ledger once per line with qty > 0,
-- trust +1 both sides, completes the trip and clears the location.
begin;
\ir ../_helpers.psql

select plan(45);

select tests.create_user('ch_staff');
select tests.add_member('charity_b', 'ch_staff', 'staff');
select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');

-- volunteer trip p1 (charity_volunteer): a1 = 5 loaves (0.12 kg), a2 = 3 kg of vegetables, both at site_a
select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.make_offer('o2', 'site_a', 'vegetables', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 3)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.confirm('store_staff', tests.var('a2')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid, tests.var('a2')::uuid],
                                        'site_b', 'volunteer', 'charity_volunteer')::text);
select tests.issue('charity_volunteer', tests.stop_of(tests.var('a1')::uuid), 'k');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('k_token'), tests.full_lines(tests.stop_of(tests.var('a1')::uuid)), gen_random_uuid());
select tests.clear_auth();
update public.pickups
   set last_location = 'SRID=4326;POINT(106.68 10.77)'::extensions.geography, last_location_at = now(), last_location_accuracy_m = 10
 where id = tests.var('p1')::uuid;
select tests.set_var('ds', tests.dropoff_stop(tests.var('p1')::uuid)::text);
select tests.set_var('dl', tests.full_lines(tests.var('ds')::uuid)::text);
select tests.issue('charity_volunteer', tests.var('ds')::uuid, 'd');   -- d_token / d_code / d_id

-- a code that is certainly not the current dropoff code
create function tests.wrong_code() returns text language sql stable as $$
  select lpad(((tests.var('d_code')::int + 1) % 1000000)::text, 6, '0');
$$;
-- PT422 detail (jsonb) of a dropoff with the right token and p_lines
create function tests.lines_error(p_lines jsonb) returns jsonb language sql as $$
  select (tests.error_of(format('select public.record_dropoff(%L, %L, %L, gen_random_uuid())',
                                tests.var('d_id'), tests.var('d_token'), p_lines)) ->> 'detail')::jsonb;
$$;
create function tests.line(p_alloc text, p_qty numeric, p_reason text default null, p_note text default null)
returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'allocation_id', tests.var(p_alloc), 'qty', p_qty, 'reason', p_reason, 'note', p_note)));
$$;
grant execute on function tests.wrong_code(), tests.lines_error(jsonb), tests.line(text, numeric, text, text) to anon, authenticated;

-- ---- who (PT404: only the receiving charity's owner/manager/staff) ----
select tests.as_anon();
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_staff');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'the store never confirms the dropoff');
select tests.authenticate_as('charity_volunteer');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'the carrier (volunteer role) cannot confirm its own delivery');
select tests.authenticate_as('ch2_owner');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'another charity => not_found');

-- ---- input (receiving coordinator) ----
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.record_dropoff(null, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'NULL handover id => not_found');
select throws_ok($$select public.record_dropoff(gen_random_uuid(), tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'unknown handover id => not_found');
select is(tests.error_of($$select public.record_dropoff(tests.var('k_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$),
  '{"sqlstate":"PT422","message":"token_invalid","detail":"not_a_dropoff_handover","hint":null}'::jsonb,
  'a pickup handover is not a dropoff');
select is((tests.error_of($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, null)$$)
           ->> 'detail')::jsonb, '{"p_client_op_id":"required"}'::jsonb, 'client_op_id required');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, null, tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_invalid', 'NULL secret => token_invalid (never a silent pass)');
select throws_ok(format($$select public.record_dropoff(tests.var('d_id')::uuid, %L, tests.var('dl')::jsonb, gen_random_uuid())$$, repeat('A', 43)),
  'PT422', 'token_invalid', 'wrong QR token => token_invalid');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, 'abc', tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_invalid', 'secret that is neither a token nor a 6-digit code => token_invalid');

-- ---- lines (dropoff: expected = qty_picked, only quality_reject with a note) ----
select is(tests.lines_error(null), '{"p_lines":"array_required"}'::jsonb, 'p_lines NULL => array_required');
select is(tests.lines_error('{}'), '{"p_lines":"array_required"}'::jsonb, 'p_lines object => array_required');
select is(tests.lines_error('[]') ->> 'p_lines', 'missing_allocation', 'lines must cover every picked_up allocation of the trip');
select is(tests.lines_error(tests.line('a1', 6)),
  jsonb_build_object('p_lines', 'qty_out_of_range', 'allocation_id', tests.var('a1'), 'max', 5), 'qty above qty_picked refused');
select is(tests.lines_error(tests.line('a1', 4)), jsonb_build_object('p_lines', 'reason_required', 'allocation_id', tests.var('a1')),
  'a shortfall needs a reason');
select is(tests.lines_error(tests.line('a1', 4, 'capacity')),
  jsonb_build_object('p_lines', 'reason_not_allowed', 'allocation_id', tests.var('a1')), 'at dropoff only quality_reject is allowed');
select is(tests.lines_error(tests.line('a1', 4, 'quality_reject')),
  jsonb_build_object('p_lines', 'note_required', 'allocation_id', tests.var('a1')), 'quality_reject needs a note');
select is(tests.lines_error(tests.line('a1', 4.5, 'quality_reject', 'Bánh bị dập')),
  jsonb_build_object('p_lines', 'integer_required', 'allocation_id', tests.var('a1')), 'loaves are whole units (4.5 refused)');
select is(tests.lines_error(jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a1'), 'reason', 'quality_reject', 'note', 'x'))),
  jsonb_build_object('p_lines', 'qty_required', 'allocation_id', tests.var('a1')),
  'a line without qty is refused (missing key => NULL must not skip the check)');
select tests.clear_auth();
select results_eq(
  $$select h.consumed_at, h.failed_attempts, (select count(*) from public.handover_lines l where l.handover_id = h.id),
           (select count(*) from public.allocations a where a.pickup_id = h.pickup_id and a.status = 'picked_up')
    from public.handovers h where h.id = tests.var('d_id')::uuid$$,
  $$values (null::timestamptz, 0::smallint, 0::bigint, 2::bigint)$$,
  'refused calls change nothing (no attempt counted for a wrong token or bad lines)');

-- ---- wrong 6-digit code: no raise, counted; locked at 5 ----
select tests.authenticate_as('charity_owner');
create table tests.w1 as
  select public.record_dropoff(tests.var('d_id')::uuid, tests.wrong_code(), tests.var('dl')::jsonb, 'fa000000-0000-4000-8000-000000000001') as r;
select tests.clear_auth();
select is((select r from tests.w1), '{"ok": false, "error": "code_invalid", "attempts_left": 4}'::jsonb,
  'wrong code => {ok:false, code_invalid, attempts_left 4}');
select results_eq($$select consumed_at, failed_attempts from public.handovers where id = tests.var('d_id')::uuid$$,
  $$values (null::timestamptz, 1::smallint)$$, 'failed_attempts + 1 is kept, handover still open');
select tests.authenticate_as('charity_owner');
select is(public.record_dropoff(tests.var('d_id')::uuid, tests.wrong_code(), tests.var('dl')::jsonb, 'fa000000-0000-4000-8000-000000000001'),
  (select r from tests.w1), 'replay of the wrong attempt returns the stored result (not counted twice)');
select is((select array_agg((public.record_dropoff(tests.var('d_id')::uuid, tests.wrong_code(), tests.var('dl')::jsonb, gen_random_uuid())
                             ->> 'attempts_left')::int order by g) from generate_series(1, 4) g),
  array[3, 2, 1, 0], '4 more wrong codes: attempts_left 3, 2, 1, 0');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('dl')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_locked', 'locked after 5 wrong codes: even the right QR is refused');
select tests.clear_auth();
select tests.issue('charity_volunteer', tests.var('ds')::uuid, 'd');   -- re-issue: new d_token / d_code, same d_id
select is((select failed_attempts from public.handovers where id = tests.var('d_id')::uuid), 0::smallint,
  're-issue unlocks (failed_attempts reset)');

-- ---- dual control and TTL on a second trip (carrier = charity staff) ----
select tests.make_offer('o3', 'site_a', 'bread', 20);
select tests.set_var('a3', tests.request('charity_owner', tests.id('o3'), 2)::text);
select tests.set_var('a4', tests.request('charity_owner', tests.id('o3'), 1)::text);
select tests.confirm('store_staff', tests.var('a3')::uuid);
select tests.confirm('store_staff', tests.var('a4')::uuid);
select tests.set_var('p2', tests.pickup('charity_owner', array[tests.var('a3')::uuid, tests.var('a4')::uuid],
                                        'site_b', 'volunteer', 'ch_staff')::text);
select tests.issue('ch_staff', tests.stop_of(tests.var('a3')::uuid), 'k2');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('k2_token'), tests.full_lines(tests.stop_of(tests.var('a3')::uuid)), gen_random_uuid());
select tests.clear_auth();
select tests.set_var('dl2', tests.full_lines(tests.dropoff_stop(tests.var('p2')::uuid))::text);
select tests.issue('ch_staff', tests.dropoff_stop(tests.var('p2')::uuid), 'd2');
select tests.authenticate_as('ch_staff');
select throws_ok($$select public.record_dropoff(tests.var('d2_id')::uuid, tests.var('d2_token'), tests.var('dl2')::jsonb, gen_random_uuid())$$,
  'PT403', 'self_dealing', 'dual control: the staff member who carried the goods cannot confirm the dropoff');
select tests.clear_auth();
select tests.set_clock(now() + interval '16 minutes');
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.record_dropoff(tests.var('d2_id')::uuid, tests.var('d2_token'), tests.var('dl2')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_expired', '16 min after issue (TTL 15) => token_expired');
select tests.clear_auth();
select tests.clear_clock();

-- ---- dropoff by QR: 5 loaves + 2.5 of 3 kg (quality_reject) ----
select tests.set_var('ql', jsonb_build_array(
  jsonb_build_object('allocation_id', tests.var('a1'), 'qty', 5),
  jsonb_build_object('allocation_id', tests.var('a2'), 'qty', 2.5, 'reason', 'quality_reject', 'note', 'Rau dập, không dùng được'))::text);
select tests.authenticate_as('charity_owner');
create table tests.r1 as
  select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('ql')::jsonb, 'fa000000-0000-4000-8000-000000000002') as r;
select tests.clear_auth();
select results_eq($$select (r ->> 'ok')::boolean, (r ->> 'kg')::numeric, (r ->> 'co2e_kg')::numeric, (r ->> 'water_l')::numeric,
                           (r ->> 'meals')::numeric, jsonb_array_length(r -> 'ledger_ids') from tests.r1$$,
  $$values (true, 3.100::numeric, 6.200::numeric, 465.00::numeric, 7.38::numeric, 2)$$,
  'ok: 0.6 + 2.5 kg, CO2e ×2.0, water ×150, meals 1.43 + 5.95, two ledger rows');
select results_eq($$select consumed_at is not null, scanned_by, method::text, client_op_id from public.handovers where id = tests.var('d_id')::uuid$$,
  format($$values (true, %L::uuid, 'qr', 'fa000000-0000-4000-8000-000000000002'::uuid)$$, tests.id('charity_owner')),
  'handover consumed by the receiving coordinator (≠ issuer), method qr');
select results_eq($$select allocation_id, expected_qty, qty, reason::text, note from public.handover_lines
                    where handover_id = tests.var('d_id')::uuid order by expected_qty desc$$,
  format($$values (%L::uuid, 5.000::numeric, 5.000::numeric, null::text, null::text),
                  (%L::uuid, 3.000::numeric, 2.500::numeric, 'quality_reject', 'Rau dập, không dùng được')$$,
         tests.var('a1'), tests.var('a2')),
  'dropoff lines: expected = qty_picked; kg unit accepts 2.5');
select results_eq($$select status::text, qty_delivered, qty_released, shortfall_reason::text, proof_due_at = delivered_at + interval '48 hours'
                    from public.allocations where pickup_id = tests.var('p1')::uuid order by qty_delivered desc$$,
  $$values ('delivered', 5.000::numeric, 0.000::numeric, null::text, true), ('delivered', 2.500::numeric, 0.000::numeric, 'quality_reject', true)$$,
  'allocations delivered; the rejected 0.5 kg is not returned to the lot; proof due in 48 h');
select results_eq($$select il.allocation_id, il.kg, il.kg = round(hl.qty * a.unit_weight_kg_snapshot, 3), il.occurred_at = h.consumed_at, il.factor_version
                    from public.impact_ledger il
                    join public.handover_lines hl on hl.id = il.handover_line_id
                    join public.handovers h on h.id = hl.handover_id
                    join public.allocations a on a.id = il.allocation_id
                    where h.id = tests.var('d_id')::uuid and il.entry_type = 'credit' order by il.kg$$,
  format($$values (%L::uuid, 0.600::numeric, true, true, 'v1'), (%L::uuid, 2.500::numeric, true, true, 'v1')$$, tests.var('a1'), tests.var('a2')),
  'exactly one credit per line, kg = qty × unit_weight snapshot, at dropoff time, factor v1');
select results_eq($$select s.status::text, p.status::text, p.completed_at is not null, p.last_location is null and p.last_location_at is null
                    from public.pickups p join public.pickup_stops s on s.pickup_id = p.id and s.kind = 'dropoff'
                    where p.id = tests.var('p1')::uuid$$,
  $$values ('done', 'completed', true, true)$$, 'dropoff stop done; trip completed; volunteer location cleared (C9)');
select results_eq($$select array_agg(distinct org_id order by org_id), bool_and(delta = 1 and reason = 'delivered_on_time')
                    from public.trust_events where ref_id = tests.var('d_id')::uuid$$,
  $$select array_agg(x order by x), true from unnest(array[tests.id('store_a'), tests.id('charity_b')]) x$$,
  'trust +1 (delivered_on_time) for both sides');
select is((select count(*) - count(distinct org_id) from public.trust_events where ref_id = tests.var('d_id')::uuid), 0::bigint,
  'trust is +1 per side per delivery, not per line (splitting requests cannot inflate trust)');
select is((select count(*)::int from public.notification_outbox
           where event = 'delivery_completed' and payload ->> 'handover_id' = tests.var('d_id')), 1, 'outbox delivery_completed');
select ok((select count(*) = 1 from public.audit_logs where entity_id = tests.var('d_id')::uuid and action = 'handover.dropoff')
          and not exists (select 1 from public.audit_logs a
                          where position(tests.var('d_token') in coalesce(a.before::text, '') || coalesce(a.after::text, '')) > 0
                             or jsonb_path_exists(coalesce(a.before, '{}') || coalesce(a.after, '{}'), 'strict $.** ? (@ == $c)',
                                                  jsonb_build_object('c', tests.var('d_code'))))
          and not exists (select 1 from public.rpc_idempotency where position(tests.var('d_token') in coalesce(response::text, '')) > 0),
  'audited once (handover.dropoff); token and code never reach audit_logs or rpc_idempotency');
select tests.authenticate_as('charity_owner');
select is(public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('ql')::jsonb, 'fa000000-0000-4000-8000-000000000002'),
  (select r from tests.r1), 'replay with the same client_op_id returns the stored result');
select tests.clear_auth();
select results_eq($$select (select count(*) from public.impact_ledger where allocation_id in (tests.var('a1')::uuid, tests.var('a2')::uuid)),
                           (select count(*) from public.handover_lines where handover_id = tests.var('d_id')::uuid)$$,
  $$values (2::bigint, 2::bigint)$$, 'replay writes no second credit and no line');
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.record_dropoff(tests.var('d_id')::uuid, tests.var('d_token'), tests.var('ql')::jsonb, gen_random_uuid())$$,
  'PT409', 'token_consumed', 'second confirmation (new client_op_id) => token_consumed');

-- ---- dropoff by code: one line rejected entirely (qty 0 => no credit) ----
select lives_ok(format($$select tests.set_var('r2', public.record_dropoff(tests.var('d2_id')::uuid, tests.var('d2_code'), %L, gen_random_uuid())::text)$$,
                       jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a3'), 'qty', 2),
                                         jsonb_build_object('allocation_id', tests.var('a4'), 'qty', 0, 'reason', 'quality_reject', 'note', 'Bánh mốc'))),
  'receiving coordinator confirms with the 6-digit code');
select tests.clear_auth();
select results_eq($$select h.method::text, (tests.var('r2')::jsonb ->> 'kg')::numeric, a.status::text, a.qty_delivered,
                           (select count(*) from public.impact_ledger il where il.allocation_id = a.id)
                    from public.handovers h join public.allocations a on a.pickup_id = h.pickup_id
                    where h.id = tests.var('d2_id')::uuid order by a.qty_delivered desc$$,
  $$values ('code', 0.240::numeric, 'delivered', 2.000::numeric, 1::bigint), ('code', 0.240::numeric, 'delivered', 0.000::numeric, 0::bigint)$$,
  'method code; the rejected line is delivered with 0 and gets no credit (credit only when qty > 0)');

select * from finish();
rollback;

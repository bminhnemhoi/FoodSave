-- consume_handover_code (DATA-MODEL §2.3 "Hiệu lực token", §6.6 + "Ghi chú đếm sai mã", §8.5;
-- SECURITY-PRIVACY C10, C11): the store types the carrier's 6-digit code. A wrong code does not
-- raise: failed_attempts + 1 and {ok:false, error:code_invalid, attempts_left}; locked at
-- handover_max_failed_attempts (5) until re-issued. Non-members get PT404 and never count.
begin;
\ir ../_helpers.psql

select plan(39);

select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid])::text);
select tests.set_var('l1', tests.full_lines(tests.stop_of(tests.var('a1')::uuid))::text);
select tests.issue('charity_owner', tests.stop_of(tests.var('a1')::uuid));   -- h_token / h_code / h_id

-- a code that is certainly not the current code of handover key p_key
create function tests.wrong_code(p_key text default 'h') returns text language sql stable as $$
  select lpad(((tests.var(p_key || '_code')::int + 1) % 1000000)::text, 6, '0');
$$;
-- consume_handover_code on handover h with its full lines
create function tests.code(p_code text, p_op uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.consume_handover_code(tests.var('h_id')::uuid, p_code, tests.var('l1')::jsonb, p_op);
$$;
grant execute on function tests.wrong_code(text), tests.code(text, uuid) to anon, authenticated;

-- ---- who (PT404 for the code path: a non-member cannot probe or lock a handover) ----
select tests.as_anon();
select throws_ok($$select public.consume_handover_code(tests.var('h_id')::uuid, '000000', '[]', gen_random_uuid())$$,
  '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok($$select tests.code(tests.wrong_code())$$, 'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('other_owner');
select throws_ok($$select tests.code(tests.var('h_code'))$$, 'PT404', 'not_found', 'another store, even with the right code => not_found');
select tests.authenticate_as('charity_owner');
select throws_ok($$select tests.code(tests.var('h_code'))$$, 'PT404', 'not_found', 'the carrier cannot type its own code');
select tests.clear_auth();
select is((select failed_attempts from public.handovers where id = tests.var('h_id')::uuid), 0::smallint,
  'non-members never count an attempt (they cannot lock the store out)');

-- ---- input ----
select tests.authenticate_as('store_staff');
select throws_ok($$select tests.code(null)$$, 'PT422', 'validation_failed', 'NULL code => validation_failed');
select throws_ok($$select tests.code('12345')$$, 'PT422', 'validation_failed', '5 digits => validation_failed');
select is((tests.error_of($$select tests.code('12a456')$$) ->> 'detail')::jsonb, '{"p_code":"6 digits"}'::jsonb,
  'non-digits => validation_failed {p_code: 6 digits}');
select throws_ok($$select public.consume_handover_code(null, tests.var('h_code'), tests.var('l1')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'NULL handover id => not_found');
select throws_ok($$select public.consume_handover_code(gen_random_uuid(), tests.var('h_code'), tests.var('l1')::jsonb, gen_random_uuid())$$,
  'PT404', 'not_found', 'unknown handover id => not_found');
select is((tests.error_of($$select tests.code(tests.var('h_code'), null)$$) ->> 'detail')::jsonb, '{"p_client_op_id":"required"}'::jsonb,
  'client_op_id required');
select is((tests.error_of($$select public.consume_handover_code(tests.var('h_id')::uuid, tests.var('h_code'), null, gen_random_uuid())$$)
           ->> 'detail')::jsonb, '{"p_lines":"array_required"}'::jsonb, 'right code, p_lines NULL => array_required');
select is((tests.error_of(format($$select public.consume_handover_code(tests.var('h_id')::uuid, tests.var('h_code'), %L, gen_random_uuid())$$,
                                 jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a1'), 'qty', 6)))) ->> 'detail')::jsonb ->> 'p_lines',
  'qty_out_of_range', 'right code, qty above the reserved quantity => refused');
select is((tests.error_of(format($$select public.consume_handover_code(tests.var('h_id')::uuid, tests.wrong_code(), %L, gen_random_uuid())$$,
                                 jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a1'))))) ->> 'detail')::jsonb ->> 'p_lines',
  'qty_required', 'line without qty refused (lines are checked before the code: no attempt counted)');
select tests.clear_auth();
select results_eq($$select consumed_at, failed_attempts from public.handovers where id = tests.var('h_id')::uuid$$,
  $$values (null::timestamptz, 0::smallint)$$, 'refused calls: not consumed, no attempt counted');

-- ---- wrong code: no raise, counted, audited without the code ----
select tests.authenticate_as('store_staff');
create table tests.w1 as select tests.code(tests.wrong_code(), 'f9000000-0000-4000-8000-000000000001') as r;
select tests.clear_auth();
select is((select r from tests.w1), '{"ok": false, "error": "code_invalid", "attempts_left": 4}'::jsonb,
  'wrong code => {ok:false, code_invalid, attempts_left 4}');
select results_eq($$select consumed_at, failed_attempts from public.handovers where id = tests.var('h_id')::uuid$$,
  $$values (null::timestamptz, 1::smallint)$$, 'failed_attempts + 1 is kept (the call did not raise)');
select results_eq($$select after from public.audit_logs where entity_id = tests.var('h_id')::uuid and action = 'handover.code_fail'$$,
  $$values ('{"failed_attempts": 1}'::jsonb)$$, 'audited handover.code_fail with the counter only');
select ok(not exists (select 1 from public.audit_logs a
                      where a.entity_id = tests.var('h_id')::uuid
                        and jsonb_path_exists(coalesce(a.before, '{}') || coalesce(a.after, '{}'), 'strict $.** ? (@ == $c || @ == $w)',
                                              jsonb_build_object('c', tests.var('h_code'), 'w', tests.wrong_code()))),
  'neither the real nor the typed code reaches audit_logs');
select tests.authenticate_as('store_staff');
select is(tests.code(tests.wrong_code(), 'f9000000-0000-4000-8000-000000000001'), (select r from tests.w1),
  'replay of the same wrong attempt returns the stored result');
select tests.clear_auth();
select is((select failed_attempts from public.handovers where id = tests.var('h_id')::uuid), 1::smallint, '... and is not counted twice');
select tests.authenticate_as('store_staff');
select throws_ok($$select tests.code(tests.var('h_code'), 'f9000000-0000-4000-8000-000000000001')$$,
  'PT409', 'idempotency_conflict', 'another code needs a new client_op_id');

-- ---- lock at 5 ----
select is((select array_agg((tests.code(tests.wrong_code()) ->> 'attempts_left')::int order by g) from generate_series(1, 4) g),
  array[3, 2, 1, 0], '4 more wrong codes: attempts_left 3, 2, 1, 0');
select tests.clear_auth();
select is((select failed_attempts from public.handovers where id = tests.var('h_id')::uuid), 5::smallint,
  'failed_attempts = handover_max_failed_attempts (5)');
select tests.authenticate_as('store_staff');
select throws_ok($$select tests.code(tests.var('h_code'))$$, 'PT422', 'token_locked', 'locked: even the right code is refused');
select throws_ok($$select tests.code(tests.wrong_code())$$, 'PT422', 'token_locked', 'locked: a further wrong code raises');
select tests.clear_auth();
select is((select failed_attempts from public.handovers where id = tests.var('h_id')::uuid), 5::smallint, 'counter stays at 5 while locked');
select tests.issue('charity_owner', tests.stop_of(tests.var('a1')::uuid), 'h');   -- re-issue: new h_token / h_code, same h_id
select is((select failed_attempts from public.handovers where id = tests.var('h_id')::uuid), 0::smallint,
  're-issue unlocks (failed_attempts reset)');

-- ---- right code ----
select tests.authenticate_as('store_staff');
create table tests.ok1 as select tests.code(tests.var('h_code'), 'f9000000-0000-4000-8000-000000000002') as r;
select tests.clear_auth();
select is((select (r ->> 'ok')::boolean from tests.ok1), true, 'right code => ok');
select results_eq($$select consumed_at is not null, scanned_by, method::text, client_op_id from public.handovers where id = tests.var('h_id')::uuid$$,
  format($$values (true, %L::uuid, 'code', 'f9000000-0000-4000-8000-000000000002'::uuid)$$, tests.id('store_staff')),
  'handover consumed by the store member, method code');
select results_eq(format($$select hl.expected_qty, hl.qty, a.qty_picked, a.picked_at is not null from public.handover_lines hl
                          join public.allocations a on a.id = hl.allocation_id where hl.handover_id = %L$$, tests.var('h_id')),
  $$values (5.000::numeric, 5.000::numeric, 5.000::numeric, true)$$, 'line recorded; 5 picked');
select is((select status::text from public.pickups where id = tests.var('p1')::uuid), 'completed',
  'self trip: the automatic dropoff completes the trip');
select tests.set_var('auto_id', (select id::text from public.handovers where pickup_id = tests.var('p1')::uuid and kind = 'dropoff'));
select tests.authenticate_as('store_staff');
select is(tests.code(tests.var('h_code'), 'f9000000-0000-4000-8000-000000000002'), (select r from tests.ok1),
  'replay returns the stored success');
select throws_ok($$select tests.code(tests.var('h_code'))$$, 'PT409', 'token_consumed', 'the code is single-use');
select is(tests.error_of($$select public.consume_handover_code(tests.var('auto_id')::uuid, '000000', '[]', gen_random_uuid())$$),
  '{"sqlstate":"PT404","message":"not_found","detail":null,"hint":null}'::jsonb,
  'a dropoff handover id is not even revealed to the store (access checked before kind, §8.0)');
select tests.clear_auth();

-- ---- TTL and pickup window ----
select tests.make_offer('o2', 'site_a', 'bread', 20);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 2)::text);
select tests.confirm('store_staff', tests.var('a2')::uuid);
select tests.pickup('charity_owner', array[tests.var('a2')::uuid]);
select tests.set_var('l2', tests.full_lines(tests.stop_of(tests.var('a2')::uuid))::text);
select tests.issue('charity_owner', tests.stop_of(tests.var('a2')::uuid), 'e');
select tests.set_clock(now() + interval '16 minutes');
select tests.authenticate_as('store_staff');
select throws_ok($$select public.consume_handover_code(tests.var('e_id')::uuid, tests.var('e_code'), tests.var('l2')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_expired', 'right code 16 min after issue (TTL 15) => token_expired');
select throws_ok($$select public.consume_handover_code(tests.var('e_id')::uuid, tests.wrong_code('e'), tests.var('l2')::jsonb, gen_random_uuid())$$,
  'PT422', 'token_expired', 'an expired code raises before the code is compared');
select tests.clear_auth();
select tests.clear_clock();
update public.offers set pickup_window = tstzrange(now() + interval '50 minutes', now() + interval '5 hours') where id = tests.id('o2');
select tests.authenticate_as('store_staff');
select is(tests.error_of($$select public.consume_handover_code(tests.var('e_id')::uuid, tests.var('e_code'), tests.var('l2')::jsonb, gen_random_uuid())$$),
  '{"sqlstate":"PT422","message":"token_expired","detail":"outside_pickup_window","hint":null}'::jsonb,
  'right code within TTL but outside the pickup window ± 30 min => refused');
select tests.clear_auth();
select is((select failed_attempts from public.handovers where id = tests.var('e_id')::uuid), 0::smallint,
  'expired / out-of-window attempts are never counted');

select * from finish();
rollback;

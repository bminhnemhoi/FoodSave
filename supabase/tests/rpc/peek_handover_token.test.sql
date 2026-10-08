-- peek_handover_token (DATA-MODEL §2.3 "Hiệu lực token", §6.6, §8.5 addition; SECURITY-PRIVACY C10;
-- PRD US-STO-17 AC1): read-only preview of a scanned QR for the counterpart (store at a pickup stop,
-- charity coordinator at the dropoff). Never consumes, never counts attempts, never audits.
begin;
\ir ../_helpers.psql

select plan(26);

-- self trip of charity_b: a1 = 5 loaves at site_a; the carrier proposes 4 (capacity)
select tests.make_offer('o1', 'site_a', 'bread', 20, now() - interval '10 minutes', now() + interval '4 hours');
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid])::text);
select tests.set_var('s1', tests.stop_of(tests.var('a1')::uuid)::text);
select tests.authenticate_as('charity_owner');
create table tests.issued as
  select * from public.issue_handover_token(tests.var('s1')::uuid,
    jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a1'), 'qty', 4, 'reason', 'capacity')), gen_random_uuid());
select tests.clear_auth();
select tests.set_var('h_token', (select token from tests.issued));
select tests.set_var('h_id', (select handover_id::text from tests.issued));
-- a proposal line without qty is refused at issue (jsonb_typeof(null) <> 'number' used to let it through
-- and store qty null in proposed_lines, previewed as proposed_qty null)
select tests.authenticate_as('charity_owner');
select is((tests.error_of(format($$select * from public.issue_handover_token(%L, %L, gen_random_uuid())$$, tests.var('s1'),
            jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a1'), 'reason', 'capacity')))) ->> 'detail')::jsonb ->> 'p_lines',
  'qty_required', 'a proposal line without qty is refused at issue');
select tests.clear_auth();
-- snapshot: any UPDATE of the row would give it a new ctid
create table tests.h_before as
  select ctid as row_ctid, token_hash, failed_attempts, consumed_at, scanned_by, method from public.handovers where id = tests.var('h_id')::uuid;
create table tests.audit_before as select count(*) as n from public.audit_logs where entity_id = tests.var('h_id')::uuid;

-- ---- who / input ----
select tests.as_anon();
select throws_ok($$select public.peek_handover_token(tests.var('h_token'))$$, '42501', null, 'anon: no EXECUTE');
select tests.clear_auth();
select throws_ok($$select public.peek_handover_token(tests.var('h_token'))$$, 'PT401', 'not_authenticated',
  'no JWT subject => not_authenticated');
select tests.authenticate_as('store_staff');
select throws_ok($$select public.peek_handover_token(null)$$, 'PT422', 'token_invalid', 'NULL token => token_invalid');
select throws_ok($$select public.peek_handover_token('not-a-token')$$, 'PT422', 'token_invalid', 'malformed token => token_invalid');
select throws_ok(format($$select public.peek_handover_token(%L)$$, repeat('A', 43)), 'PT422', 'token_invalid',
  'well-formed but unknown token => token_invalid');
select tests.authenticate_as('outsider');
select is(tests.error_of($$select public.peek_handover_token(tests.var('h_token'))$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_store","hint":null}'::jsonb, 'unrelated user => wrong_store');
select tests.authenticate_as('other_owner');
select is(tests.error_of($$select public.peek_handover_token(tests.var('h_token'))$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_store","hint":null}'::jsonb, 'another store => wrong_store');
select tests.authenticate_as('charity_owner');
select is(tests.error_of($$select public.peek_handover_token(tests.var('h_token'))$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_store","hint":null}'::jsonb,
  'the carrier does not preview its own pickup QR (the store does)');

-- ---- the store previews ----
select tests.authenticate_as('store_manager');
select lives_ok($$select public.peek_handover_token(tests.var('h_token'))$$, 'store manager previews');
select tests.authenticate_as('store_staff');
create table tests.pk as select public.peek_handover_token(tests.var('h_token')) as r;
select tests.clear_auth();
select results_eq(
  $$select r ->> 'handover_id', r ->> 'kind', r ->> 'stop_id', r ->> 'pickup_id', r ->> 'site_id', r ->> 'charity_org_id',
           r ->> 'charity_name' from tests.pk$$,
  format($$values (%L, 'pickup', %L, %L, %L, %L, 'Org charity_b')$$,
         tests.var('h_id'), tests.var('s1'), tests.var('p1'), tests.id('site_a'), tests.id('charity_b')),
  'store sees which handover, stop, trip and charity the QR belongs to');
select results_eq(
  $$select (r ->> 'expired')::boolean, (r ->> 'locked')::boolean, (r ->> 'in_window')::boolean, r -> 'consumed_at',
           (r ->> 'expires_at')::timestamptz from tests.pk$$,
  $$select false, false, true, 'null'::jsonb, token_expires_at from public.handovers where id = tests.var('h_id')::uuid$$,
  'fresh token: not expired, not locked, inside the pickup window, not consumed');
select results_eq(
  $$select l ->> 'allocation_id', (l ->> 'expected_qty')::numeric, (l ->> 'proposed_qty')::numeric, l ->> 'unit',
           (l ->> 'unit_weight_kg')::numeric
    from tests.pk, jsonb_array_elements(r -> 'lines') l$$,
  format($$values (%L, 5::numeric, 4::numeric, 'loaf', 0.12::numeric)$$, tests.var('a1')),
  'lines: expected (reserved − released) next to the carrier proposal');
select ok((select not (r ?| array['token', 'code', 'token_hash', 'code_hash']) and position(tests.var('h_token') in r::text) = 0
           from tests.pk),
  'the preview never echoes the token, the code or their hashes');

-- ---- no side effect ----
select results_eq(
  $$select ctid, token_hash, failed_attempts, consumed_at, scanned_by, method from public.handovers where id = tests.var('h_id')::uuid$$,
  $$select * from tests.h_before$$,
  'after 9 previews (allowed and refused) the handover row is untouched: not consumed, no attempt counted');
select is((select count(*) from public.audit_logs where entity_id = tests.var('h_id')::uuid), (select n from tests.audit_before),
  'previews write no audit row');
select tests.authenticate_as('store_staff');
select lives_ok($$select public.consume_handover_token(tests.var('h_token'), tests.full_lines(tests.var('s1')::uuid), gen_random_uuid())$$,
  'the previewed token is still consumable');
select ok((public.peek_handover_token(tests.var('h_token')) ->> 'consumed_at') is not null,
  'a consumed token still previews, with consumed_at set');
select tests.clear_auth();

-- ---- validity flags (no raise) ----
select tests.make_offer('o2', 'site_a', 'bread', 20, now() - interval '10 minutes', now() + interval '4 hours');
select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 2)::text);
select tests.confirm('store_staff', tests.var('a2')::uuid);
select tests.pickup('charity_owner', array[tests.var('a2')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('a2')::uuid), 'e');
select tests.set_clock(now() + interval '16 minutes');
select tests.authenticate_as('store_staff');
select is((public.peek_handover_token(tests.var('e_token')) ->> 'expired')::boolean, true,
  '16 min after issue (TTL 15): expired = true');
select tests.clear_auth();
select tests.clear_clock();
update public.handovers set failed_attempts = 5 where id = tests.var('e_id')::uuid;
select tests.authenticate_as('store_staff');
select is((public.peek_handover_token(tests.var('e_token')) ->> 'locked')::boolean, true, '5 wrong codes: locked = true');
select tests.clear_auth();
update public.offers set pickup_window = tstzrange(now() + interval '50 minutes', now() + interval '4 hours') where id = tests.id('o2');
select tests.authenticate_as('store_staff');
select is((public.peek_handover_token(tests.var('e_token')) ->> 'in_window')::boolean, false,
  'more than 30 min before the pickup window: in_window = false');
select tests.clear_auth();
update public.offers set pickup_window = tstzrange(now() - interval '10 minutes', now() + interval '4 hours') where id = tests.id('o2');
select tests.issue('charity_owner', tests.stop_of(tests.var('a2')::uuid), 'e2');
select tests.authenticate_as('store_staff');
select throws_ok($$select public.peek_handover_token(tests.var('e_token'))$$, 'PT422', 'token_invalid',
  're-issued: the previous token no longer previews');
select is((public.peek_handover_token(tests.var('e2_token')) ->> 'locked')::boolean, false, 're-issue clears the lock');
select tests.clear_auth();

-- ---- dropoff token (volunteer trip): the receiving charity previews ----
select tests.make_offer('o3', 'site_a', 'bread', 20);
select tests.set_var('a3', tests.request('charity_owner', tests.id('o3'), 3)::text);
select tests.confirm('store_staff', tests.var('a3')::uuid);
select tests.set_var('p3', tests.pickup('charity_owner', array[tests.var('a3')::uuid], 'site_b', 'volunteer', 'charity_volunteer')::text);
select tests.issue('charity_volunteer', tests.stop_of(tests.var('a3')::uuid), 'v');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('v_token'),
  jsonb_build_array(jsonb_build_object('allocation_id', tests.var('a3'), 'qty', 2, 'reason', 'store_short')), gen_random_uuid());
select tests.clear_auth();
select tests.issue('charity_volunteer', tests.dropoff_stop(tests.var('p3')::uuid), 'd');
select tests.authenticate_as('charity_owner');
select results_eq(
  $$select r ->> 'kind', (r ->> 'in_window')::boolean, l ->> 'allocation_id', (l ->> 'expected_qty')::numeric
    from (select public.peek_handover_token(tests.var('d_token')) as r) x, jsonb_array_elements(r -> 'lines') l$$,
  format($$values ('dropoff', true, %L, 2::numeric)$$, tests.var('a3')),
  'charity coordinator previews the dropoff: expected = qty_picked (2 of 3 reserved)');
select tests.authenticate_as('store_staff');
select is(tests.error_of($$select public.peek_handover_token(tests.var('d_token'))$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_org","hint":null}'::jsonb, 'the store cannot preview a dropoff QR');
select tests.authenticate_as('charity_volunteer');
select is(tests.error_of($$select public.peek_handover_token(tests.var('d_token'))$$),
  '{"sqlstate":"PT403","message":"not_authorized","detail":"wrong_org","hint":null}'::jsonb,
  'the carrier (volunteer) cannot preview its own dropoff QR');
select tests.clear_auth();

select * from finish();
rollback;

-- issue_handover_token (DATA-MODEL §2.3 "Hiệu lực token", §6.6, §8.5; SECURITY-PRIVACY C10).
begin;
\ir ../_helpers.psql

select plan(25);

select tests.make_offer('o1', 'site_a', 'bread', 20, now() - interval '10 minutes', now() + interval '4 hours');
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid])::text);
select tests.set_var('s1', tests.stop_of(tests.var('a1')::uuid)::text);

-- ---- who: only the carrier ----
select tests.as_anon();
select throws_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.var('s1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.var('s1')),
  'PT404', 'not_found', 'the store never issues the token (it scans it)');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.var('s1')),
  'PT404', 'not_found', 'volunteer not on this (self) trip');
select tests.authenticate_as('outsider');
select throws_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.var('s1')),
  'PT404', 'not_found', 'unrelated user');

-- ---- issue ----
select tests.authenticate_as('charity_owner');
create table tests.issued as select * from public.issue_handover_token(tests.var('s1')::uuid, '[]', 'f7000000-0000-4000-8000-000000000001');
select tests.clear_auth();
select ok((select token ~ '^[A-Za-z0-9_-]{43}$' from tests.issued), 'token: 32 random bytes, base64url (43 chars)');
select ok((select code ~ '^[0-9]{6}$' from tests.issued), '6-digit fallback code');
select ok((select abs(extract(epoch from expires_at - (now() + interval '15 minutes'))) < 2 from tests.issued), 'TTL 15 minutes');
select results_eq(
  $$select h.token_hash = sha256(convert_to(i.token, 'UTF8')), h.code_hash = sha256(convert_to(h.id::text || ':' || i.code, 'UTF8')),
           h.issued_by, h.kind::text, h.consumed_at
    from public.handovers h join tests.issued i on i.handover_id = h.id$$,
  format($$values (true, true, %L::uuid, 'pickup', null::timestamptz)$$, tests.id('charity_owner')),
  'only sha256 hashes are stored (token and code never stored)');
select ok(not exists (select 1 from public.audit_logs a, tests.issued i
                      where a.entity_id = i.handover_id and (a.after::text like '%' || i.token || '%' or a.after::text like '%' || i.code || '%')),
  'secrets never reach audit_logs');
select ok(not exists (select 1 from public.rpc_idempotency r, tests.issued i
                      where r.client_op_id = 'f7000000-0000-4000-8000-000000000001' and r.response::text like '%' || i.token || '%'),
  'secrets never reach rpc_idempotency');

-- replay: same handover, no secret
select tests.authenticate_as('charity_owner');
select results_eq($$select handover_id, token, code from public.issue_handover_token(tests.var('s1')::uuid, '[]', 'f7000000-0000-4000-8000-000000000001')$$,
  $$select handover_id, null::text, null::text from tests.issued$$, 'replay returns the handover without the secrets (returned once)');

-- re-issue: new token, old one invalid, attempts reset
select tests.clear_auth();
update public.handovers set failed_attempts = 3 where id = (select handover_id from tests.issued);
select tests.authenticate_as('charity_owner');
create table tests.reissued as select * from public.issue_handover_token(tests.var('s1')::uuid, '[]', gen_random_uuid());
select tests.clear_auth();
select is((select handover_id from tests.reissued), (select handover_id from tests.issued), 're-issue keeps one handover per stop');
select results_eq($$select h.token_hash = sha256(convert_to(r.token, 'UTF8')), h.failed_attempts from public.handovers h join tests.reissued r on r.handover_id = h.id$$,
  $$values (true, 0::smallint)$$, 're-issue: new hash, failed_attempts reset');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.consume_handover_token(%L, tests.full_lines(%L), gen_random_uuid())$$,
                        (select token from tests.issued), tests.var('s1')),
  'PT422', 'token_invalid', 'the previous token no longer works');

-- proposed lines validated and stored
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select * from public.issue_handover_token(%L, '[{"allocation_id":"%s","qty":6}]', gen_random_uuid())$$,
                        tests.var('s1'), tests.var('a1')),
  'PT422', 'validation_failed', 'proposed qty above the reserved quantity refused');
select lives_ok(format($$select * from public.issue_handover_token(%L, '[{"allocation_id":"%s","qty":4,"reason":"capacity"}]', gen_random_uuid())$$,
                       tests.var('s1'), tests.var('a1')), 'carrier proposes 4 (capacity)');
select tests.clear_auth();
select is((select (proposed_lines -> 0 ->> 'qty')::numeric from public.handovers where stop_id = tests.var('s1')::uuid), 4::numeric,
  'proposed_lines stored for the store to review');

-- ---- pickup window ± grace (30 min) ----
select tests.make_offer('o_later', 'site_a', 'bread', 10, now() + interval '1 hour', now() + interval '4 hours');
select tests.set_var('b1', tests.request('charity_owner', tests.id('o_later'), 2)::text);
select tests.confirm('store_staff', tests.var('b1')::uuid);
select tests.pickup('charity_owner', array[tests.var('b1')::uuid]);
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.stop_of(tests.var('b1')::uuid))),
  '{"sqlstate":"PT409","message":"invalid_state","detail":"outside_pickup_window","hint":null}'::jsonb,
  'more than 30 min before the window opens => no token');
select tests.clear_auth();
select tests.set_clock(now() + interval '31 minutes');
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.stop_of(tests.var('b1')::uuid)),
  '29 min before the window opens (inside the grace) => token issued');
select tests.clear_auth();
select tests.clear_clock();

-- ---- dropoff ----
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.dropoff_stop(tests.var('p1')::uuid))),
  '{"sqlstate":"PT409","message":"invalid_state","detail":"auto_dropoff","hint":null}'::jsonb,
  'self trip: the dropoff is automatic (no dropoff token)');
select tests.clear_auth();
select tests.make_offer('o_v', 'site_a', 'bread', 10);
select tests.set_var('v1', tests.request('charity_owner', tests.id('o_v'), 2)::text);
select tests.confirm('store_staff', tests.var('v1')::uuid);
select tests.set_var('pv', tests.pickup('charity_owner', array[tests.var('v1')::uuid], 'site_b', 'volunteer', 'charity_volunteer')::text);
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.stop_of(tests.var('v1')::uuid)),
  'PT403', 'not_authorized', 'volunteer trip: the coordinator is not the carrier');
select tests.authenticate_as('charity_volunteer');
select lives_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.stop_of(tests.var('v1')::uuid)),
  'assigned volunteer issues the pickup token');
select is(tests.error_of(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.dropoff_stop(tests.var('pv')::uuid))),
  '{"sqlstate":"PT409","message":"invalid_state","detail":"pickups_pending","hint":null}'::jsonb,
  'dropoff token only after every pickup stop is done/skipped');

-- ---- rate limit 10 / 10 min / stop ----
select tests.clear_auth();
insert into public.rate_limits (key, window_start, count)
values ('issue_handover:stop:' || tests.var('s1'), date_bin('10 minutes', now(), '2000-01-01 00:00+07'), 10)
on conflict (key, window_start) do update set count = 10;
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.var('s1')),
  'PT429', 'rate_limited', 'rate limit 10 issues / 10 min / stop');

-- ---- consumed handover cannot be re-issued ----
select tests.clear_auth();
delete from public.rate_limits where key = 'issue_handover:stop:' || tests.var('s1');
select tests.issue('charity_owner', tests.var('s1')::uuid, 'k');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('k_token'), tests.full_lines(tests.var('s1')::uuid), gen_random_uuid());
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select * from public.issue_handover_token(%L, '[]', gen_random_uuid())$$, tests.var('s1')),
  'PT409', 'invalid_state', 'a done stop gets no new token');
select tests.clear_auth();

select * from finish();
rollback;

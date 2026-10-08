-- Concurrency of reservations (DATA-MODEL §19.2 "accept race", PRD US-CHA-08 AC2, ROADMAP P2-09).
-- pgTAP runs in ONE session (fixture rows are uncommitted, so a second real session cannot see
-- them); true parallelism is covered by the Vitest integration test (TESTING §2.3). Here we assert
-- the lock semantics the guarantee relies on — request_offer and every other writer lock the offer
-- row FOR UPDATE before reading qty_available — plus the outcome of interleaved requests and the
-- CHECK backstop: never more than `quantity` committed.
begin;
\ir ../_helpers.psql

select plan(11);

select ok((select prosrc ~* 'from public\.offers o where o\.id = p_offer_id for update'
           from pg_proc where oid = 'public.request_offer(uuid, numeric, uuid, uuid)'::regprocedure),
  'request_offer locks the offer row (FOR UPDATE) before checking availability');
select ok((select prosrc ~* 'perform 1 from public\.offers o where o\.id = v_offer for update'
           from pg_proc where oid = 'private.lock_allocation(uuid)'::regprocedure),
  'allocation transitions lock need → offer → allocation in the global order');
select ok((select prosrc ~* 'order by o\.id for update'
           from pg_proc where oid = 'private.consume_pickup(uuid, text, jsonb, public.handover_method, uuid)'::regprocedure),
  'multi-lot writers lock offers ORDER BY id (deadlock-free)');
select ok((select prosrc ~* 'from public\.organizations o where o\.id = p_org for update\s*;\s*insert into public\.trust_events'
           from pg_proc where oid = 'private.apply_trust(uuid, numeric, text, text, uuid)'::regprocedure),
  'apply_trust locks the org row before appending (no lost update of trust_score = 50 + Σ delta)');

-- two charities race for the last units of a 10-unit lot
select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_site('site_z', 'charity_z', 'approximate', 10.77, 106.69);
select tests.make_offer('o10', 'site_a', 'bread', 10);

select tests.request('charity_owner', tests.id('o10'), 7);
select tests.authenticate_as('charity_owner');
select tests.set_var('r_b', coalesce(tests.error_of(format($$select public.request_offer(%L, 3, %L, gen_random_uuid())$$,
                                                          tests.id('o10'), tests.id('site_b'))) ->> 'message', 'ok'));
select tests.authenticate_as('ch2_owner');
select tests.set_var('r_z', coalesce(tests.error_of(format($$select public.request_offer(%L, 3, %L, gen_random_uuid())$$,
                                                          tests.id('o10'), tests.id('site_z'))) ->> 'message', 'ok'));
select tests.clear_auth();
select is(tests.var('r_b'), 'ok', 'first request for the last 3 units wins');
select is(tests.var('r_z'), 'insufficient_quantity', 'second request for the same last units gets insufficient_quantity');

-- 15 alternating requests of 1 unit on a 10-unit lot: exactly 10 succeed
select tests.make_offer('o_burst', 'site_a', 'bread', 10);
do $$
declare
  i int;
  v_user text;
  v_site text;
  v_err jsonb;
begin
  for i in 1..15 loop
    v_user := case when i % 2 = 0 then 'charity_owner' else 'ch2_owner' end;
    v_site := case when i % 2 = 0 then 'site_b' else 'site_z' end;
    perform tests.authenticate_as(v_user);
    v_err := tests.error_of(format('select public.request_offer(%L, 1, %L, gen_random_uuid())', tests.id('o_burst'), tests.id(v_site)));
    perform tests.clear_auth();
    perform tests.set_var('burst_' || i, coalesce(v_err ->> 'message', 'ok'));
  end loop;
end;
$$;
select is((select count(*)::int from tests.vars where k like 'burst_%' and v = 'ok'), 10, 'exactly 10 of 15 one-unit requests succeed');
select is((select count(*)::int from tests.vars where k like 'burst_%' and v = 'insufficient_quantity'), 5,
  'the other 5 get insufficient_quantity');
select results_eq(format($$select qty_committed, quantity, status::text from public.offers where id = %L$$, tests.id('o_burst')),
  $$values (10.000::numeric, 10.000::numeric, 'fully_allocated')$$, 'committed = quantity, fully_allocated');
select is((select sum(qty_reserved - qty_released) from public.allocations where offer_id = tests.id('o_burst')), 10.000::numeric,
  'Σ(qty_reserved − qty_released) = qty_committed (§4.4)');
select throws_ok(format($$update public.offers set qty_committed = quantity + 1 where id = %L$$, tests.id('o_burst')),
  '23514', null, 'CHECK backstop: qty_committed can never exceed quantity');

select * from finish();
rollback;

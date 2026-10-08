-- Concurrency of multi-lot reservations (DATA-MODEL §6 rule 2, §8.4 steps 2/4/5, §19.2 "accept race";
-- PRD US-CHA-11 AC1; ROADMAP P3-04). Same approach as request_offer_concurrency: pgTAP runs in one
-- session (uncommitted fixtures), so we assert the lock semantics the guarantee relies on — needs
-- (incl. the ones lazy expiry touches) then lots ORDER BY id FOR UPDATE before any quantity math —
-- plus the outcome of interleaved reservations, atomicity under contention and the CHECK backstop.
begin;
\ir ../_helpers.psql

select plan(12);

select ok((select prosrc ~* 'from public\.needs x\s+where x\.id = p_need_id\s+or x\.id in \(select al\.need_id from public\.allocations al\s+where al\.offer_id = any \(v_hint\) and al\.status = ''requested'' and al\.reserved_until <= v_now'
           from pg_proc where oid = 'public.reserve_bundle(uuid, jsonb, uuid, jsonb)'::regprocedure),
  'step 2: the need and every need touched by lazy expiry are locked in one statement');
select ok((select prosrc ~* 'order by x\.id\s+for update'
           from pg_proc where oid = 'public.reserve_bundle(uuid, jsonb, uuid, jsonb)'::regprocedure),
  'needs locked ORDER BY id');
select ok((select prosrc ~* 'from public\.offers o where o\.id = any \(v_ids\) order by o\.id for update'
           from pg_proc where oid = 'public.reserve_bundle(uuid, jsonb, uuid, jsonb)'::regprocedure),
  'step 4: lots locked ORDER BY id (deadlock-free with request_offer / cancel_offer / consume)');
select ok((select position('for update' in prosrc) < position('perform private.expire_requested' in prosrc)
                  and position('perform private.expire_requested' in prosrc) < position('v_qty > v.qty_available' in prosrc)
           from pg_proc where oid = 'public.reserve_bundle(uuid, jsonb, uuid, jsonb)'::regprocedure),
  'locks, then lazy expiry, then quantity checks (no check-then-act race)');

select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_site('site_z', 'charity_z', 'approximate', 10.77, 106.69);
select tests.make_need('nb', 'site_b', '{bread}', 'loaf', 40);
select tests.make_need('nz', 'site_z', '{bread}', 'loaf', 40);

-- a bundle and a single request race for the last units of a 10-unit lot
select tests.make_offer('o10', 'site_a', 'bread', 10);
select tests.reserve('charity_owner', tests.id('nb'), '[["o10", 7]]');
select tests.set_var('q_z', tests.request('ch2_owner', tests.id('o10'), 3, 'site_z')::text);
select tests.authenticate_as('charity_owner');
select is(coalesce(tests.error_of(format($$select public.reserve_bundle(%L, %L, gen_random_uuid())$$, tests.id('nb'),
                                         jsonb_build_array(jsonb_build_object('offer_id', tests.id('o10'), 'qty', 3)))) ->> 'message', 'ok'),
  'insufficient_quantity', 'the bundle asking for units already granted gets insufficient_quantity');
select tests.clear_auth();

-- 15 alternating one-unit bundles from two charities on a 10-unit lot: exactly 10 succeed
select tests.make_offer('o_burst', 'site_a', 'bread', 10);
do $$
declare
  i int;
  v_user text;
  v_need text;
  v_err jsonb;
begin
  for i in 1..15 loop
    v_user := case when i % 2 = 0 then 'charity_owner' else 'ch2_owner' end;
    v_need := case when i % 2 = 0 then 'nb' else 'nz' end;
    perform tests.authenticate_as(v_user);
    v_err := tests.error_of(format('select public.reserve_bundle(%L, %L, gen_random_uuid())', tests.id(v_need),
                                   jsonb_build_array(jsonb_build_object('offer_id', tests.id('o_burst'), 'qty', 1))));
    perform tests.clear_auth();
    perform tests.set_var('burst_' || i, coalesce(v_err ->> 'message', 'ok'));
  end loop;
end;
$$;
select is((select count(*)::int from tests.vars where k like 'burst_%' and v = 'ok'), 10, 'exactly 10 of 15 one-unit bundles succeed');
select is((select count(*)::int from tests.vars where k like 'burst_%' and v = 'insufficient_quantity'), 5, 'the other 5 get insufficient_quantity');
select results_eq(format($$select qty_committed, status::text from public.offers where id = %L$$, tests.id('o_burst')),
  $$values (10.000::numeric, 'fully_allocated')$$, 'committed = quantity, fully_allocated');
select is((select sum(qty_reserved - qty_released) from public.allocations where offer_id = tests.id('o_burst')), 10.000::numeric,
  'Σ(qty_reserved − qty_released) = qty_committed (§4.4)');

-- atomic under contention: the second lot was taken meanwhile => the first lot is not touched
select tests.make_offer('oP', 'site_a', 'bread', 5);
select tests.make_offer('oQ', 'site_x', 'bread', 5);
select tests.request('ch2_owner', tests.id('oQ'), 5, 'site_z');
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format($$select public.reserve_bundle(%L, %L, gen_random_uuid())$$, tests.id('nb'),
                                jsonb_build_array(jsonb_build_object('offer_id', tests.id('oP'), 'qty', 3),
                                                  jsonb_build_object('offer_id', tests.id('oQ'), 'qty', 1)))) ->> 'message',
  'insufficient_quantity', 'one lot gone => whole bundle refused');
select tests.clear_auth();
select results_eq(format($$select qty_committed from public.offers where id = %L$$, tests.id('oP')),
  $$values (0.000::numeric)$$, 'nothing committed on the other lot (all-or-nothing)');
select throws_ok(format($$update public.offers set qty_committed = quantity + 1 where id = %L$$, tests.id('o_burst')),
  '23514', null, 'CHECK backstop: qty_committed can never exceed quantity');

select * from finish();
rollback;

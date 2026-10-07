-- rpc_idempotency: no policy, no grant to anon/authenticated (§9.2, §15). idem_claim / idem_store
-- semantics: new claim => null, replay => stored response, other actor/rpc/params => idempotency_conflict.
begin;
\ir ../_helpers.psql

select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.rpc_idempotency'::regclass), 'RLS enabled');
select is_empty($$select polname from pg_policy where polrelid = 'public.rpc_idempotency'::regclass$$,
  'no policy at all');

select tests.as_anon();
select throws_ok('select * from public.rpc_idempotency', '42501', null, 'anon: no SELECT');
select tests.authenticate_as('outsider');
select throws_ok('select * from public.rpc_idempotency', '42501', null, 'authenticated: no SELECT');
select throws_ok($$select private.idem_claim(gen_random_uuid(), 'x_rpc', repeat('a', 64))$$,
  '42501', null, 'authenticated cannot call private.idem_claim');
select tests.clear_auth();

-- semantics (as postgres with a simulated caller)
select set_config('request.jwt.claims', jsonb_build_object('sub', tests.id('outsider'))::text, true);
select is(private.idem_claim('11111111-1111-4111-8111-111111111111', 'demo_rpc', private.idem_hash('{"a":1}')),
  null::jsonb, 'first claim => null (run the RPC)');
select lives_ok($$select private.idem_store('11111111-1111-4111-8111-111111111111', '{"id":"x"}')$$, 'store response');
select is(private.idem_claim('11111111-1111-4111-8111-111111111111', 'demo_rpc', private.idem_hash('{"a":1}')),
  '{"id":"x"}'::jsonb, 'replay => stored response');
select is(private.idem_hash('{"b":2,"a":1}'), private.idem_hash('{"a":1,"b":2}'), 'hash ignores key order');
select throws_ok($$select private.idem_claim('11111111-1111-4111-8111-111111111111', 'demo_rpc', private.idem_hash('{"a":2}'))$$,
  'PT409', 'idempotency_conflict', 'same op, different params => idempotency_conflict');
select throws_ok($$select private.idem_claim('11111111-1111-4111-8111-111111111111', 'other_rpc', private.idem_hash('{"a":1}'))$$,
  'PT409', 'idempotency_conflict', 'same op, different rpc => idempotency_conflict');
select set_config('request.jwt.claims', jsonb_build_object('sub', tests.id('store_owner'))::text, true);
select throws_ok($$select private.idem_claim('11111111-1111-4111-8111-111111111111', 'demo_rpc', private.idem_hash('{"a":1}'))$$,
  'PT409', 'idempotency_conflict', 'same op, different actor => idempotency_conflict');
select tests.clear_auth();

select * from finish();
rollback;

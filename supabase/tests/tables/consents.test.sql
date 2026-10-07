-- consents: S own rows + admin aal2; writes RPC only (§9.2, §11).
begin;
\ir ../_helpers.psql

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.consents'::regclass), 'RLS enabled');
select policies_are('public', 'consents', array['consents_select']);

insert into public.consents (user_id, purpose, policy_version, source, text_hash)
values (tests.id('outsider'), 'terms', '2026-10-v1', 'web', repeat('a', 64)),
       (tests.id('store_owner'), 'terms', '2026-10-v1', 'web', repeat('b', 64));

select tests.as_anon();
select throws_ok('select id from public.consents', '42501', null, 'anon: no access');
select tests.authenticate_as('outsider');
select results_eq('select user_id from public.consents', $$values (tests.id('outsider'))$$, 'user sees only own consents');
select throws_ok($$insert into public.consents (user_id, purpose, policy_version, source, text_hash)
                   values (auth.uid(), 'marketing', 'v1', 'web', 'x')$$,
  '42501', null, 'no direct INSERT (grant_consent RPC)');
select throws_ok($$update public.consents set withdrawn_at = now()$$, '42501', null, 'no direct UPDATE (withdraw_consent RPC)');
select tests.authenticate_as('store_staff');
select is_empty('select id from public.consents', 'colleague cannot see another member''s consents');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select id from public.consents', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.consents), 2, 'admin aal2 sees all');
select tests.clear_auth();

select throws_ok($$insert into public.consents (user_id, purpose, policy_version, source, text_hash)
                   values (tests.id('outsider'), 'terms', '2026-11-v2', 'web', 'c')$$,
  '23505', null, 'one active consent per (user, purpose)');

select * from finish();
rollback;

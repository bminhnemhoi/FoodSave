-- push_subscriptions: S/I/U/D own rows; keys are never selectable; https endpoints only
-- (DATA-MODEL §2.6, §9.2). Sending is P5.
begin;
\ir ../_helpers.psql

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass), 'RLS enabled');
select policies_are('public', 'push_subscriptions', array[
  'push_subscriptions_select_own', 'push_subscriptions_insert_own',
  'push_subscriptions_update_own', 'push_subscriptions_delete_own']);

select tests.as_anon();
select throws_ok('select id from public.push_subscriptions', '42501', null, 'anon: no access');

select tests.authenticate_as('charity_volunteer');
select lives_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth, user_agent)
                  values ('https://push.example/abc', 'BKeyKeyKeyKeyKeyKeyKey', 'authauthauth', 'Chrome')$$,
  'user registers a push endpoint');
select throws_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('http://push.example/x', 'BKeyKeyKeyKeyKeyKeyKey', 'authauthauth')$$,
  '23514', null, 'endpoint must be https');
select throws_ok('select p256dh from public.push_subscriptions', '42501', null, 'keys are not selectable');
select is((select count(*)::int from public.push_subscriptions), 1, 'owner sees own subscription');
select throws_ok($$update public.push_subscriptions set disabled_at = now()$$, '42501', null, 'server-managed columns are not updatable');

select tests.authenticate_as('store_owner');
select is_empty('select id from public.push_subscriptions', 'another user sees nothing');
select tests.authenticate_as('charity_volunteer');
select is(tests.affected('delete from public.push_subscriptions'), 1::bigint, 'owner unsubscribes');
select tests.clear_auth();

select * from finish();
rollback;

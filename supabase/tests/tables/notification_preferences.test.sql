-- notification_preferences: S/I/U/D own rows; in-app of mandatory events cannot be turned off
-- (DATA-MODEL §2.6, §9.2).
begin;
\ir ../_helpers.psql

select plan(14);

select ok((select relrowsecurity from pg_class where oid = 'public.notification_preferences'::regclass), 'RLS enabled');
select policies_are('public', 'notification_preferences', array[
  'notification_preferences_select_own', 'notification_preferences_insert_own',
  'notification_preferences_update_own', 'notification_preferences_delete_own']);

select tests.as_anon();
select throws_ok('select user_id from public.notification_preferences', '42501', null, 'anon: no access');

select tests.authenticate_as('charity_owner');
select lives_ok($$insert into public.notification_preferences (event, channel, enabled) values ('offer_published', 'email', true)$$,
  'user opts in to e-mail for new lots (user_id defaults to auth.uid())');
select lives_ok($$insert into public.notification_preferences (event, channel, enabled) values ('offer_published', 'in_app', false)$$,
  'in-app of a non-mandatory event can be turned off');
select throws_ok($$insert into public.notification_preferences (event, channel, enabled) values ('allocation_confirmed', 'in_app', false)$$,
  'PT422', 'validation_failed', 'in-app of a mandatory event (allocation_*) cannot be turned off');
select throws_ok($$insert into public.notification_preferences (event, channel, enabled) values ('kyc_purge', 'email', true)$$,
  'PT422', 'validation_failed', 'internal events have no preference');
select throws_ok(format($$insert into public.notification_preferences (user_id, event, channel, enabled) values (%L, 'need_closed', 'email', false)$$,
                        tests.id('store_owner')),
  '42501', null, 'cannot write a preference for another user (user_id not insertable)');
select is(tests.affected($$update public.notification_preferences set enabled = false where event = 'offer_published' and channel = 'email'$$), 1::bigint,
  'user updates own preference');
select throws_ok($$update public.notification_preferences set enabled = false, event = 'need_closed' where channel = 'email'$$,
  '42501', null, 'only enabled is updatable');

select tests.authenticate_as('store_owner');
select is_empty('select event from public.notification_preferences', 'another user sees none of them');
select is(tests.affected($$delete from public.notification_preferences$$), 0::bigint, 'another user deletes nothing');

select tests.authenticate_as('charity_owner');
select is((select count(*)::int from public.notification_preferences), 2, 'owner sees own rows');
select is(tests.affected($$delete from public.notification_preferences where channel = 'in_app'$$), 1::bigint, 'owner deletes own row');
select tests.clear_auth();

select * from finish();
rollback;

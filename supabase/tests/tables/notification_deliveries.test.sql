-- notification_deliveries: admin aal2 reads; nobody writes directly (dispatcher RPCs only).
begin;
\ir ../_helpers.psql

select plan(9);

select ok((select relrowsecurity from pg_class where oid = 'public.notification_deliveries'::regclass), 'RLS enabled');
select policies_are('public', 'notification_deliveries', array['notification_deliveries_select_admin']);

insert into public.notifications (id, user_id, event, title, channels)
values ('b2000000-0000-4000-8000-000000000001', tests.id('store_owner'), 'allocation_requested', 'x', '{in_app,email}');
insert into public.notification_deliveries (notification_id, channel, target, status)
values ('b2000000-0000-4000-8000-000000000001', 'email', 'email', 'sent');

select throws_ok($$insert into public.notification_deliveries (notification_id, channel, target, status, locked_until)
                   values ('b2000000-0000-4000-8000-000000000001', 'push', 'h', null, null)$$,
  '23514', null, 'an in-flight row (status null) needs a lease');

select tests.as_anon();
select throws_ok('select notification_id from public.notification_deliveries', '42501', null, 'anon: no access');
select tests.authenticate_as('store_owner');
select is_empty('select notification_id from public.notification_deliveries', 'the recipient does not read delivery rows');
select throws_ok($$update public.notification_deliveries set status = 'failed'$$, '42501', null, 'authenticated cannot update');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select notification_id from public.notification_deliveries', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.notification_deliveries where notification_id = 'b2000000-0000-4000-8000-000000000001'), 1,
  'admin aal2 reads delivery rows');
select throws_ok($$insert into public.notification_deliveries (notification_id, channel, target, status)
                   values ('b2000000-0000-4000-8000-000000000001', 'push', 'x', 'sent')$$,
  '42501', null, 'admin cannot insert');
select tests.clear_auth();

select * from finish();
rollback;

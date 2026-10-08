-- notifications: the user reads own rows once deliver_after passed and when in-app was chosen; only
-- read_at is updatable; nobody inserts/deletes directly (DATA-MODEL §2.6, §9.2, §9.4, §12).
-- mark_notifications_read (security invoker) works inside the same rules. Realtime publication.
begin;
\ir ../_helpers.psql

select plan(28);

-- ---- structure ----
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'RLS enabled');
select policies_are('public', 'notifications', array['notifications_select_own', 'notifications_update_own']);
select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'),
  'notifications is in the supabase_realtime publication');
select ok(exists (select 1 from pg_constraint where conname = 'notifications_outbox_user_uq'
                  and conrelid = 'public.notifications'::regclass and contype = 'u'),
  'UNIQUE (outbox_id, user_id) makes the fan-out idempotent');
select ok(has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
          and not has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE')
          and not has_column_privilege('authenticated', 'public.notifications', 'user_id', 'UPDATE')
          and not has_column_privilege('authenticated', 'public.notifications', 'deliver_after', 'UPDATE'),
  'authenticated may only UPDATE read_at');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'INSERT')
          and not has_table_privilege('authenticated', 'public.notifications', 'DELETE')
          and not has_table_privilege('anon', 'public.notifications', 'SELECT'),
  'no INSERT/DELETE for authenticated, nothing for anon');

-- ---- fixture rows (postgres) ----
insert into public.notifications (id, user_id, event, title, body, link_path, deliver_after, channels) values
  ('b1000000-0000-4000-8000-000000000001', tests.id('store_owner'), 'allocation_requested', 'Yêu cầu nhận lô mới: A', 'x', '/store/inventory', now() - interval '1 minute', '{in_app,email}'),
  ('b1000000-0000-4000-8000-000000000002', tests.id('store_owner'), 'offer_published', 'Đợt sau', 'x', '/charity/donations', now() + interval '5 minutes', '{in_app}'),
  ('b1000000-0000-4000-8000-000000000003', tests.id('store_owner'), 'offer_published', 'Chỉ email', 'x', null, now() - interval '1 minute', '{email}'),
  ('b1000000-0000-4000-8000-000000000004', tests.id('charity_owner'), 'allocation_confirmed', 'Của tổ chức', 'x', '/charity/pickups', now() - interval '1 minute', '{in_app}'),
  ('b1000000-0000-4000-8000-000000000005', tests.id('store_owner'), 'offer_expired', 'Đã đọc', 'x', '/store/inventory', now() - interval '1 hour', '{in_app}');
update public.notifications set read_at = now() - interval '10 minutes' where id = 'b1000000-0000-4000-8000-000000000005';

select throws_ok($$insert into public.notifications (user_id, event, title, link_path) values (gen_random_uuid(), 'org_submitted', 'x', '//evil.example')$$,
  '23514', null, 'link_path must be an internal path (no protocol-relative URL)');
select throws_ok($$insert into public.notifications (user_id, event, title, link_path) values (gen_random_uuid(), 'org_submitted', 'x', 'https://evil.example')$$,
  '23514', null, 'link_path cannot be an absolute URL');

-- ---- anon ----
select tests.as_anon();
select throws_ok('select id from public.notifications', '42501', null, 'anon: no access');
select throws_ok('select public.mark_notifications_read(null)', '42501', null, 'anon cannot run mark_notifications_read');

-- ---- owner of the rows ----
select tests.authenticate_as('store_owner');
select results_eq($$select right(id::text, 1) from public.notifications order by id$$,
  $$values ('1'), ('5')$$, 'user sees own rows that are due and in-app (not the later wave, not e-mail-only, not others)');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'b1000000-0000-4000-8000-000000000001'$$), 1::bigint,
  'user marks own notification read');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'b1000000-0000-4000-8000-000000000004'$$), 0::bigint,
  'user cannot touch another user''s notification');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'b1000000-0000-4000-8000-000000000002'$$), 0::bigint,
  'a notification of a later fairness wave cannot be touched before it is due');
select throws_ok($$update public.notifications set title = 'hacked' where id = 'b1000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'title is not updatable');
select throws_ok($$update public.notifications set user_id = gen_random_uuid() where id = 'b1000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'user_id is not updatable');
select throws_ok($$insert into public.notifications (user_id, event, title) values (auth.uid(), 'org_submitted', 'forged')$$,
  '42501', null, 'user cannot insert notifications');
select throws_ok($$delete from public.notifications$$, '42501', null, 'user cannot delete notifications');

-- mark_notifications_read: only own, visible, unread rows
update public.notifications set read_at = null where id = 'b1000000-0000-4000-8000-000000000001';
select is(public.mark_notifications_read(array['b1000000-0000-4000-8000-000000000004'::uuid]), 0,
  'mark_notifications_read ignores ids of other users');
select is(public.mark_notifications_read(null), 1, 'mark all read: only the due, in-app, unread own row');
select is(public.mark_notifications_read(null), 0, 'second call changes nothing');
select throws_ok(format('select public.mark_notifications_read(%L::uuid[])',
                        (select array_agg(gen_random_uuid())::text from generate_series(1, 201))),
  'PT422', 'validation_failed', 'at most 200 ids');

-- ---- another user / admin ----
select tests.authenticate_as('charity_owner');
select results_eq($$select right(id::text, 1) from public.notifications$$, $$values ('4')$$, 'charity owner sees only own row');
select tests.authenticate_as('admin', 'aal2');
select is_empty($$select id from public.notifications$$, 'admin aal2 has no special read access (own rows only)');
select tests.authenticate_as('outsider');
select is_empty($$select id from public.notifications$$, 'outsider sees nothing');
select tests.clear_auth();

select results_eq($$select right(id::text, 1), read_at is not null from public.notifications where id::text like 'b1000000-%' order by id$$,
  $$values ('1', true), ('2', false), ('3', false), ('4', false), ('5', true)$$,
  'only the visible own row changed');

-- deleting the profile removes its notifications (on delete cascade)
select is((select count(*)::int from pg_constraint c
           where c.conrelid = 'public.notifications'::regclass and c.contype = 'f' and c.confdeltype = 'c'
             and c.confrelid = 'public.profiles'::regclass), 1, 'user_id FK cascades with the profile');
select is((select count(*)::int from pg_constraint c
           where c.conrelid = 'public.notifications'::regclass and c.contype = 'f' and c.confdeltype = 'n'
             and c.confrelid = 'public.notification_outbox'::regclass), 1, 'outbox purge sets outbox_id null');

select * from finish();
rollback;

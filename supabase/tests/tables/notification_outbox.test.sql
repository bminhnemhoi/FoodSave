-- notification_outbox: admin aal2 reads; nobody writes directly; private.enqueue is idempotent on
-- dedupe_key (§2.6, §9.2, §12.1).
begin;
\ir ../_helpers.psql

select plan(12);

select ok((select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass), 'RLS enabled');
select policies_are('public', 'notification_outbox', array['notification_outbox_select_admin']);

select isnt(private.enqueue('org_submitted', 'organization', tests.id('draft_c'), 'test:dedupe:1',
                            jsonb_build_object('org_id', tests.id('draft_c'))),
  null::uuid, 'enqueue returns the outbox id');
select is(private.enqueue('org_submitted', 'organization', tests.id('draft_c'), 'test:dedupe:1'),
  (select id from public.notification_outbox where dedupe_key = 'test:dedupe:1'),
  'enqueue with the same dedupe_key returns the existing id');
select is((select count(*)::int from public.notification_outbox where dedupe_key = 'test:dedupe:1'), 1,
  'only one row per dedupe_key');
select is((select status from public.notification_outbox where dedupe_key = 'test:dedupe:1'),
  'pending'::public.outbox_status, 'new rows are pending');

select tests.as_anon();
select throws_ok('select id from public.notification_outbox', '42501', null, 'anon: no access');
select tests.authenticate_as('draft_owner');
select is_empty('select id from public.notification_outbox', 'org owner: 0 rows');
select throws_ok($$insert into public.notification_outbox (event, aggregate_type, aggregate_id, dedupe_key)
                   values ('org_submitted', 'organization', gen_random_uuid(), 'forged')$$,
  '42501', null, 'authenticated cannot insert');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select id from public.notification_outbox', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.notification_outbox), 1, 'admin aal2 reads the outbox');
select throws_ok($$update public.notification_outbox set status = 'done'$$, '42501', null, 'admin cannot update');
select tests.clear_auth();

select * from finish();
rollback;

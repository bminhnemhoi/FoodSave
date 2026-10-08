-- Waking the dispatcher (ARCHITECTURE §8.2–§8.3): private.kick_dispatch reads the URL and the HMAC
-- secret from Vault (nothing hard-coded), signs "<ts>.<body>" with pgcrypto, queues a pg_net POST;
-- a quiet no-op without secrets. Statement trigger on notification_outbox, pg_cron jobs, retention.
begin;
\ir ../_helpers.psql

select plan(13);

delete from vault.secrets where name in ('jobs_dispatch_url', 'jobs_hmac_secret');
select tests.set_var('q0', (select coalesce(max(id), 0)::text from net.http_request_queue));
select is(private.kick_dispatch('test'), false, 'without Vault secrets (local dev, CI) kick_dispatch is a quiet no-op');
select lives_ok($$select private.enqueue('org_submitted', 'organization', gen_random_uuid(), 'test:kick:0', '{}')$$,
  'business RPCs still enqueue without secrets (the trigger never raises)');
select is((select count(*)::int from net.http_request_queue where id > tests.var('q0')::bigint), 0, 'nothing queued without secrets');

select vault.create_secret('http://host.docker.internal:3000/api/jobs/dispatch', 'jobs_dispatch_url');
select vault.create_secret('pgtap-only-secret-0123456789abcdef', 'jobs_hmac_secret');
select is(private.kick_dispatch('test'), true, 'with Vault secrets kick_dispatch queues a request');
select results_eq(format($$select url, method::text, headers ->> 'Content-Type', convert_from(body, 'UTF8')::jsonb
                           from net.http_request_queue where id > %s order by id limit 1$$, tests.var('q0')),
  $$values ('http://host.docker.internal:3000/api/jobs/dispatch'::text, 'POST'::text, 'application/json'::text,
            '{"job":"dispatch","source":"test"}'::jsonb)$$,
  'POST to the Vault URL with the job body');
select ok((select headers ->> 'x-fs-signature'
                  = encode(extensions.hmac((headers ->> 'x-fs-timestamp') || '.' || convert_from(body, 'UTF8'),
                                           'pgtap-only-secret-0123456789abcdef', 'sha256'), 'hex')
           from net.http_request_queue where id > tests.var('q0')::bigint order by id limit 1),
  'x-fs-signature = hex(HMAC-SHA256(secret, timestamp || "." || exact body bytes sent))');
select ok((select abs((headers ->> 'x-fs-timestamp')::bigint - extract(epoch from clock_timestamp())::bigint) < 60
           from net.http_request_queue where id > tests.var('q0')::bigint order by id limit 1),
  'x-fs-timestamp is the current unix time (seconds)');

select tests.set_var('q1', (select max(id)::text from net.http_request_queue));
select private.enqueue('org_submitted', 'organization', gen_random_uuid(), 'test:kick:1', '{}');
select is((select count(*)::int from net.http_request_queue where id > tests.var('q1')::bigint), 1,
  'an outbox insert wakes the dispatcher once (statement trigger)');
select tests.set_var('q2', (select max(id)::text from net.http_request_queue));
select private.enqueue('org_submitted', 'organization', gen_random_uuid(), 'test:kick:1', '{}');
select is((select count(*)::int from net.http_request_queue where id > tests.var('q2')::bigint), 0,
  'a deduplicated (no-op) insert does not');

select ok(exists (select 1 from cron.job where jobname = 'fs_dispatch_tick' and schedule = '* * * * *'
                  and command like '%kick_dispatch%dispatch_due%'),
  'fs_dispatch_tick runs every minute, only when work is due');
select ok(exists (select 1 from cron.job where jobname = 'fs_purge_notifications' and command like '%purge_notifications%'),
  'fs_purge_notifications scheduled');
select ok(not exists (select 1 from cron.job where command ~* '(https?://|secret)'), 'no URL or secret hard-coded in cron jobs');

-- retention: 90 days (deliveries cascade)
insert into public.notifications (id, user_id, event, title, created_at, channels) values
  ('b5000000-0000-4000-8000-000000000001', tests.id('store_owner'), 'offer_expired', 'old', now() - interval '91 days', '{in_app,email}'),
  ('b5000000-0000-4000-8000-000000000002', tests.id('store_owner'), 'offer_expired', 'recent', now() - interval '89 days', '{in_app}');
insert into public.notification_deliveries (notification_id, channel, target, status)
values ('b5000000-0000-4000-8000-000000000001', 'email', 'email', 'sent');
select public.purge_notifications();
select results_eq($$select right(id::text, 1) from public.notifications where id::text like 'b5000000-%'
                    union all select 'd' from public.notification_deliveries where notification_id::text like 'b5000000-%'$$,
  $$values ('2')$$, 'purge_notifications removes notifications (and deliveries) older than 90 days');

select * from finish();
rollback;

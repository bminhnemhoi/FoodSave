-- claim_email_deliveries / complete_email_delivery (DATA-MODEL §2.6, §12.1): due e-mails only (e-mail
-- channel chosen, deliver_after passed, < 24 h, recipient has an address), one lease per notification,
-- sent/failed bookkeeping, retries with 5 min × attempts backoff up to 3 attempts, expired leases.
begin;
\ir ../_helpers.psql

select plan(19);

-- The local DB is shared: neutralise e-mails left by other runs.
update public.notifications set channels = '{in_app}' where 'email' = any (channels);
update public.notification_deliveries set attempts = 3, status = coalesce(status, 'failed'), locked_until = null
 where attempts < 3 or status is null;

select tests.create_user('no_mail');
update public.profiles set email = null where id = tests.id('no_mail');

insert into public.notifications (id, user_id, org_id, event, title, body, link_path, urgency, deliver_after, channels, created_at) values
  ('b4000000-0000-4000-8000-000000000001', tests.id('store_owner'), tests.id('store_a'), 'allocation_requested',
   'Yêu cầu nhận lô mới: Bánh mì', 'Org charity_b muốn nhận 3 ổ.', '/store/inventory', 'normal', now() - interval '1 minute', '{in_app,email}', now()),
  ('b4000000-0000-4000-8000-000000000002', tests.id('charity_owner'), tests.id('charity_b'), 'offer_turned_red',
   'GẤP · Lô Đỏ gần bạn: Bánh mì', 'x', '/charity/donations', 'urgent', now() - interval '1 minute', '{in_app,email}', now()),
  ('b4000000-0000-4000-8000-000000000003', tests.id('store_owner'), null, 'offer_published',
   'Đợt sau', 'x', null, 'normal', now() + interval '5 minutes', '{in_app,email}', now()),
  ('b4000000-0000-4000-8000-000000000004', tests.id('store_owner'), null, 'offer_expired',
   'Chỉ trong ứng dụng', 'x', null, 'normal', now() - interval '1 minute', '{in_app}', now()),
  ('b4000000-0000-4000-8000-000000000005', tests.id('store_owner'), null, 'allocation_confirmed',
   'Quá cũ', 'x', null, 'normal', now() - interval '2 days', '{in_app,email}', now() - interval '2 days'),
  ('b4000000-0000-4000-8000-000000000006', tests.id('no_mail'), null, 'allocation_confirmed',
   'Không có địa chỉ', 'x', null, 'normal', now() - interval '1 minute', '{in_app,email}', now());

select ok(private.dispatch_due(), 'dispatch_due: due e-mails wake the dispatcher');
select throws_ok('select * from public.claim_email_deliveries(0)', 'PT422', 'validation_failed', 'p_limit is validated');

create temp table c1 as select * from public.claim_email_deliveries(10);
select set_eq($$select right(notification_id::text, 1) from c1$$, $$values ('1'), ('2')$$,
  'claims only due e-mails (not a later wave, not in-app only, not older than 24 h, not without an address)');
select results_eq($$select email, org_name, title, link_path, attempts from c1 where right(notification_id::text, 1) = '1'$$,
  $$values ('store_owner@test.local'::text, 'Org store_a'::text, 'Yêu cầu nhận lô mới: Bánh mì'::text, '/store/inventory'::text, 1::smallint)$$,
  'returns what the template needs');
select results_eq($$select count(*)::int, bool_and(status is null), bool_and(locked_until > now()) from public.notification_deliveries
                    where notification_id::text like 'b4000000-%'$$,
  $$values (2, true, true)$$, 'one in-flight delivery row (lease) per claimed e-mail');
select is_empty('select * from public.claim_email_deliveries(10)', 'in-flight e-mails are not claimed twice');

select is(public.complete_email_delivery('b4000000-0000-4000-8000-000000000001', true, '<m1@foodsave>'), true, 'complete: sent');
select results_eq($$select status::text, provider_message_id, locked_until is null, error is null from public.notification_deliveries
                    where notification_id = 'b4000000-0000-4000-8000-000000000001'$$,
  $$values ('sent', '<m1@foodsave>'::text, true, true)$$, 'sent row keeps the provider id, no lease');
select is(public.complete_email_delivery('b4000000-0000-4000-8000-000000000001', true, null), false, 'completing twice is refused');
select is(public.complete_email_delivery('b4000000-0000-4000-8000-000000000002', false, null, 'smtp timeout'), true, 'complete: failed');
select is_empty('select * from public.claim_email_deliveries(10)', 'a failed e-mail waits 5 minutes before the retry');

select tests.set_clock(now() + interval '6 minutes');
create temp table c2 as select * from public.claim_email_deliveries(10);
select results_eq($$select right(notification_id::text, 1), attempts from c2 order by 1$$,
  $$values ('2', 2::smallint), ('3', 1::smallint)$$, 'after 6 minutes: retry #2 of the failed one + the later wave now due');
select public.complete_email_delivery('b4000000-0000-4000-8000-000000000002', false, null, 'smtp timeout');
select public.complete_email_delivery('b4000000-0000-4000-8000-000000000003', true, null);
select tests.set_clock(now() + interval '17 minutes');
select is((select attempts from public.claim_email_deliveries(10) where right(notification_id::text, 1) = '2'), 3::smallint,
  'retry #3 after 5 × 2 minutes');
select public.complete_email_delivery('b4000000-0000-4000-8000-000000000002', false, null, 'smtp timeout');
select tests.set_clock(now() + interval '2 hours');
select is_empty('select * from public.claim_email_deliveries(10)', 'no fourth attempt');
select results_eq($$select status::text, attempts, error from public.notification_deliveries where notification_id = 'b4000000-0000-4000-8000-000000000002'$$,
  $$values ('failed', 3::smallint, 'smtp timeout'::text)$$, 'final state: failed after 3 attempts, error kept');
select tests.clear_clock();

-- expired lease (the sender crashed): reclaimed with the next attempt number
insert into public.notifications (id, user_id, event, title, deliver_after, channels)
values ('b4000000-0000-4000-8000-000000000007', tests.id('store_manager'), 'allocation_requested', 'Lease', now() - interval '1 minute', '{in_app,email}');
select is((select count(*)::int from public.claim_email_deliveries(10) where right(notification_id::text, 1) = '7'), 1, 'claimed');
select is_empty('select * from public.claim_email_deliveries(10)', 'lease held');
select tests.set_clock(now() + interval '3 minutes');
select is((select attempts from public.claim_email_deliveries(10) where right(notification_id::text, 1) = '7'), 2::smallint,
  'an expired lease is reclaimed as attempt 2');
select tests.clear_clock();

select ok(not exists (select 1 from public.notification_deliveries where target <> 'email' and channel = 'email'),
  'delivery rows never store the e-mail address (target = "email")');

select * from finish();
rollback;

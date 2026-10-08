-- dispatch_outbox + resolve_recipients + claim_outbox_batch / complete_outbox (DATA-MODEL §8.7, §12;
-- ROADMAP P2-14): recipients per event (radius, category, paused, approved, demo, feasibility, role,
-- site scope), fairness waves, rendering without address/coordinates, idempotent re-run, backoff and
-- dead letter, service_role-only EXECUTE. Events of the core loop come from the real RPCs.
begin;
\ir ../_helpers.psql

select plan(56);

-- The local DB is shared: park outbox rows left by other runs so only this file's rows are claimed.
update public.notification_outbox set status = 'done', processed_at = now(), locked_until = null
 where status in ('pending', 'processing');

-- ---- privileges ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok('select public.dispatch_outbox(10)', '42501', null, 'authenticated (even admin aal2) cannot run dispatch_outbox');
select throws_ok(format('select * from public.resolve_recipients(%L)', gen_random_uuid()), '42501', null, '... nor resolve_recipients');
select throws_ok($$select * from public.claim_outbox_batch(1, '{kyc_purge}')$$, '42501', null, '... nor claim_outbox_batch');
select throws_ok(format('select public.complete_outbox(%L, true)', gen_random_uuid()), '42501', null, '... nor complete_outbox');
select throws_ok('select * from public.claim_email_deliveries(1)', '42501', null, '... nor claim_email_deliveries');
select throws_ok(format('select public.complete_email_delivery(%L, true)', gen_random_uuid()), '42501', null, '... nor complete_email_delivery');
select throws_ok('select public.purge_notifications()', '42501', null, '... nor purge_notifications');
select tests.as_anon();
select throws_ok('select public.dispatch_outbox(10)', '42501', null, 'anon cannot run dispatch_outbox');
select tests.as_service();
select lives_ok('select public.dispatch_outbox(10)', 'service_role runs dispatch_outbox');
select throws_ok('select public.dispatch_outbox(0)', 'PT422', 'validation_failed', 'p_limit is validated');
select tests.clear_auth();

-- ---- an isolated cluster far from other data of the shared local DB (E2E rows sit around Bến Thành) ----
select tests.create_user(n) from unnest(array['iso_owner', 'near_owner', 'near_scoped', 'mid_owner', 'mid_vol', 'far_owner',
                                              'paused_owner', 'cat_owner', 'pending_owner', 'demo_owner', 'store_scoped']) as n;
select tests.create_org('store_iso', 'store', 'iso_owner');
select tests.create_site('site_iso', 'store_iso', 'public', 11.300000, 107.300000);
select tests.create_org('ch_near', 'charity', 'near_owner');
select tests.create_site('site_near', 'ch_near', 'public', 11.303100, 107.300000);          -- ~345 m
select tests.create_site('site_near_far', 'ch_near', 'public', 11.500000, 107.500000);      -- ~31 km
insert into public.org_members (org_id, user_id, role, status, site_ids, joined_at)
values (tests.id('ch_near'), tests.id('near_scoped'), 'staff', 'active', array[tests.id('site_near_far')], now());
select tests.create_org('ch_mid', 'charity', 'mid_owner');
select tests.create_site('site_mid', 'ch_mid', 'approximate', 11.300000, 107.343000);      -- ~4,7 km (~32 min)
select tests.add_member('ch_mid', 'mid_vol', 'volunteer');
select tests.create_org('ch_far', 'charity', 'far_owner');
select tests.create_site('site_far', 'ch_far', 'public', 11.300000, 107.500000);           -- ~22 km
select tests.create_org('ch_paused', 'charity', 'paused_owner');
select tests.create_site('site_paused', 'ch_paused', 'public', 11.301000, 107.301000);
update public.organizations set is_paused = true where id = tests.id('ch_paused');
select tests.create_org('ch_cat', 'charity', 'cat_owner');
select tests.create_site('site_cat', 'ch_cat', 'public', 11.302000, 107.302000);
update public.sites set accepted_categories = '{vegetables}' where id = tests.id('site_cat');
select tests.create_org('ch_pending', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_pending', 'ch_pending', 'public', 11.299000, 107.299000);
select tests.create_org('ch_demo', 'charity', 'demo_owner');
select tests.create_site('site_demo', 'ch_demo', 'public', 11.298000, 107.301000);
update public.organizations set is_demo = true where id = tests.id('ch_demo');
insert into public.org_members (org_id, user_id, role, status, site_ids, joined_at)
values (tests.id('store_a'), tests.id('store_scoped'), 'staff', 'active', array[tests.id('site_a_off')], now());

-- non-admin recipients of an outbox row / every active admin got it (other admins may exist in the shared DB)
create function tests.non_admin_recipients(p_outbox uuid) returns setof uuid language sql stable as $$
  select n.user_id from public.notifications n
  where n.outbox_id = p_outbox and n.user_id not in (select private.admin_ids());
$$;
create function tests.all_admins_got(p_outbox uuid) returns boolean language sql stable as $$
  select not exists (select 1 from private.admin_ids() a(id)
                     where not exists (select 1 from public.notifications n where n.outbox_id = p_outbox and n.user_id = a.id));
$$;

-- ==== offer_published (normal) ====
select tests.make_offer('o1', 'site_iso', 'bread', 10);
select tests.set_var('ob1', private.enqueue('offer_published', 'offer', tests.id('o1'), 'test:offer_published:o1',
  jsonb_build_object('offer_id', tests.id('o1'), 'store_org_id', tests.id('store_iso'), 'site_id', tests.id('site_iso'),
                     'category_code', 'bread', 'label', 'green'), 'normal')::text);
select public.dispatch_outbox(50);

select results_eq(format($$select status::text, attempts, processed_at is not null from public.notification_outbox where id = %L$$, tests.var('ob1')),
  $$values ('done', 1::smallint, true)$$, 'outbox row done after one attempt');
select set_eq(format('select * from tests.non_admin_recipients(%L)', tests.var('ob1')),
  format($$values (%L::uuid), (%L::uuid)$$, tests.id('near_owner'), tests.id('mid_owner')),
  'offer_published: staff of approved, unpaused, same-demo charities with a feasible site in radius accepting the category (not far/paused/category/pending/demo/volunteer/site-scoped)');
select ok(tests.all_admins_got(tests.var('ob1')::uuid), '... and every admin');
select results_eq(format($$select count(distinct deliver_after)::int, min(deliver_after) = %L::timestamptz,
                                  max(deliver_after) = %L::timestamptz + interval '5 minutes'
                           from public.notifications where outbox_id = %L and user_id in (select tests.non_admin_recipients(%L))$$,
                         now(), now(), tests.var('ob1'), tests.var('ob1')),
  $$values (2, true, true)$$, 'two eligible charities, non-urgent lot: fairness waves 0 and 1 (5 minutes apart)');
select results_eq(format($$select title, channels::text, deliver_after = %L::timestamptz, link_path from public.notifications
                           where outbox_id = %L and user_id = %L$$, now(), tests.var('ob1'), tests.id('admin')),
  format($$values ('Lô mới: Lô o1'::text, '{in_app}'::text, true, '/admin/offers?offer=%s'::text)$$, tests.id('o1')),
  'admin row: in-app only, wave 0, admin link');
select results_eq(format($$select title, channels::text, link_path from public.notifications where outbox_id = %L and user_id = %L$$,
                         tests.var('ob1'), tests.id('mid_owner')),
  format($$values ('Lô mới gần bạn: Lô o1'::text, '{in_app}'::text, '/charity/donations?offer=%s'::text)$$, tests.id('o1')),
  'charity row: Vietnamese title, in-app only by default for a normal lot, deep link');
select ok((select body like 'Org store_iso tặng 10 ổ Lô o1, cách 4,7 km. Lấy trước %'
           from public.notifications where outbox_id = tests.var('ob1')::uuid and user_id = tests.id('mid_owner')),
  'charity body: store, quantity + unit, crow-fly distance, deadline');
select ok(not exists (select 1 from public.notifications where outbox_id = tests.var('ob1')::uuid
                      and (title || body) ~ '(Hẻm|Lê Lợi|Bến Thành|107[.]|11[.]3)'),
  'no address, ward or coordinates in titles/bodies');

select tests.set_var('wave1_user', (select user_id::text from public.notifications
                                    where outbox_id = tests.var('ob1')::uuid and deliver_after > now()));
select tests.authenticate_as((select name from tests.ids where id = tests.var('wave1_user')::uuid));
select is_empty(format('select id from public.notifications where outbox_id = %L', tests.var('ob1')),
  'the later fairness wave is hidden from its recipient until deliver_after');
select tests.clear_auth();

-- idempotent re-run
select tests.set_var('ob1_n', (select count(*)::text from public.notifications where outbox_id = tests.var('ob1')::uuid));
update public.notification_outbox set status = 'pending', next_attempt_at = now() where id = tests.var('ob1')::uuid;
select lives_ok('select public.dispatch_outbox(50)', 're-dispatching the same outbox row');
select is((select count(*)::text from public.notifications where outbox_id = tests.var('ob1')::uuid), tests.var('ob1_n'),
  'no duplicate notification after a second run (UNIQUE outbox_id, user_id)');
select is(private.fanout((select o from public.notification_outbox o where o.id = tests.var('ob1')::uuid)), 0,
  'fan-out replay inserts nothing');

-- ==== urgent lot (red at publish): wave 0 for everyone, GẤP, e-mail by default ====
select tests.make_offer('o_red', 'site_iso', 'bread', 6);
select tests.set_var('ob_red', private.enqueue('offer_published', 'offer', tests.id('o_red'), 'test:offer_published:o_red',
  jsonb_build_object('offer_id', tests.id('o_red')), 'urgent')::text);
select public.dispatch_outbox(50);
select results_eq(format($$select count(*) filter (where user_id in (select tests.non_admin_recipients(%L)))::int,
                                  bool_and(deliver_after = %L::timestamptz)
                           from public.notifications where outbox_id = %L$$, tests.var('ob_red'), now(), tests.var('ob_red')),
  $$values (2, true)$$, 'urgent lot: every recipient in wave 0');
select results_eq(format($$select title, channels::text, urgency from public.notifications where outbox_id = %L and user_id = %L$$,
                         tests.var('ob_red'), tests.id('mid_owner')),
  $$values ('GẤP · Lô Đỏ gần bạn: Lô o_red'::text, '{in_app,email}'::text, 'urgent'::text)$$,
  'urgent lot: GẤP title, in-app + e-mail by default');
select ok((select body like 'GẤP · Org store_iso có 6 ổ Lô o_red (Đỏ), cách 4,7 km, cần lấy trước %'
           from public.notifications where outbox_id = tests.var('ob_red')::uuid and user_id = tests.id('mid_owner')),
  'urgent body follows DESIGN-SYSTEM §16.5');

-- ==== offer_turned_red: only charities that can still make it (feasibility §4.7) ====
select tests.make_offer('o_soon', 'site_iso', 'bread', 4, now() - interval '10 minutes', now() + interval '20 minutes');
select tests.set_var('ob_soon', private.enqueue('offer_turned_red', 'offer', tests.id('o_soon'), 'test:offer_turned_red:o_soon',
  jsonb_build_object('offer_id', tests.id('o_soon')), 'urgent')::text);
select public.dispatch_outbox(50);
select set_eq(format('select * from tests.non_admin_recipients(%L)', tests.var('ob_soon')),
  format($$values (%L::uuid)$$, tests.id('near_owner')),
  'turned red, 20 minutes left: the charity 345 m away is notified, the one ~32 minutes away is not');
select is((select title from public.notifications where outbox_id = tests.var('ob_soon')::uuid and user_id = tests.id('admin')),
  'GẤP · Lô chuyển Đỏ: Lô o_soon', 'admin title for a lot turning red');

-- ==== a lot that can no longer be requested: admins only ====
select tests.make_offer('o_full', 'site_iso', 'bread', 5);
update public.offers set qty_committed = quantity, status = 'fully_allocated' where id = tests.id('o_full');
select tests.set_var('ob_full', private.enqueue('offer_published', 'offer', tests.id('o_full'), 'test:offer_published:o_full',
  jsonb_build_object('offer_id', tests.id('o_full')), 'normal')::text);
select public.dispatch_outbox(50);
select ok(not exists (select tests.non_admin_recipients(tests.var('ob_full')::uuid)) and tests.all_admins_got(tests.var('ob_full')::uuid),
  'fully allocated lot: charities are not disturbed, admins still informed');

-- ==== allocation events from the real RPCs ====
select tests.make_offer('o2', 'site_a', 'bread', 10);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o2'), 3)::text);
select public.dispatch_outbox(50);
select set_eq(format($$select n.user_id from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                       where o.event = 'allocation_requested' and o.aggregate_id = %L$$, tests.var('a1')),
  format($$values (%L::uuid), (%L::uuid), (%L::uuid)$$, tests.id('store_owner'), tests.id('store_manager'), tests.id('store_staff')),
  'allocation_requested: owner/manager/staff with access to the store site (not a staff scoped to another site, not the charity)');
select results_eq(format($$select n.title like '%%Yêu cầu nhận lô mới: Lô o2', n.channels::text, n.link_path, n.org_id
                           from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                           where o.event = 'allocation_requested' and o.aggregate_id = %L and n.user_id = %L$$,
                         tests.var('a1'), tests.id('store_owner')),
  format($$values (true, '{in_app,email}'::text, '/store/inventory?offer=%s'::text, %L::uuid)$$, tests.id('o2'), tests.id('store_a')),
  'store row: title, in-app + e-mail by default, link to the lot, org context');
select ok((select n.body like 'Org charity_b muốn nhận 3 ổ. Hãy trả lời trước %'
           from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
           where o.event = 'allocation_requested' and o.aggregate_id = tests.var('a1')::uuid and n.user_id = tests.id('store_owner')),
  'store body: charity name, quantity, answer-by time');

select tests.confirm('store_staff', tests.var('a1')::uuid);
select public.dispatch_outbox(50);
select results_eq(format($$select n.user_id, n.title, n.link_path from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                           where o.event = 'allocation_confirmed' and o.aggregate_id = %L$$, tests.var('a1')),
  format($$values (%L::uuid, 'Yêu cầu đã được chấp nhận: Lô o2'::text, '/charity/pickups?allocation=%s'::text)$$,
         tests.id('charity_owner'), tests.var('a1')),
  'allocation_confirmed: the charity staff of the receiving site only (not its volunteer)');

select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 2)::text);
select tests.authenticate_as('store_staff');
select public.reject_allocation(tests.var('a2')::uuid, 'Hết hàng', gen_random_uuid());
select tests.clear_auth();
select public.dispatch_outbox(50);
select results_eq(format($$select n.user_id, n.title from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                           where o.event = 'allocation_rejected' and o.aggregate_id = %L$$, tests.var('a2')),
  format($$values (%L::uuid, 'Yêu cầu chưa được chấp nhận: Lô o2'::text)$$, tests.id('charity_owner')),
  'allocation_rejected: the requesting charity');

select tests.set_var('a3', tests.request('charity_owner', tests.id('o2'), 1)::text);
select tests.authenticate_as('charity_owner');
select public.cancel_allocation(tests.var('a3')::uuid, null, gen_random_uuid());
select tests.clear_auth();
select public.dispatch_outbox(50);
select set_eq(format($$select n.user_id from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                       where o.event = 'allocation_cancelled' and o.aggregate_id = %L$$, tests.var('a3')),
  format($$values (%L::uuid), (%L::uuid), (%L::uuid)$$, tests.id('store_owner'), tests.id('store_manager'), tests.id('store_staff')),
  'charity cancels: the store side is told, not the charity itself');
select results_eq(format($$select n.title, n.channels::text from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                           where o.event = 'allocation_cancelled' and o.aggregate_id = %L and n.user_id = %L$$, tests.var('a3'), tests.id('store_owner')),
  $$values ('Tổ chức đã hủy yêu cầu: Lô o2'::text, '{in_app}'::text)$$, '... in-app only by default');

-- volunteer trip, then the store cancels the assigned allocation (N-19: charity, volunteer, admins; urgent)
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid], 'site_b', 'volunteer', 'charity_volunteer')::text);
select public.dispatch_outbox(50);
select results_eq(format($$select n.user_id, n.title, n.link_path from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                           where o.event = 'pickup_assigned' and o.aggregate_id = %L$$, tests.var('p1')),
  format($$values (%L::uuid, 'Bạn được giao chuyến lấy hàng'::text, '/volunteer/trips'::text)$$, tests.id('charity_volunteer')),
  'pickup_assigned: the volunteer, linking to the volunteer app');
select tests.authenticate_as('store_owner');
select public.cancel_allocation(tests.var('a1')::uuid, 'Hàng bị hỏng', gen_random_uuid());
select tests.clear_auth();
select public.dispatch_outbox(50);
select results_eq(format($$select n.user_id, n.urgency, n.channels::text from public.notifications n
                           join public.notification_outbox o on o.id = n.outbox_id
                           where o.event = 'allocation_cancelled' and o.aggregate_id = %L and n.user_id in (select id from tests.ids)
                           order by n.channels::text, n.user_id$$, tests.var('a1')),
  format($$select * from (values (%L::uuid, 'urgent'::text, '{in_app}'::text), (%L::uuid, 'urgent', '{in_app,email}'), (%L::uuid, 'urgent', '{in_app,email}')) v
           order by 3, 1$$, tests.id('admin'), tests.id('charity_owner'), tests.id('charity_volunteer')),
  'store cancels during a trip: charity + volunteer (in-app + e-mail) and admins (in-app), all urgent');
select is((select n.title from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
           where o.event = 'allocation_cancelled' and o.aggregate_id = tests.var('a1')::uuid and n.user_id = tests.id('charity_owner')),
  'GẤP · Cửa hàng đã hủy phân bổ: Lô o2', 'charity title for a store cancellation during a trip');

-- ==== organization events, e-mail-only and unsupported events ====
select tests.set_var('os', private.enqueue('org_submitted', 'organization', tests.id('draft_c'), 'test:org_submitted',
  jsonb_build_object('org_id', tests.id('draft_c'), 'kind', 'store'))::text);
select tests.set_var('orv', private.enqueue('org_reviewed', 'organization', tests.id('draft_c'), 'test:org_reviewed',
  jsonb_build_object('org_id', tests.id('draft_c'), 'decision', 'request_changes'))::text);
select tests.set_var('mi', private.enqueue('member_invited', 'org_invitation', gen_random_uuid(), 'test:member_invited',
  jsonb_build_object('org_id', tests.id('store_a')))::text);
select tests.set_var('np', private.enqueue('need_published', 'need', gen_random_uuid(), 'test:need_published', '{}')::text);
select public.dispatch_outbox(50);
select results_eq(format($$select user_id, title, link_path from public.notifications
                           where outbox_id = %L and user_id in (select id from tests.ids)$$, tests.var('os')),
  format($$values (%L::uuid, 'Hồ sơ mới chờ duyệt'::text, '/admin/reviews/%s'::text)$$, tests.id('admin'), tests.id('draft_c')),
  'org_submitted: admins, link to the review page');
select results_eq(format($$select user_id, title, channels::text, link_path from public.notifications where outbox_id = %L$$, tests.var('orv')),
  format($$values (%L::uuid, 'Hồ sơ cần bổ sung'::text, '{in_app}'::text, '/onboarding/status?org=%s'::text)$$, tests.id('draft_owner'), tests.id('draft_c')),
  'org_reviewed: owner/manager, in-app only (the review e-mail is sent by the server action)');
select results_eq(format($$select status::text, (select count(*)::int from public.notifications where outbox_id = %L)
                           from public.notification_outbox where id = %L$$, tests.var('mi'), tests.var('mi')),
  $$values ('done', 0)$$, 'member_invited: done without in-app rows (e-mail sent by the server action)');
select results_eq(format($$select status::text, attempts, last_error from public.notification_outbox where id = %L$$, tests.var('np')),
  $$values ('dead', 1::smallint, 'unsupported_event'::text)$$, 'an event without a resolver is dead-lettered at once, visibly');

-- ==== failures: backoff 1m, 5m, 15m, 1h, 6h, dead after the 6th attempt ====
select tests.set_var('bad', private.enqueue('allocation_requested', 'allocation', gen_random_uuid(), 'test:bad',
  jsonb_build_object('store_site_id', tests.id('site_a'), 'qty', 'not-a-number'))::text);
select public.dispatch_outbox(50);
select results_eq(format($$select status::text, attempts, next_attempt_at = %L::timestamptz + interval '1 minute', last_error is not null
                           from public.notification_outbox where id = %L$$, now(), tests.var('bad')),
  $$values ('pending', 1::smallint, true, true)$$, 'failed fan-out: back to pending, 1-minute backoff, error kept');
select is((select count(*)::int from public.notifications where outbox_id = tests.var('bad')::uuid), 0,
  'a failed fan-out leaves no partial notifications');
select tests.set_clock(now() + interval '30 seconds');
select public.dispatch_outbox(50);
select is((select attempts from public.notification_outbox where id = tests.var('bad')::uuid), 1::smallint,
  'not retried before next_attempt_at');
select tests.set_clock(now() + interval '2 minutes');
select public.dispatch_outbox(50);
select tests.set_clock(now() + interval '8 minutes');
select public.dispatch_outbox(50);
select tests.set_clock(now() + interval '24 minutes');
select public.dispatch_outbox(50);
select results_eq(format($$select status::text, attempts, next_attempt_at = %L::timestamptz + interval '1 hour'
                           from public.notification_outbox where id = %L$$, now() + interval '24 minutes', tests.var('bad')),
  $$values ('pending', 4::smallint, true)$$, 'after 1m/5m/15m backoffs the 4th failure waits 1 hour');
select tests.set_clock(now() + interval '85 minutes');
select public.dispatch_outbox(50);
select tests.set_clock(now() + interval '450 minutes');
select public.dispatch_outbox(50);
select results_eq(format($$select status::text, attempts, processed_at is not null from public.notification_outbox where id = %L$$, tests.var('bad')),
  $$values ('dead', 6::smallint, true)$$, 'the 6th failure dead-letters the row');
select tests.set_clock(now() + interval '2 days');
select public.dispatch_outbox(50);
select is((select attempts from public.notification_outbox where id = tests.var('bad')::uuid), 6::smallint, 'dead rows are never claimed again');
select tests.clear_clock();

-- ==== expired leases ====
insert into public.notification_outbox (id, event, aggregate_type, aggregate_id, dedupe_key, payload, status, attempts, locked_until) values
  ('b3000000-0000-4000-8000-000000000001', 'org_submitted', 'organization', tests.id('draft_c'), 'test:lease:1',
   jsonb_build_object('org_id', tests.id('draft_c'), 'kind', 'store'), 'processing', 2, now() - interval '1 minute'),
  ('b3000000-0000-4000-8000-000000000002', 'org_submitted', 'organization', tests.id('draft_c'), 'test:lease:2',
   jsonb_build_object('org_id', tests.id('draft_c'), 'kind', 'store'), 'processing', 6, now() - interval '1 minute'),
  ('b3000000-0000-4000-8000-000000000003', 'org_submitted', 'organization', tests.id('draft_c'), 'test:lease:3',
   jsonb_build_object('org_id', tests.id('draft_c'), 'kind', 'store'), 'processing', 1, now() + interval '1 minute');
select public.dispatch_outbox(50);
select results_eq($$select right(id::text, 1), status::text, attempts, coalesce(last_error, '') from public.notification_outbox
                    where id::text like 'b3000000-%' order by id$$,
  $$values ('1', 'done', 3::smallint, ''), ('2', 'dead', 6::smallint, 'lease_expired'), ('3', 'processing', 1::smallint, '')$$,
  'expired lease is reclaimed; expired after the last attempt => dead; a live lease is left alone');

-- ==== kyc_purge: left to the app (Storage API) via claim_outbox_batch / complete_outbox ====
select tests.set_var('kyc', private.enqueue('kyc_purge', 'org_document', gen_random_uuid(), 'test:kyc',
  jsonb_build_object('bucket', 'kyc', 'path', 'x/y.pdf'))::text);
select public.dispatch_outbox(50);
select is((select status::text from public.notification_outbox where id = tests.var('kyc')::uuid), 'pending',
  'dispatch_outbox leaves kyc_purge to the app dispatcher');
select tests.as_service();
select throws_ok('select * from public.claim_outbox_batch(10, null)', 'PT422', 'validation_failed', 'claim_outbox_batch needs explicit events');
select is((select count(*)::int from public.claim_outbox_batch(10, '{kyc_purge}') c where c.id = tests.var('kyc')::uuid), 1,
  'claim_outbox_batch leases the kyc_purge row');
select results_eq(format($$select status::text, attempts, locked_until > now() from public.notification_outbox where id = %L$$, tests.var('kyc')),
  $$values ('processing', 1::smallint, true)$$, 'leased: processing, attempt 1, lease in the future');
select is((select count(*)::int from public.claim_outbox_batch(10, '{kyc_purge}') c where c.id = tests.var('kyc')::uuid), 0,
  'a leased row is not claimed twice');
select is(public.complete_outbox(tests.var('kyc')::uuid, true, null), 'done'::public.outbox_status, 'complete_outbox: done');
select throws_ok(format('select public.complete_outbox(%L, true)', tests.var('kyc')), 'PT409', 'invalid_state',
  'completing a row that is not processing fails');
select tests.clear_auth();

select * from finish();
rollback;

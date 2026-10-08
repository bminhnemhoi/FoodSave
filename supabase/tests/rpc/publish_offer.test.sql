-- publish_offer (DATA-MODEL §4.2, §6.1, §8.3; PRD US-STO-07 AC4/AC5, US-STO-09, US-STO-11).
-- Clock fixed at 2026-10-20 10:00 (Tuesday); site_a open 06:00–21:00 every day.
begin;
\ir ../_helpers.psql

select plan(28);

select tests.set_clock('2026-10-20 10:00+07');
insert into public.site_hours (site_id, dow, opens, closes, closes_next_day)
select tests.id('site_a'), d, '06:00'::time, '21:00'::time, false from generate_series(0, 6) d;

create function tests.draft(p_name text, p_start text, p_end text, p_expires text default '2026-10-21 12:00+07',
                            p_site text default 'site_a') returns uuid
language sql as $$
  select tests.make_offer(p_name, p_site, 'bread', 10, p_start::timestamptz, p_end::timestamptz, p_expires::timestamptz, 'draft');
$$;

select tests.draft('o_ok', '2026-10-20 10:00+07', '2026-10-20 20:00+07');
select tests.draft('o_red', '2026-10-20 10:00+07', '2026-10-20 13:00+07');
select tests.draft('o_ended', '2026-10-20 08:00+07', '2026-10-20 09:00+07');
select tests.draft('o_after_exp', '2026-10-20 12:00+07', '2026-10-20 19:00+07', '2026-10-20 18:00+07');
select tests.draft('o_night', '2026-10-20 22:00+07', '2026-10-20 23:00+07');
select tests.draft('o_after_close', '2026-10-20 15:00+07', '2026-10-20 22:00+07');
select tests.draft('o_short', '2026-10-20 10:00+07', '2026-10-20 10:20+07');
select tests.draft('o_draft_org', '2026-10-20 10:00+07', '2026-10-20 20:00+07', '2026-10-21 12:00+07', 'site_c');

-- ---- permissions ----
select tests.as_anon();
select throws_ok(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_ok')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_ok')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_ok')),
  'PT404', 'not_found', 'charity => not_found');
select tests.authenticate_as('draft_owner');
select throws_ok(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_draft_org')),
  'PT403', 'org_not_active', 'store not approved => org_not_active (L4)');
select tests.clear_auth();
update public.organizations set is_paused = true, paused_reason = 'Nghỉ Tết' where id = tests.id('store_a');
select tests.authenticate_as('store_staff');
select is(tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_ok'))),
  '{"sqlstate":"PT403","message":"org_not_active","detail":"paused","hint":null}'::jsonb, 'paused store cannot publish');
select tests.clear_auth();
update public.organizations set is_paused = false, paused_reason = null where id = tests.id('store_a');

-- ---- preconditions ----
select tests.authenticate_as('store_staff');
select is((tests.error_of(format($$select public.publish_offer(%L, false, gen_random_uuid())$$, tests.id('o_ok'))) ->> 'detail')::jsonb,
  '{"p_safety_attested":"required"}'::jsonb, 'AC4: safety attestation is mandatory');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_ended'))) ->> 'detail')::jsonb,
  '{"pickup_window":"ended"}'::jsonb, 'window already over');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_after_exp'))) ->> 'detail')::jsonb,
  '{"pickup_window":"after_expiry","suggested_end":"2026-10-20T11:00:00+00:00"}'::jsonb,
  'AC5: window ending after expiry refused with a suggested end');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_night'))) ->> 'detail')::jsonb,
  '{"pickup_window":"outside_hours"}'::jsonb, 'window starting while the store is closed');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_after_close'))) ->> 'detail')::jsonb,
  '{"pickup_window":"after_close","suggested_end":"2026-10-20T14:00:00+00:00"}'::jsonb,
  'AC5: window ending after closing (21:00) refused with suggested end 21:00');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_short'))) ->> 'detail')::jsonb,
  '{"pickup_window":"too_short","min_minutes":30}'::jsonb, 'less than min_publish_lead_minutes (30) refused');

-- ---- happy path ----
select is(public.publish_offer(tests.id('o_ok'), true, 'f0000000-0000-4000-8000-000000000001'),
  '{"label": "yellow", "effective_deadline": "2026-10-20T13:00:00+00:00"}'::jsonb,
  'published: deadline 20:00 (window end), Vàng (10 h left, cooked)');
select tests.clear_auth();
select results_eq(
  format($$select status::text, published_at, safety_attested_at, safety_attested_by, red_notified_at
           from public.offers where id = %L$$, tests.id('o_ok')),
  format($$values ('open', '2026-10-20 10:00+07'::timestamptz, '2026-10-20 10:00+07'::timestamptz, %L::uuid, null::timestamptz)$$,
         tests.id('store_staff')),
  'open, published_at and safety attestation (who/when) recorded');
select results_eq(
  format($$select event::text, urgency, payload ->> 'label', payload ->> 'store_org_id' from public.notification_outbox
           where aggregate_id = %L$$, tests.id('o_ok')),
  format($$values ('offer_published', 'normal', 'yellow', %L)$$, tests.id('store_a')),
  'US-STO-11 AC2: offer_published enqueued once (ids only)');
select results_eq(
  format($$select action, client_op_id from public.audit_logs where entity_id = %L$$, tests.id('o_ok')),
  $$values ('offer.publish'::text, 'f0000000-0000-4000-8000-000000000001'::uuid)$$, 'audited (offer.publish)');

select tests.authenticate_as('store_staff');
select is(public.publish_offer(tests.id('o_ok'), true, 'f0000000-0000-4000-8000-000000000001'),
  '{"label": "yellow", "effective_deadline": "2026-10-20T13:00:00+00:00"}'::jsonb, 'replay returns the stored result');
select throws_ok(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_ok')),
  'PT409', 'invalid_state', 'publishing an open lot again => invalid_state');
select tests.clear_auth();
select is((select count(*)::int from public.notification_outbox where aggregate_id = tests.id('o_ok')), 1, 'still one outbox row');
select is((select count(*)::int from public.audit_logs where entity_id = tests.id('o_ok')), 1, 'still one audit row');

-- red at publish => urgent + red_notified_at (no second "turned red" later)
select tests.authenticate_as('store_owner');
select is(public.publish_offer(tests.id('o_red'), true, gen_random_uuid()) ->> 'label', 'red', 'deadline in 3 h (cooked) => Đỏ');
select tests.clear_auth();
select results_eq(
  format($$select o.red_notified_at is not null, n.urgency from public.offers o join public.notification_outbox n on n.aggregate_id = o.id
           where o.id = %L$$, tests.id('o_red')),
  $$values (true, 'urgent'::text)$$, 'US-STO-11 AC3: red at publish => urgent, red_notified_at set');

-- closure day blocks a 24/7 or regular site
insert into public.site_closures (site_id, closed_on) values (tests.id('site_a'), '2026-10-20');
select tests.draft('o_closed_day', '2026-10-20 11:00+07', '2026-10-20 16:00+07');
select tests.authenticate_as('store_staff');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_closed_day'))) ->> 'detail')::jsonb,
  '{"pickup_window":"outside_hours"}'::jsonb, 'closure day => outside_hours');
select tests.clear_auth();
delete from public.site_closures where site_id = tests.id('site_a');

-- inactive category / site
update public.food_categories set is_active = false where code = 'bread';
select tests.authenticate_as('store_staff');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_closed_day'))) ->> 'detail')::jsonb,
  '{"category_code":"inactive"}'::jsonb, 'inactive category cannot be published');
select tests.clear_auth();
update public.food_categories set is_active = true where code = 'bread';
select tests.draft('o_off_site', '2026-10-20 11:00+07', '2026-10-20 16:00+07', '2026-10-21 12:00+07', 'site_a_off');
select tests.authenticate_as('store_staff');
select is((tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_off_site'))) ->> 'detail')::jsonb,
  '{"site_id":"inactive"}'::jsonb, 'inactive site cannot publish');

-- 24/7 site (no hours): deadline = least(expiry, window end)
select tests.clear_auth();
select tests.draft('o_247', '2026-10-20 10:00+07', '2026-10-21 03:00+07', '2026-10-21 01:00+07', 'site_x');
select tests.authenticate_as('other_owner');
select is(tests.error_of(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_247'))) ->> 'message',
  'validation_failed', '24/7 site: a window past expiry is still refused');
select tests.clear_auth();
update public.offers set pickup_window = tstzrange('2026-10-20 10:00+07', '2026-10-20 23:00+07') where id = tests.id('o_247');
select tests.authenticate_as('other_owner');
select is((public.publish_offer(tests.id('o_247'), true, gen_random_uuid()) ->> 'effective_deadline')::timestamptz,
  '2026-10-20 23:00+07'::timestamptz, '24/7 site: deadline = window end (no closing time)');

-- ---- rate limit 60/h/org ----
select tests.clear_auth();
insert into public.rate_limits (key, window_start, count)
values ('publish_offer:org:' || tests.id('store_a'), date_bin('1 hour', '2026-10-20 10:00+07'::timestamptz, '2000-01-01 00:00+07'), 60)
on conflict (key, window_start) do update set count = 60;
select tests.draft('o_rl', '2026-10-20 11:00+07', '2026-10-20 16:00+07');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.publish_offer(%L, true, gen_random_uuid())$$, tests.id('o_rl')),
  'PT429', 'rate_limited', 'rate limit 60 publications / hour / org');
select tests.clear_auth();
select is((select status::text from public.offers where id = tests.id('o_rl')), 'draft', 'rate-limited lot stays draft');
select tests.clear_clock();

select * from finish();
rollback;

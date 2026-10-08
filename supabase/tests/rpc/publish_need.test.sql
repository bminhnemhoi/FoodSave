-- publish_need (DATA-MODEL §6.2 tạo → open, §8.4; PRD US-CHA-09; ROADMAP P3-01)
begin;
\ir ../_helpers.psql

select plan(35);

select tests.create_user('charity_staff');
select tests.add_member('charity_b', 'charity_staff', 'staff');
select tests.create_site('site_b2', 'charity_b', 'approximate', 10.765, 106.665);
select tests.create_user('charity_mgr2');
insert into public.org_members (org_id, user_id, role, site_ids, status, joined_at)
values (tests.id('charity_b'), tests.id('charity_mgr2'), 'manager', array[tests.id('site_b2')], 'active', now());
select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_p', 'charity_p', 'approximate');

create function tests.pn(p_site text, p_codes text, p_unit text, p_qty text, p_by text, p_people text default 'null',
                         p_note text default 'null', p_op text default 'gen_random_uuid()') returns text
language sql stable as $$
  select format('select public.publish_need(%L, %s, %s, %s, %s, %s, %s, %s)',
                tests.id(p_site), p_codes, p_unit, p_qty, p_by, p_people, p_note, p_op);
$$;
grant execute on function tests.pn(text, text, text, text, text, text, text, text) to authenticated, anon;

-- ==== who may call ====
select tests.as_anon();
select throws_ok(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$), '42501', null,
  'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$), 'PT404', 'not_found',
  'user without org: not_found (no existence leak)');
select tests.authenticate_as('store_owner');
select throws_ok(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$), 'PT404', 'not_found',
  'store member on a charity site: not_found');
select is((tests.error_of(tests.pn('site_a', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_site_id":"not_a_charity_site"}'::jsonb, 'a store cannot post a need from its own site');
select tests.authenticate_as('charity_volunteer');
select throws_ok(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$), 'PT403', 'not_authorized',
  'volunteer cannot post needs');
select tests.authenticate_as('charity_mgr2');
select throws_ok(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$), 'PT403', 'not_authorized',
  'manager scoped to another site cannot post for site_b (branch scope)');
select tests.authenticate_as('pending_owner');
select throws_ok(tests.pn('site_p', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$), 'PT403', 'org_not_active',
  'unapproved charity: org_not_active (B8)');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$), 'PT403', 'not_authorized',
  'admin aal2 cannot post on behalf of a charity');
select tests.clear_auth();
update public.organizations set is_paused = true where id = tests.id('charity_b');
select tests.authenticate_as('charity_owner');
select is(tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$)) - 'hint',
  '{"sqlstate":"PT403","message":"org_not_active","detail":"paused"}'::jsonb, 'paused charity: org_not_active / paused');
select tests.clear_auth();
update public.organizations set is_paused = false where id = tests.id('charity_b');

-- ==== validation (NULL probes included) ====
select tests.authenticate_as('charity_owner');
select throws_ok(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$, 'null', 'null', 'null'),
  'PT422', 'validation_failed', 'client_op_id is required');
select is((tests.error_of(tests.pn('site_b', 'null', 'null', 'null', 'null')) ->> 'detail')::jsonb,
  '{"p_category_codes":"1-3 codes","p_unit":"required","p_quantity":"> 0","p_needed_by":"required"}'::jsonb,
  'all-null payload: every field error at once');
select is((tests.error_of(tests.pn('site_b', $$'{}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_category_codes":"1-3 codes"}'::jsonb, 'empty category list refused');
select is((tests.error_of(tests.pn('site_b', $$'{bread,null}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_category_codes":"1-3 codes"}'::jsonb, 'null element refused');
select is((tests.error_of(tests.pn('site_b', $$'{bread,pastry,dairy,fruit}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_category_codes":"1-3 codes"}'::jsonb, 'at most 3 interchangeable categories');
select is((tests.error_of(tests.pn('site_b', $$'{bread,caviar}'$$, $$'loaf'$$, '50', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_category_codes":"unknown_or_inactive"}'::jsonb, 'unknown category refused');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '5.5', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_quantity":"integer_required"}'::jsonb, 'counted unit: integer quantity');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '0', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_quantity":"> 0"}'::jsonb, 'quantity > 0');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '5', $$now() + interval '30 minutes'$$)) ->> 'detail')::jsonb,
  '{"p_needed_by":"min_1_hour"}'::jsonb, 'needed_by must be more than 1 hour ahead');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '5', $$now() - interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_needed_by":"min_1_hour"}'::jsonb, 'needed_by in the past refused (US-CHA-09 AC3)');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '5', $$now() + interval '8 days'$$)) ->> 'detail')::jsonb,
  '{"p_needed_by":"max_7_days"}'::jsonb, 'needed_by beyond 7 days refused (US-CHA-09 AC3)');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '5', $$now() + interval '1 day'$$, '0')) ->> 'detail')::jsonb,
  '{"p_people_to_serve":"1-100000"}'::jsonb, 'people_to_serve > 0');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '5', $$now() + interval '1 day'$$, 'null', quote_literal(repeat('x', 501)))) ->> 'detail')::jsonb,
  '{"p_note":"≤ 500 chars"}'::jsonb, 'note ≤ 500 chars');
select tests.clear_auth();
update public.sites set accepted_categories = '{bread,pastry}' where id = tests.id('site_b');
select tests.authenticate_as('charity_owner');
select is((tests.error_of(tests.pn('site_b', $$'{bread,dairy}'$$, $$'loaf'$$, '5', $$now() + interval '1 day'$$)) ->> 'detail')::jsonb,
  '{"p_category_codes":"not_accepted_by_site"}'::jsonb, 'categories must be accepted by the receiving site');

-- ==== happy path ====
select tests.clear_auth();
select tests.authenticate_as('charity_staff');
select lives_ok(format($$select tests.set_var('n1', public.publish_need(%L, '{bread,pastry,bread}', 'loaf', 50, now() + interval '1 day', 45,
                         '  Cho 45 trẻ  ', 'c3000000-0000-4000-8000-000000000001')::text)$$, tests.id('site_b')),
  'staff with site access posts a need');
select is(public.publish_need(tests.id('site_b'), '{bread,pastry,bread}', 'loaf', 50, now() + interval '1 day', 45, '  Cho 45 trẻ  ',
                              'c3000000-0000-4000-8000-000000000001')::text, tests.var('n1'), 'replay returns the same need');
select throws_ok(format($$select public.publish_need(%L, '{bread}', 'loaf', 51, now() + interval '1 day', 45, null,
                          'c3000000-0000-4000-8000-000000000001')$$, tests.id('site_b')),
  'PT409', 'idempotency_conflict', 'same client_op_id with other parameters: idempotency_conflict');
select tests.clear_auth();
select results_eq(format($$select org_id, site_id, category_codes, unit::text, quantity, people_to_serve, note, status::text,
                                  qty_in_flight, qty_delivered, created_by
                           from public.needs where id = %L$$, tests.var('n1')),
  format($$values (%L::uuid, %L::uuid, '{bread,pastry}'::text[], 'loaf', 50.000::numeric, 45, 'Cho 45 trẻ', 'open', 0.000::numeric,
                   0.000::numeric, %L::uuid)$$, tests.id('charity_b'), tests.id('site_b'), tests.id('charity_staff')),
  'need open; categories de-duplicated in order; note trimmed');
select is((select count(*)::int from public.needs where org_id = tests.id('charity_b')), 1, 'replay created no second need');
select results_eq(format($$select event::text, urgency, payload - 'needed_by' from public.notification_outbox where aggregate_id = %L$$, tests.var('n1')),
  format($$values ('need_published', 'normal', jsonb_build_object('need_id', %L::uuid, 'org_id', %L::uuid, 'site_id', %L::uuid,
                   'category_codes', '["bread","pastry"]'::jsonb, 'unit', 'loaf', 'quantity', 50))$$,
         tests.var('n1'), tests.id('charity_b'), tests.id('site_b')),
  'outbox need_published (ids/enums only, no note), normal urgency');
select results_eq(format($$select action, org_id, after ->> 'status', client_op_id from public.audit_logs where entity_id = %L$$, tests.var('n1')),
  format($$values ('need.publish', %L::uuid, 'open', 'c3000000-0000-4000-8000-000000000001'::uuid)$$, tests.id('charity_b')),
  'audited once (need.publish) with client_op_id');
select ok(not exists (select 1 from public.audit_logs where entity_id = tests.var('n1')::uuid and after::text like '%45 trẻ%'),
  'free-text note is not copied into audit_logs');

select tests.authenticate_as('charity_owner');
select lives_ok(format($$select tests.set_var('n2', public.publish_need(%L, '{pastry}', 'piece', 12, now() + interval '3 hours', null, null,
                         gen_random_uuid())::text)$$, tests.id('site_b')), 'need due within 4 hours');
select tests.clear_auth();
select is((select urgency from public.notification_outbox where aggregate_id = tests.var('n2')::uuid), 'urgent',
  'needed within 4 hours => urgent need_published (N-06)');
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select tests.set_var('n3', public.publish_need(%L, '{bread}', 'kg', 2.5, now() + interval '2 days', null, null,
                         gen_random_uuid())::text)$$, tests.id('site_b')), 'kg need accepts decimals');

-- ==== rate limit: 30 / hour / org ====
select tests.clear_auth();
insert into public.rate_limits (key, window_start, count)
values ('publish_need:org:' || tests.id('charity_b'), date_bin('1 hour', now(), '2000-01-01 00:00+07'), 30)
on conflict (key, window_start) do update set count = 30;
select tests.authenticate_as('charity_owner');
select is((tests.error_of(tests.pn('site_b', $$'{bread}'$$, $$'loaf'$$, '5', $$now() + interval '1 day'$$)) ->> 'message'),
  'rate_limited', 'the 31st need of the hour is rate limited (PT429)');
select tests.clear_auth();

select * from finish();
rollback;

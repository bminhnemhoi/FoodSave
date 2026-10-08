-- create_offer (addition to DATA-MODEL §8.3; PRD US-STO-07): draft lot from a validated payload.
-- Store owner/manager/staff with access to the site of an approved store; idempotent; audited; no
-- notification for drafts (AC6).
begin;
\ir ../_helpers.psql

select plan(26);

create function tests.payload(p_extra jsonb default '{}'::jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'site_id', tests.id('site_a'), 'category_code', 'bread', 'title', 'Bánh mì que', 'quantity', 30,
    'expiry', jsonb_build_object('datetime', '2026-12-01T21:00:00+07:00'),
    'pickup_start', '2026-12-01T15:00:00+07:00', 'pickup_end', '2026-12-01T20:00:00+07:00') || p_extra;
$$;
grant execute on function tests.payload(jsonb) to authenticated;

select tests.create_user('branch_staff');
select tests.create_site('site_a2', 'store_a', 'public', 10.78, 106.69);
insert into public.org_members (org_id, user_id, role, status, site_ids, joined_at)
values (tests.id('store_a'), tests.id('branch_staff'), 'staff', 'active', array[tests.id('site_a2')], now());

-- ---- who may call ----
select tests.as_anon();
select throws_ok($$select public.create_offer(tests.payload(), gen_random_uuid())$$, '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok($$select public.create_offer(tests.payload(), gen_random_uuid())$$, 'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('charity_owner');
select throws_ok($$select public.create_offer(tests.payload(), gen_random_uuid())$$, 'PT404', 'not_found', 'charity member => not_found');
select tests.authenticate_as('draft_owner');
select throws_ok(format($$select public.create_offer(tests.payload(jsonb_build_object('site_id', %L)), gen_random_uuid())$$, tests.id('site_c')),
  'PT403', 'org_not_active', 'store not approved yet => org_not_active');
select tests.authenticate_as('branch_staff');
select throws_ok($$select public.create_offer(tests.payload(), gen_random_uuid())$$, 'PT403', 'not_authorized',
  'staff scoped to another branch => not_authorized');
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.create_offer(tests.payload(), gen_random_uuid())$$, 'PT403', 'not_authorized',
  'admin is not a store member');

-- ---- validation ----
select tests.authenticate_as('store_staff');
select is((tests.error_of(format($$select public.create_offer(jsonb_build_object('site_id', %L), gen_random_uuid())$$, tests.id('site_a'))) ->> 'detail')::jsonb,
  '{"title": "required", "expiry": "required", "quantity": "required", "category_code": "required", "pickup_window": "pickup_start and pickup_end required"}'::jsonb,
  'every missing field is listed at once');
select is((tests.error_of($$select public.create_offer(tests.payload('{"quantity": 12.5}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"quantity": "integer_required"}'::jsonb, 'AC2: 12,5 ổ refused (counted unit)');
select is((tests.error_of($$select public.create_offer(tests.payload('{"colour": "red"}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"unknown_keys": ["colour"]}'::jsonb, 'unknown keys refused');
select is((tests.error_of($$select public.create_offer(tests.payload('{"expiry": {"datetime": "2026-12-01T21:00:00"}}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"expiry": "{date: YYYY-MM-DD} or {datetime: ISO-8601 with offset}"}'::jsonb, 'local time without offset refused');
select is((tests.error_of($$select public.create_offer(tests.payload('{"pickup_end": "2026-12-01T14:00:00+07:00"}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"pickup_window": "end_before_start"}'::jsonb, 'pickup window must end after it starts');
select is((tests.error_of($$select public.create_offer(tests.payload('{"category_code": "caviar"}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"category_code": "unknown_or_inactive"}'::jsonb, 'unknown category refused');
select is((tests.error_of($$select public.create_offer(tests.payload('{"unit": "box"}'), gen_random_uuid())$$) ->> 'detail')::jsonb,
  '{"unit_weight_kg": "required_for_unit"}'::jsonb, 'non-default unit needs a declared weight');
select throws_ok($$select public.create_offer(tests.payload('{"photo_paths": ["org/x/offer/a.webp"]}'), gen_random_uuid())$$,
  'PT422', 'validation_failed', 'photo outside org/{org_id}/offer/ refused');
select throws_ok(format($$select public.create_offer(tests.payload(jsonb_build_object('site_id', %L)), gen_random_uuid())$$, tests.id('site_a_off')),
  'PT422', 'validation_failed', 'inactive site refused');

-- ---- happy path ----
select lives_ok($$select tests.set_var('o1', public.create_offer(tests.payload(), 'd0000000-0000-4000-8000-000000000001')::text)$$,
  'store staff creates a draft');
select results_eq(
  format($$select status::text, unit::text, unit_weight_kg, weight_source::text, expires_at, pickup_window, created_by, effective_deadline
           from public.offers where id = %L$$, tests.var('o1')),
  format($$values ('draft', 'loaf', 0.120::numeric, 'category_default', '2026-12-01 21:00+07'::timestamptz,
                   tstzrange('2026-12-01 15:00+07', '2026-12-01 20:00+07'), %L::uuid, null::timestamptz)$$, tests.id('store_staff')),
  'AC1/AC6: draft, default unit ổ + category weight (category_default), no effective deadline yet');
select is(public.create_offer(tests.payload(), 'd0000000-0000-4000-8000-000000000001')::text, tests.var('o1'),
  'same client_op_id => same offer (double tap creates one lot)');
select throws_ok($$select public.create_offer(tests.payload('{"quantity": 31}'), 'd0000000-0000-4000-8000-000000000001')$$,
  'PT409', 'idempotency_conflict', 'same client_op_id with other params => idempotency_conflict');
select lives_ok($$select tests.set_var('o2', public.create_offer(tests.payload(
    '{"expiry": {"date": "2026-12-01"}, "unit_weight_kg": 0.15, "description": "  Bánh mì ngọt  "}'), gen_random_uuid())::text)$$,
  'date-only expiry + declared weight');
select results_eq(
  format($$select expires_at, expiry_is_date_only, unit_weight_kg, weight_source::text, description from public.offers where id = %L$$, tests.var('o2')),
  $$values ('2026-12-01 23:59+07'::timestamptz, true, 0.150::numeric, 'declared', 'Bánh mì ngọt')$$,
  'AC3: date-only expiry = 23:59 VN; declared weight kept; description trimmed');
select lives_ok($$select tests.set_var('o3', public.create_offer(tests.payload(
    '{"category_code": "vegetables", "quantity": 2.5, "unit_weight_kg": 9}'), gen_random_uuid())::text)$$,
  'kg lot with decimal quantity');
select results_eq(format($$select unit::text, quantity, unit_weight_kg from public.offers where id = %L$$, tests.var('o3')),
  $$values ('kg', 2.500::numeric, 1.000::numeric)$$, 'kg: decimals allowed, unit weight forced to 1');
select tests.clear_auth();

select results_eq(
  format($$select action, actor_id, client_op_id from public.audit_logs where entity_id = %L$$, tests.var('o1')),
  format($$values ('offer.create'::text, %L::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid)$$, tests.id('store_staff')),
  'audited once (offer.create)');
select is_empty(format($$select 1 from public.notification_outbox where aggregate_id in (%L, %L, %L)$$,
                       tests.var('o1'), tests.var('o2'), tests.var('o3')),
  'AC6: drafts send no notification');
select is((select count(*)::int from public.offers where id::text in (tests.var('o1'), tests.var('o2'), tests.var('o3'))), 3,
  'three drafts created');

select * from finish();
rollback;

-- create_organization (DATA-MODEL §6.8, SECURITY-PRIVACY L5): confirmed email, ≤ 3 drafts, creator =
-- owner, empty org_sensitive, idempotent on client_op_id, audited, respects signups_enabled.
begin;
\ir ../_helpers.psql

select plan(24);

select tests.confirm_email('outsider');

-- ---- privileges / preconditions ----
select tests.as_anon();
select throws_ok($$select public.create_organization('store', 'Tiệm bánh', 'bakery', gen_random_uuid())$$,
  '42501', null, 'anon has no EXECUTE');

select tests.authenticate_as('store_staff');
select throws_ok($$select public.create_organization('store', 'Tiệm bánh', 'bakery', gen_random_uuid())$$,
  'PT403', 'not_authorized', 'email not confirmed => not_authorized');

-- ---- happy path ----
select tests.authenticate_as('outsider');
select lives_ok($$select public.create_organization('store', '  Tiệm Bánh Mì Hòa Bình Đặc Biệt ', 'bakery',
                                                    'a0000000-0000-4000-8000-000000000001')$$,
  'confirmed user creates a store draft');
select tests.clear_auth();

select results_eq(
  $$select kind, name, subtype, status, created_by, submitted_at from public.organizations
    where created_by = tests.id('outsider')$$,
  $$values ('store'::public.org_kind, 'Tiệm Bánh Mì Hòa Bình Đặc Biệt'::text, 'bakery'::text,
            'draft'::public.org_status, tests.id('outsider'), null::timestamptz)$$,
  'row is a draft store created by the caller (name trimmed)');
select matches((select slug from public.organizations where created_by = tests.id('outsider')),
  '^tiem-banh-mi-hoa-binh-dac-biet-[0-9a-f]{8}$', 'slug is ASCII from the Vietnamese name + id suffix');
select results_eq(
  $$select m.role, m.status from public.org_members m join public.organizations o on o.id = m.org_id
    where o.created_by = tests.id('outsider')$$,
  $$values ('owner'::public.org_role, 'active'::public.member_status)$$,
  'creator is the active owner');
select is((select count(*)::int from public.org_sensitive s join public.organizations o on o.id = s.org_id
           where o.created_by = tests.id('outsider') and s.legal_name is null), 1,
  'empty org_sensitive row created');
select results_eq(
  $$select action, entity_type, actor_id, actor_org_role, client_op_id from public.audit_logs where action = 'org.create'$$,
  $$values ('org.create'::text, 'organization'::text, tests.id('outsider'), 'owner'::public.org_role,
            'a0000000-0000-4000-8000-000000000001'::uuid)$$,
  'audited (org.create) with client_op_id');

-- ---- idempotency (L5) ----
select tests.authenticate_as('outsider');
select is(public.create_organization('store', '  Tiệm Bánh Mì Hòa Bình Đặc Biệt ', 'bakery',
                                     'a0000000-0000-4000-8000-000000000001'),
  (select id from public.organizations where created_by = tests.id('outsider')),
  'same client_op_id returns the same org_id');
select tests.clear_auth();
select is((select count(*)::int from public.organizations where created_by = tests.id('outsider')), 1,
  'still exactly one organization');
select is((select count(*)::int from public.audit_logs where action = 'org.create'), 1, 'still one audit row');

select tests.authenticate_as('outsider');
select throws_ok($$select public.create_organization('store', 'Tên khác', 'bakery', 'a0000000-0000-4000-8000-000000000001')$$,
  'PT409', 'idempotency_conflict', 'same op with different params => idempotency_conflict');
select tests.clear_auth();
select tests.confirm_email('draft_owner');
select tests.authenticate_as('draft_owner');
select throws_ok($$select public.create_organization('store', '  Tiệm Bánh Mì Hòa Bình Đặc Biệt ', 'bakery',
                                                     'a0000000-0000-4000-8000-000000000001')$$,
  'PT409', 'idempotency_conflict', 'same op from another user => idempotency_conflict');

-- ---- validation ----
select tests.authenticate_as('outsider');
select throws_ok($$select public.create_organization('store', 'Bếp', 'soup_kitchen', gen_random_uuid())$$,
  'PT422', 'validation_failed', 'subtype must match kind');
select throws_ok($$select public.create_organization('charity', 'X', 'shelter', gen_random_uuid())$$,
  'PT422', 'validation_failed', 'name shorter than 2 chars');
select throws_ok($$select public.create_organization('charity', 'Mái ấm', 'shelter', null)$$,
  'PT422', 'validation_failed', 'client_op_id is required');

-- ---- charity + draft cap (≤ 3 drafts per user) ----
select lives_ok($$select public.create_organization('charity', 'Mái ấm Hoa Hồng', 'children_home', gen_random_uuid())$$,
  'second draft (charity)');
select lives_ok($$select public.create_organization('charity', 'Bếp ăn 0 đồng', 'soup_kitchen', gen_random_uuid())$$,
  'third draft');
select throws_ok($$select public.create_organization('store', 'Cửa hàng thứ tư', 'other', gen_random_uuid())$$,
  'PT409', 'invalid_state', 'fourth draft => invalid_state (draft_limit)');
select is(tests.error_of($$select public.create_organization('store', 'Cửa hàng thứ tư', 'other', gen_random_uuid())$$) ->> 'detail',
  'draft_limit', 'detail = draft_limit');
select tests.clear_auth();
select is((select count(*)::int from public.organizations where created_by = tests.id('outsider') and kind = 'charity'), 2,
  'charity drafts created');
select is((select count(*)::int from public.organizations where created_by = tests.id('outsider')), 3, 'exactly 3 drafts');

-- ---- signups_enabled = false ----
update public.app_settings set value = 'false' where key = 'signups_enabled';
select tests.authenticate_as('draft_owner');
select throws_ok($$select public.create_organization('store', 'Đóng đăng ký', 'other', gen_random_uuid())$$,
  'PT403', 'not_authorized', 'signups disabled => not_authorized');
select is(tests.error_of($$select public.create_organization('store', 'Đóng đăng ký', 'other', gen_random_uuid())$$) ->> 'detail',
  'signups_disabled', 'detail = signups_disabled');
select tests.clear_auth();

select * from finish();
rollback;

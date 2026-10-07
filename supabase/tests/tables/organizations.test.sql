-- organizations: RLS matrix (§9.2), column grants (§9.4), CHECKs, kind immutability.
begin;
\ir ../_helpers.psql

select plan(22);

select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'RLS enabled');
select policies_are('public', 'organizations',
  array['organizations_select_anon', 'organizations_select', 'organizations_update_owner_manager']);
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'organizations' and grantee = 'anon' and privilege_type = 'SELECT'$$,
  array['id', 'kind', 'name', 'slug', 'subtype', 'description', 'logo_path', 'cover_path', 'website',
        'is_demo', 'leaderboard_opt_in'],
  'anon SELECT columns = public columns only');
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'organizations' and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  array['name', 'subtype', 'description', 'logo_path', 'cover_path', 'website', 'founded_on',
        'declared_beneficiaries', 'leaderboard_opt_in'],
  'authenticated UPDATE allow-list (no status/review/trust columns)');

-- ---- SELECT ----
select tests.as_anon();
select set_eq('select id from public.organizations',
  $$values (tests.id('store_a')), (tests.id('charity_b')), (tests.id('store_x'))$$,
  'anon sees approved organizations only');

select tests.authenticate_as('outsider');
select set_eq('select id from public.organizations',
  $$values (tests.id('store_a')), (tests.id('charity_b')), (tests.id('store_x'))$$,
  'unrelated user sees approved organizations only');

select tests.authenticate_as('draft_owner');
select set_eq('select id from public.organizations',
  $$values (tests.id('store_a')), (tests.id('charity_b')), (tests.id('store_x')), (tests.id('draft_c'))$$,
  'draft owner also sees their own draft org');

select tests.authenticate_as('admin', 'aal1');
select is((select count(*)::int from public.organizations), 3, 'admin aal1 sees only approved orgs');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.organizations), 4, 'admin aal2 sees every org');

-- ---- UPDATE / INSERT / DELETE ----
select tests.authenticate_as('store_manager');
select is(tests.affected(format($$update public.organizations set description = 'Bánh mì mỗi tối' where id = %L$$, tests.id('store_a'))),
  1::bigint, 'manager updates allow-listed column of approved org');
select tests.authenticate_as('store_staff');
select is(tests.affected(format($$update public.organizations set description = 'x' where id = %L$$, tests.id('store_a'))),
  0::bigint, 'staff cannot update the org');
select tests.authenticate_as('other_owner');
select is(tests.affected(format($$update public.organizations set description = 'x' where id = %L$$, tests.id('store_a'))),
  0::bigint, 'owner of another org cannot update it');
select tests.authenticate_as('draft_owner');
select is(tests.affected(format($$update public.organizations set name = 'Tiệm Nháp' where id = %L$$, tests.id('draft_c'))),
  1::bigint, 'owner updates own draft org');
select throws_ok($$insert into public.organizations (kind, name, slug, subtype, created_by)
                   values ('store', 'Tự tạo', 'tu-tao', 'bakery', auth.uid())$$,
  '42501', null, 'no direct INSERT (create_organization RPC only)');
select throws_ok(format($$delete from public.organizations where id = %L$$, tests.id('draft_c')),
  '42501', null, 'no DELETE');
select tests.authenticate_as('admin', 'aal2');
select is(tests.affected(format($$update public.organizations set description = 'admin sửa' where id = %L$$, tests.id('charity_b'))),
  0::bigint, 'admin aal2 does not update directly (RPC only)');
select tests.clear_auth();

-- submitted org: owner cannot edit while under review
select tests.create_org('sub_d', 'charity', 'outsider', 'submitted');
select tests.authenticate_as('outsider');
select is(tests.affected(format($$update public.organizations set description = 'x' where id = %L$$, tests.id('sub_d'))),
  0::bigint, 'owner cannot edit an org while it is submitted');
select tests.clear_auth();

-- ---- invariants ----
select throws_ok(format($$update public.organizations set kind = 'charity', subtype = 'other' where id = %L$$, tests.id('store_a')),
  'PT409', 'invalid_state', 'kind is immutable even for postgres');
select throws_ok(format($$update public.organizations set status = 'rejected' where id = %L$$, tests.id('draft_c')),
  '23514', null, 'rejected requires reason + review columns (CHECK)');
select throws_ok($$insert into public.organizations (kind, name, slug, subtype, created_by)
                   values ('store', 'Sai loại', 'sai-loai', 'shelter', tests.id('outsider'))$$,
  '23514', null, 'subtype must match kind');
select throws_ok($$insert into public.organizations (kind, name, slug, subtype, created_by, declared_beneficiaries)
                   values ('store', 'Cửa hàng', 'cua-hang-1', 'bakery', tests.id('outsider'), 10)$$,
  '23514', null, 'declared_beneficiaries only for charities');
select throws_ok($$insert into public.organizations (kind, name, slug, subtype, created_by)
                   values ('store', 'Slug sai', 'Slug Sai!', 'bakery', tests.id('outsider'))$$,
  '23514', null, 'slug format CHECK');

select * from finish();
rollback;

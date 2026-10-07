-- org_sensitive: RLS (owner/manager + admin aal2), allow-list, legal-field lock (§2.1, §9.2, §9.4).
-- Read matrix per role is covered in regression/b3_public_columns.test.sql.
begin;
\ir ../_helpers.psql

select plan(14);

select ok((select relrowsecurity from pg_class where oid = 'public.org_sensitive'::regclass), 'RLS enabled');
select policies_are('public', 'org_sensitive',
  array['org_sensitive_select', 'org_sensitive_update_owner_manager']);
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'org_sensitive' and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  array['legal_name', 'tax_code', 'registration_no', 'representative_name', 'representative_title',
        'contact_email', 'contact_phone'],
  'UPDATE allow-list excludes id_verified_* and representative_id_last4');

-- ---- approved org: contact columns editable, legal columns locked ----
select tests.authenticate_as('store_owner');
select is(tests.affected(format($$update public.org_sensitive set contact_phone = '0909000111' where org_id = %L$$, tests.id('store_a'))),
  1::bigint, 'owner edits contact columns of an approved org directly');
select throws_ok(format($$update public.org_sensitive set legal_name = 'Tên pháp lý mới' where org_id = %L$$, tests.id('store_a')),
  'PT409', 'invalid_state', 'legal columns are locked while approved (use org_change_requests)');
select throws_ok(format($$update public.org_sensitive set representative_id_last4 = '9999' where org_id = %L$$, tests.id('store_a')),
  '42501', null, 'representative_id_last4 is not in the allow-list');
select throws_ok(format($$update public.org_sensitive set id_verified_at = now() where org_id = %L$$, tests.id('store_a')),
  '42501', null, 'id_verified_at is not in the allow-list (B6)');
select is(tests.affected(format($$update public.org_sensitive set contact_phone = '1' where org_id = %L$$, tests.id('store_x'))),
  0::bigint, 'owner cannot update another org''s row');

-- the bypass flag is ignored for direct client statements
select set_config('fs.org_change_apply', 'on', true);
select throws_ok(format($$update public.org_sensitive set legal_name = 'Lách luật' where org_id = %L$$, tests.id('store_a')),
  'PT409', 'invalid_state', 'fs.org_change_apply does not unlock for authenticated');
select set_config('fs.org_change_apply', '', true);

select tests.authenticate_as('store_staff');
select is(tests.affected(format($$update public.org_sensitive set contact_phone = '1' where org_id = %L$$, tests.id('store_a'))),
  0::bigint, 'staff cannot update (owner/manager only)');

select tests.authenticate_as('admin', 'aal2');
select is(tests.affected(format($$update public.org_sensitive set contact_phone = '1' where org_id = %L$$, tests.id('store_a'))),
  0::bigint, 'admin aal2 has no direct UPDATE (RPC only)');

-- ---- draft org: legal columns editable during onboarding ----
select tests.authenticate_as('draft_owner');
select is(tests.affected(format($$update public.org_sensitive set legal_name = 'Công ty Nháp', tax_code = '0312345678-001' where org_id = %L$$, tests.id('draft_c'))),
  1::bigint, 'draft owner edits legal columns');
select throws_ok(format($$update public.org_sensitive set tax_code = '123' where org_id = %L$$, tests.id('draft_c')),
  '23514', null, 'tax_code format CHECK');
select tests.clear_auth();

-- ---- definer path (review_org_change_request) can bypass the lock ----
select set_config('fs.org_change_apply', 'on', true);
select is(tests.affected(format($$update public.org_sensitive set legal_name = 'Đã duyệt đổi tên' where org_id = %L$$, tests.id('store_a'))),
  1::bigint, 'postgres with fs.org_change_apply = on can apply approved changes');

select * from finish();
rollback;

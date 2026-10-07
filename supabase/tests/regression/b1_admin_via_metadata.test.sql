-- B1 (never delete/skip): signing up with role keys in metadata must NOT produce an admin.
-- SECURITY-PRIVACY §10 B1, TESTING §4.2, DATA-MODEL §19.2.
begin;
\ir ../_helpers.psql

select plan(10);

-- Sign-up through auth.users with every role-ish key an attacker could try.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role)
values ('b1b1b1b1-0000-4000-8000-000000000001', 'Evil@Example.com',
        '{"role":"admin","platform_role":"admin","status":"approved","full_name":"Kẻ Mạo Danh"}',
        '{"role":"admin","platform_role":"admin"}',
        'authenticated', 'authenticated');
insert into tests.ids values ('evil', 'b1b1b1b1-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.profiles where id = tests.id('evil')), 1,
  'handle_new_user created exactly one profile');
select is(
  (select platform_role from public.profiles where id = tests.id('evil')), 'user'::public.platform_role,
  'metadata role/platform_role=admin still yields platform_role = user');
select is(
  (select email from public.profiles where id = tests.id('evil')), 'evil@example.com',
  'email is copied lower-cased');
select is(
  (select full_name from public.profiles where id = tests.id('evil')), 'Kẻ Mạo Danh',
  'only full_name is read from metadata');
select is(
  (select count(*)::int from public.org_members where user_id = tests.id('evil')), 0,
  'no organization membership is created from metadata');

-- Acting as that user, even with an aal2 token
select tests.authenticate_as('evil', 'aal2');
select is(private.is_admin(), false, 'is_admin() = false for the metadata "admin" (aal2)');
select is_empty('select org_id from public.org_sensitive', 'cannot read any org_sensitive row');
select is((select count(*)::int from public.profiles), 1, 'sees only their own profile');
select throws_ok(
  $$select public.grant_platform_admin(auth.uid(), 'tự cấp quyền')$$,
  'PT403', 'not_authorized', 'cannot grant themselves admin');
select tests.clear_auth();

select is(
  (select platform_role from public.profiles where id = tests.id('evil')), 'user'::public.platform_role,
  'still user after the attempts');

select * from finish();
rollback;

-- profiles: structure, RLS matrix (§9.2), column grants (§9.4), sign-up/email triggers.
begin;
\ir ../_helpers.psql

select plan(19);

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS enabled');
select policies_are('public', 'profiles', array['profiles_select', 'profiles_update_own']);
select col_default_is('public', 'profiles', 'platform_role', 'user'::text,
  'platform_role defaults to user');

-- ---- SELECT ----
select tests.as_anon();
select throws_ok('select id from public.profiles', '42501', null, 'anon: no access');

select tests.authenticate_as('outsider');
select results_eq('select id from public.profiles', $$values (tests.id('outsider'))$$,
  'unrelated user sees only their own profile');

select tests.authenticate_as('draft_owner');
select results_eq('select id from public.profiles', $$values (tests.id('draft_owner'))$$,
  'owner of a draft org (U) sees only their own profile');

select tests.authenticate_as('store_staff');
select set_eq('select id from public.profiles',
  $$values (tests.id('store_owner')), (tests.id('store_manager')), (tests.id('store_staff'))$$,
  'member of an approved org sees colleagues of that org');

select tests.authenticate_as('charity_volunteer');
select set_eq('select id from public.profiles',
  $$values (tests.id('charity_owner')), (tests.id('charity_volunteer'))$$,
  'volunteer sees colleagues of their org');

select tests.authenticate_as('admin', 'aal1');
select results_eq('select id from public.profiles', $$values (tests.id('admin'))$$,
  'admin aal1 sees only their own profile');

select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.profiles), 9, 'admin aal2 sees every profile');

-- ---- UPDATE ----
select tests.authenticate_as('outsider');
select is(tests.affected($$update public.profiles set full_name = 'Người Ngoài', locale = 'en' where id = auth.uid()$$),
  1::bigint, 'user updates allow-listed columns of own row');
select is(tests.affected(format($$update public.profiles set full_name = 'x' where id = %L$$, tests.id('store_owner'))),
  0::bigint, 'user cannot update another profile (0 rows)');
select throws_ok(format($$update public.profiles set active_org_id = %L where id = auth.uid()$$, tests.id('store_a')),
  '42501', null, 'active_org_id must be an org the user belongs to (WITH CHECK)');
select throws_ok($$delete from public.profiles where id = auth.uid()$$, '42501', null, 'no DELETE privilege');

select tests.authenticate_as('store_owner');
select is(tests.affected(format($$update public.profiles set active_org_id = %L where id = auth.uid()$$, tests.id('store_a'))),
  1::bigint, 'member can set active_org_id to their org');
select tests.clear_auth();

-- ---- triggers ----
insert into auth.users (id, email, raw_user_meta_data)
values ('a0a0a0a0-0000-4000-8000-000000000001', 'Long@Name.vn', jsonb_build_object('full_name', repeat('x', 200)));
select is((select char_length(full_name) from public.profiles where id = 'a0a0a0a0-0000-4000-8000-000000000001'),
  120, 'full_name from metadata is truncated to 120 chars');
update auth.users set email = 'New@Mail.VN' where id = 'a0a0a0a0-0000-4000-8000-000000000001';
select is((select email from public.profiles where id = 'a0a0a0a0-0000-4000-8000-000000000001'),
  'new@mail.vn', 'email change in auth.users is synced (lower-cased)');
select throws_ok($$update public.profiles set email = 'UPPER@X.VN' where id = tests.id('outsider')$$,
  '23514', null, 'email must be lower-case (CHECK)');
delete from auth.users where id = 'a0a0a0a0-0000-4000-8000-000000000001';
select is((select count(*)::int from public.profiles where id = 'a0a0a0a0-0000-4000-8000-000000000001'),
  0, 'profile is removed with its auth user (on delete cascade)');

select * from finish();
rollback;

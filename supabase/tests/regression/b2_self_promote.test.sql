-- B2 (never delete/skip): users cannot change their own platform_role nor org status/review
-- columns. Layer 1 = column allow-list grants (§9.4); layer 2 = guard_privileged_columns trigger.
-- SECURITY-PRIVACY §10 B2, TESTING §4.2.
begin;
\ir ../_helpers.psql

select plan(17);

-- ---- Layer 1: no UPDATE privilege on privileged columns ----
select tests.authenticate_as('outsider', 'aal2');
select throws_ok(
  $$update public.profiles set platform_role = 'admin' where id = auth.uid()$$,
  '42501', null, 'user cannot UPDATE own profiles.platform_role');
select throws_ok(
  $$update public.profiles set deleted_at = null, is_demo = true where id = auth.uid()$$,
  '42501', null, 'user cannot UPDATE own profiles.is_demo / deleted_at');
select is(
  tests.affected($$update public.profiles set full_name = 'Tên mới' where id = auth.uid()$$), 1::bigint,
  'user can still UPDATE an allow-listed column (full_name)');

select tests.authenticate_as('draft_owner', 'aal2');
select throws_ok(
  format($$update public.organizations set status = 'approved' where id = %L$$, tests.id('draft_c')),
  '42501', null, 'owner cannot UPDATE organizations.status');
select throws_ok(
  format($$update public.organizations set reviewed_by = auth.uid(), reviewed_at = now() where id = %L$$, tests.id('draft_c')),
  '42501', null, 'owner cannot UPDATE organizations.reviewed_by / reviewed_at');
select throws_ok(
  format($$update public.organizations set submitted_at = now() where id = %L$$, tests.id('draft_c')),
  '42501', null, 'owner cannot UPDATE organizations.submitted_at');

select tests.authenticate_as('store_owner', 'aal2');
select throws_ok(
  format($$update public.organizations set trust_score = 100, is_demo = true where id = %L$$, tests.id('store_a')),
  '42501', null, 'owner cannot UPDATE organizations.trust_score / is_demo');
select throws_ok(
  format($$update public.org_members set role = 'owner' where org_id = %L$$, tests.id('store_a')),
  '42501', null, 'member cannot UPDATE org_members.role');
select throws_ok(
  format($$insert into public.org_members (org_id, user_id, role) values (%L, %L, 'owner')$$,
         tests.id('charity_b'), tests.id('store_owner')),
  '42501', null, 'user cannot INSERT themselves into another org');
select tests.clear_auth();

select is(
  (select platform_role from public.profiles where id = tests.id('outsider')), 'user'::public.platform_role,
  'outsider is still a plain user');
select is(
  (select status from public.organizations where id = tests.id('draft_c')), 'draft'::public.org_status,
  'draft org is still draft');

-- ---- No table-level UPDATE for anon/authenticated on identity tables ----
select is_empty(
  $$select table_name from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'UPDATE'
      and table_name in ('profiles', 'organizations', 'org_sensitive', 'org_members',
                         'org_change_requests', 'org_documents', 'org_invitations', 'audit_logs',
                         'trust_events', 'consents', 'app_settings', 'sites', 'site_hours')$$,
  'no table-level UPDATE grant to anon/authenticated on identity tables');
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  array['full_name', 'phone', 'avatar_path', 'locale', 'active_org_id'],
  'profiles UPDATE allow-list is exactly the documented columns');

-- ---- Protective triggers exist and are enabled (tgenabled = 'O') ----
select is(
  (select count(*)::int from pg_trigger
   where not tgisinternal
     and tgname in ('guard_privileged_columns', 'forbid_mutation', 'org_sensitive_lock',
                    'on_auth_user_created', 'org_members_guard', 'org_members_owner_guard')),
  9, 'all protective triggers exist (3 guard, 2 forbid_mutation, lock, new-user, 2 member guards)');
select is_empty(
  $$select tgname from pg_trigger
    where not tgisinternal and tgenabled <> 'O'
      and tgname in ('guard_privileged_columns', 'forbid_mutation', 'org_sensitive_lock',
                     'on_auth_user_created', 'org_members_guard', 'org_members_owner_guard')$$,
  'no protective trigger is disabled');

-- ---- Layer 2 (last: the extra grant is rolled back): even if someone re-grants table-level UPDATE by mistake, the trigger blocks ----
grant update on public.profiles, public.organizations to authenticated;

select tests.authenticate_as('outsider', 'aal2');
select throws_ok(
  $$update public.profiles set platform_role = 'admin' where id = auth.uid()$$,
  '42501', 'not_authorized', 'guard_privileged_columns blocks platform_role even with a table grant');
select tests.authenticate_as('draft_owner', 'aal2');
select throws_ok(
  format($$update public.organizations set status = 'approved' where id = %L$$, tests.id('draft_c')),
  '42501', 'not_authorized', 'guard_privileged_columns blocks organizations.status even with a table grant');
select tests.clear_auth();

select * from finish();
rollback;

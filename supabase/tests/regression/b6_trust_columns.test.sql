-- B6 (never delete/skip): an org owner cannot edit trust/verification columns of their own org.
-- Only RPCs (apply_trust, verify_representative_id, review_organization) change them.
-- SECURITY-PRIVACY §10 B6, DATA-MODEL §9.4.
begin;
\ir ../_helpers.psql

select plan(7);

select tests.authenticate_as('store_owner');
select throws_ok(
  format($$update public.organizations set trust_score = 100 where id = %L$$, tests.id('store_a')),
  '42501', null, 'owner cannot raise trust_score directly');
select throws_ok(
  format($$update public.organizations set is_demo = true, reviewed_by = auth.uid() where id = %L$$, tests.id('store_a')),
  '42501', null, 'owner cannot change review or demo columns outside the allow-list');
select throws_ok(
  format($$update public.org_sensitive set id_verified_at = now() where org_id = %L$$, tests.id('store_a')),
  '42501', null, 'owner cannot mark the representative ID as verified');
select throws_ok(
  $$insert into public.trust_events (org_id, delta, reason) select id, 50, 'admin_adjust' from public.organizations limit 1$$,
  '42501', null, 'owner cannot write trust_events');
select tests.clear_auth();

select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'organizations'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  array['cover_path', 'declared_beneficiaries', 'description', 'founded_on', 'leaderboard_opt_in',
        'logo_path', 'name', 'subtype', 'website'],
  'organizations UPDATE allow-list has no trust/verification/status column');
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'org_sensitive'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  array['contact_email', 'contact_phone', 'legal_name', 'registration_no', 'representative_name',
        'representative_title', 'tax_code'],
  'org_sensitive UPDATE allow-list has no id_verified_* column');
select is((select trust_score from public.organizations where id = tests.id('store_a')), 50::numeric,
  'trust_score unchanged after the attempts');

select * from finish();
rollback;

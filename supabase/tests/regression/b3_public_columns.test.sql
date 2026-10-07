-- B3 (never delete/skip): sensitive org data and exact locations are not readable by anon or
-- other organizations. SECURITY-PRIVACY §10 B3, TESTING §4.2.
-- The `columns_are('public_org_cards', ...)` assertion is added together with the view in
-- migration #9 `impact` (DATA-MODEL §18).
begin;
\ir ../_helpers.psql

select plan(16);

-- ---- org_sensitive ----
select tests.as_anon();
select throws_ok('select org_id, tax_code from public.org_sensitive', '42501', null,
  'anon: org_sensitive is not readable at all');
select throws_ok('select tax_code from public.org_sensitive', '42501', null,
  'anon: tax_code (MST) is not readable');

select tests.authenticate_as('outsider', 'aal2');
select is_empty('select org_id from public.org_sensitive', 'unrelated user (aal2): 0 rows');

select tests.authenticate_as('other_owner');
select results_eq('select org_id from public.org_sensitive',
  format('values (%L::uuid)', tests.id('store_x')),
  'owner of another org sees only their own org_sensitive row');

select tests.authenticate_as('store_staff');
select is_empty('select org_id from public.org_sensitive', 'staff of the org: 0 rows (owner/manager only)');

select tests.authenticate_as('charity_volunteer');
select is_empty('select org_id from public.org_sensitive', 'volunteer of the org: 0 rows');

select tests.authenticate_as('store_owner');
select results_eq('select org_id from public.org_sensitive',
  format('values (%L::uuid)', tests.id('store_a')), 'owner reads own org_sensitive');

select tests.authenticate_as('store_manager');
select results_eq('select representative_id_last4::text from public.org_sensitive',
  $$values ('1234')$$, 'manager reads own org_sensitive');

select tests.authenticate_as('admin', 'aal1');
select is_empty('select org_id from public.org_sensitive', 'admin with aal1 (no MFA): 0 rows');

select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.org_sensitive), 4, 'admin aal2 reads every org_sensitive row');

-- ---- organizations: anon only gets public columns ----
select tests.as_anon();
select throws_ok('select status from public.organizations', '42501', null,
  'anon: organizations.status is not a public column');
select throws_ok('select created_by from public.organizations', '42501', null,
  'anon: organizations.created_by is not a public column');

-- ---- sites: exact location / address are never directly selectable ----
select throws_ok('select location from public.sites', '42501', null, 'anon: sites.location denied');
select throws_ok('select address_line from public.sites', '42501', null, 'anon: sites.address_line denied');

select tests.authenticate_as('store_owner', 'aal2');
select throws_ok('select location from public.sites', '42501', null,
  'authenticated (even own org): sites.location denied — use get_site_location');
select throws_ok('select address_line from public.sites', '42501', null,
  'authenticated: sites.address_line denied');
select tests.clear_auth();

select * from finish();
rollback;

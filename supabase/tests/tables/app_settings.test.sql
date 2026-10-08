-- app_settings: S is_public rows for anon/authenticated (key, value, description), all rows for
-- admin aal2; writes RPC only (§2.6, §9.2, §9.4). Rows come from supabase/seed/00_reference.sql.
begin;
\ir ../_helpers.psql

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.app_settings'::regclass), 'RLS enabled');
select policies_are('public', 'app_settings', array['app_settings_select_anon', 'app_settings_select']);
select is((select value from public.app_settings where key = 'request_ttl_minutes'), '120'::jsonb,
  'seeded default request_ttl_minutes = 120');

select tests.as_anon();
select set_eq('select key from public.app_settings',
  array['terms_policy_version', 'privacy_policy_version', 'public_map_enabled', 'signups_enabled',
        'service_area_bbox', 'impact_factor_version'],
  'anon reads only public keys');
select throws_ok('select is_public from public.app_settings', '42501', null, 'anon: is_public column not granted');
select throws_ok($$update public.app_settings set value = 'false' where key = 'signups_enabled'$$,
  '42501', null, 'anon cannot update settings');

select tests.authenticate_as('outsider');
select is((select count(*)::int from public.app_settings), 6, 'authenticated reads only public keys');
select tests.authenticate_as('admin', 'aal1');
select is((select count(*)::int from public.app_settings), 6, 'admin aal1 reads only public keys');
select tests.authenticate_as('admin', 'aal2');
select ok((select count(*)::int from public.app_settings) >= 30, 'admin aal2 reads every key');
select throws_ok($$update public.app_settings set value = 'false' where key = 'ai_enabled'$$,
  '42501', null, 'admin cannot update directly (set_app_setting RPC, audited)');
select tests.clear_auth();

select * from finish();
rollback;

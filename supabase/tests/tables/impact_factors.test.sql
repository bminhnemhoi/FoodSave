-- impact_factors (DATA-MODEL §2.5, ADR-009): v1 seeded with sources; everyone reads; immutable.
begin;
\ir ../_helpers.psql

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.impact_factors'::regclass), 'RLS enabled');
select policies_are('public', 'impact_factors', array['impact_factors_select']);
select results_eq(
  $$select metric, value, unit, source_page, approved_adr from public.impact_factors where version = 'v1' order by metric$$,
  $$values ('co2e_kg_per_kg', 2.0000::numeric, 'kg CO2e/kg', 'tr. 6, tr. 11', 'docs/adr/ADR-009-esg-factors.md'),
           ('kg_per_meal', 0.4200, 'kg/suất', null, 'docs/adr/ADR-009-esg-factors.md'),
           ('water_l_per_kg', 150.0000, 'L/kg', 'tr. 6, tr. 11', 'docs/adr/ADR-009-esg-factors.md')$$,
  'v1 = CO2e 2.0 (FAO tr. 6/11), water 150 L/kg (FAO tr. 6/11), 0.42 kg/meal (WRAP)');
select is((select value #>> '{}' from public.app_settings where key = 'impact_factor_version'), 'v1',
  'app_settings.impact_factor_version = v1');
select ok((select bool_and(source_url ~ '^https://' and derivation <> '') from public.impact_factors), 'every factor has a source URL and a derivation');

select tests.as_anon();
select is((select count(*)::int from public.impact_factors where version = 'v1'), 3, 'anon reads the factors (methodology page)');
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$insert into public.impact_factors (version, metric, value, unit, source_title, source_url, derivation, valid_from, approved_adr)
                   values ('v2', 'kg_per_meal', 0.4, 'kg/suất', 'x', 'https://x', 'x', current_date, 'x')$$,
  '42501', null, 'not even admin aal2 writes factors at runtime (migration + ADR)');
select tests.clear_auth();
select throws_ok($$update public.impact_factors set value = 2.5 where version = 'v1' and metric = 'co2e_kg_per_kg'$$,
  '42501', 'append_only', 'factors are immutable (UPDATE refused even for postgres)');
select throws_ok($$delete from public.impact_factors where version = 'v1'$$, '42501', 'append_only', 'factors cannot be deleted');
select throws_ok($$insert into public.impact_factors (version, metric, value, unit, source_title, source_url, derivation, valid_from, approved_adr)
                   values ('v1', 'kg_per_meal', 0.4, 'kg/suất', 'x', 'https://x', 'x', current_date, 'x')$$,
  '23505', null, 'one value per (version, metric)');

select * from finish();
rollback;

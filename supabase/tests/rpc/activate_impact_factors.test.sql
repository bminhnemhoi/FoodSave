-- activate_impact_factors (DATA-MODEL §2.5 impact_factors, §8.6, §13; ESG-METHODOLOGY §3; ADR-009;
-- SECURITY-PRIVACY C3): admin aal2 switches app_settings.impact_factor_version to a complete factor
-- version (co2e_kg_per_kg + kg_per_meal; water optional). Audited; no-op when unchanged; history
-- is never rewritten (credits keep their factor_version).
begin;
\ir ../_helpers.psql

select plan(19);

-- v2: complete without water; v3: incomplete (no kg_per_meal). Inserted by "migration" (postgres).
insert into public.impact_factors (version, metric, value, unit, source_title, source_url, derivation, valid_from, approved_adr)
values ('v2', 'co2e_kg_per_kg', 2.5, 'kg CO2e/kg', 'Nguồn thử', 'https://example.org/v2', 'fixture', current_date, 'docs/adr/ADR-test.md'),
       ('v2', 'kg_per_meal', 0.5, 'kg/suất', 'Nguồn thử', 'https://example.org/v2', 'fixture', current_date, 'docs/adr/ADR-test.md'),
       ('v3', 'co2e_kg_per_kg', 3.0, 'kg CO2e/kg', 'Nguồn thử', 'https://example.org/v3', 'fixture', current_date, 'docs/adr/ADR-test.md');

-- delivers p_qty loaves (0.12 kg) to charity_b through a self trip; returns the allocation id
create function tests.deliver(p_offer text, p_qty numeric) returns uuid language plpgsql as $$
declare
  v_a uuid;
begin
  perform tests.make_offer(p_offer, 'site_a', 'bread', 20);
  v_a := tests.request('charity_owner', tests.id(p_offer), p_qty);
  perform tests.confirm('store_staff', v_a);
  perform tests.pickup('charity_owner', array[v_a]);
  perform tests.issue('charity_owner', tests.stop_of(v_a), p_offer);
  perform tests.authenticate_as('store_staff');
  perform public.consume_handover_token(tests.var(p_offer || '_token'), tests.full_lines(tests.stop_of(v_a)), gen_random_uuid());
  perform tests.clear_auth();
  return v_a;
end;
$$;

select tests.set_var('a1', tests.deliver('o1', 5)::text);   -- credited with v1
create table tests.audit_before as select count(*) as n from public.audit_logs where action = 'settings.update';

-- ---- who ----
select tests.as_anon();
select throws_ok($$select public.activate_impact_factors('v2')$$, '42501', null, 'anon: no EXECUTE');
select tests.clear_auth();
select throws_ok($$select public.activate_impact_factors('v2')$$, 'PT401', 'not_authenticated', 'no JWT subject => not_authenticated');
select tests.authenticate_as('outsider');
select throws_ok($$select public.activate_impact_factors('v2')$$, 'PT403', 'not_authorized', 'ordinary user => not_authorized');
select tests.authenticate_as('store_owner');
select throws_ok($$select public.activate_impact_factors('v2')$$, 'PT403', 'not_authorized',
  'a store owner cannot change the factors behind its ESG numbers');
select tests.authenticate_as('admin', 'aal1');
select throws_ok($$select public.activate_impact_factors('v2')$$, 'PT403', 'mfa_required', 'admin without MFA (aal1) => mfa_required');

-- ---- validation (admin aal2) ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.activate_impact_factors(null)$$, 'PT422', 'validation_failed', 'NULL version => validation_failed');
select throws_ok($$select public.activate_impact_factors('v99')$$, 'PT422', 'validation_failed', 'unknown version => validation_failed');
select is((tests.error_of($$select public.activate_impact_factors('v3')$$) ->> 'detail')::jsonb,
  '{"p_version":"unknown or missing co2e_kg_per_kg / kg_per_meal"}'::jsonb, 'version without kg_per_meal => validation_failed');
select tests.clear_auth();
select results_eq($$select value #>> '{}', updated_by from public.app_settings where key = 'impact_factor_version'$$,
  $$values ('v1', null::uuid)$$, 'refused calls leave v1 active');
select tests.authenticate_as('admin', 'aal2');
select lives_ok($$select public.activate_impact_factors('v1')$$, 'activating the active version is accepted');
select tests.clear_auth();
select results_eq($$select (select value #>> '{}' from public.app_settings where key = 'impact_factor_version'),
                           (select updated_by from public.app_settings where key = 'impact_factor_version'),
                           (select count(*) from public.audit_logs where action = 'settings.update') - (select n from tests.audit_before)$$,
  $$values ('v1', null::uuid, 0::bigint)$$, '... as a no-op (no write, no audit)');

-- ---- switch to v2 ----
select tests.authenticate_as('admin', 'aal2');
select lives_ok($$select public.activate_impact_factors('v2')$$, 'admin aal2 activates v2');
select tests.clear_auth();
select results_eq($$select value, updated_by from public.app_settings where key = 'impact_factor_version'$$,
  format($$values ('"v2"'::jsonb, %L::uuid)$$, tests.id('admin')), 'single setting row now v2, updated_by the admin');
select results_eq($$select actor_id, actor_kind, entity_type, before, after from public.audit_logs where action = 'settings.update'
                    order by id desc limit 1$$,
  format($$values (%L::uuid, 'admin', 'app_setting', '{"key": "impact_factor_version", "value": "v1"}'::jsonb,
                   '{"key": "impact_factor_version", "value": "v2"}'::jsonb)$$, tests.id('admin')),
  'audited settings.update v1 -> v2 by the admin');
select tests.set_var('a2', tests.deliver('o2', 5)::text);   -- credited with v2
select results_eq($$select kg, co2e_kg, water_l, meals, factor_version from public.impact_ledger where allocation_id = tests.var('a2')::uuid$$,
  $$values (0.600::numeric, 1.500::numeric, null::numeric, 1.20::numeric, 'v2')$$,
  'the next credit uses v2 at once: CO2e ×2.5, no water factor => water_l null, meals ÷0.5');
select results_eq($$select kg, co2e_kg, water_l, meals, factor_version from public.impact_ledger where allocation_id = tests.var('a1')::uuid$$,
  $$values (0.600::numeric, 1.200::numeric, 90.00::numeric, 1.43::numeric, 'v1')$$,
  'earlier credits are not rewritten (still v1)');
select tests.authenticate_as('admin', 'aal1');
select throws_ok($$select public.activate_impact_factors('v1')$$, 'PT403', 'mfa_required', 'switching back also needs aal2');
select tests.authenticate_as('admin', 'aal2');
select lives_ok($$select public.activate_impact_factors('v1')$$, 'admin aal2 switches back to v1');
select tests.clear_auth();
select results_eq($$select (select value #>> '{}' from public.app_settings where key = 'impact_factor_version'),
                           (select count(*) from public.audit_logs where action = 'settings.update') - (select n from tests.audit_before)$$,
  $$values ('v1', 2::bigint)$$, 'v1 active again; two audited switches');

select * from finish();
rollback;

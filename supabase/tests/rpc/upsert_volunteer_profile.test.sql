-- upsert_volunteer_profile (DATA-MODEL §2.1, §8.2; PRD US-VOL-01 AC2, US-CHA-15; ROADMAP P3-08)
begin;
\ir ../_helpers.psql

select plan(18);

select tests.as_anon();
select throws_ok($$select public.upsert_volunteer_profile('{"vehicle":"car"}')$$, '42501', null, 'anon: no EXECUTE');

select tests.authenticate_as('charity_volunteer');
select throws_ok($$select public.upsert_volunteer_profile(null)$$, 'PT422', 'validation_failed', 'NULL payload refused');
select is((tests.error_of($$select public.upsert_volunteer_profile('{"vehicle":"rocket","capacity_kg":0,"lat":10.7,"home_address":"x"}')$$) ->> 'detail')::jsonb,
  '{"unknown_keys":["home_address"]}'::jsonb, 'unknown keys refused first (never store a home address)');
select is((tests.error_of($$select public.upsert_volunteer_profile('{"vehicle":"rocket","capacity_kg":0,"lat":10.7}')$$) ->> 'detail')::jsonb,
  '{"vehicle":"motorbike|bicycle|car|on_foot","capacity_kg":"1-500","location":"lat and lng numbers required together"}'::jsonb,
  'every field error at once');
select is((tests.error_of($$select public.upsert_volunteer_profile('{"lat":21.03,"lng":105.85}')$$) ->> 'detail')::jsonb,
  '{"location":"out_of_service_area"}'::jsonb, 'area outside the service bbox refused');
select is((tests.error_of($$select public.upsert_volunteer_profile('{"capacity_kg":"20"}')$$) ->> 'detail')::jsonb,
  '{"capacity_kg":"1-500"}'::jsonb, 'capacity must be a JSON number');
select is((tests.error_of(format($$select public.upsert_volunteer_profile('{"base_area_label":"%s"}')$$, repeat('x', 121))) ->> 'detail')::jsonb,
  '{"base_area_label":"≤ 120 chars or null"}'::jsonb, 'label ≤ 120');

select lives_ok($$select public.upsert_volunteer_profile('{"vehicle":"bicycle","capacity_kg":15.55,"lat":10.77649,"lng":106.69312,
                                                           "base_area_label":"  Phường Bàn Cờ ","availability_note":"Tối thứ 2–6"}')$$,
  'volunteer creates the profile');
select results_eq($$select vehicle::text, capacity_kg, extensions.st_y(base_area::extensions.geometry), extensions.st_x(base_area::extensions.geometry),
                           base_area_label, availability_note from public.volunteer_profiles$$,
  $$values ('bicycle', 15.6::numeric, 10.78::float8, 106.69::float8, 'Phường Bàn Cờ', 'Tối thứ 2–6')$$,
  'stored: area snapped to 0.01°, label trimmed, capacity to 0.1 kg');
select lives_ok($$select public.upsert_volunteer_profile('{"capacity_kg":30}')$$, 'partial update keeps other fields');
select results_eq($$select vehicle::text, capacity_kg, base_area is not null from public.volunteer_profiles$$,
  $$values ('bicycle', 30.0::numeric, true)$$, 'only capacity changed');
select lives_ok($$select public.upsert_volunteer_profile('{"lat":null,"lng":null,"base_area_label":null}')$$, 'area cleared');
select results_eq($$select base_area is null, base_area_label from public.volunteer_profiles$$,
  $$values (true, null::text)$$, 'lat/lng null clears the area');
select lives_ok($$select public.upsert_volunteer_profile('{"capacity_kg":30}')$$, 'same call twice is harmless (idempotent by construction)');
select tests.clear_auth();

select is((select count(*)::int from public.volunteer_profiles where user_id = tests.id('charity_volunteer')), 1, 'one row per user');
select results_eq(format($$select action, after -> 'keys' from public.audit_logs where entity_id = %L order by id limit 2$$, tests.id('charity_volunteer')),
  $$values ('volunteer_profile.create', '["availability_note","base_area_label","capacity_kg","lat","lng","vehicle"]'::jsonb),
           ('volunteer_profile.update', '["capacity_kg"]'::jsonb)$$,
  'audited with keys only');
select ok(not exists (select 1 from public.audit_logs where entity_id = tests.id('charity_volunteer') and after::text ~ '10\.7|106\.6'),
  'no coordinate in audit_logs');

-- any authenticated user may keep a profile for themselves only
select tests.authenticate_as('outsider');
select lives_ok($$select public.upsert_volunteer_profile('{}')$$, 'empty payload creates a default profile for the caller');
select tests.clear_auth();

select * from finish();
rollback;

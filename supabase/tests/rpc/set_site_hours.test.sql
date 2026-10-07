-- set_site_hours (DATA-MODEL §2.1 site_hours, §4.2, P1-06): owner / scoped manager; replace all;
-- HH:MM format; closes_next_day rule; no overlap (overnight and Saturday→Sunday wrap); [] = 24/7.
begin;
\ir ../_helpers.psql

select plan(21);

select tests.as_anon();
select throws_ok(format($$select public.set_site_hours(%L, '[]')$$, tests.id('site_a')), '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.set_site_hours(%L, '[]')$$, tests.id('site_a')), 'PT404', 'not_found', 'unrelated user');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.set_site_hours(%L, '[]')$$, tests.id('site_a')), 'PT403', 'not_authorized', 'staff');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.set_site_hours(%L, '[]')$$, tests.id('site_a')), 'PT404', 'not_found', 'other org owner');

-- ---- happy path (Mon split shift, Sat overnight) ----
select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.set_site_hours(%L, '[
  {"dow":1,"opens":"08:00","closes":"12:00"},
  {"dow":1,"opens":"12:00","closes":"21:00"},
  {"dow":6,"opens":"18:00","closes":"02:00","closes_next_day":true},
  {"dow":0,"opens":"02:00","closes":"10:00"}
]')$$, tests.id('site_a')), 'owner sets hours (touching intervals and Sat overnight ending when Sun opens)');
select tests.clear_auth();
select results_eq(
  $$select dow, opens, closes, closes_next_day from public.site_hours where site_id = tests.id('site_a') order by dow, opens$$,
  $$values (0::smallint, '02:00'::time, '10:00'::time, false), (1::smallint, '08:00'::time, '12:00'::time, false),
           (1::smallint, '12:00'::time, '21:00'::time, false), (6::smallint, '18:00'::time, '02:00'::time, true)$$,
  'hours stored');
select is(public.site_close_at(tests.id('site_a'), '2026-10-10 20:00:00+07'),  -- Saturday
  '2026-10-11 02:00:00+07'::timestamptz, 'site_close_at sees the overnight interval');
select results_eq(
  $$select action, jsonb_array_length(after -> 'hours') from public.audit_logs where action = 'site.set_hours'$$,
  $$values ('site.set_hours'::text, 4)$$, 'audited with the normalised hours');

-- ---- validation ----
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.set_site_hours(%L, '[{"dow":2,"opens":"08:00","closes":"12:00"},{"dow":2,"opens":"11:00","closes":"14:00"}]')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'same-day overlap');
select is(tests.error_of(format($$select public.set_site_hours(%L, '[{"dow":2,"opens":"18:00","closes":"02:00","closes_next_day":true},{"dow":3,"opens":"01:00","closes":"05:00"}]')$$, tests.id('site_a'))) ->> 'detail',
  '{"p_hours":"overlap"}', 'overnight interval overlapping the next morning');
select throws_ok(format($$select public.set_site_hours(%L, '[{"dow":6,"opens":"22:00","closes":"03:00","closes_next_day":true},{"dow":0,"opens":"02:00","closes":"06:00"}]')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'Saturday overnight overlapping Sunday (week wrap)');
select throws_ok(format($$select public.set_site_hours(%L, '[{"dow":2,"opens":"21:00","closes":"02:00"}]')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'closes before opens without closes_next_day');
select throws_ok(format($$select public.set_site_hours(%L, '[{"dow":2,"opens":"08:00","closes":"12:00","closes_next_day":true}]')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'closes_next_day with closes after opens (> 24 h)');
select throws_ok(format($$select public.set_site_hours(%L, '[{"dow":7,"opens":"08:00","closes":"12:00"}]')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'dow 7');
select throws_ok(format($$select public.set_site_hours(%L, '[{"dow":2,"opens":"8h","closes":"12:00"}]')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'bad time format');
select throws_ok(format($$select public.set_site_hours(%L, '[{"dow":2,"opens":"08:00","closes":"12:00","note":"x"}]')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'unknown key');
select throws_ok(format($$select public.set_site_hours(%L, '{"dow":2}')$$, tests.id('site_a')),
  'PT422', 'validation_failed', 'must be an array');
select tests.clear_auth();
select is((select count(*)::int from public.site_hours where site_id = tests.id('site_a')), 4, 'failed calls changed nothing');

-- ---- 24/7 and midnight close ----
select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.set_site_hours(%L, '[{"dow":5,"opens":"18:00","closes":"00:00","closes_next_day":true}]')$$, tests.id('site_a')),
  'closing at midnight uses closes_next_day');
select lives_ok(format($$select public.set_site_hours(%L, '[]')$$, tests.id('site_a')), 'empty list = 24/7');
select tests.clear_auth();
select is((select count(*)::int from public.site_hours where site_id = tests.id('site_a')), 0, 'all intervals removed');

select * from finish();
rollback;

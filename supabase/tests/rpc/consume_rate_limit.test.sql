-- consume_rate_limit (service_role only, never raises for exceed) and private.check_rate_limit (PT429,
-- hint = seconds). Fixed windows aligned to 2000-01-01 00:00 +07 (DATA-MODEL §15, SECURITY-PRIVACY C11).
begin;
\ir ../_helpers.psql

select plan(19);

-- ---- privileges ----
select tests.as_anon();
select throws_ok($$select public.consume_rate_limit('auth_signup:ip:abc', 2, '1 hour')$$,
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok($$select public.consume_rate_limit('auth_signup:ip:abc', 2, '1 hour')$$,
  '42501', null, 'authenticated has no EXECUTE');
select throws_ok($$select private.check_rate_limit('x:user:abc', 2, '1 hour')$$,
  '42501', null, 'authenticated cannot call private.check_rate_limit');
select tests.clear_auth();

-- ---- limit 2 per minute (clock pinned with fs.clock; session_user is postgres) ----
select set_config('fs.clock', '2026-10-08 10:00:10+07', true);
select tests.as_service();
select is(public.consume_rate_limit('auth_signup:ip:9f86d081884c7d65', 2, '1 minute'), true, '1st call allowed');
select is(public.consume_rate_limit('auth_signup:ip:9f86d081884c7d65', 2, '1 minute'), true, '2nd call allowed');
select is(public.consume_rate_limit('auth_signup:ip:9f86d081884c7d65', 2, '1 minute'), false, '3rd call over limit 2 => false');
select is(public.consume_rate_limit('auth_signup:ip:9f86d081884c7d65', 2, '1 minute'), false, 'still false in the same window');
select is(public.consume_rate_limit('auth_email:email:Zm9vQGJhci5jb20', 2, '1 minute'), true, 'other key is independent');
select tests.clear_auth();

select set_config('fs.clock', '2026-10-08 10:01:05+07', true);
select tests.as_service();
select is(public.consume_rate_limit('auth_signup:ip:9f86d081884c7d65', 2, '1 minute'), true,
  'next window (rollover) => allowed again');
select tests.clear_auth();
select is((select count(*)::int from public.rate_limits where key = 'auth_signup:ip:9f86d081884c7d65'), 2,
  'one row per window');
select is((select min(window_start) from public.rate_limits where key = 'auth_signup:ip:9f86d081884c7d65'),
  '2026-10-08 10:00:00+07'::timestamptz, 'window_start = date_bin of the call');

-- daily windows reset at Vietnam midnight
select set_config('fs.clock', '2026-10-08 23:30:00+07', true);
select is(public.consume_rate_limit('export_my_data:user:u1', 3, '1 day'), true, 'daily window call');
select is((select window_start from public.rate_limits where key = 'export_my_data:user:u1'),
  '2026-10-08 00:00:00+07'::timestamptz, '1-day window starts at 00:00 Asia/Ho_Chi_Minh');

-- ---- validation ----
select tests.as_service();
select throws_ok($$select public.consume_rate_limit('auth_email:email:a@b.com', 2, '1 hour')$$,
  'PT422', 'validation_failed', 'raw email in the key is rejected (must be hashed)');
select throws_ok($$select public.consume_rate_limit('auth_signup:ip:abc', 0, '1 hour')$$,
  'PT422', 'validation_failed', 'limit must be >= 1');
select throws_ok($$select public.consume_rate_limit('auth_signup:ip:abc', 2, '2 days')$$,
  'PT422', 'validation_failed', 'window must be <= 1 day');
select tests.clear_auth();

-- ---- private.check_rate_limit raises PT429 with hint = seconds until reset ----
select set_config('fs.clock', '2026-10-08 10:00:10+07', true);
select lives_ok($$select private.check_rate_limit('publish_offer:org:o1', 1, '1 hour')$$, 'first call passes');
select is(tests.error_of($$select private.check_rate_limit('publish_offer:org:o1', 1, '1 hour')$$),
  '{"sqlstate":"PT429","message":"rate_limited","detail":null,"hint":"3590"}'::jsonb,
  'second call => PT429 rate_limited, hint = 3590 s until 11:00');
select is((select count from public.rate_limits where key = 'publish_offer:org:o1'), 1,
  'the rejected call is rolled back (counter stays at the limit)');

select * from finish();
rollback;

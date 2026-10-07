-- site_close_at / private.is_open_at (DATA-MODEL §4.2, §8.1). All calendar maths in
-- Asia/Ho_Chi_Minh. Calendar used: 2026-10-08 = Thursday, 2026-10-09 = Friday,
-- 2026-10-10 = Saturday, 2026-10-12 = Monday.
begin;
\ir ../_helpers.psql

select plan(24);

-- Fixtures:
--   site_a (store)  : every day 07:00–21:00, closed on 2026-10-10
--   site_b (charity): every day 18:00–02:00 (closes_next_day)
--   site_x (store)  : Mon–Fri 08:00–17:00
--   site_c          : no hours => 24/7, closed on 2026-10-10
insert into public.site_hours (site_id, dow, opens, closes, closes_next_day)
select tests.id('site_a'), d, '07:00'::time, '21:00'::time, false from generate_series(0, 6) d
union all
select tests.id('site_b'), d, '18:00'::time, '02:00'::time, true from generate_series(0, 6) d
union all
select tests.id('site_x'), d, '08:00'::time, '17:00'::time, false from generate_series(1, 5) d;
insert into public.site_closures (site_id, closed_on, reason) values
  (tests.id('site_a'), '2026-10-10', 'Nghỉ sửa chữa'),
  (tests.id('site_c'), '2026-10-10', 'Nghỉ');

select is(extract(dow from date '2026-10-08')::int, 4, 'calendar check: 2026-10-08 is a Thursday');

-- ---- site_close_at ----
select is(public.site_close_at(tests.id('site_a'), '2026-10-08 15:00+07'),
  '2026-10-08 21:00+07'::timestamptz, 'shop closing 21:00 => close time 21:00 the same day');
select is(least('2026-10-09 00:00+07'::timestamptz, public.site_close_at(tests.id('site_a'), '2026-10-08 15:00+07')),
  '2026-10-08 21:00+07'::timestamptz, 'bread expiring 24:00 at a shop closing 21:00 => effective deadline 21:00');
select is(public.site_close_at(tests.id('site_a'), '2026-10-08 06:00+07'),
  '2026-10-08 21:00+07'::timestamptz, 'before opening => that day''s closing time');
select is(public.site_close_at(tests.id('site_a'), '2026-10-08 21:00+07'),
  '2026-10-09 21:00+07'::timestamptz, 'exactly at closing => next day (strictly after p_at)');
set local timezone to 'America/New_York';
select is(public.site_close_at(tests.id('site_a'), '2026-10-08 15:00+07'),
  '2026-10-08 14:00+00'::timestamptz, 'session time zone does not matter (hours are Asia/Ho_Chi_Minh)');
set local timezone to 'UTC';
select is(public.site_close_at(tests.id('site_a'), '2026-10-10 10:00+07'),
  '2026-10-11 21:00+07'::timestamptz, 'closure date is skipped');
select is(public.site_close_at(tests.id('site_a'), '2026-10-09 22:00+07'),
  '2026-10-11 21:00+07'::timestamptz, 'evening before a closure date jumps over it');
select is(public.site_close_at(tests.id('site_b'), '2026-10-08 20:00+07'),
  '2026-10-09 02:00+07'::timestamptz, 'closes_next_day: 18:00–02:00 => 02:00 next day');
select is(public.site_close_at(tests.id('site_b'), '2026-10-09 01:00+07'),
  '2026-10-09 02:00+07'::timestamptz, 'after midnight inside the overnight interval => 02:00 today');
select is(public.site_close_at(tests.id('site_b'), '2026-10-09 03:00+07'),
  '2026-10-10 02:00+07'::timestamptz, 'after the overnight close => next night''s 02:00');
select is(public.site_close_at(tests.id('site_x'), '2026-10-09 18:00+07'),
  '2026-10-12 17:00+07'::timestamptz, 'Friday evening of a Mon–Fri shop => Monday 17:00');
select is(public.site_close_at(tests.id('site_c'), '2026-10-08 15:00+07'),
  null::timestamptz, 'no hours declared (24/7) => null');
select is(least('2026-10-09 00:00+07'::timestamptz, public.site_close_at(tests.id('site_c'), '2026-10-08 15:00+07')),
  '2026-10-09 00:00+07'::timestamptz, 'least() ignores the null of a 24/7 site');

-- ---- private.is_open_at ----
select is(private.is_open_at(tests.id('site_a'), '2026-10-08 15:00+07'), true, 'open at 15:00');
select is(private.is_open_at(tests.id('site_a'), '2026-10-08 21:00+07'), false, 'closed exactly at 21:00');
select is(private.is_open_at(tests.id('site_a'), '2026-10-10 10:00+07'), false, 'closed on a closure date');
select is(private.is_open_at(tests.id('site_b'), '2026-10-09 01:00+07'), true, 'open at 01:00 inside an overnight interval');
select is(private.is_open_at(tests.id('site_b'), '2026-10-09 03:00+07'), false, 'closed at 03:00');
select is(private.is_open_at(tests.id('site_c'), '2026-10-08 03:00+07'), true, '24/7 site is open at night');
select is(private.is_open_at(tests.id('site_c'), '2026-10-10 03:00+07'), false, '24/7 site is closed on its closure date');

-- ---- privileges ----
select tests.as_anon();
select throws_ok($$select public.site_close_at(tests.id('site_a'), now())$$, '42501', null,
  'anon cannot execute site_close_at');
select tests.authenticate_as('outsider');
select lives_ok($$select public.site_close_at(tests.id('site_a'), now())$$,
  'authenticated can execute site_close_at');
select throws_ok($$select private.is_open_at(tests.id('site_a'), now())$$, '42501', null,
  'authenticated cannot execute private.is_open_at');
select tests.clear_auth();

select * from finish();
rollback;

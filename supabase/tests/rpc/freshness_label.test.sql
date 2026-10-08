-- freshness_label / effective_deadline / date-only expiry (DATA-MODEL §4.2, §4.3, §8.1; ADR-005;
-- PRD US-STO-09). The `fixtures` jsonb below is a VERBATIM copy of src/core/labels/fixtures.json —
-- the same cases run in Vitest (src/core/labels/labels.test.ts). When the fixture changes, paste the
-- new file content here (the last assertion checks the fixture version this copy was taken from).
begin;
\ir ../_helpers.psql

create temp table fixture as select $json$
{
  "$comment": "Fixture dùng CHUNG cho src/core/labels (Vitest) và public.freshness_label (pgTAP). label_rules version 1. Đổi ngưỡng = migration mới + sửa file này.",
  "version": 1,
  "freshness": [
    {
      "name": "cooked: còn 13h là Xanh",
      "perishability": "cooked",
      "deadline": "2026-10-20T23:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "green"
    },
    {
      "name": "cooked: đúng 12h là Vàng",
      "perishability": "cooked",
      "deadline": "2026-10-20T22:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "yellow"
    },
    {
      "name": "cooked: đúng 4h là Vàng",
      "perishability": "cooked",
      "deadline": "2026-10-20T14:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "yellow"
    },
    {
      "name": "cooked: 3h59 là Đỏ",
      "perishability": "cooked",
      "deadline": "2026-10-20T13:59:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "red"
    },
    {
      "name": "cooked: đúng hạn là Hết hạn",
      "perishability": "cooked",
      "deadline": "2026-10-20T10:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "expired"
    },
    {
      "name": "fresh: còn 73h là Xanh",
      "perishability": "fresh",
      "deadline": "2026-10-23T11:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "green"
    },
    {
      "name": "fresh: đúng 72h là Vàng",
      "perishability": "fresh",
      "deadline": "2026-10-23T10:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "yellow"
    },
    {
      "name": "fresh: đúng 24h là Vàng",
      "perishability": "fresh",
      "deadline": "2026-10-21T10:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "yellow"
    },
    {
      "name": "fresh: 23h là Đỏ",
      "perishability": "fresh",
      "deadline": "2026-10-21T09:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "red"
    },
    {
      "name": "packaged: còn 8 ngày là Xanh",
      "perishability": "packaged",
      "deadline": "2026-10-28T10:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "green"
    },
    {
      "name": "packaged: đúng 7 ngày là Vàng",
      "perishability": "packaged",
      "deadline": "2026-10-27T10:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "yellow"
    },
    {
      "name": "packaged: đúng 3 ngày là Vàng",
      "perishability": "packaged",
      "deadline": "2026-10-23T10:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "yellow"
    },
    {
      "name": "packaged: 2 ngày 23h là Đỏ",
      "perishability": "packaged",
      "deadline": "2026-10-23T09:00:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "red"
    },
    {
      "name": "packaged: quá hạn 1 phút là Hết hạn",
      "perishability": "packaged",
      "deadline": "2026-10-20T09:59:00+07:00",
      "at": "2026-10-20T10:00:00+07:00",
      "expected": "expired"
    }
  ],
  "effectiveDeadline": [
    {
      "name": "Bánh hết hạn 24:00, cửa hàng đóng 21:00 ⇒ hạn hiệu lực 21:00, Đỏ từ 17:00",
      "expiresAt": "2026-10-21T00:00:00+07:00",
      "pickupWindowEnd": "2026-10-20T21:00:00+07:00",
      "siteCloseAt": "2026-10-20T21:00:00+07:00",
      "expected": "2026-10-20T21:00:00+07:00",
      "perishability": "cooked",
      "redFrom": "2026-10-20T17:00:00+07:00"
    },
    {
      "name": "Cửa hàng 24/7 (không có giờ đóng) ⇒ min(hết hạn, cuối khung lấy)",
      "expiresAt": "2026-10-21T08:00:00+07:00",
      "pickupWindowEnd": "2026-10-20T22:00:00+07:00",
      "siteCloseAt": null,
      "expected": "2026-10-20T22:00:00+07:00"
    }
  ],
  "dateOnly": [{ "date": "2026-10-20", "expected": "2026-10-20T23:59:00+07:00" }]
}
$json$::jsonb as j;
grant select on fixture to anon, authenticated;

select plan(
  (select jsonb_array_length(j -> 'freshness') from fixture)        -- label cases
  + (select jsonb_array_length(j -> 'effectiveDeadline') from fixture) -- least() cases
  + 2                                                                  -- red-from boundary (case 1)
  + (select jsonb_array_length(j -> 'dateOnly') from fixture) * 2      -- date-only (function + parser)
  + 12);

-- ---- 1. freshness fixture parity (SQL = TS) ----
select is(public.freshness_label((c ->> 'deadline')::timestamptz, (c ->> 'perishability')::public.perishability,
                                 (c ->> 'at')::timestamptz),
          (c ->> 'expected')::public.freshness_label,
          'fixture: ' || (c ->> 'name'))
from fixture, jsonb_array_elements(j -> 'freshness') c;

-- ---- 2. effective_deadline fixture: least(expires_at, window end, site_close_at) ----
-- site_a: 06:00–21:00 every day => site_close_at = 21:00 (case 1); site_x: no hours => 24/7 (case 2).
insert into public.site_hours (site_id, dow, opens, closes, closes_next_day)
select tests.id('site_a'), d, '06:00'::time, '21:00'::time, false from generate_series(0, 6) d;

select is(
  least((c ->> 'expiresAt')::timestamptz, (c ->> 'pickupWindowEnd')::timestamptz,
        public.site_close_at(case when c ->> 'siteCloseAt' is null then tests.id('site_x') else tests.id('site_a') end,
                             '2026-10-20 15:00+07')),
  (c ->> 'expected')::timestamptz,
  'fixture: ' || (c ->> 'name'))
from fixture, jsonb_array_elements(j -> 'effectiveDeadline') c;

select is(public.freshness_label((c ->> 'expected')::timestamptz, 'cooked', (c ->> 'redFrom')::timestamptz - interval '1 minute'),
          'yellow'::public.freshness_label, 'fixture: one minute before redFrom (16:59) is still yellow')
from fixture, jsonb_array_elements(j -> 'effectiveDeadline') c where c ? 'redFrom';
select is(public.freshness_label((c ->> 'expected')::timestamptz, 'cooked', (c ->> 'redFrom')::timestamptz + interval '1 minute'),
          'red'::public.freshness_label, 'fixture: one minute after redFrom (17:01) is red')
from fixture, jsonb_array_elements(j -> 'effectiveDeadline') c where c ? 'redFrom';

-- ---- 3. date-only expiry = 23:59 Asia/Ho_Chi_Minh ----
select is(private.date_only_expiry((c ->> 'date')::date), (c ->> 'expected')::timestamptz,
          'fixture: date-only ' || (c ->> 'date') || ' => 23:59 VN')
from fixture, jsonb_array_elements(j -> 'dateOnly') c;
select is((select p.expires_at from private.parse_expiry(jsonb_build_object('date', c ->> 'date')) p),
          (c ->> 'expected')::timestamptz, 'parse_expiry {date} => 23:59 VN')
from fixture, jsonb_array_elements(j -> 'dateOnly') c;

-- ---- 4. other properties ----
select ok((select provolatile = 'i' and proparallel = 's' from pg_proc
           where oid = 'public.freshness_label(timestamptz, public.perishability, timestamptz)'::regprocedure),
  'freshness_label is immutable and parallel safe');
select is(public.freshness_label(null, 'cooked', now()), null, 'null deadline => null');
set local timezone to 'America/New_York';
select is(public.freshness_label('2026-10-20 13:59+07', 'cooked', '2026-10-20 10:00+07'),
  'red'::public.freshness_label, 'session time zone does not matter');
select is(private.date_only_expiry('2026-10-20'), '2026-10-20 23:59+07'::timestamptz,
  'date-only expiry ignores the session time zone');
set local timezone to 'UTC';
select is((select p.expires_at from private.parse_expiry('{"datetime":"2026-10-20T21:00:00"}') p), null,
  'datetime without an offset is rejected (client never sends local time)');
select is((select p.is_date_only from private.parse_expiry('{"datetime":"2026-10-20T21:00:00+07:00"}') p), false,
  'datetime with offset accepted, not date-only');
select is((select p.expires_at from private.parse_expiry('{"date":"2026-02-30"}') p), null, 'invalid date rejected');

-- label_rules v1 rows match the hard-coded thresholds
select results_eq(
  $$select perishability::text, green_above, red_below from public.label_rules where version = 1 order by perishability$$,
  $$values ('cooked', interval '12 hours', interval '4 hours'),
           ('fresh', interval '72 hours', interval '24 hours'),
           ('packaged', interval '7 days', interval '3 days')$$,
  'label_rules v1 documents the thresholds hard-coded in freshness_label');
select is((select j ->> 'version' from fixture), '1', 'this copy is fixture version 1 (= label_rules version)');

-- ---- 5. PRD US-STO-09 AC1 through publish_offer: bread expiring 24:00, shop closing 21:00, published 15:00 ----
select tests.set_clock('2026-10-20 15:00+07');
select tests.make_offer('bread_2400', 'site_a', 'bread', 10, '2026-10-20 15:00+07', '2026-10-20 21:00+07',
                        '2026-10-21 00:00+07', 'draft');
select tests.authenticate_as('store_staff');
select is(public.publish_offer(tests.id('bread_2400'), true, gen_random_uuid()),
  '{"label": "yellow", "effective_deadline": "2026-10-20T14:00:00+00:00"}'::jsonb,
  'publish at 15:00: effective deadline 21:00 (closing), label Vàng (6 h left)');
select tests.clear_auth();
select is(public.freshness_label(o.effective_deadline, 'cooked', '2026-10-20 17:01+07'), 'red'::public.freshness_label,
  'the same lot is Đỏ from 17:00 (not 20:00)')
from public.offers o where o.id = tests.id('bread_2400');

-- closes_next_day: 18:00–02:00 => a window until 02:00 gives a deadline at 02:00 next day
delete from public.site_hours where site_id = tests.id('site_a');
insert into public.site_hours (site_id, dow, opens, closes, closes_next_day)
select tests.id('site_a'), d, '18:00'::time, '02:00'::time, true from generate_series(0, 6) d;
select tests.make_offer('late_night', 'site_a', 'bread', 10, '2026-10-20 20:00+07', '2026-10-21 02:00+07',
                        '2026-10-21 12:00+07', 'draft');
select tests.set_clock('2026-10-20 20:00+07');
select tests.authenticate_as('store_staff');
select is((public.publish_offer(tests.id('late_night'), true, gen_random_uuid()) ->> 'effective_deadline')::timestamptz,
  '2026-10-21 02:00+07'::timestamptz, 'overnight hours: effective deadline 02:00 the next day');
select tests.clear_auth();
select tests.clear_clock();

select * from finish();
rollback;

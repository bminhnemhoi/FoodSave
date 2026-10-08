-- private.pre_score (ADR-007 §2; DATA-MODEL §8.4 match_candidates; ROADMAP P3-02/P3-03). The `fixtures`
-- jsonb below is a VERBATIM copy of the "preScore" array of src/core/matching/fixtures.json, so the SQL
-- pre_score and the TypeScript preScore() are locked to the same expected values.
begin;

select plan(9);

create temporary table fx as
select x.value as c from jsonb_array_elements($fx$[
  {
    "name": "cooked còn 6 giờ, cách 2/5 km, uy tín 80",
    "perishability": "cooked",
    "at": "2026-10-20T10:00:00+07:00",
    "effective_deadline": "2026-10-20T16:00:00+07:00",
    "distance_km": 2,
    "radius_km": 5,
    "trust_score": 80,
    "expected": {
      "urgency": 0.5,
      "proximity": 0.6,
      "trust": 0.8,
      "pre_score": 0.46
    }
  },
  {
    "name": "fresh còn 18 giờ, ngay tại điểm nhận, uy tín 50",
    "perishability": "fresh",
    "at": "2026-10-20T10:00:00+07:00",
    "effective_deadline": "2026-10-21T04:00:00+07:00",
    "distance_km": 0,
    "radius_km": 10,
    "trust_score": 50,
    "expected": {
      "urgency": 0.75,
      "proximity": 1,
      "trust": 0.5,
      "pre_score": 0.65
    }
  },
  {
    "name": "packaged còn 10 ngày (quá ngưỡng Xanh ⇒ độ gấp 0), đúng biên bán kính",
    "perishability": "packaged",
    "at": "2026-10-20T10:00:00+07:00",
    "effective_deadline": "2026-10-30T10:00:00+07:00",
    "distance_km": 3,
    "radius_km": 3,
    "trust_score": 100,
    "expected": {
      "urgency": 0,
      "proximity": 0,
      "trust": 1,
      "pre_score": 0.1
    }
  },
  {
    "name": "fresh đúng 72 giờ ⇒ độ gấp 0; ngoài bán kính ⇒ gần 0 (kẹp)",
    "perishability": "fresh",
    "at": "2026-10-20T10:00:00+07:00",
    "effective_deadline": "2026-10-23T10:00:00+07:00",
    "distance_km": 12,
    "radius_km": 10,
    "trust_score": 100,
    "expected": {
      "urgency": 0,
      "proximity": 0,
      "trust": 1,
      "pre_score": 0.1
    }
  },
  {
    "name": "packaged còn 84 giờ, cách 1,5/6 km, uy tín 0",
    "perishability": "packaged",
    "at": "2026-10-20T10:00:00+07:00",
    "effective_deadline": "2026-10-23T22:00:00+07:00",
    "distance_km": 1.5,
    "radius_km": 6,
    "trust_score": 0,
    "expected": {
      "urgency": 0.5,
      "proximity": 0.75,
      "trust": 0,
      "pre_score": 0.425
    }
  },
  {
    "name": "cooked còn 2 giờ 30, cách 4,2/7 km, uy tín 73,5 (làm tròn 4 chữ số)",
    "perishability": "cooked",
    "at": "2026-10-20T10:00:00+07:00",
    "effective_deadline": "2026-10-20T12:30:00+07:00",
    "distance_km": 4.2,
    "radius_km": 7,
    "trust_score": 73.5,
    "expected": {
      "urgency": 0.7917,
      "proximity": 0.4,
      "trust": 0.735,
      "pre_score": 0.5102
    }
  },
  {
    "name": "cooked đã quá hạn 1 giờ ⇒ độ gấp kẹp 1 (SQL đã lọc, chỉ để khóa công thức)",
    "perishability": "cooked",
    "at": "2026-10-20T10:00:00+07:00",
    "effective_deadline": "2026-10-20T09:00:00+07:00",
    "distance_km": 1,
    "radius_km": 4,
    "trust_score": 0,
    "expected": {
      "urgency": 1,
      "proximity": 0.75,
      "trust": 0,
      "pre_score": 0.625
    }
  }
]$fx$::jsonb) x;

select is(private.pre_score((c ->> 'effective_deadline')::timestamptz, (c ->> 'perishability')::public.perishability,
                            (c ->> 'at')::timestamptz, (c ->> 'distance_km')::numeric, (c ->> 'radius_km')::numeric,
                            (c ->> 'trust_score')::numeric),
          (c -> 'expected' ->> 'pre_score')::numeric, c ->> 'name')
from fx;

select is(private.pre_score(now() + interval '6 hours', 'cooked', now(), 2, 0, 80), 0.28::numeric,
  'radius 0 => proximity 0 (no division by zero)');
select is(private.pre_score(now() + interval '6 hours', 'cooked', now(), 2, 5, null), 0.38::numeric, 'NULL trust => 0');

select * from finish();
rollback;

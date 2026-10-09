-- Admin console computed fields (migration 20261009100000_admin_console; PRD US-ADM-05, F-64; UAT P2-12).
-- offer_label / offer_label_rank / offer_red_at: read-time label of a lot (ADR-005), callable as PostgREST
-- computed fields. SECURITY INVOKER: RLS on offers still decides which rows a caller sees. The shared local
-- DB may hold other lots, so every assertion is restricted to the fixture lots.
begin;
\ir ../_helpers.psql

select plan(30);

-- store_a (bread = cooked: red < 4 h, yellow 4–12 h; vegetables = fresh: red < 24 h; dry_goods = packaged:
-- yellow 3–7 days). store_x has one red lot.
select tests.make_offer('l_red', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '2 hours');
select tests.make_offer('l_soon', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '6 hours');
select tests.make_offer('l_yellow', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '8 hours');
select tests.make_offer('l_green', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '20 hours', now() + interval '2 days');
select tests.make_offer('l_veg', 'site_a', 'vegetables', 5, now() - interval '10 minutes', now() + interval '10 hours');
select tests.make_offer('l_dry', 'site_a', 'dry_goods', 5, now() - interval '10 minutes', now() + interval '5 days', now() + interval '6 days');
select tests.make_offer('l_past', 'site_a', 'bread', 10, now() - interval '2 hours', now() - interval '5 minutes');
select tests.make_offer('l_full', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '3 hours', p_status => 'fully_allocated');
select tests.make_offer('l_expired', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '3 hours');
select tests.make_offer('l_cancelled', 'site_a', 'bread', 10, now() - interval '10 minutes', now() + interval '3 hours');
select tests.make_offer('l_draft', 'site_a', 'bread', 10, p_status => 'draft');
select tests.make_offer('x_red', 'site_x', 'bread', 10, now() - interval '10 minutes', now() + interval '1 hour');
update public.offers set status = 'expired', closed_at = now(), qty_unclaimed = 10 where id = tests.id('l_expired');
update public.offers set status = 'cancelled', closed_at = now(), cancel_reason = 'fixture' where id = tests.id('l_cancelled');

create function tests.lbl(p_name text) returns text language sql stable as $$
  select public.offer_label(o)::text from public.offers o where o.id = tests.id(p_name);
$$;
-- (name, lot) of the fixture lots visible to the current role (security_invoker ⇒ offers RLS applies)
create view tests.fixture_lots with (security_invoker = true) as
  select i.name, o as lot from public.offers o join tests.ids i on i.id = o.id
  where i.name like 'l\_%' or i.name like 'x\_%';
grant execute on function tests.lbl(text) to authenticated;
grant select on tests.fixture_lots to authenticated;

-- ---- offer_label: same thresholds as freshness_label (never stored) ----
select is(tests.lbl('l_red'), 'red', 'cooked lot, 2 h left => red');
select is(tests.lbl('l_yellow'), 'yellow', 'cooked lot, 8 h left => yellow');
select is(tests.lbl('l_green'), 'green', 'cooked lot, 20 h left => green');
select is(tests.lbl('l_veg'), 'red', 'fresh lot, 10 h left => red (fresh: red < 24 h)');
select is(tests.lbl('l_dry'), 'yellow', 'packaged lot, 5 days left => yellow (packaged: 3–7 days)');
select is(tests.lbl('l_full'), 'red', 'fully_allocated lots are live and labelled');
select is(tests.lbl('l_past'), 'expired', 'open lot past its deadline (not yet closed by the job) => expired');
select is(tests.lbl('l_expired'), 'expired', 'status expired => expired');
select is(tests.lbl('l_cancelled'), null, 'cancelled lot => no label');
select is(tests.lbl('l_draft'), null, 'draft lot => no label');

-- ---- offer_label_rank: Đỏ → Vàng → Xanh → Hết hạn → none ----
select results_eq(
  $$select name, public.offer_label_rank(f.lot) from tests.fixture_lots f
    where name in ('l_red', 'l_yellow', 'l_green', 'l_past', 'l_draft') order by name$$,
  $$values ('l_draft'::text, 4::smallint), ('l_green', 2::smallint), ('l_past', 3::smallint), ('l_red', 0::smallint), ('l_yellow', 1::smallint)$$,
  'rank: red 0, yellow 1, green 2, expired 3, none 4');

-- ---- offer_red_at: deadline − red threshold of the category ----
select is((select public.offer_red_at(o) from public.offers o where o.id = tests.id('l_red')),
  (select effective_deadline - interval '4 hours' from public.offers where id = tests.id('l_red')),
  'cooked: red_at = deadline − 4 h');
select is((select public.offer_red_at(o) from public.offers o where o.id = tests.id('l_veg')),
  (select effective_deadline - interval '24 hours' from public.offers where id = tests.id('l_veg')),
  'fresh: red_at = deadline − 24 h');
select is((select public.offer_red_at(o) from public.offers o where o.id = tests.id('l_dry')),
  (select effective_deadline - interval '3 days' from public.offers where id = tests.id('l_dry')),
  'packaged: red_at = deadline − 3 days');
select is((select public.offer_red_at(o) from public.offers o where o.id = tests.id('l_draft')), null,
  'draft (no effective_deadline) => no red_at');
-- coupling with freshness_label: still yellow exactly at red_at, red right after (one test per category)
select ok((select bool_and(
             public.freshness_label(o.effective_deadline, c.perishability, public.offer_red_at(o)) = 'yellow'
             and public.freshness_label(o.effective_deadline, c.perishability,
                                        public.offer_red_at(o) + interval '1 millisecond') = 'red')
           from public.offers o join public.food_categories c on c.code = o.category_code
           where o.id = tests.id('l_yellow')),
  'offer_red_at agrees with freshness_label (cooked)');
select ok((select bool_and(
             public.freshness_label(o.effective_deadline, c.perishability, public.offer_red_at(o)) = 'yellow'
             and public.freshness_label(o.effective_deadline, c.perishability,
                                        public.offer_red_at(o) + interval '1 millisecond') = 'red')
           from public.offers o join public.food_categories c on c.code = o.category_code
           where o.id = tests.id('l_veg')),
  'offer_red_at agrees with freshness_label (fresh)');
select ok((select bool_and(
             public.freshness_label(o.effective_deadline, c.perishability, public.offer_red_at(o)) = 'yellow'
             and public.freshness_label(o.effective_deadline, c.perishability,
                                        public.offer_red_at(o) + interval '1 millisecond') = 'red')
           from public.offers o join public.food_categories c on c.code = o.category_code
           where o.id = tests.id('l_dry')),
  'offer_red_at agrees with freshness_label (packaged)');

-- ---- RLS still applies (invoker) ----
select tests.authenticate_as('admin', 'aal2');
select set_eq($$select name from tests.fixture_lots f where public.offer_label(f.lot) = 'red'$$,
  array['l_red', 'l_veg', 'l_full', 'x_red'], 'admin aal2: red lots of every store');
select is((select array_agg(name order by public.offer_label_rank(f.lot), (f.lot).effective_deadline)
           from tests.fixture_lots f where public.offer_label_rank(f.lot) <= 2),
  array['x_red', 'l_red', 'l_full', 'l_veg', 'l_soon', 'l_yellow', 'l_dry', 'l_green'],
  'admin aal2: red first, then yellow, then green; most urgent deadline first inside a label');
select set_eq($$select name from tests.fixture_lots f
                where (f.lot).status = 'open' and public.offer_label(f.lot) in ('green', 'yellow')
                  and public.offer_red_at(f.lot) <= now() + interval '3 hours'$$,
  array['l_soon'], 'KPI "turning red within 3 h": open, not red yet, red_at ≤ now + 3 h');
select set_eq($$select name from tests.fixture_lots f where public.offer_label(f.lot) = 'expired'$$,
  array['l_past', 'l_expired'], 'admin aal2: expired label filter');
select tests.authenticate_as('admin', 'aal1');
select is_empty($$select 1 from tests.fixture_lots f where public.offer_label(f.lot) is not null$$,
  'admin aal1 (no MFA): RLS hides every lot — the computed field opens nothing');
select tests.authenticate_as('other_owner');
select set_eq($$select name from tests.fixture_lots f where public.offer_label(f.lot) = 'red'$$,
  array['x_red'], 'store owner: label only on the lots RLS already shows (own store)');
select is(tests.lbl('l_red'), null, 'store owner of another store: no row => no label for store_a lots');
select tests.authenticate_as('store_owner');
select set_eq($$select name from tests.fixture_lots f where public.offer_label(f.lot) = 'red'$$,
  array['l_red', 'l_veg', 'l_full'], 'store owner: own red lots only');
select tests.authenticate_as('outsider');
select is_empty($$select 1 from tests.fixture_lots$$, 'outsider sees no lot');
select tests.clear_auth();

-- ---- EXECUTE surface and function kind ----
select ok(not has_function_privilege('anon', 'public.offer_label(public.offers)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.offer_label_rank(public.offers)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.offer_red_at(public.offers)', 'EXECUTE'),
  'anon cannot execute the computed fields');
select ok(has_function_privilege('authenticated', 'public.offer_label(public.offers)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.offer_label_rank(public.offers)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.offer_red_at(public.offers)', 'EXECUTE'),
  'authenticated can execute them (RLS limits the rows)');
select ok((select bool_and(not p.prosecdef and p.provolatile = 's'
                           and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""'))
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('offer_label', 'offer_label_rank', 'offer_red_at')),
  'computed fields are security invoker, stable, search_path = ''''');

select * from finish();
rollback;

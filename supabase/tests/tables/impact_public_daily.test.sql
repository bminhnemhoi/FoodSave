-- impact_public_daily + public views (DATA-MODEL §2.5, §9.3): anon-safe daily aggregate maintained
-- by trigger (grid cell for public store sites, ward otherwise); public_impact_stats and
-- public_org_cards are security_invoker views (never over impact_ledger).
begin;
\ir ../_helpers.psql

select plan(18);

select ok((select relrowsecurity from pg_class where oid = 'public.impact_public_daily'::regclass), 'RLS enabled');
select policies_are('public', 'impact_public_daily', array['impact_public_daily_select']);
select ok(not has_table_privilege('anon', 'public.impact_public_daily', 'INSERT')
          and not has_table_privilege('authenticated', 'public.impact_public_daily', 'UPDATE'),
  'only the trigger writes the aggregate');
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce((select bool_or(o = 'security_invoker=true') from unnest(c.reloptions) o), false)$$,
  'every public view is security_invoker');
select columns_are('public', 'public_impact_stats',
  array['kg_total', 'co2e_kg_total', 'meals_total', 'deliveries_total', 'kg_30d', 'demo_kg_total', 'updated_at'],
  'public_impact_stats exposes counters only');

-- baseline (the shared local DB may already hold data)
create table tests.before as select * from public.public_impact_stats;
grant select on tests.before to anon, authenticated;

-- delivery 1: public store site (site_a) 5 loaves; delivery 2: hidden store site (site_x) 3 loaves
select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.make_offer('o2', 'site_x', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 3)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.confirm('other_owner', tests.var('a2')::uuid);
select tests.pickup('charity_owner', array[tests.var('a1')::uuid]);
select tests.pickup('charity_owner', array[tests.var('a2')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('a1')::uuid), 'h1');
select tests.issue('charity_owner', tests.stop_of(tests.var('a2')::uuid), 'h2');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('h1_token'), tests.full_lines(tests.stop_of(tests.var('a1')::uuid)), gen_random_uuid());
select tests.authenticate_as('other_owner');
select public.consume_handover_token(tests.var('h2_token'), tests.full_lines(tests.stop_of(tests.var('a2')::uuid)), gen_random_uuid());
select tests.clear_auth();

select ok(exists (select 1 from public.impact_public_daily
                  where cell_key = extensions.st_geohash(extensions.st_snaptogrid(
                                     'SRID=4326;POINT(106.700806 10.776889)'::extensions.geometry, 0.005), 7)
                    and not is_demo and day = (now() at time zone 'Asia/Ho_Chi_Minh')::date),
  'public store site => 7-char geohash of the 0.005° grid cell');
select ok(exists (select 1 from public.impact_public_daily where cell_key = 'ward:Phường Bến Thành' and not is_demo
                  and day = (now() at time zone 'Asia/Ho_Chi_Minh')::date),
  'hidden store site => aggregated by ward (no coordinates)');

select tests.as_anon();
select results_eq(
  $$select s.kg_total - b.kg_total, s.co2e_kg_total - b.co2e_kg_total, s.deliveries_total - b.deliveries_total,
           s.kg_30d - b.kg_30d, s.demo_kg_total - b.demo_kg_total
    from public.public_impact_stats s, tests.before b$$,
  $$values (0.960::numeric, 1.920::numeric, 2::bigint, 0.960::numeric, 0.000::numeric)$$,
  'anon: public counters grow by the delivered 8 loaves × 0.12 kg (0.96 kg, 1.92 kg CO2e, 2 deliveries)');
select throws_ok('select kg from public.impact_ledger', '42501', null, 'anon never reads impact_ledger');
select ok((select count(*) > 0 from public.impact_public_daily), 'anon reads the daily aggregate');
select tests.clear_auth();

-- reversal subtracts kg but not deliveries
select tests.authenticate_as('admin', 'aal2');
select public.reverse_impact((select hl.id from public.handover_lines hl join public.handovers h on h.id = hl.handover_id
                              where hl.allocation_id = tests.var('a1')::uuid and h.kind = 'dropoff'),
                             0.2, 'Giao thiếu phát hiện muộn', gen_random_uuid());
select tests.as_anon();
select results_eq(
  $$select s.kg_total - b.kg_total, s.deliveries_total - b.deliveries_total from public.public_impact_stats s, tests.before b$$,
  $$values (0.760::numeric, 2::bigint)$$, 'reversal subtracts kg, deliveries unchanged');

-- demo data stays out of the public totals
select tests.clear_auth();
update public.organizations set is_demo = true where id in (tests.id('store_a'), tests.id('charity_b'));
select tests.make_offer('o_demo', 'site_a', 'bread', 20);
select tests.set_var('ad', tests.request('charity_owner', tests.id('o_demo'), 10)::text);
select tests.confirm('store_staff', tests.var('ad')::uuid);
select tests.pickup('charity_owner', array[tests.var('ad')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('ad')::uuid), 'hd');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('hd_token'), tests.full_lines(tests.stop_of(tests.var('ad')::uuid)), gen_random_uuid());
select tests.as_anon();
select results_eq(
  $$select s.kg_total - b.kg_total, s.demo_kg_total - b.demo_kg_total from public.public_impact_stats s, tests.before b$$,
  $$values (0.760::numeric, 1.200::numeric)$$, 'demo delivery counted in demo_kg_total only');
select tests.clear_auth();
update public.organizations set is_demo = false where id in (tests.id('store_a'), tests.id('charity_b'));

-- ---- public_org_cards ----
select columns_are('public', 'public_org_cards',
  array['id', 'kind', 'name', 'subtype', 'logo_path', 'ward', 'public_lat', 'public_lng', 'is_demo'],
  'public_org_cards: safe columns only');
update public.sites set is_primary = true where id in (tests.id('site_a'), tests.id('site_b'), tests.id('site_x'), tests.id('site_c'));
select tests.as_anon();
select results_eq(
  format($$select name, ward, public_lat, public_lng from public.public_org_cards where id = %L$$, tests.id('store_a')),
  $$values ('Org store_a'::text, 'Phường Bến Thành'::text, 10.776889::float8, 106.700806::float8)$$,
  'anon: public store card with its public pin');
select ok((select abs(public_lat - 10.762622) > 0.0000001 or abs(public_lng - 106.660172) > 0.0000001
           from public.public_org_cards where id = tests.id('charity_b')),
  'approximate charity site: card shows the snapped point, never the exact pin');
select results_eq(
  format($$select public_lat, public_lng from public.public_org_cards where id = %L$$, tests.id('store_x')),
  $$values (null::float8, null::float8)$$, 'hidden site: no coordinates at all');
select is_empty(format($$select 1 from public.public_org_cards where id = %L$$, tests.id('draft_c')),
  'draft org has no public card');
select tests.authenticate_as('draft_owner');
select is_empty(format($$select 1 from public.public_org_cards where id = %L$$, tests.id('draft_c')),
  'not even its owner sees an unapproved org as a public card');
select tests.clear_auth();

select * from finish();
rollback;

-- needs + need_bundles (DATA-MODEL §2.3, §9.2): tables exist from P2 because allocations reference
-- them; RPCs arrive in P3. RLS: charity members read their needs; stores read live needs of
-- approved charities and needs/bundles they supply; admin aal2 reads all; no direct writes.
begin;
\ir ../_helpers.psql

select plan(24);

select ok((select relrowsecurity from pg_class where oid = 'public.needs'::regclass), 'needs: RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.need_bundles'::regclass), 'need_bundles: RLS enabled');
select policies_are('public', 'needs', array['needs_select']);
select policies_are('public', 'need_bundles', array['need_bundles_select']);
select ok(not has_table_privilege('authenticated', 'public.needs', 'INSERT')
          and not has_table_privilege('authenticated', 'public.needs', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.need_bundles', 'INSERT'),
  'no direct writes on needs / need_bundles');

select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_p', 'charity_p', 'approximate');

insert into public.needs (id, org_id, site_id, category_codes, unit, quantity, needed_by, created_by)
values ('a1000000-0000-4000-8000-000000000001', tests.id('charity_b'), tests.id('site_b'), '{bread,pastry}', 'loaf',
        50, now() + interval '1 day', tests.id('charity_owner')),
       ('a1000000-0000-4000-8000-000000000002', tests.id('charity_b'), tests.id('site_b'), '{dairy}', 'bottle',
        10, now() + interval '1 day', tests.id('charity_owner')),
       ('a1000000-0000-4000-8000-000000000003', tests.id('charity_p'), tests.id('site_p'), '{bread}', 'loaf',
        5, now() + interval '1 day', tests.id('pending_owner'));
update public.needs set status = 'fulfilled', closed_at = now() where id = 'a1000000-0000-4000-8000-000000000002';

insert into public.need_bundles (id, need_id, option_rank, qty_target, score, stop_count, est_distance_m, est_duration_s,
                                 algorithm_version, inputs_snapshot, client_op_id, created_by)
values ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, 50, 0.8, 1, 4000, 900,
        'match-v1', '{}', gen_random_uuid(), tests.id('charity_owner'));

create view tests.my_needs with (security_invoker = true) as
  select right(id::text, 1) as n from public.needs where id::text like 'a1000000-%';
create view tests.my_bundles with (security_invoker = true) as
  select right(id::text, 1) as n from public.need_bundles where id::text like 'b1000000-%';
grant select on tests.my_needs, tests.my_bundles to anon, authenticated;

select tests.as_anon();
select throws_ok('select id from public.needs', '42501', null, 'anon: no access to needs');
select tests.authenticate_as('charity_owner');
select set_eq('select n from tests.my_needs', array['1', '2'], 'charity owner: own needs (any status)');
select set_eq('select n from tests.my_bundles', array['1'], 'charity owner: bundles of own needs');
select tests.authenticate_as('charity_volunteer');
select set_eq('select n from tests.my_needs', array['1', '2'], 'volunteer: needs of own charity');
select is_empty('select n from tests.my_bundles', 'volunteer: no bundles');
select tests.authenticate_as('store_staff');
select set_eq('select n from tests.my_needs', array['1'], 'store: live needs of approved charities only (not fulfilled, not unapproved)');
select is_empty('select n from tests.my_bundles', 'store without allocation in the bundle: no bundle');
select tests.authenticate_as('outsider');
select is_empty('select n from tests.my_needs', 'unrelated user: no needs');
select tests.authenticate_as('pending_owner');
select is_empty('select n from tests.my_needs', 'member of an unapproved charity: no needs (even its own)');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select n from tests.my_needs', 'admin aal1: none');
select tests.authenticate_as('admin', 'aal2');
select set_eq('select n from tests.my_needs', array['1', '2', '3'], 'admin aal2: all needs');
select set_eq('select n from tests.my_bundles', array['1'], 'admin aal2: all bundles');

-- a store supplying the bundle (allocation with need_id/bundle_id) sees need + bundle
select tests.clear_auth();
select tests.make_offer('o1', 'site_x', 'bread', 10);
insert into public.allocations (offer_id, store_org_id, store_site_id, charity_org_id, charity_site_id, need_id, bundle_id,
                                unit, unit_weight_kg_snapshot, qty_reserved, status, reserved_until, requested_by)
values (tests.id('o1'), tests.id('store_x'), tests.id('site_x'), tests.id('charity_b'), tests.id('site_b'),
        'a1000000-0000-4000-8000-000000000002', null, 'loaf', 0.12, 2, 'requested', now() + interval '1 hour', tests.id('charity_owner')),
       (tests.id('o1'), tests.id('store_x'), tests.id('site_x'), tests.id('charity_b'), tests.id('site_b'),
        'a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'loaf', 0.12, 3, 'requested',
        now() + interval '1 hour', tests.id('charity_owner'));
select tests.authenticate_as('other_owner');
select set_eq('select n from tests.my_needs', array['1', '2'], 'supplying store sees the needs it supplies (even fulfilled)');
select set_eq('select n from tests.my_bundles', array['1'], 'supplying store sees the bundle');
select tests.clear_auth();

-- ---- triggers / checks ----
select throws_ok(format($$insert into public.needs (org_id, site_id, category_codes, unit, quantity, needed_by, created_by)
                         values (%L, %L, '{bread,unknown_cat}', 'loaf', 5, now() + interval '1 day', %L)$$,
                        tests.id('charity_b'), tests.id('site_b'), tests.id('charity_owner')),
  'PT422', 'validation_failed', 'unknown category rejected');
select throws_ok(format($$insert into public.needs (org_id, site_id, category_codes, unit, quantity, needed_by, created_by)
                         values (%L, %L, '{bread}', 'loaf', 5, now() + interval '1 day', %L)$$,
                        tests.id('charity_b'), tests.id('site_a'), tests.id('charity_owner')),
  'PT422', 'validation_failed', 'site must belong to the charity');
select throws_ok(format($$insert into public.needs (org_id, site_id, category_codes, unit, quantity, needed_by, created_by)
                         values (%L, %L, '{bread}', 'loaf', 5.5, now() + interval '1 day', %L)$$,
                        tests.id('charity_b'), tests.id('site_b'), tests.id('charity_owner')),
  '23514', null, 'counted unit: integer quantity');

-- private.refresh_need / refresh_bundle (§4.6, §6.3)
select private.refresh_need('a1000000-0000-4000-8000-000000000001');
select private.refresh_bundle('b1000000-0000-4000-8000-000000000001');
select results_eq($$select status::text, qty_in_flight from public.needs where id = 'a1000000-0000-4000-8000-000000000001'$$,
  $$values ('partially_matched', 3.000::numeric)$$, 'refresh_need: R = 3 of 50 => partially_matched');
select is((select status::text from public.need_bundles where id = 'b1000000-0000-4000-8000-000000000001'), 'proposed',
  'refresh_bundle: live only => proposed');

select * from finish();
rollback;

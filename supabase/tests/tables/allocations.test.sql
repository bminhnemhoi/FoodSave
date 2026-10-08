-- allocations (DATA-MODEL §2.3, §4.1, §9.2): store side / charity side / trip volunteer / admin
-- aal2 read; nobody writes directly; quantity invariants are CHECK constraints.
begin;
\ir ../_helpers.psql

select plan(30);

select ok((select relrowsecurity from pg_class where oid = 'public.allocations'::regclass), 'RLS enabled');
select policies_are('public', 'allocations', array['allocations_select', 'allocations_select_trip']);
select ok(not has_table_privilege('authenticated', 'public.allocations', 'INSERT')
          and not has_table_privilege('authenticated', 'public.allocations', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.allocations', 'DELETE'),
  'authenticated cannot insert/update/delete allocations (RPC only)');
select ok(not has_table_privilege('anon', 'public.allocations', 'SELECT'), 'anon has no access');

-- second approved charity near site_a
select tests.create_user('ch2_owner');
select tests.create_org('charity_z', 'charity', 'ch2_owner');
select tests.create_site('site_z', 'charity_z', 'approximate', 10.77, 106.69);

select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.set_var('a2', tests.request('ch2_owner', tests.id('o1'), 4, 'site_z')::text);

create view tests.my_allocs with (security_invoker = true) as
  select v.k from tests.vars v join public.allocations a on a.id::text = v.v where v.k in ('a1', 'a2', 'a3');
grant select on tests.my_allocs to anon, authenticated;

select tests.authenticate_as('store_staff');
select set_eq('select k from tests.my_allocs', array['a1', 'a2'], 'store staff sees allocations of its lots');
select tests.authenticate_as('charity_owner');
select set_eq('select k from tests.my_allocs', array['a1'], 'charity sees only its own allocations');
select tests.authenticate_as('ch2_owner');
select set_eq('select k from tests.my_allocs', array['a2'], 'second charity sees only its own allocation');
select tests.authenticate_as('charity_volunteer');
select is_empty('select k from tests.my_allocs', 'volunteer without a trip: 0 rows');
select tests.authenticate_as('other_owner');
select is_empty('select k from tests.my_allocs', 'another store: 0 rows');
select tests.authenticate_as('outsider');
select is_empty('select k from tests.my_allocs', 'unrelated user: 0 rows');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select k from tests.my_allocs', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select set_eq('select k from tests.my_allocs', array['a1', 'a2'], 'admin aal2 sees all');

-- volunteer assigned to a trip carrying a1 sees a1 and its lot
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.pickup('charity_owner', array[tests.var('a1')::uuid], 'site_b', 'volunteer', 'charity_volunteer');
select tests.authenticate_as('charity_volunteer');
select set_eq('select k from tests.my_allocs', array['a1'], 'volunteer sees the allocation of the assigned trip');
select ok(exists (select 1 from public.offers where id = tests.id('o1')), 'volunteer sees the lot of the assigned trip');

-- ---- no direct writes ----
select tests.authenticate_as('store_owner');
select throws_ok(format($$update public.allocations set status = 'confirmed' where id = %L$$, tests.var('a2')),
  '42501', null, 'store cannot change status directly');
select throws_ok(format($$update public.allocations set qty_reserved = 1 where id = %L$$, tests.var('a2')),
  '42501', null, 'store cannot change quantities directly');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$delete from public.allocations where id = %L$$, tests.var('a1')),
  '42501', null, 'charity cannot delete allocations');
select throws_ok(format($$insert into public.allocations (offer_id, store_org_id, store_site_id, charity_org_id, charity_site_id,
                            unit, unit_weight_kg_snapshot, qty_reserved, reserved_until, requested_by)
                          values (%L, %L, %L, %L, %L, 'loaf', 0.12, 100, now() + interval '1 hour', %L)$$,
                        tests.id('o1'), tests.id('store_a'), tests.id('site_a'), tests.id('charity_b'), tests.id('site_b'),
                        tests.id('charity_owner')),
  '42501', null, 'charity cannot insert allocations (over-allocation impossible without the RPC)');
select tests.clear_auth();

-- ---- CHECK invariants (§4.1) as postgres ----
select throws_ok(format($$update public.allocations set qty_picked = 6 where id = %L$$, tests.var('a2')),
  '23514', null, 'qty_reserved ≥ qty_picked');
select throws_ok(format($$update public.allocations set qty_delivered = 1 where id = %L$$, tests.var('a2')),
  '23514', null, 'qty_picked ≥ qty_delivered');
select throws_ok(format($$update public.allocations set qty_released = 5 where id = %L$$, tests.var('a2')),
  '23514', null, 'qty_picked + qty_released ≤ qty_reserved');
select throws_ok(format($$update public.allocations set qty_reserved = 3.5 where id = %L$$, tests.var('a2')),
  '23514', null, 'counted unit: integer quantities');
select throws_ok(format($$update public.allocations set reserved_until = null where id = %L$$, tests.var('a2')),
  '23514', null, 'requested needs reserved_until');
select throws_ok(format($$update public.allocations set status = 'assigned' where id = %L$$, tests.var('a2')),
  '23514', null, 'assigned needs pickup_id and stop_id');
select throws_ok(format($$update public.allocations set status = 'cancelled', closed_at = now() where id = %L$$, tests.var('a2')),
  '23514', null, 'cancelled needs cancel_actor');
select throws_ok(format($$update public.allocations set status = 'rejected' where id = %L$$, tests.var('a2')),
  '23514', null, 'terminal status needs closed_at');
select throws_ok(format($$update public.allocations set packed_at = now() where id = %L$$, tests.var('a2')),
  '23514', null, 'packed_at needs packed_by');
select throws_ok(format($$update public.allocations set charity_org_id = store_org_id where id = %L$$, tests.var('a2')),
  '23514', null, 'store and charity are different orgs');
select throws_ok(format($$update public.allocations set status = 'delivered', closed_at = now(), qty_picked = 4, qty_delivered = 4,
                          pickup_id = null where id = %L$$, tests.var('a2')),
  '23514', null, 'delivered needs delivered_at and proof_due_at');
select is((select kg_delivered from public.allocations where id = tests.var('a1')::uuid), 0.000::numeric,
  'kg_delivered generated (0 before delivery)');

select * from finish();
rollback;

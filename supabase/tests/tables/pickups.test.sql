-- pickups + pickup_stops (DATA-MODEL §2.3, §9.2): charity coordinators and the assignee read the
-- trip (incl. last_location); stores never read pickups, only the stops at their own sites (ETA);
-- admin aal2 reads all; writes RPC only; CHECKs on status fields / location retention.
begin;
\ir ../_helpers.psql

select plan(27);

select ok((select relrowsecurity from pg_class where oid = 'public.pickups'::regclass), 'pickups: RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.pickup_stops'::regclass), 'pickup_stops: RLS enabled');
select policies_are('public', 'pickups', array['pickups_select']);
select policies_are('public', 'pickup_stops', array['pickup_stops_select']);
select ok(not has_table_privilege('authenticated', 'public.pickups', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.pickups', 'INSERT')
          and not has_table_privilege('authenticated', 'public.pickup_stops', 'UPDATE')
          and not has_table_privilege('anon', 'public.pickups', 'SELECT'),
  'no direct writes; anon has no access');
select has_index('public', 'pickup_stops', 'pickup_stops_one_dropoff_uq', 'one dropoff stop per trip');

-- two trips of charity_b: P1 self (no assignee), P2 volunteer (charity_volunteer)
select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.make_offer('o2', 'site_x', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 5)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.confirm('other_owner', tests.var('a2')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid])::text);
select tests.set_var('p2', tests.pickup('charity_owner', array[tests.var('a2')::uuid], 'site_b', 'volunteer', 'charity_volunteer')::text);
update public.pickups
   set last_location = 'SRID=4326;POINT(106.69 10.77)'::extensions.geography, last_location_at = now()
 where id = tests.var('p2')::uuid;

create view tests.my_pickups with (security_invoker = true) as
  select v.k from tests.vars v join public.pickups p on p.id::text = v.v where v.k in ('p1', 'p2');
create view tests.my_stops with (security_invoker = true) as
  select v.k || ':' || s.kind as k from tests.vars v join public.pickup_stops s on s.pickup_id::text = v.v
  where v.k in ('p1', 'p2');
grant select on tests.my_pickups, tests.my_stops to anon, authenticated;

select results_eq(format($$select status::text, mode::text from public.pickups where id = %L$$, tests.var('p1')),
  $$values ('planned', 'self')$$, 'self trip without assignee is planned');
select results_eq(format($$select status::text, mode::text from public.pickups where id = %L$$, tests.var('p2')),
  $$values ('assigned', 'volunteer')$$, 'volunteer trip with assignee is assigned');

-- ---- pickups SELECT ----
select tests.authenticate_as('charity_owner');
select set_eq('select k from tests.my_pickups', array['p1', 'p2'], 'charity coordinator sees the org trips');
select isnt((select last_location from public.pickups where id = tests.var('p2')::uuid), null,
  'coordinator reads last_location');
select tests.authenticate_as('charity_volunteer');
select set_eq('select k from tests.my_pickups', array['p2'], 'volunteer sees only the assigned trip');
select tests.authenticate_as('store_staff');
select is_empty('select k from tests.my_pickups', 'store never reads pickups (no volunteer location)');
select tests.authenticate_as('outsider');
select is_empty('select k from tests.my_pickups', 'unrelated user: 0 trips');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select k from tests.my_pickups', 'admin aal1: 0 trips');
select tests.authenticate_as('admin', 'aal2');
select set_eq('select k from tests.my_pickups', array['p1', 'p2'], 'admin aal2 sees all trips');

-- ---- pickup_stops SELECT ----
select tests.authenticate_as('store_staff');
select set_eq('select k from tests.my_stops', array['p1:pickup'], 'store sees only the pickup stop at its site (not the dropoff)');
select tests.authenticate_as('other_owner');
select set_eq('select k from tests.my_stops', array['p2:pickup'], 'store_x sees only its stop');
select tests.authenticate_as('charity_owner');
select set_eq('select k from tests.my_stops', array['p1:pickup', 'p1:dropoff', 'p2:pickup', 'p2:dropoff'],
  'charity coordinator sees every stop of its trips');
select tests.authenticate_as('charity_volunteer');
select set_eq('select k from tests.my_stops', array['p2:pickup', 'p2:dropoff'], 'volunteer sees the stops of the assigned trip');
select tests.authenticate_as('outsider');
select is_empty('select k from tests.my_stops', 'unrelated user: no stops');

-- ---- writes ----
select tests.authenticate_as('charity_owner');
select throws_ok(format($$update public.pickups set status = 'completed' where id = %L$$, tests.var('p1')),
  '42501', null, 'coordinator cannot change trip status directly');
select tests.authenticate_as('store_staff');
select throws_ok(format($$update public.pickup_stops set status = 'done' where pickup_id = %L$$, tests.var('p1')),
  '42501', null, 'store cannot mark stops done directly');
select tests.clear_auth();

-- ---- CHECKs ----
select throws_ok(format($$update public.pickups set status = 'completed' where id = %L$$, tests.var('p1')),
  '23514', null, 'completed needs completed_at');
select throws_ok(format($$update public.pickups set status = 'cancelled', cancelled_at = now() where id = %L$$, tests.var('p2')),
  '23514', null, 'a finished trip keeps no location (last_location must be cleared)');
select throws_ok(format($$update public.pickups set assignee_user_id = null where id = %L$$, tests.var('p2')),
  '23514', null, 'assigned volunteer trip needs an assignee');
select throws_ok(format($$insert into public.pickup_stops (pickup_id, seq, kind, site_id) values (%L, 5, 'dropoff', %L)$$,
                        tests.var('p1'), tests.id('site_z_none')),
  '23502', null, 'stop needs a site');
select throws_ok(format($$insert into public.pickup_stops (pickup_id, seq, kind, site_id) values (%L, 5, 'dropoff', %L)$$,
                        tests.var('p1'), tests.id('site_c')),
  '23505', null, 'a second dropoff stop is refused');

select * from finish();
rollback;

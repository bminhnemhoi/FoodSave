-- handovers + handover_lines (DATA-MODEL §2.3, §9.2, §9.4): visibility follows the stop (store of
-- the pickup site, charity side of the trip, admin aal2); token_hash / code_hash are never
-- selectable; no direct writes; dual-control and line CHECKs.
begin;
\ir ../_helpers.psql

select plan(24);

select ok((select relrowsecurity from pg_class where oid = 'public.handovers'::regclass), 'handovers: RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.handover_lines'::regclass), 'handover_lines: RLS enabled');
select policies_are('public', 'handovers', array['handovers_select']);
select policies_are('public', 'handover_lines', array['handover_lines_select']);
select is_empty(
  $$select column_name from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'handovers' and grantee in ('anon', 'authenticated')
      and column_name in ('token_hash', 'code_hash')$$,
  'token_hash / code_hash granted to nobody');
select ok(not has_table_privilege('authenticated', 'public.handovers', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.handover_lines', 'INSERT'),
  'no direct writes');

-- self trip of charity_b at site_a, token issued by charity_owner, consumed by store_staff
select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid])::text);
select tests.issue('charity_owner', tests.stop_of(tests.var('a1')::uuid));

create view tests.my_handovers with (security_invoker = true) as
  select h.kind::text as k from public.handovers h where h.pickup_id::text = tests.var('p1');
create view tests.my_lines with (security_invoker = true) as
  select l.qty from public.handover_lines l join public.handovers h on h.id = l.handover_id
  where h.pickup_id::text = tests.var('p1');
grant select on tests.my_handovers, tests.my_lines to anon, authenticated;

select tests.authenticate_as('store_staff');
select set_eq('select k from tests.my_handovers', array['pickup'], 'store sees the pickup handover at its site');
select throws_ok('select token_hash from public.handovers', '42501', null, 'store cannot read token_hash');
select throws_ok('select code_hash from public.handovers', '42501', null, 'store cannot read code_hash');
select tests.authenticate_as('charity_owner');
select set_eq('select k from tests.my_handovers', array['pickup'], 'charity coordinator sees the handover');
select tests.authenticate_as('other_owner');
select is_empty('select k from tests.my_handovers', 'another store: nothing');
select tests.authenticate_as('charity_volunteer');
select is_empty('select k from tests.my_handovers', 'volunteer not on the trip: nothing');
select tests.authenticate_as('outsider');
select is_empty('select k from tests.my_handovers', 'unrelated user: nothing');

-- consume (store scans) => lines + automatic dropoff (self trip)
select tests.authenticate_as('store_staff');
select lives_ok(format($$select public.consume_handover_token(%L, tests.full_lines(%L), gen_random_uuid())$$,
                       tests.var('h_token'), tests.stop_of(tests.var('a1')::uuid)), 'store consumes the token');
select set_eq('select k from tests.my_handovers', array['pickup'], 'store still sees only the pickup handover (not the dropoff)');
select set_eq('select qty from tests.my_lines', array[5.000::numeric], 'store sees the lines of its handover');
select tests.authenticate_as('charity_owner');
select set_eq('select k from tests.my_handovers', array['pickup', 'dropoff'], 'charity sees pickup + automatic dropoff');
select is((select count(*)::int from tests.my_lines), 2, 'charity sees both lines');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from tests.my_lines), 2, 'admin aal2 sees the lines');
select tests.clear_auth();

-- ---- CHECKs ----
select throws_ok(format($$update public.handovers set scanned_by = issued_by where pickup_id = %L and kind = 'pickup'$$, tests.var('p1')),
  '23514', null, 'dual control: scanner ≠ issuer');
select throws_ok(format($$update public.handovers set token_hash = sha256('x') where pickup_id = %L and kind = 'dropoff'$$, tests.var('p1')),
  '23514', null, 'automatic handover carries no token');
select throws_ok(format($$update public.handovers set consumed_at = null, scanned_by = null, method = null
                          where pickup_id = %L and kind = 'dropoff'$$, tests.var('p1')),
  '23514', null, 'an open handover must have a token');
select throws_ok(format($$update public.handover_lines set qty = 6 where allocation_id = %L$$, tests.var('a1')),
  '23514', null, 'line qty ≤ expected');
select throws_ok(format($$insert into public.handover_lines (handover_id, allocation_id, expected_qty, qty)
                          select id, %L, 5, 5 from public.handovers where pickup_id = %L and kind = 'pickup'$$,
                        tests.var('a1'), tests.var('p1')),
  '23505', null, 'one line per allocation per handover');

select * from finish();
rollback;

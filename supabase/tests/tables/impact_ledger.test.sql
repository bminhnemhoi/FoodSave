-- impact_ledger (DATA-MODEL §2.5, §13; ESG-METHODOLOGY §2.3, §10): written at dropoff in the same
-- transaction, exactly one credit per handover line, append-only (UPDATE/DELETE refused, except
-- demo rows inside demo_reset), RLS per side.
begin;
\ir ../_helpers.psql

select plan(25);

select ok((select relrowsecurity from pg_class where oid = 'public.impact_ledger'::regclass), 'RLS enabled');
select policies_are('public', 'impact_ledger', array['impact_ledger_select']);
select ok(not has_table_privilege('authenticated', 'public.impact_ledger', 'INSERT')
          and not has_table_privilege('authenticated', 'public.impact_ledger', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.impact_ledger', 'DELETE')
          and not has_table_privilege('anon', 'public.impact_ledger', 'SELECT'),
  'nobody writes the ledger through the API; anon cannot read it');
select has_index('public', 'impact_ledger', 'impact_ledger_credit_uq', 'partial unique credit per handover line');

-- scenario: 5 loaves × 0.12 kg delivered through a self pickup
select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.pickup('charity_owner', array[tests.var('a1')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('a1')::uuid));
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('h_token'), tests.full_lines(tests.stop_of(tests.var('a1')::uuid)), gen_random_uuid());
select tests.clear_auth();

select results_eq(
  format($$select entry_type::text, kg, co2e_kg, water_l, meals, factor_version, is_demo, category_code
           from public.impact_ledger where allocation_id = %L$$, tests.var('a1')),
  $$values ('credit', 0.600::numeric, 1.200::numeric, 90.00::numeric, 1.43::numeric, 'v1', false, 'bread')$$,
  'credit = 0.6 kg, 1.2 kg CO2e (×2.0), 90 L (×150), 1.43 meals (÷0.42), factor v1');
select is((select kg_delivered from public.allocations where id = tests.var('a1')::uuid),
          (select sum(kg) from public.impact_ledger where allocation_id = tests.var('a1')::uuid and entry_type = 'credit'),
  'allocations.kg_delivered = Σ credit kg (ESG-METHODOLOGY §2.3 cross-check)');
select ok((select l.occurred_at = h.consumed_at from public.impact_ledger l
           join public.handover_lines hl on hl.id = l.handover_line_id
           join public.handovers h on h.id = hl.handover_id
           where l.allocation_id = tests.var('a1')::uuid),
  'occurred_at = dropoff time');

create view tests.my_ledger with (security_invoker = true) as
  select l.id from public.impact_ledger l where l.allocation_id::text = tests.var('a1');
grant select on tests.my_ledger to anon, authenticated;

select tests.authenticate_as('store_owner');
select is((select count(*)::int from tests.my_ledger), 1, 'store owner reads its ledger rows');
select tests.authenticate_as('store_staff');
select is((select count(*)::int from tests.my_ledger), 0, 'store staff: no ESG/ledger access (US-STO-06 AC2)');
select tests.authenticate_as('charity_owner');
select is((select count(*)::int from tests.my_ledger), 1, 'charity reads its ledger rows');
select tests.authenticate_as('charity_volunteer');
select is((select count(*)::int from tests.my_ledger), 0, 'volunteer: no ledger rows');
select tests.authenticate_as('other_owner');
select is((select count(*)::int from tests.my_ledger), 0, 'another store: no rows');
select tests.authenticate_as('admin', 'aal1');
select is((select count(*)::int from tests.my_ledger), 0, 'admin aal1: no rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from tests.my_ledger), 1, 'admin aal2 reads all');
select tests.authenticate_as('store_owner');
select throws_ok($$update public.impact_ledger set kg = 100$$, '42501', null, 'store cannot edit its ESG numbers');
select tests.clear_auth();

-- ---- append-only / exactly one credit ----
select throws_ok(format($$update public.impact_ledger set kg = 100 where allocation_id = %L$$, tests.var('a1')),
  '42501', 'append_only', 'UPDATE refused even for postgres');
select throws_ok(format($$delete from public.impact_ledger where allocation_id = %L$$, tests.var('a1')),
  '42501', 'append_only', 'DELETE refused even for postgres');
select set_config('fs.demo_reset', 'on', true);
select throws_ok(format($$delete from public.impact_ledger where allocation_id = %L$$, tests.var('a1')),
  '42501', 'append_only', 'demo_reset flag does not delete non-demo rows');
select set_config('fs.demo_reset', '', true);
select is(private.credit_impact((select hl.id from public.handover_lines hl join public.handovers h on h.id = hl.handover_id
                                 where hl.allocation_id = tests.var('a1')::uuid and h.kind = 'dropoff')),
          (select id from public.impact_ledger where allocation_id = tests.var('a1')::uuid),
  'credit_impact is idempotent (returns the existing credit)');
select is((select count(*)::int from public.impact_ledger where allocation_id = tests.var('a1')::uuid), 1,
  'still exactly one ledger row');
select throws_ok(format($$insert into public.impact_ledger (entry_type, handover_line_id, allocation_id, offer_id, store_org_id,
                            charity_org_id, store_site_id, category_code, occurred_at, kg, co2e_kg, meals, factor_version, is_demo)
                          select 'credit', handover_line_id, allocation_id, offer_id, store_org_id, charity_org_id, store_site_id,
                                 category_code, now(), 1, 2, 2, 'v1', false
                          from public.impact_ledger where allocation_id = %L$$, tests.var('a1')),
  '23505', null, 'a second credit for the same handover line is refused');
select throws_ok(format($$insert into public.impact_ledger (entry_type, handover_line_id, allocation_id, offer_id, store_org_id,
                            charity_org_id, store_site_id, category_code, occurred_at, kg, co2e_kg, meals, factor_version, is_demo, reason)
                          select 'reversal', handover_line_id, allocation_id, offer_id, store_org_id, charity_org_id, store_site_id,
                                 category_code, now(), -1, -2, -2, 'v1', false, 'x'
                          from public.impact_ledger where allocation_id = %L$$, tests.var('a1')),
  '23514', null, 'a reversal must point to the credit it reverses (ledger_sign)');
select throws_ok(format($$select private.credit_impact(hl.id) from public.handover_lines hl join public.handovers h on h.id = hl.handover_id
                          where hl.allocation_id = %L and h.kind = 'pickup'$$, tests.var('a1')),
  'PT409', 'invalid_state', 'only dropoff lines are credited (never at pickup)');

-- demo rows can be deleted only by demo_reset (fs.demo_reset = on)
update public.organizations set is_demo = true where id in (tests.id('store_a'), tests.id('charity_b'));
select tests.make_offer('o_demo', 'site_a', 'bread', 20);
select tests.set_var('ad', tests.request('charity_owner', tests.id('o_demo'), 2)::text);
select tests.confirm('store_staff', tests.var('ad')::uuid);
select tests.pickup('charity_owner', array[tests.var('ad')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('ad')::uuid), 'd');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('d_token'), tests.full_lines(tests.stop_of(tests.var('ad')::uuid)), gen_random_uuid());
select tests.clear_auth();
select is((select is_demo from public.impact_ledger where allocation_id = tests.var('ad')::uuid), true, 'demo flag flows into the ledger');
select set_config('fs.demo_reset', 'on', true);
select is(tests.affected(format($$delete from public.impact_ledger where allocation_id = %L$$, tests.var('ad'))), 1::bigint,
  'demo_reset path deletes demo rows');
select set_config('fs.demo_reset', '', true);

select * from finish();
rollback;

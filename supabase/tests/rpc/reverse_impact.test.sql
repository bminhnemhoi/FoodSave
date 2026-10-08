-- reverse_impact (DATA-MODEL §2.5 impact_ledger "Đảo ngược từng phần", §8.6, §13; ESG-METHODOLOGY
-- §6.1; SECURITY-PRIVACY C3): admin aal2 (not a member of either side) appends a negative reversal
-- pointing to a credit; repeatable, Σ reversals ≤ credit, co2e/water/meals pro rata with the
-- credit's factor_version. The ledger itself is never updated or deleted.
begin;
\ir ../_helpers.psql

select plan(31);

select tests.create_user('admin_member');
select tests.make_admin('admin_member');
select tests.add_member('charity_b', 'admin_member', 'staff');

-- 5 loaves × 0.12 kg delivered (self trip) => credit 0.6 kg, 1.2 kg CO2e, 90 L, 1.43 meals (v1)
select tests.make_offer('o1', 'site_a', 'bread', 20);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.pickup('charity_owner', array[tests.var('a1')::uuid]);
select tests.issue('charity_owner', tests.stop_of(tests.var('a1')::uuid));
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('h_token'), tests.full_lines(tests.stop_of(tests.var('a1')::uuid)), gen_random_uuid());
select tests.clear_auth();
select tests.set_var('line', (select hl.id::text from public.handover_lines hl join public.handovers h on h.id = hl.handover_id
                              where hl.allocation_id = tests.var('a1')::uuid and h.kind = 'dropoff'));
select tests.set_var('pline', (select hl.id::text from public.handover_lines hl join public.handovers h on h.id = hl.handover_id
                               where hl.allocation_id = tests.var('a1')::uuid and h.kind = 'pickup'));
select tests.set_var('credit', (select id::text from public.impact_ledger where handover_line_id = tests.var('line')::uuid));

-- reverse_impact on the dropoff line
create function tests.rev(p_kg numeric, p_reason text default 'Giao thiếu phát hiện muộn', p_op uuid default gen_random_uuid())
returns bigint language sql as $$
  select public.reverse_impact(tests.var('line')::uuid, p_kg, p_reason, p_op);
$$;
grant execute on function tests.rev(numeric, text, uuid) to anon, authenticated;

-- ---- who ----
select tests.as_anon();
select throws_ok($$select public.reverse_impact(tests.var('line')::uuid, 0.1, 'x', gen_random_uuid())$$, '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok($$select tests.rev(0.1)$$, 'PT403', 'not_authorized', 'ordinary user => not_authorized');
select tests.authenticate_as('store_owner');
select throws_ok($$select tests.rev(0.1)$$, 'PT403', 'not_authorized', 'the store cannot correct its own impact');
select tests.authenticate_as('charity_owner');
select throws_ok($$select tests.rev(0.1)$$, 'PT403', 'not_authorized', 'the charity cannot correct its own impact');
select tests.authenticate_as('admin', 'aal1');
select throws_ok($$select tests.rev(0.1)$$, 'PT403', 'mfa_required', 'admin without MFA (aal1) => mfa_required');
select tests.authenticate_as('admin_member', 'aal2');
select throws_ok($$select tests.rev(0.1)$$, 'PT403', 'self_dealing', 'admin who is a member of one side => self_dealing');

-- ---- validation (admin aal2) ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select tests.rev(0.1, null)$$, 'PT422', 'validation_failed', 'reason NULL => validation_failed');
select throws_ok($$select tests.rev(0.1, '   ')$$, 'PT422', 'validation_failed', 'blank reason => validation_failed');
select throws_ok(format($$select tests.rev(0.1, %L)$$, repeat('x', 1001)), 'PT422', 'validation_failed', 'reason > 1000 chars => validation_failed');
select throws_ok($$select tests.rev(0)$$, 'PT422', 'validation_failed', 'p_kg = 0 => validation_failed');
select throws_ok($$select tests.rev(-0.1)$$, 'PT422', 'validation_failed', 'negative p_kg => validation_failed');
select throws_ok($$select tests.rev(0.0004)$$, 'PT422', 'validation_failed',
  'p_kg below the ledger precision (0.0004 kg rounds to 0.000) => validation_failed, not a CHECK violation');
select is((tests.error_of($$select tests.rev(0.1, 'x', null)$$) ->> 'detail')::jsonb, '{"p_client_op_id":"required"}'::jsonb,
  'client_op_id required');
select throws_ok($$select public.reverse_impact(null, 0.1, 'x', gen_random_uuid())$$, 'PT404', 'not_found', 'NULL line => not_found');
select throws_ok($$select public.reverse_impact(gen_random_uuid(), 0.1, 'x', gen_random_uuid())$$, 'PT404', 'not_found', 'unknown line => not_found');
select throws_ok($$select public.reverse_impact(tests.var('pline')::uuid, 0.1, 'x', gen_random_uuid())$$, 'PT404', 'not_found',
  'pickup line (never credited) => not_found');
select tests.clear_auth();
select is((select count(*)::int from public.impact_ledger where allocation_id = tests.var('a1')::uuid), 1, 'refused calls append nothing');

-- ---- partial reversal 0.2 kg ----
select tests.authenticate_as('admin', 'aal2');
select tests.set_var('r1', tests.rev(0.2, 'Giao thiếu phát hiện muộn', 'fb000000-0000-4000-8000-000000000001')::text);
select tests.clear_auth();
select results_eq($$select entry_type::text, reverses_entry_id, handover_line_id, allocation_id, kg, co2e_kg, water_l, meals, factor_version,
                           reason, created_by, occurred_at = now()
                    from public.impact_ledger where id = tests.var('r1')::bigint$$,
  format($$values ('reversal', %s::bigint, %L::uuid, %L::uuid, -0.200::numeric, -0.400::numeric, -30.00::numeric, -0.48::numeric, 'v1',
                   'Giao thiếu phát hiện muộn', %L::uuid, true)$$,
         tests.var('credit'), tests.var('line'), tests.var('a1'), tests.id('admin')),
  'reversal row: −0.2 kg, CO2e/water/meals pro rata (1/3) with the credit''s v1, reason, by the admin, now');
select results_eq($$select kg, co2e_kg, water_l, meals from public.impact_ledger where id = tests.var('credit')::bigint$$,
  $$values (0.600::numeric, 1.200::numeric, 90.00::numeric, 1.43::numeric)$$, 'the credit itself is untouched');
select tests.authenticate_as('admin', 'aal2');
select is(tests.rev(0.2, 'Giao thiếu phát hiện muộn', 'fb000000-0000-4000-8000-000000000001'), tests.var('r1')::bigint,
  'replay with the same client_op_id returns the same reversal');
select throws_ok($$select tests.rev(0.3, 'Giao thiếu phát hiện muộn', 'fb000000-0000-4000-8000-000000000001')$$,
  'PT409', 'idempotency_conflict', 'same client_op_id, other kg => idempotency_conflict');
select is(tests.error_of($$select tests.rev(0.5)$$),
  jsonb_build_object('sqlstate', 'PT409', 'message', 'invalid_state', 'detail', '{"remaining_kg": 0.400}', 'hint', null),
  'more than what is left (0.5 > 0.4) => invalid_state {remaining_kg}');
select tests.clear_auth();
select is((select count(*)::int from public.impact_ledger where reverses_entry_id = tests.var('credit')::bigint), 1,
  'replay and refused calls append nothing');

-- ---- more partial reversals until nothing is left ----
select tests.authenticate_as('admin', 'aal2');
select tests.set_var('r2', tests.rev(0.1234)::text);
select tests.set_var('r3', tests.rev(null)::text);
select tests.clear_auth();
select results_eq($$select kg, co2e_kg, water_l, meals from public.impact_ledger where id = tests.var('r2')::bigint$$,
  $$values (-0.123::numeric, -0.246::numeric, -18.45::numeric, -0.29::numeric)$$,
  'p_kg is taken at ledger precision: 0.1234 => −0.123 kg and CO2e/water/meals pro rata of 0.123');
select results_eq($$select kg, co2e_kg, water_l, meals from public.impact_ledger where id = tests.var('r3')::bigint$$,
  $$values (-0.277::numeric, -0.554::numeric, -41.55::numeric, -0.66::numeric)$$, 'p_kg NULL reverses everything left (0.277 kg)');
select results_eq($$select sum(kg), sum(co2e_kg), sum(water_l), sum(meals), count(*) filter (where entry_type = 'reversal')
                    from public.impact_ledger where handover_line_id = tests.var('line')::uuid$$,
  $$values (0.000::numeric, 0.000::numeric, 0.00::numeric, 0.00::numeric, 3::bigint)$$,
  'Σ reversals = credit: the line nets to zero on every metric');
select tests.authenticate_as('admin', 'aal2');
select is(tests.error_of($$select tests.rev(null)$$),
  jsonb_build_object('sqlstate', 'PT409', 'message', 'invalid_state', 'detail', '{"remaining_kg": 0.000}', 'hint', null),
  'nothing left => invalid_state');
select tests.clear_auth();
select results_eq($$select count(*), bool_and(reason = 'Giao thiếu phát hiện muộn' and actor_id = tests.id('admin'))
                    from public.audit_logs where action = 'ledger.reverse' and after ->> 'handover_line_id' = tests.var('line')$$,
  $$values (3::bigint, true)$$, 'each reversal audited (ledger.reverse) with the reason, by the admin');

-- ---- append-only ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$update public.impact_ledger set kg = -0.1 where id = %s$$, tests.var('r1')), '42501', null,
  'admin aal2 cannot edit a reversal (no UPDATE privilege)');
select throws_ok(format($$delete from public.impact_ledger where id = %s$$, tests.var('r1')), '42501', null,
  'admin aal2 cannot delete a reversal (no DELETE privilege)');
select tests.clear_auth();
select throws_ok(format($$update public.impact_ledger set reason = 'x' where id = %s$$, tests.var('r1')), '42501', 'append_only',
  'even postgres cannot update a reversal (trigger)');

select * from finish();
rollback;

-- set_org_paused (DATA-MODEL §8.2): owner/manager of an approved org; no-op when unchanged; audited.
begin;
\ir ../_helpers.psql

select plan(13);

select tests.as_anon();
select throws_ok(format($$select public.set_org_paused(%L, true, null)$$, tests.id('store_a')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.set_org_paused(%L, true, null)$$, tests.id('store_a')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.set_org_paused(%L, true, null)$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'staff cannot pause');
select tests.authenticate_as('draft_owner');
select throws_ok(format($$select public.set_org_paused(%L, true, null)$$, tests.id('draft_c')),
  'PT409', 'invalid_state', 'draft org cannot pause');

select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.set_org_paused(%L, null, null)$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'p_paused required');
select lives_ok(format($$select public.set_org_paused(%L, true, ' Nghỉ Tết ')$$, tests.id('store_a')), 'manager pauses');
select lives_ok(format($$select public.set_org_paused(%L, true, 'Nghỉ Tết')$$, tests.id('store_a')), 'same value again');
select tests.clear_auth();
select results_eq(
  $$select is_paused, paused_reason from public.organizations where id = tests.id('store_a')$$,
  $$values (true, 'Nghỉ Tết'::text)$$, 'paused with trimmed reason');
select is((select count(*)::int from public.audit_logs where action = 'org.pause'), 1, 'unchanged second call is not audited');

select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.set_org_paused(%L, false, 'ignored')$$, tests.id('store_a')), 'owner resumes');
select tests.clear_auth();
select results_eq(
  $$select is_paused, paused_reason from public.organizations where id = tests.id('store_a')$$,
  $$values (false, null::text)$$, 'resumed, reason cleared');
select is((select count(*)::int from public.audit_logs where action = 'org.resume'), 1, 'resume audited');

select tests.authenticate_as('store_owner');
select throws_ok(format($$update public.organizations set is_paused = true where id = %L$$, tests.id('store_a')),
  '42501', null, 'is_paused is not directly writable');
select tests.clear_auth();

select * from finish();
rollback;

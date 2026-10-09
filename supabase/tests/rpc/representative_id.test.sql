-- Representative CCCD number (B2; DATA-MODEL §2.1, §8.2, §16; SECURITY-PRIVACY C6; NĐ 356/2025 Điều 3–4):
-- owner/manager set the 12-digit number (valid province code), read it masked only; the full number lives in
-- private.org_representative_ids, revealed to admin aal2 only (audited); purged 30 days after closure.
begin;
\ir ../_helpers.psql

select plan(42);

-- ---- privileges ----
select tests.as_anon();
select throws_ok(format($$select public.set_representative_id(%L, '079123455678', 'manual')$$, tests.id('draft_c')),
  '42501', null, 'anon: no EXECUTE on set_representative_id');
select throws_ok(format('select * from public.get_representative_id_summary(%L)', tests.id('draft_c')),
  '42501', null, 'anon: no EXECUTE on get_representative_id_summary');
select throws_ok(format('select public.reveal_representative_id(%L)', tests.id('draft_c')),
  '42501', null, 'anon: no EXECUTE on reveal_representative_id');
select ok(not has_table_privilege('authenticated', 'private.org_representative_ids', 'SELECT')
          and not has_table_privilege('anon', 'private.org_representative_ids', 'SELECT'),
  'no role but the owner of the schema reads the private table');

-- ---- validation (draft org) ----
select tests.authenticate_as('draft_owner');
select throws_ok(format($$select public.set_representative_id(%L, '099123455678', 'manual')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'province code 099 does not exist');
select throws_ok(format($$select public.set_representative_id(%L, '003123455678', 'manual')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'province code 003 does not exist (gaps in the official list)');
select throws_ok(format($$select public.set_representative_id(%L, '07912345567', 'manual')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', '11 digits rejected');
select throws_ok(format($$select public.set_representative_id(%L, '0791234556789', 'manual')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', '13 digits rejected');
select throws_ok(format($$select public.set_representative_id(%L, '07912345567a', 'manual')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'non-digit rejected');
select throws_ok(format($$select public.set_representative_id(%L, null, 'manual')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'NULL number rejected');
select throws_ok($$select public.set_representative_id(null, '079123455678', 'manual')$$,
  'PT422', 'validation_failed', 'NULL org rejected');
select throws_ok(format($$select public.set_representative_id(%L, '079123455678', null)$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'NULL source rejected');
select throws_ok(format($$select public.set_representative_id(%L, '079123455678', 'cccd_qr')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'cccd_qr needs the name read from the card');
select throws_ok(format($$select public.set_representative_id(%L, '079123455678', 'photo')$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'unknown source (there is no image source)');

-- ---- who may set it ----
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.set_representative_id(%L, '079123455678', 'manual')$$, tests.id('store_a')),
  'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.set_representative_id(%L, '079123451234', 'manual')$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'staff: not_authorized (owner/manager only)');

-- ---- draft: set, masked read, replace ----
select tests.authenticate_as('draft_owner');
select is(public.set_representative_id(tests.id('draft_c'), ' 079123455678 ', 'manual'),
  '{"masked":"079*****5678"}'::jsonb, 'owner sets the number, gets the masked form');
select throws_ok('select * from private.org_representative_ids', '42501', null, 'owner cannot read the private table');
select results_eq(format('select masked, source, name_on_card from public.get_representative_id_summary(%L)', tests.id('draft_c')),
  $$values ('079*****5678'::text, 'manual'::text, null::text)$$, 'owner reads the masked form only');
select is_empty(format($$select 1 from public.get_representative_id_summary(%L) s where s.masked ~ '[0-9]{5}'$$, tests.id('draft_c')),
  'never more than the province code and the last 4 digits');
select lives_ok(format($$select public.set_representative_id(%L, '001095001234', 'cccd_qr', '  Nguyễn   Văn A ')$$, tests.id('draft_c')),
  'replace while draft, from the QR (name collapsed)');
select results_eq(format('select masked, source, name_on_card from public.get_representative_id_summary(%L)', tests.id('draft_c')),
  $$values ('001*****1234'::text, 'cccd_qr'::text, 'Nguyễn Văn A'::text)$$, 'summary follows the replacement');
select tests.clear_auth();
select results_eq(format('select representative_id_last4::text from public.org_sensitive where org_id = %L', tests.id('draft_c')),
  $$values ('1234'::text)$$, 'org_sensitive.representative_id_last4 kept in sync');
select tests.authenticate_as('store_owner');
select throws_ok(format('select * from public.get_representative_id_summary(%L)', tests.id('draft_c')), 'PT404', 'not_found',
  'owner of another org: not_found');
select throws_ok('select * from public.get_representative_id_summary(null)', 'PT422', 'validation_failed', 'NULL org: validation_failed');

-- ---- approved org: first capture only, last 4 must match what FoodSave recorded ----
select throws_ok(format($$select public.set_representative_id(%L, '079123456789', 'manual')$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'approved: other last 4 digits than recorded => validation_failed');
select tests.authenticate_as('store_manager');
select lives_ok(format($$select public.set_representative_id(%L, '079123451234', 'manual')$$, tests.id('store_a')),
  'approved: manager captures the number once (last 4 match)');
select is(tests.error_of(format($$select public.set_representative_id(%L, '079123451234', 'manual')$$, tests.id('store_a'))) ->> 'detail',
  'id_locked', 'approved: a second change is locked (change request instead)');

-- ---- admin reveal: aal2 only, audited ----
select tests.authenticate_as('store_owner', 'aal2');
select throws_ok(format('select public.reveal_representative_id(%L)', tests.id('store_a')), 'PT403', 'not_authorized',
  'owner (even aal2) cannot reveal the full number');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format('select public.reveal_representative_id(%L)', tests.id('store_a')), 'PT403', 'mfa_required',
  'admin aal1: mfa_required');
select tests.authenticate_as('admin', 'aal2');
select is(public.reveal_representative_id(tests.id('store_a')), '079123451234', 'admin aal2 reveals the full number');
select results_eq(format('select masked from public.get_representative_id_summary(%L)', tests.id('store_a')),
  $$values ('079*****1234'::text)$$, 'admin aal2 also reads the masked summary');
select throws_ok(format('select public.reveal_representative_id(%L)', tests.id('store_x')), 'PT404', 'not_found',
  'no number captured: not_found');
select throws_ok('select public.reveal_representative_id(null)', 'PT422', 'validation_failed', 'NULL org: validation_failed');
select tests.clear_auth();
select results_eq($$select actor_id, actor_kind, org_id from public.audit_logs where action = 'representative_id.reveal'$$,
  format($$values (%L::uuid, 'admin'::text, %L::uuid)$$, tests.id('admin'), tests.id('store_a')),
  'one audit row per reveal (admin, org)');
select is_empty($$select id from public.audit_logs
                  where action in ('representative_id.reveal', 'org.representative_id_set')
                    and (coalesce(after::text, '') ~ '[0-9]{4}' or coalesce(before::text, '') ~ '[0-9]{4}')$$,
  'no digits of the number in the audit trail');

-- ---- sync: admin verifies other digits => the stale full number is dropped ----
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.verify_representative_id(%L, '9999', 'video_call')$$, tests.id('store_a')),
  'admin verifies over a video call (new method)');
select tests.clear_auth();
select results_eq(format($$select (select count(*)::int from private.org_representative_ids where org_id = %L),
                                  (select id_verification_method from public.org_sensitive where org_id = %L)$$,
                         tests.id('store_a'), tests.id('store_a')),
  $$values (0, 'video_call'::text)$$, 'full number with other last 4 dropped; method video_call stored');

-- ---- retention: 30 days after closure ----
select tests.authenticate_as('store_owner');
select public.set_representative_id(tests.id('store_a'), '079123459999', 'manual');
select tests.clear_auth();
update public.organizations set status = 'closed', closed_at = now() where id = tests.id('store_a');
select tests.as_service();
select is(public.purge_retention() ->> 'representative_ids_purged', '0', 'closed today: kept');
select tests.clear_auth();
select tests.set_clock(now() + interval '31 days');
select tests.as_service();
select is(public.purge_retention() ->> 'representative_ids_purged', '1', '31 days after closure: the full number is purged');
select tests.clear_auth();
select tests.clear_clock();
select results_eq(format($$select (select count(*)::int from private.org_representative_ids where org_id = %L),
                                  (select representative_id_last4::text from public.org_sensitive where org_id = %L)$$,
                         tests.id('store_a'), tests.id('store_a')),
  $$values (0, '9999'::text)$$, 'full number gone; last 4 digits follow org_sensitive retention (12 months)');
select is((select count(*)::int from private.org_representative_ids where org_id = tests.id('draft_c')), 1,
  'the number of an open (draft) org is untouched');

select * from finish();
rollback;

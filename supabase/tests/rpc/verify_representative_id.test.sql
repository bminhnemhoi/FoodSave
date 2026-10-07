-- verify_representative_id (DATA-MODEL §8.2, SECURITY-PRIVACY §2.2): admin aal2, not self; stores
-- only 4 digits + verifier + method; bypasses the legal-field lock; audit without the digits.
begin;
\ir ../_helpers.psql

select plan(12);

select tests.as_anon();
select throws_ok(format($$select public.verify_representative_id(%L, '6789', 'cccd_qr')$$, tests.id('store_a')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('store_owner', 'aal2');
select throws_ok(format($$select public.verify_representative_id(%L, '6789', 'cccd_qr')$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'owner cannot verify their own representative');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.verify_representative_id(%L, '6789', 'cccd_qr')$$, tests.id('store_a')),
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');

select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.verify_representative_id(%L, '079123456789', 'cccd_qr')$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'a full CCCD number is refused (4 digits only)');
select throws_ok(format($$select public.verify_representative_id(%L, '6789', 'selfie')$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'unknown method');
select throws_ok(format($$select public.verify_representative_id(%L, '6789', 'cccd_qr')$$, tests.id('draft_c')),
  'PT409', 'invalid_state', 'draft org cannot be verified');
select throws_ok($$select public.verify_representative_id(gen_random_uuid(), '6789', 'cccd_qr')$$,
  'PT404', 'not_found', 'unknown org');
select lives_ok(format($$select public.verify_representative_id(%L, '6789', 'cccd_qr')$$, tests.id('store_a')),
  'admin aal2 verifies an approved org (legal lock bypassed)');
select tests.clear_auth();

select results_eq(
  $$select representative_id_last4::text, id_verified_by, id_verification_method, id_verified_at is not null
    from public.org_sensitive where org_id = tests.id('store_a')$$,
  $$values ('6789'::text, tests.id('admin'), 'cccd_qr'::text, true)$$,
  'last4 + verifier + method stored');
select results_eq(
  $$select after from public.audit_logs where action = 'org.verify_id'$$,
  $$values ('{"id_verification_method":"cccd_qr"}'::jsonb)$$,
  'audit does not contain the digits');

select tests.create_org('adm_org', 'charity', 'admin', 'submitted');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.verify_representative_id(%L, '1111', 'manual_document')$$, tests.id('adm_org')),
  'PT403', 'self_dealing', 'admin cannot verify their own org');
select tests.authenticate_as('store_owner');
select throws_ok(format($$update public.org_sensitive set id_verified_at = now() where org_id = %L$$, tests.id('store_a')),
  '42501', null, 'owner cannot self-verify directly');
select tests.clear_auth();

select * from finish();
rollback;

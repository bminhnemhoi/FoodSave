-- grant_consent / withdraw_consent (DATA-MODEL §11, SECURITY-PRIVACY §6): own rows only, one active
-- per purpose, new version supersedes, idempotent, user_agent from request headers, audited.
begin;
\ir ../_helpers.psql

select plan(19);

select tests.as_anon();
select throws_ok($$select public.grant_consent('terms', '2026-10-v1', repeat('a', 64), 'web')$$,
  '42501', null, 'anon has no EXECUTE on grant_consent');
select throws_ok($$select public.withdraw_consent('terms')$$, '42501', null, 'anon has no EXECUTE on withdraw_consent');

select tests.authenticate_as('outsider');
select throws_ok($$select public.grant_consent('terms', '2026-10-v1', 'not-a-hash', 'web')$$,
  'PT422', 'validation_failed', 'text_hash must be sha256 hex');
select throws_ok($$select public.grant_consent('terms', '2026-10-v1', repeat('a', 64), 'email')$$,
  'PT422', 'validation_failed', 'unknown source');
select throws_ok($$select public.grant_consent('terms', 'v 1; drop', repeat('a', 64), 'web')$$,
  'PT422', 'validation_failed', 'policy_version format');

select set_config('request.headers', '{"user-agent":"Mozilla/5.0 pgTAP"}', true);
select lives_ok($$select public.grant_consent('terms', '2026-10-v1', repeat('a', 64), 'web')$$, 'grant terms');
select is(public.grant_consent('terms', '2026-10-v1', repeat('a', 64), 'web'),
  (select id from public.consents where purpose = 'terms' and withdrawn_at is null),
  'granting the same version again returns the same row');
select tests.clear_auth();

select results_eq(
  $$select user_id, policy_version, source, user_agent, ip_hash from public.consents where purpose = 'terms'$$,
  $$values (tests.id('outsider'), '2026-10-v1'::text, 'web'::text, 'Mozilla/5.0 pgTAP'::text, null::text)$$,
  'consent row for the caller with user agent, no raw IP');
select is(private.has_consent(tests.id('outsider'), 'terms'), true, 'has_consent true');
select is((select count(*)::int from public.audit_logs where action = 'consent.grant'), 1, 'one grant audited');

select tests.authenticate_as('outsider');
select lives_ok($$select public.grant_consent('terms', '2026-11-v2', repeat('b', 64), 'pwa')$$, 'new policy version');
select tests.clear_auth();
select results_eq(
  $$select policy_version, withdrawn_at is null from public.consents where purpose = 'terms' order by granted_at, withdrawn_at nulls last$$,
  $$values ('2026-10-v1'::text, false), ('2026-11-v2'::text, true)$$,
  'old version superseded, new one active');

-- marketing is independent; withdraw
select tests.authenticate_as('outsider');
select lives_ok($$select public.grant_consent('marketing', '2026-10-v1', repeat('c', 64), 'web')$$, 'grant marketing');
select lives_ok($$select public.withdraw_consent('marketing')$$, 'withdraw marketing');
select lives_ok($$select public.withdraw_consent('marketing')$$, 'withdrawing again is a no-op');
select lives_ok($$select public.withdraw_consent('location_trip')$$, 'withdrawing a never-given consent is a no-op');
select tests.clear_auth();
select is(private.has_consent(tests.id('outsider'), 'marketing'), false, 'marketing no longer active');
select is((select count(*)::int from public.audit_logs where action = 'consent.withdraw'), 1, 'one withdrawal audited');

-- consents of other users are untouched and not directly writable
select tests.authenticate_as('store_owner');
select throws_ok($$insert into public.consents (user_id, purpose, policy_version, source, text_hash)
                   values (auth.uid(), 'terms', 'x', 'web', 'y')$$,
  '42501', null, 'no direct INSERT on consents');
select tests.clear_auth();

select * from finish();
rollback;

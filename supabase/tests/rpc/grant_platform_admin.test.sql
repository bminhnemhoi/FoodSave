-- grant_platform_admin / revoke_platform_admin (DATA-MODEL §8.2, DEPLOYMENT §5.6, TESTING §2.2)
-- Callers: service_role, direct postgres session, or admin aal2. Always audited. Refuses self-revoke
-- and revoking the last admin.
begin;
\ir ../_helpers.psql

select plan(30);

-- ---- Unauthorized callers ----
select tests.as_anon();
select throws_ok($$select public.grant_platform_admin(tests.id('outsider'), 'x')$$,
  '42501', null, 'anon has no EXECUTE on grant_platform_admin');
select throws_ok($$select public.revoke_platform_admin(tests.id('admin'), 'x')$$,
  '42501', null, 'anon has no EXECUTE on revoke_platform_admin');

select tests.authenticate_as('outsider', 'aal2');
select throws_ok($$select public.grant_platform_admin(tests.id('outsider'), 'tự cấp')$$,
  'PT403', 'not_authorized', 'plain user (aal2) is rejected');
select throws_ok($$select public.revoke_platform_admin(tests.id('admin'), 'phá')$$,
  'PT403', 'not_authorized', 'plain user cannot revoke an admin');

select tests.authenticate_as('admin', 'aal1');
select throws_ok($$select public.grant_platform_admin(tests.id('outsider'), 'cấp')$$,
  'PT403', 'mfa_required', 'admin with aal1 is rejected (mfa_required)');

select tests.authenticate_as('outsider');
select throws_ok($$select private.audit('admin.grant', 'profile', auth.uid())$$,
  '42501', null, 'authenticated cannot call private.audit directly');

-- ---- Validation ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.grant_platform_admin(tests.id('outsider'), '   ')$$,
  'PT422', 'validation_failed', 'reason is required');
select throws_ok($$select public.grant_platform_admin(gen_random_uuid(), 'không tồn tại')$$,
  'PT404', 'not_found', 'unknown user => not_found');

-- ---- Admin aal2 grants ----
select lives_ok($$select public.grant_platform_admin(tests.id('outsider'), 'Thêm admin vận hành')$$,
  'admin aal2 can grant');
select tests.clear_auth();
select is((select platform_role from public.profiles where id = tests.id('outsider')),
  'admin'::public.platform_role, 'grantee is now admin');
select results_eq(
  $$select actor_id, actor_kind, action, entity_type, entity_id, reason, after
    from public.audit_logs where action = 'admin.grant'$$,
  $$values (tests.id('admin'), 'admin'::text, 'admin.grant'::text, 'profile'::text, tests.id('outsider'),
            'Thêm admin vận hành'::text, '{"platform_role":"admin"}'::jsonb)$$,
  'grant is audited with actor, reason and after-state');

select tests.authenticate_as('admin', 'aal2');
select lives_ok($$select public.grant_platform_admin(tests.id('outsider'), 'lần hai')$$,
  'granting an existing admin is an idempotent no-op');
select tests.clear_auth();
select is((select count(*)::int from public.audit_logs where action = 'admin.grant'), 1,
  'idempotent grant writes no extra audit row');

-- ---- service_role grants ----
select tests.as_service();
select lives_ok($$select public.grant_platform_admin(tests.id('store_owner'), 'Bootstrap bằng service role')$$,
  'service_role can grant');
select tests.clear_auth();
select results_eq(
  $$select actor_id, actor_kind from public.audit_logs
    where action = 'admin.grant' and entity_id = tests.id('store_owner')$$,
  $$values (null::uuid, 'service'::text)$$,
  'service_role grant audited with actor_kind = service, actor_id null');

-- ---- direct postgres session (SQL Editor / bootstrap) ----
select lives_ok($$select public.grant_platform_admin(tests.id('store_staff'), 'SQL Editor')$$,
  'postgres session (no SET ROLE) can grant');
select is((select actor_kind from public.audit_logs
           where action = 'admin.grant' and entity_id = tests.id('store_staff')),
  'service', 'postgres session grant audited as service');

-- ---- Revoke ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.revoke_platform_admin(auth.uid(), 'tự gỡ')$$,
  'PT403', 'self_dealing', 'admin cannot revoke themselves');
select throws_ok($$select public.revoke_platform_admin(tests.id('outsider'), '')$$,
  'PT422', 'validation_failed', 'revoke reason is required');
select lives_ok($$select public.revoke_platform_admin(tests.id('outsider'), 'Hết nhiệm vụ')$$,
  'admin aal2 can revoke another admin');
select lives_ok($$select public.revoke_platform_admin(tests.id('charity_owner'), 'không phải admin')$$,
  'revoking a non-admin is an idempotent no-op');
select tests.clear_auth();
select is((select platform_role from public.profiles where id = tests.id('outsider')),
  'user'::public.platform_role, 'revoked user is back to user');
select results_eq(
  $$select actor_id, action, before, after, reason from public.audit_logs where action = 'admin.revoke'$$,
  $$values (tests.id('admin'), 'admin.revoke'::text, '{"platform_role":"admin"}'::jsonb,
            '{"platform_role":"user"}'::jsonb, 'Hết nhiệm vụ'::text)$$,
  'revoke is audited exactly once (no row for the no-op)');

-- ---- Last admin ----
select tests.as_service();
select lives_ok($$select public.revoke_platform_admin(tests.id('store_owner'), 'dọn dẹp')$$,
  'service_role can revoke');
select lives_ok($$select public.revoke_platform_admin(tests.id('store_staff'), 'dọn dẹp')$$,
  'service_role revokes down to one admin');
select throws_ok($$select public.revoke_platform_admin(tests.id('admin'), 'xóa admin cuối')$$,
  'PT409', 'invalid_state', 'revoking the last admin is refused');
select tests.clear_auth();
select is((select count(*)::int from public.profiles where platform_role = 'admin'), 1,
  'exactly one admin remains');

-- ---- audit_logs stays append-only, even for postgres ----
select throws_ok($$update public.audit_logs set reason = 'sửa lịch sử'$$,
  '42501', 'append_only', 'audit_logs cannot be updated (postgres)');
select throws_ok($$delete from public.audit_logs$$,
  '42501', 'append_only', 'audit_logs cannot be deleted (postgres)');
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$delete from public.audit_logs$$,
  '42501', null, 'authenticated (even admin) has no DELETE privilege on audit_logs');
select tests.clear_auth();

select * from finish();
rollback;

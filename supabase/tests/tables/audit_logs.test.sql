-- audit_logs: S owner/manager of the approved org (rows with that org_id) + admin aal2;
-- written only by private.audit; append-only (§14).
begin;
\ir ../_helpers.psql

select plan(13);

select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'RLS enabled');
select policies_are('public', 'audit_logs', array['audit_logs_select']);

do $$
begin
  perform private.audit('org.review', 'organization', tests.id('store_a'), tests.id('store_a'),
                        '{"status":"submitted"}', '{"status":"approved"}', 'Hồ sơ đầy đủ');
  perform private.audit('settings.update', 'app_setting', null);
end;
$$;

select is((select actor_kind from public.audit_logs where action = 'settings.update'), 'system',
  'no JWT => actor_kind system');

select tests.as_anon();
select throws_ok('select id from public.audit_logs', '42501', null, 'anon: no access');
select tests.authenticate_as('store_owner');
select results_eq('select action from public.audit_logs', $$values ('org.review'::text)$$,
  'owner sees audit rows of their org only');
select throws_ok($$insert into public.audit_logs (actor_kind, action, entity_type) values ('admin', 'x.y', 'z')$$,
  '42501', null, 'no direct INSERT');
select tests.authenticate_as('store_staff');
select is_empty('select id from public.audit_logs', 'staff: 0 rows');
select tests.authenticate_as('other_owner');
select is_empty('select id from public.audit_logs', 'owner of another org: 0 rows');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select id from public.audit_logs', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.audit_logs), 2, 'admin aal2 sees all');
select tests.clear_auth();

-- actor deletion: FK on delete set null is the only mutation allowed
select tests.create_user('leaver');
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tests.id('leaver'), 'role', 'authenticated')::text, true);
  perform private.audit('profile.update', 'profile', tests.id('leaver'));
end;
$$;
select results_eq($$select actor_id, actor_kind from public.audit_logs where action = 'profile.update'$$,
  $$values (tests.id('leaver'), 'user'::text)$$, 'actor_id / actor_kind come from the JWT');
select tests.clear_auth();
delete from auth.users where id = tests.id('leaver');
select is((select count(*)::int from public.audit_logs where action = 'profile.update' and actor_id is null), 1,
  'deleting the actor nulls actor_id and keeps the row');
select throws_ok($$update public.audit_logs set actor_id = null, reason = 'sửa' where action = 'org.review'$$,
  '42501', 'append_only', 'nulling actor_id together with other columns is refused');

select * from finish();
rollback;

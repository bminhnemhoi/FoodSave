-- rate_limits: no policy, no grant to anon/authenticated; definer functions / service role only (§9.2, §15).
begin;
\ir ../_helpers.psql

select plan(7);

select ok((select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass), 'RLS enabled');
select is_empty($$select polname from pg_policy where polrelid = 'public.rate_limits'::regclass$$,
  'no policy at all');
select col_is_pk('public', 'rate_limits', array['key', 'window_start'], 'PK (key, window_start)');

select tests.as_anon();
select throws_ok('select * from public.rate_limits', '42501', null, 'anon: no SELECT');
select tests.authenticate_as('admin', 'aal2');
select throws_ok('select * from public.rate_limits', '42501', null, 'authenticated (even admin aal2): no SELECT');
select throws_ok($$insert into public.rate_limits (key, window_start, count) values ('x:user:y', now(), 0)$$,
  '42501', null, 'authenticated: no INSERT');
select tests.as_service();
select lives_ok('select * from public.rate_limits', 'service_role reads');
select tests.clear_auth();

select * from finish();
rollback;

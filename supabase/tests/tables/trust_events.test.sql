-- trust_events: S owner/manager/staff of approved org + admin aal2; append-only.
begin;
\ir ../_helpers.psql

select plan(11);

select ok((select relrowsecurity from pg_class where oid = 'public.trust_events'::regclass), 'RLS enabled');
select policies_are('public', 'trust_events', array['trust_events_select']);

insert into public.trust_events (org_id, delta, reason)
values (tests.id('store_a'), 1, 'delivered_on_time'),
       (tests.id('charity_b'), 1, 'delivered_on_time');

select tests.as_anon();
select throws_ok('select id from public.trust_events', '42501', null, 'anon: no access');
select tests.authenticate_as('store_staff');
select is((select count(*)::int from public.trust_events), 1, 'staff sees own org events only');
select throws_ok(format($$insert into public.trust_events (org_id, delta, reason) values (%L, 50, 'admin_adjust')$$, tests.id('store_a')),
  '42501', null, 'members cannot write trust events (B6)');
select tests.authenticate_as('charity_volunteer');
select is_empty('select id from public.trust_events', 'volunteer: 0 rows');
select tests.authenticate_as('outsider');
select is_empty('select id from public.trust_events', 'unrelated user: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.trust_events), 2, 'admin aal2 sees all');
select tests.clear_auth();

select throws_ok($$update public.trust_events set delta = 10$$, '42501', 'append_only', 'append-only: UPDATE refused (postgres)');
select throws_ok($$delete from public.trust_events$$, '42501', 'append_only', 'append-only: DELETE refused (postgres)');
select set_config('fs.allow_purge', 'on', true);
select is(tests.affected('delete from public.trust_events'), 2::bigint, 'purge path (fs.allow_purge) can delete');

select * from finish();
rollback;

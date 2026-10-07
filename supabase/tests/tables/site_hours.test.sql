-- site_hours: S whenever the parent site is visible; writes RPC only (set_site_hours).
begin;
\ir ../_helpers.psql

select plan(10);

select ok((select relrowsecurity from pg_class where oid = 'public.site_hours'::regclass), 'RLS enabled');
select policies_are('public', 'site_hours', array['site_hours_select']);

insert into public.site_hours (site_id, dow, opens, closes)
values (tests.id('site_a'), 1, '07:00', '21:00'),
       (tests.id('site_c'), 1, '07:00', '21:00');

select tests.as_anon();
select results_eq('select site_id from public.site_hours', $$values (tests.id('site_a'))$$,
  'anon sees hours of visible sites only (not the draft org)');
select tests.authenticate_as('draft_owner');
select is((select count(*)::int from public.site_hours), 2, 'draft owner also sees own site hours');
select tests.authenticate_as('store_owner');
select throws_ok(format($$insert into public.site_hours (site_id, dow, opens, closes) values (%L, 2, '07:00', '21:00')$$, tests.id('site_a')),
  '42501', null, 'owner cannot INSERT directly (set_site_hours RPC)');
select throws_ok($$update public.site_hours set closes = '23:00'$$, '42501', null, 'owner cannot UPDATE directly');
select throws_ok($$delete from public.site_hours$$, '42501', null, 'owner cannot DELETE directly');
select tests.clear_auth();

select throws_ok(format($$insert into public.site_hours (site_id, dow, opens, closes) values (%L, 3, '21:00', '07:00')$$, tests.id('site_a')),
  '23514', null, 'closes must be after opens unless closes_next_day');
select lives_ok(format($$insert into public.site_hours (site_id, dow, opens, closes, closes_next_day) values (%L, 3, '21:00', '02:00', true)$$, tests.id('site_a')),
  'overnight interval with closes_next_day');
delete from public.sites where id = tests.id('site_c');
select is((select count(*)::int from public.site_hours where site_id = tests.id('site_c')), 0,
  'hours are deleted with their site (cascade)');

select * from finish();
rollback;

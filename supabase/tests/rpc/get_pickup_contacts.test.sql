-- get_pickup_contacts (DATA-MODEL §8.5): parties of a trip with masked phones only.
begin;
\ir ../_helpers.psql

select plan(13);

update public.profiles set phone = '0912345678', full_name = 'Lê Minh Khoa' where id = tests.id('charity_volunteer');
select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.make_offer('o_self', 'site_a', 'bread', 5);
select tests.set_var('a_self', tests.request('charity_owner', tests.id('o_self'), 1)::text);
select tests.confirm('store_staff', tests.var('a_self')::uuid);
select tests.set_var('p_self', tests.pickup('charity_owner', array[tests.var('a_self')::uuid], 'site_b', 'self', 'charity_owner')::text);

create function tests.contacts() returns table (role text, display_name text, phone_masked text) language sql as $$
  select * from public.get_pickup_contacts(tests.var('p1')::uuid) order by 1, 2;
$$;
grant execute on function tests.contacts() to anon, authenticated;

select tests.as_anon();
select throws_ok(format('select * from public.get_pickup_contacts(%L)', tests.var('p1')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select * from public.get_pickup_contacts(%L)', tests.var('p1')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('other_owner');
select throws_ok(format('select * from public.get_pickup_contacts(%L)', tests.var('p1')), 'PT404', 'not_found', 'store not on the trip: not_found');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format('select * from public.get_pickup_contacts(%L)', tests.var('p1')), 'PT404', 'not_found', 'admin aal1: not_found');

select tests.authenticate_as('charity_owner');
select results_eq('select * from tests.contacts()',
  $$values ('charity', 'Org charity_b', '090****567'), ('store', 'Org store_a — Site site_a', '090****567'),
           ('volunteer', 'Lê Minh Khoa', '091****678')$$,
  'coordinator: volunteer, charity and every store of the trip — phones masked');
select tests.authenticate_as('charity_volunteer');
select is((select count(*)::int from tests.contacts()), 3, 'the volunteer sees the same parties');
select tests.authenticate_as('store_staff');
select results_eq('select * from tests.contacts()',
  $$values ('charity', 'Org charity_b', '090****567'), ('volunteer', 'Lê Minh Khoa', '091****678')$$,
  'store of a stop: volunteer + charity only (not the other stores)');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from tests.contacts()), 3, 'admin aal2: all parties');
select tests.clear_auth();

select tests.authenticate_as('charity_owner');
select ok(not exists (select 1 from public.get_pickup_contacts(tests.var('p1')::uuid) c where c.phone_masked ~ '[0-9]{4}'),
  'never 4 consecutive digits (no full phone number)');
select results_eq(format('select role from public.get_pickup_contacts(%L) where role in (%L, %L)', tests.var('p_self'), 'carrier', 'volunteer'),
  $$values ('carrier')$$, 'self pickup: the assignee is listed as carrier');
select tests.clear_auth();
update public.profiles set phone = null where id = tests.id('charity_volunteer');
select tests.authenticate_as('store_staff');
select results_eq($$select phone_masked from tests.contacts() where role = 'volunteer'$$, $$values (null::text)$$, 'no phone => null');
select tests.clear_auth();
select is(private.mask_phone('12345'), '****', 'short numbers fully masked');
select is(private.mask_phone('+84912345678'), '+84******678', 'international format masked');

select * from finish();
rollback;

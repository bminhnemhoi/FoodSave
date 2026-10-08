-- incidents (DATA-MODEL §2.3, §9.2): reporter/subject org members (owner/manager/staff of an
-- approved org) and the reporter read; admin aal2 reads all; writes via RPC (later phase).
begin;
\ir ../_helpers.psql

select plan(13);

select ok((select relrowsecurity from pg_class where oid = 'public.incidents'::regclass), 'RLS enabled');
select policies_are('public', 'incidents', array['incidents_select']);
select ok(not has_table_privilege('authenticated', 'public.incidents', 'INSERT')
          and not has_table_privilege('authenticated', 'public.incidents', 'UPDATE')
          and not has_table_privilege('anon', 'public.incidents', 'SELECT'),
  'no direct writes; anon has no access');

select tests.make_offer('o1', 'site_a', 'bread', 20);
insert into public.incidents (id, kind, reporter_org_id, subject_org_id, offer_id, description, reported_by)
values ('c1000000-0000-4000-8000-000000000001', 'quality', tests.id('charity_b'), tests.id('store_a'), tests.id('o1'),
        'Bánh bị mốc một phần', tests.id('charity_owner')),
       ('c1000000-0000-4000-8000-000000000002', 'other', null, null, null,
        'Tình nguyện viên báo đường ngập', tests.id('charity_volunteer'));

create view tests.my_incidents with (security_invoker = true) as
  select right(id::text, 1) as n from public.incidents where id::text like 'c1000000-%';
grant select on tests.my_incidents to anon, authenticated;

select tests.authenticate_as('store_staff');
select set_eq('select n from tests.my_incidents', array['1'], 'subject store sees the incident');
select tests.authenticate_as('charity_owner');
select set_eq('select n from tests.my_incidents', array['1'], 'reporter charity sees the incident');
select tests.authenticate_as('charity_volunteer');
select set_eq('select n from tests.my_incidents', array['2'], 'volunteer sees only what they reported');
select tests.authenticate_as('other_owner');
select is_empty('select n from tests.my_incidents', 'unrelated store: nothing');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select n from tests.my_incidents', 'admin aal1: nothing');
select tests.authenticate_as('admin', 'aal2');
select set_eq('select n from tests.my_incidents', array['1', '2'], 'admin aal2 sees all');
select tests.authenticate_as('charity_owner');
select throws_ok($$update public.incidents set status = 'resolved'$$, '42501', null, 'members cannot resolve directly');
select tests.clear_auth();

select throws_ok(format($$insert into public.incidents (kind, description, reported_by) values ('quality', 'Không có tham chiếu', %L)$$,
                        tests.id('charity_owner')),
  '23514', null, 'non-"other" incident needs a reference');
select throws_ok($$update public.incidents set status = 'resolved' where id = 'c1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'resolved needs a resolution');
select throws_ok(format($$insert into public.incidents (kind, offer_id, description, reported_by) values ('quality', %L, 'ngắn', %L)$$,
                        tests.id('o1'), tests.id('charity_owner')),
  '23514', null, 'description 10–2000 chars');

select * from finish();
rollback;

-- org_contacts + get_org_contact (B1; DATA-MODEL §2.1, §8.2, §9.2): owner/manager write their own hotline;
-- nobody else selects the table; get_org_contact shares the hotline of an APPROVED org with owner/manager/
-- staff of approved orgs, members of the org and the volunteer of a live trip through it; 60/hour.
begin;
\ir ../_helpers.psql

select plan(37);

-- ---- table: privileges + RLS ----
select ok((select relrowsecurity from pg_class where oid = 'public.org_contacts'::regclass), 'RLS enabled');
select tests.as_anon();
select throws_ok('select * from public.org_contacts', '42501', null, 'anon: no SELECT at all');

select tests.authenticate_as('store_owner');
select lives_ok(format($$insert into public.org_contacts (org_id, hotline_phone, hotline_email)
                         values (%L, ' 0281234567 ', ' Hotline@Store.VN ')$$, tests.id('store_a')),
  'owner inserts the hotline of their org (trimmed, email lower-cased)');
select throws_ok(format($$insert into public.org_contacts (org_id, hotline_phone) values (%L, '0901234567')$$, tests.id('store_x')),
  '42501', null, 'owner cannot write the hotline of another org');
select tests.authenticate_as('store_manager');
select is(tests.affected(format($$update public.org_contacts set hotline_phone = '02812345678' where org_id = %L$$, tests.id('store_a'))),
  1::bigint, 'manager updates it (11-digit landline)');
select throws_ok(format($$update public.org_contacts set hotline_phone = '12345' where org_id = %L$$, tests.id('store_a')),
  '23514', null, 'invalid phone rejected by the check');
select throws_ok(format($$update public.org_contacts set hotline_email = 'not-an-email' where org_id = %L$$, tests.id('store_a')),
  '23514', null, 'invalid email rejected by the check');
select throws_ok(format($$update public.org_contacts set hotline_phone = null, hotline_email = null where org_id = %L$$, tests.id('store_a')),
  '23514', null, 'a row keeps at least one value (clearing both = delete the row)');
select throws_ok(format($$update public.org_contacts set org_id = %L where org_id = %L$$, tests.id('store_x'), tests.id('store_a')),
  '42501', null, 'org_id is not updatable');
select tests.clear_auth();
select results_eq(format('select hotline_phone, hotline_email, updated_by from public.org_contacts where org_id = %L', tests.id('store_a')),
  format($$values ('02812345678'::text, 'hotline@store.vn'::text, %L::uuid)$$, tests.id('store_manager')),
  'normalised values, updated_by = last writer');

select tests.authenticate_as('store_staff');
select is_empty('select 1 from public.org_contacts', 'staff: no direct SELECT (owner/manager only)');
select is(tests.affected(format($$update public.org_contacts set hotline_phone = '0909999999' where org_id = %L$$, tests.id('store_a'))),
  0::bigint, 'staff cannot update');
select tests.authenticate_as('charity_owner');
select is_empty('select 1 from public.org_contacts', 'another approved org: no direct SELECT');
select tests.authenticate_as('charity_volunteer');
select is_empty('select 1 from public.org_contacts', 'volunteer: no direct SELECT');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select 1 from public.org_contacts', 'admin aal1: nothing');
select tests.authenticate_as('admin', 'aal2');
select isnt_empty('select 1 from public.org_contacts', 'admin aal2 reads');
select tests.authenticate_as('draft_owner');
select lives_ok(format($$insert into public.org_contacts (org_id, hotline_phone) values (%L, '19001234')$$, tests.id('draft_c')),
  'a draft org sets its hotline in the wizard (1900 number)');
select tests.clear_auth();

-- ---- get_org_contact: callers ----
select tests.as_anon();
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), 'PT404', 'not_found',
  'user without an approved org: not_found');
select throws_ok('select * from public.get_org_contact(null)', 'PT422', 'validation_failed', 'NULL org id: validation_failed');
select tests.authenticate_as('draft_owner');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), 'PT404', 'not_found',
  'member of an unapproved org only: not_found');

select tests.authenticate_as('charity_owner');
select results_eq(format('select org_name, hotline_phone, hotline_email from public.get_org_contact(%L)', tests.id('store_a')),
  $$values ('Org store_a'::text, '02812345678'::text, 'hotline@store.vn'::text)$$,
  'member of an approved charity reads the store hotline');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('draft_c')), 'PT404', 'not_found',
  'the target must be approved (draft hotline never shared)');
select tests.authenticate_as('store_staff');
select results_eq(format('select org_id, hotline_phone, hotline_email from public.get_org_contact(%L)', tests.id('charity_b')),
  format('values (%L::uuid, null::text, null::text)', tests.id('charity_b')),
  'staff of an approved store: one row with nulls when the charity has no hotline');
select tests.authenticate_as('admin', 'aal2');
select is((select hotline_phone from public.get_org_contact(tests.id('store_a'))), '02812345678', 'admin aal2 reads');

-- ---- volunteer: only own org, or a live trip through the target ----
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), 'PT404', 'not_found',
  'volunteer without a trip: not_found for a store');
select lives_ok(format('select * from public.get_org_contact(%L)', tests.id('charity_b')), 'volunteer reads their own charity');
select tests.clear_auth();

select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), 'PT404', 'not_found',
  'trip offered but not accepted yet: not_found');
select public.respond_pickup(tests.var('p1')::uuid, true, '', gen_random_uuid());
select is((select hotline_phone from public.get_org_contact(tests.id('store_a'))), '02812345678',
  'accepted trip with a stop at the store: hotline readable');
select public.start_pickup(tests.var('p1')::uuid, gen_random_uuid());
select lives_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), 'in_progress trip: readable');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_x')), 'PT404', 'not_found',
  'a store that is not a stop of the trip: not_found');
select tests.authenticate_as('charity_owner');
select public.cancel_pickup(tests.var('p1')::uuid, 'Đổi kế hoạch', gen_random_uuid());
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), 'PT404', 'not_found',
  'finished (cancelled) trip: not_found again');
select tests.clear_auth();

-- ---- suspended target ----
update public.organizations set status = 'suspended' where id = tests.id('store_a');
select tests.authenticate_as('charity_owner');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('store_a')), 'PT404', 'not_found',
  'suspended org: hotline no longer shared');
select tests.clear_auth();
update public.organizations set status = 'approved' where id = tests.id('store_a');

-- ---- rate limit 60/hour per user ----
insert into public.rate_limits (key, window_start, count)
values ('get_org_contact:user:' || tests.id('store_manager'),
        date_bin(interval '1 hour', now(), timestamptz '2000-01-01 00:00:00+07'), 60);
select tests.authenticate_as('store_manager');
select throws_ok(format('select * from public.get_org_contact(%L)', tests.id('charity_b')), 'PT429', 'rate_limited',
  '61st call within the hour: rate_limited');
select ok((tests.error_of(format('select * from public.get_org_contact(%L)', tests.id('charity_b'))) ->> 'hint')::int > 0,
  'hint = seconds to wait');
select tests.clear_auth();

-- ---- delete ----
select tests.authenticate_as('store_owner');
select is(tests.affected(format('delete from public.org_contacts where org_id = %L', tests.id('store_a'))), 1::bigint,
  'owner removes the hotline');
select tests.authenticate_as('charity_owner');
select results_eq(format('select hotline_phone from public.get_org_contact(%L)', tests.id('store_a')),
  $$values (null::text)$$, 'no hotline => null (UI shows "Chưa có hotline")');
select tests.clear_auth();

select * from finish();
rollback;

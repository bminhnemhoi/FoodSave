-- B8 (never delete/skip): a charity that is not approved cannot see open donations, through
-- the table or through marketplace_offers; after approval it can. SECURITY-PRIVACY §10 B8.
begin;
\ir ../_helpers.psql

select plan(6);

select tests.create_user('b8_owner');
select tests.create_org('charity_b8', 'charity', 'b8_owner', 'submitted');
select tests.create_site('site_b8', 'charity_b8', 'approximate', 10.762622, 106.660172);
select tests.make_offer('b8_lot', 'site_a', 'bread', 10, now() - interval '5 minutes', now() + interval '10 hours');

select tests.authenticate_as('b8_owner');
select is((select count(*)::int from public.offers), 0, 'submitted charity: SELECT offers returns nothing');
select is((select count(*)::int from public.marketplace_offers(tests.id('site_b8'))), 0,
  'submitted charity: marketplace_offers is empty');
select throws_ok(format($$select public.request_offer(%L, 1, %L, gen_random_uuid())$$, tests.id('b8_lot'), tests.id('site_b8')),
  null, null, 'submitted charity cannot request a lot');
select tests.clear_auth();

select tests.approve_org('charity_b8');
select tests.authenticate_as('b8_owner');
select ok((select count(*) from public.offers where id = tests.id('b8_lot')) = 1, 'approved charity sees the open lot');
select ok(exists (select 1 from public.marketplace_offers(tests.id('site_b8')) m where m.offer_id = tests.id('b8_lot')),
  'approved charity finds the lot in the marketplace');
select tests.clear_auth();

update public.organizations set status = 'suspended' where id = tests.id('charity_b8');
select tests.authenticate_as('b8_owner');
select is((select count(*)::int from public.offers where id = tests.id('b8_lot')), 0, 'suspended charity loses access again');

select * from finish();
rollback;

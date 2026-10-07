-- B4 (SECURITY-PRIVACY §10, TESTING §4.2): KYC documents were in a public bucket.
-- kyc must stay private and readable only by owner/manager of the org and admin aal2.
-- (`proofs` joins this file in P4 when the bucket exists.)
begin;
\ir ../_helpers.psql

select plan(7);

select is((select public from storage.buckets where id = 'kyc'), false, 'bucket kyc is private');
select ok(not exists (select 1 from pg_policy p where p.polrelid = 'storage.objects'::regclass
                      and 'anon'::regrole = any (p.polroles)),
  'no storage.objects policy grants anything to anon');

insert into storage.objects (bucket_id, name, owner_id)
values ('kyc', tests.id('draft_c') || '/business_license/33333333-3333-4333-8333-333333333331.pdf', tests.id('draft_owner')::text);

select tests.as_anon();
select is_empty($$select name from storage.objects where bucket_id = 'kyc'$$, 'anon cannot read a kyc object');
select tests.authenticate_as('store_owner');
select is_empty($$select name from storage.objects where bucket_id = 'kyc'$$, 'another org cannot read it');
select tests.authenticate_as('outsider', 'aal2');
select is_empty($$select name from storage.objects where bucket_id = 'kyc'$$, 'a plain user (even aal2) cannot read it');
select tests.authenticate_as('draft_owner');
select is((select count(*)::int from storage.objects where bucket_id = 'kyc'), 1, 'the org owner can');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from storage.objects where bucket_id = 'kyc' and name like tests.id('draft_c') || '/%'), 1,
  'admin aal2 can');
select tests.clear_auth();

select * from finish();
rollback;

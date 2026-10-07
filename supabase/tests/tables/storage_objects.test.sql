-- storage.objects policies for buckets kyc (private) and media (public) — DATA-MODEL §10, C7, P1-01.
-- Objects are inserted with SQL as the simulated role (what the Storage API does after RLS).
begin;
\ir ../_helpers.psql

select plan(37);

-- ---- buckets ----
select results_eq(
  $$select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('kyc', 'media') order by id$$,
  $$values ('kyc'::text, false, 10485760::bigint, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
           ('media'::text, true, 5242880::bigint, array['image/jpeg', 'image/webp', 'image/png'])$$,
  'kyc private 10 MB pdf/images; media public 5 MB images');
select policies_are('storage', 'objects',
  array['kyc_insert', 'kyc_select', 'kyc_delete', 'media_insert', 'media_select', 'media_delete']);

insert into public.org_change_requests (id, org_id, changes, previous, submitted_by, client_op_id)
values ('cccccccc-0000-4000-8000-000000000001', tests.id('store_a'), '{"legal_name":"Mới"}', '{"legal_name":"Cũ"}',
        tests.id('store_owner'), gen_random_uuid());

-- ======================= kyc INSERT =======================
select tests.authenticate_as('draft_owner');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                         values ('kyc', %L || '/business_license/11111111-1111-4111-8111-1111111111a1.pdf', auth.uid()::text)$$,
                       tests.id('draft_c')),
  'owner of a draft org uploads into {org_id}/{doc_type}/');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('kyc', %L || '/business_license/11111111-1111-4111-8111-1111111111a2.pdf', auth.uid()::text)$$,
                        tests.id('store_a')),
  '42501', null, 'cannot upload into another org folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('kyc', %L || '/selfie/11111111-1111-4111-8111-1111111111a3.pdf', auth.uid()::text)$$,
                        tests.id('draft_c')),
  '42501', null, 'second folder must be a document type');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('kyc', %L || '/business_license/cccd-mat-truoc.pdf', auth.uid()::text)$$,
                        tests.id('draft_c')),
  '42501', null, 'file name must be a UUID (no original names)');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
                   values ('kyc', 'business_license/11111111-1111-4111-8111-1111111111a4.pdf', auth.uid()::text)$$,
  '42501', null, 'first folder must be an org id');

select tests.authenticate_as('store_owner');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('kyc', %L || '/business_license/11111111-1111-4111-8111-1111111111b1.pdf', auth.uid()::text)$$,
                        tests.id('store_a')),
  '42501', null, 'approved org cannot add onboarding documents');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                         values ('kyc', %L || '/change/cccccccc-0000-4000-8000-000000000001/11111111-1111-4111-8111-1111111111b2.pdf', auth.uid()::text)$$,
                       tests.id('store_a')),
  'approved org uploads under change/{pending request}');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('kyc', %L || '/change/%s/11111111-1111-4111-8111-1111111111b3.pdf', auth.uid()::text)$$,
                        tests.id('store_a'), gen_random_uuid()),
  '42501', null, 'change folder must be a pending request of the org');
select tests.authenticate_as('store_staff');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('kyc', %L || '/change/cccccccc-0000-4000-8000-000000000001/11111111-1111-4111-8111-1111111111b4.pdf', auth.uid()::text)$$,
                        tests.id('store_a')),
  '42501', null, 'staff cannot upload KYC documents');
select tests.as_anon();
select throws_ok(format($$insert into storage.objects (bucket_id, name)
                          values ('kyc', %L || '/business_license/11111111-1111-4111-8111-1111111111c1.pdf')$$,
                        tests.id('draft_c')),
  '42501', null, 'anon cannot upload');

-- ======================= kyc SELECT =======================
select tests.as_anon();
select is_empty($$select name from storage.objects where bucket_id = 'kyc'$$, 'anon reads no kyc object');
select tests.authenticate_as('outsider');
select is_empty($$select name from storage.objects where bucket_id = 'kyc'$$, 'outsider reads no kyc object');
select tests.authenticate_as('store_owner');
select is((select count(*)::int from storage.objects where bucket_id = 'kyc'), 1, 'owner reads only their org kyc objects');
select is_empty(format($$select name from storage.objects where bucket_id = 'kyc' and name like %L$$, tests.id('draft_c') || '/%'),
  'another org owner cannot read draft_c documents');
select tests.authenticate_as('store_staff');
select is_empty($$select name from storage.objects where bucket_id = 'kyc'$$, 'staff reads no kyc object');
select tests.authenticate_as('draft_owner');
select is((select count(*)::int from storage.objects where bucket_id = 'kyc'), 1, 'draft owner reads their document');
select tests.authenticate_as('admin', 'aal1');
select is_empty($$select name from storage.objects where bucket_id = 'kyc'$$, 'admin aal1 reads no kyc object');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from storage.objects
           where bucket_id = 'kyc' and split_part(name, '/', 1) in (tests.id('draft_c')::text, tests.id('store_a')::text)),
  2, 'admin aal2 reads every kyc object');

-- ======================= kyc UPDATE / DELETE =======================
select tests.authenticate_as('draft_owner');
select is(tests.affected($$update storage.objects set name = name || '.x' where bucket_id = 'kyc'$$), 0::bigint,
  'no UPDATE policy: objects are immutable');
select set_config('storage.allow_delete_query', 'true', true);  -- what the Storage API does internally
select tests.authenticate_as('outsider');
select is(tests.affected($$delete from storage.objects where bucket_id = 'kyc'$$), 0::bigint, 'outsider deletes nothing');
select tests.authenticate_as('store_owner');
select is(tests.affected($$delete from storage.objects where bucket_id = 'kyc'$$), 0::bigint,
  'change-request documents are not deletable by the org');
select tests.authenticate_as('draft_owner');
select is(tests.affected($$delete from storage.objects where bucket_id = 'kyc'$$), 1::bigint,
  'owner deletes their onboarding document while draft');
select tests.clear_auth();
select set_config('storage.allow_delete_query', 'false', true);

-- ======================= kyc quota: 20 uploads / user / hour =======================
insert into storage.objects (bucket_id, name, owner_id)
select 'kyc', tests.id('draft_c') || '/other/' || gen_random_uuid() || '.pdf', tests.id('draft_owner')::text
from generate_series(1, 20);
select tests.authenticate_as('draft_owner');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('kyc', %L || '/other/11111111-1111-4111-8111-1111111111d1.pdf', auth.uid()::text)$$,
                        tests.id('draft_c')),
  '42501', null, '21st upload within an hour is refused');
select tests.clear_auth();

-- ======================= media =======================
select tests.authenticate_as('store_owner');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                         values ('media', 'org/' || %L || '/logo/22222222-2222-4222-8222-2222222222a1.webp', auth.uid()::text)$$,
                       tests.id('store_a')),
  'owner uploads a logo');
select tests.authenticate_as('store_staff');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('media', 'org/' || %L || '/logo/22222222-2222-4222-8222-2222222222a2.webp', auth.uid()::text)$$,
                        tests.id('store_a')),
  '42501', null, 'staff cannot change the logo');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                         values ('media', 'org/' || %L || '/offer/22222222-2222-4222-8222-2222222222a3.webp', auth.uid()::text)$$,
                       tests.id('store_a')),
  'staff uploads an offer photo');
select tests.authenticate_as('draft_owner');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                         values ('media', 'org/' || %L || '/logo/22222222-2222-4222-8222-2222222222b1.png', auth.uid()::text)$$,
                       tests.id('draft_c')),
  'draft org owner uploads a logo');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('media', 'org/' || %L || '/offer/22222222-2222-4222-8222-2222222222b2.webp', auth.uid()::text)$$,
                        tests.id('draft_c')),
  '42501', null, 'draft org cannot upload offer photos');
select tests.authenticate_as('outsider');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('media', 'org/' || %L || '/offer/22222222-2222-4222-8222-2222222222c1.webp', auth.uid()::text)$$,
                        tests.id('store_a')),
  '42501', null, 'outsider cannot upload into an org folder');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id)
                  values ('media', 'user/' || auth.uid() || '/avatar/22222222-2222-4222-8222-2222222222c2.webp', auth.uid()::text)$$,
  'user uploads their own avatar');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner_id)
                          values ('media', 'user/' || %L || '/avatar/22222222-2222-4222-8222-2222222222c3.webp', auth.uid()::text)$$,
                        tests.id('store_owner')),
  '42501', null, 'cannot upload into another user folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
                   values ('media', 'user/' || auth.uid() || '/avatar/22222222-2222-4222-8222-2222222222c4.gif', auth.uid()::text)$$,
  '42501', null, 'extension must be webp/jpg/png');
select tests.as_anon();
select throws_ok($$insert into storage.objects (bucket_id, name)
                   values ('media', 'user/x/avatar/22222222-2222-4222-8222-2222222222d1.webp')$$,
  '42501', null, 'anon cannot upload media');

select set_config('storage.allow_delete_query', 'true', true);
select tests.authenticate_as('store_owner');
select is(tests.affected($$delete from storage.objects where bucket_id = 'media' and name like 'user/%'$$), 0::bigint,
  'cannot delete another user avatar');
select tests.authenticate_as('outsider');
select is(tests.affected($$delete from storage.objects where bucket_id = 'media'$$), 1::bigint,
  'user deletes only their own avatar');
select tests.clear_auth();

select * from finish();
rollback;

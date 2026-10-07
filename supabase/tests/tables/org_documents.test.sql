-- org_documents: S/I/D owner/manager while onboarding, I with a pending change request,
-- no UPDATE, admin aal2 reads (§9.2).
begin;
\ir ../_helpers.psql

select plan(16);

select ok((select relrowsecurity from pg_class where oid = 'public.org_documents'::regclass), 'RLS enabled');
select policies_are('public', 'org_documents',
  array['org_documents_select', 'org_documents_insert_owner_manager', 'org_documents_delete_owner_manager']);

-- pending change request of the approved store_a
insert into public.org_change_requests (id, org_id, changes, previous, submitted_by, client_op_id)
values ('c0c0c0c0-0000-4000-8000-000000000001', tests.id('store_a'), '{"legal_name":"Mới"}', '{"legal_name":"Cũ"}',
        tests.id('store_owner'), gen_random_uuid());

-- ---- INSERT ----
select tests.authenticate_as('draft_owner');
select lives_ok(format($$insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256)
                         values (%1$L, 'business_license', %1$L || '/business_license/a.pdf', 'application/pdf', 1000, repeat('a', 64))$$,
                       tests.id('draft_c')),
  'draft owner uploads a document for the draft org');
select is((select uploaded_by from public.org_documents where org_id = tests.id('draft_c')), tests.id('draft_owner'),
  'uploaded_by defaults to auth.uid()');
select throws_ok(format($$insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
                          values (%1$L, 'other', %1$L || '/other/b.pdf', 'application/pdf', 1, repeat('b', 64), %2$L)$$,
                        tests.id('draft_c'), tests.id('outsider')),
  '42501', null, 'uploaded_by cannot be chosen by the client');
select throws_ok(format($$insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256)
                          values (%1$L, 'other', 'elsewhere/c.pdf', 'application/pdf', 1, repeat('c', 64))$$,
                        tests.id('draft_c')),
  '23514', null, 'storage_path must start with {org_id}/');

select tests.authenticate_as('store_owner');
select throws_ok(format($$insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256)
                          values (%1$L, 'business_license', %1$L || '/business_license/d.pdf', 'application/pdf', 1, repeat('d', 64))$$,
                        tests.id('store_a')),
  '42501', null, 'approved org cannot add documents without a change request');
select lives_ok(format($$insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, change_request_id)
                         values (%1$L, 'business_license', %1$L || '/change/c0c0c0c0-0000-4000-8000-000000000001/e.pdf',
                                 'application/pdf', 1, repeat('e', 64), 'c0c0c0c0-0000-4000-8000-000000000001')$$,
                       tests.id('store_a')),
  'approved org adds a document attached to its pending change request');

select tests.authenticate_as('outsider');
select throws_ok(format($$insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256)
                          values (%1$L, 'other', %1$L || '/other/f.pdf', 'application/pdf', 1, repeat('f', 64))$$,
                        tests.id('draft_c')),
  '42501', null, 'unrelated user cannot upload for another org');

-- ---- SELECT ----
select tests.as_anon();
select throws_ok('select id from public.org_documents', '42501', null, 'anon: no access');
select tests.authenticate_as('outsider');
select is_empty('select id from public.org_documents', 'unrelated user: 0 rows');
select tests.authenticate_as('store_staff');
select is_empty('select id from public.org_documents', 'staff: 0 rows (owner/manager only)');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select id from public.org_documents', 'admin aal1: 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is((select count(*)::int from public.org_documents), 2, 'admin aal2 sees all documents');

-- ---- UPDATE / DELETE ----
select tests.authenticate_as('draft_owner');
select throws_ok($$update public.org_documents set doc_type = 'other'$$, '42501', null, 'no UPDATE privilege');
select is(tests.affected('delete from public.org_documents'), 1::bigint,
  'draft owner deletes own onboarding document (and nothing else)');
select tests.clear_auth();

select * from finish();
rollback;

-- log_document_view (P1-09, US-ADM-03 AC2): admin aal2 only; one audit row per open; no path leaked.
begin;
\ir ../_helpers.psql

select plan(9);

-- a submitted store with one KYC document
select tests.create_org('doc_org', 'store', 'store_owner', 'submitted');
insert into public.org_documents (id, org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values ('00000000-0000-4000-8000-0000000000d1', tests.id('doc_org'), 'business_license',
        tests.id('doc_org')::text || '/business_license/' || gen_random_uuid()::text || '.pdf',
        'application/pdf', 1024, repeat('a', 64), tests.id('store_owner'));

select tests.as_anon();
select throws_ok($$select public.log_document_view('00000000-0000-4000-8000-0000000000d1')$$,
  '42501', null, 'anon has no EXECUTE');

select tests.authenticate_as('store_owner', 'aal2');
select throws_ok($$select public.log_document_view('00000000-0000-4000-8000-0000000000d1')$$,
  'PT403', 'not_authorized', 'org owner cannot use the admin audit RPC');

select tests.authenticate_as('admin', 'aal1');
select throws_ok($$select public.log_document_view('00000000-0000-4000-8000-0000000000d1')$$,
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');

select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.log_document_view(gen_random_uuid())$$,
  'PT404', 'not_found', 'unknown document');
select lives_ok($$select public.log_document_view('00000000-0000-4000-8000-0000000000d1')$$,
  'admin aal2 can log a view');
select lives_ok($$select public.log_document_view('00000000-0000-4000-8000-0000000000d1')$$,
  'each open is logged (no dedupe)');
select tests.clear_auth();

select is(
  (select count(*)::int from public.audit_logs
     where action = 'document.view' and entity_id = '00000000-0000-4000-8000-0000000000d1'
       and actor_id = tests.id('admin') and org_id = tests.id('doc_org')),
  2, 'two audit rows with actor, entity and org');
select ok(
  (select bool_and(after = '{"doc_type":"business_license"}'::jsonb) from public.audit_logs
     where action = 'document.view'),
  'audit payload contains doc_type only (no storage path)');

update public.org_documents set file_deleted_at = now() where id = '00000000-0000-4000-8000-0000000000d1';
select tests.authenticate_as('admin', 'aal2');
select throws_ok($$select public.log_document_view('00000000-0000-4000-8000-0000000000d1')$$,
  'PT410', 'file_purged', 'purged file cannot be opened');
select tests.clear_auth();

select * from finish();
rollback;

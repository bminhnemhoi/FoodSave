-- review_organization (DATA-MODEL §6.8, P1-08, P1-10): admin aal2 only, not self; submitted ->
-- approved | needs_changes | rejected; reason required unless approve; purge_after on approve/reject;
-- outbox + audit; idempotent.
begin;
\ir ../_helpers.psql

select plan(26);

-- draft_c becomes submitted (fixture shortcut) and has one onboarding document
update public.organizations set status = 'submitted', submitted_at = now() where id = tests.id('draft_c');
insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values (tests.id('draft_c'), 'business_license', tests.id('draft_c') || '/business_license/a.pdf',
        'application/pdf', 1000, repeat('a', 64), tests.id('draft_owner'));

-- ---- privileges ----
select tests.as_anon();
select throws_ok(format($$select public.review_organization(%L, 'approve', null, gen_random_uuid())$$, tests.id('draft_c')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('draft_owner', 'aal2');
select throws_ok(format($$select public.review_organization(%L, 'approve', null, gen_random_uuid())$$, tests.id('draft_c')),
  'PT403', 'not_authorized', 'the profile owner cannot approve their own org');
select tests.authenticate_as('outsider', 'aal2');
select throws_ok(format($$select public.review_organization(%L, 'approve', null, gen_random_uuid())$$, tests.id('draft_c')),
  'PT403', 'not_authorized', 'plain user => not_authorized');
select tests.authenticate_as('admin', 'aal1');
select throws_ok(format($$select public.review_organization(%L, 'approve', null, gen_random_uuid())$$, tests.id('draft_c')),
  'PT403', 'mfa_required', 'admin aal1 => mfa_required');
select tests.clear_auth();
select is((select status from public.organizations where id = tests.id('draft_c')), 'submitted'::public.org_status,
  'nothing changed after rejected calls');

-- ---- validation ----
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.review_organization(%L, 'accept', null, gen_random_uuid())$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'unknown decision');
select throws_ok(format($$select public.review_organization(%L, 'request_changes', '  ', gen_random_uuid())$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'request_changes needs a reason');
select throws_ok(format($$select public.review_organization(%L, 'reject', null, gen_random_uuid())$$, tests.id('draft_c')),
  'PT422', 'validation_failed', 'reject needs a reason');
select throws_ok($$select public.review_organization(gen_random_uuid(), 'approve', null, gen_random_uuid())$$,
  'PT404', 'not_found', 'unknown org => not_found');

-- ---- request_changes ----
select lives_ok(format($$select public.review_organization(%L, 'request_changes', 'Ảnh giấy phép bị mờ',
                                                          'c0000000-0000-4000-8000-000000000001')$$, tests.id('draft_c')),
  'admin aal2 requests changes');
select tests.clear_auth();
select results_eq(
  $$select status, rejection_reason, reviewed_by from public.organizations where id = tests.id('draft_c')$$,
  $$values ('needs_changes'::public.org_status, 'Ảnh giấy phép bị mờ'::text, tests.id('admin'))$$,
  'needs_changes with reason and reviewer');
select is((select purge_after from public.org_documents where org_id = tests.id('draft_c')), null::timestamptz,
  'documents are kept while changes are requested');
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.review_organization(%L, 'request_changes', 'Ảnh giấy phép bị mờ',
                                                          'c0000000-0000-4000-8000-000000000001')$$, tests.id('draft_c')),
  'replay with the same client_op_id is a no-op');
select throws_ok(format($$select public.review_organization(%L, 'approve', null, gen_random_uuid())$$, tests.id('draft_c')),
  'PT409', 'invalid_state', 'needs_changes cannot be reviewed again before resubmission');
select tests.clear_auth();
select is((select count(*)::int from public.audit_logs where action = 'org.review'), 1, 'one audit row after replay');

-- ---- approve ----
update public.organizations set status = 'submitted' where id = tests.id('draft_c');
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.review_organization(%L, 'approve', null, 'c0000000-0000-4000-8000-000000000002')$$,
                       tests.id('draft_c')),
  'admin aal2 approves');
select tests.clear_auth();
select results_eq(
  $$select status, rejection_reason, reviewed_by from public.organizations where id = tests.id('draft_c')$$,
  $$values ('approved'::public.org_status, null::text, tests.id('admin'))$$,
  'approved, reason cleared, reviewed_by = admin');
select ok((select purge_after between now() + interval '30 days' - interval '1 minute' and now() + interval '30 days'
           from public.org_documents where org_id = tests.id('draft_c')),
  'KYC documents purge_after = decision + 30 days');
select results_eq(
  $$select payload ->> 'decision' from public.notification_outbox where event = 'org_reviewed' order by created_at, payload ->> 'decision'$$,
  $$values ('approve'::text), ('request_changes'::text)$$,
  'outbox org_reviewed for each decision');
select results_eq(
  $$select actor_id, actor_kind, after ->> 'status', reason from public.audit_logs
    where action = 'org.review' and client_op_id = 'c0000000-0000-4000-8000-000000000002'$$,
  $$values (tests.id('admin'), 'admin'::text, 'approved'::text, null::text)$$,
  'approval audited with the admin as actor');

-- ---- reject ----
select tests.create_org('sub_r', 'charity', 'outsider', 'submitted');
insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values (tests.id('sub_r'), 'establishment_decision', tests.id('sub_r') || '/establishment_decision/x.pdf',
        'application/pdf', 1000, repeat('f', 64), tests.id('outsider'));
select tests.authenticate_as('admin', 'aal2');
select lives_ok(format($$select public.review_organization(%L, 'reject', 'Giấy tờ không hợp lệ', gen_random_uuid())$$,
                       tests.id('sub_r')),
  'admin aal2 rejects with a reason');
select tests.clear_auth();
select results_eq(
  $$select status, rejection_reason from public.organizations where id = tests.id('sub_r')$$,
  $$values ('rejected'::public.org_status, 'Giấy tờ không hợp lệ'::text)$$,
  'rejected with reason');
select isnt((select purge_after from public.org_documents where org_id = tests.id('sub_r')), null::timestamptz,
  'rejected org documents are scheduled for purge');

-- ---- self-dealing ----
select tests.create_org('adm_org', 'store', 'admin', 'submitted');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.review_organization(%L, 'approve', null, gen_random_uuid())$$, tests.id('adm_org')),
  'PT403', 'self_dealing', 'admin cannot review an org they belong to');
select tests.clear_auth();

-- ---- direct status write is still impossible (layer one + two) ----
select tests.authenticate_as('draft_owner');
select throws_ok(format($$update public.organizations set status = 'approved' where id = %L$$, tests.id('sub_r')),
  '42501', null, 'owner cannot set status directly');
select tests.clear_auth();
select is((select count(*)::int from public.audit_logs where action = 'org.review'), 3, 'three reviews audited');

select * from finish();
rollback;

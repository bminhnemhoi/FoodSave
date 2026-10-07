-- Migration 5d — storage_retention (DATA-MODEL §10, §16, SECURITY-PRIVACY C7, P1-01, P1-11)
-- Buckets `kyc` (private) and `media` (public) with size/MIME limits; storage.objects policies by
-- `{org_id}/...` path; KYC purge 30 days after the decision; purge_retention() + pg_cron `fs_purge`.
-- Files are never deleted with SQL: Supabase blocks DELETE on storage.objects (trigger
-- storage.protect_delete) and a row delete would orphan the blob. The nightly job enqueues
-- `kyc_purge`; the dispatcher (service role, P2) removes the object through the Storage API and then
-- calls mark_kyc_purged(document_id), which refuses while the object still exists.

-- ===========================================================================
-- 1. Buckets
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kyc', 'kyc', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('media', 'media', true, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ===========================================================================
-- 2. Path helpers used by storage.objects policies (evaluated as `authenticated`)
-- ===========================================================================

-- kyc INSERT: owner/manager of {org_id};
--   {org_id}/{doc_type}/{uuid}.{ext}            while the org is draft/submitted/needs_changes;
--   {org_id}/change/{request_id}/{uuid}.{ext}   while approved/suspended with that request pending.
-- Quota: ≤ 20 kyc uploads per user in the last hour (counted on storage.objects, no write).
create or replace function private.can_upload_kyc(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts  text[] := string_to_array(p_name, '/');
  v_org    uuid := private.try_uuid(v_parts[1]);
  v_uid    uuid := auth.uid();
  v_status public.org_status;
begin
  if v_uid is null or v_org is null
     or not private.is_org_member(v_org, '{owner,manager}')
     or v_parts[cardinality(v_parts)] !~ '^[0-9a-fA-F-]{32,36}\.(pdf|jpg|jpeg|png|webp)$' then
    return false;
  end if;

  if (select count(*) from storage.objects o
      where o.bucket_id = 'kyc' and o.owner_id = v_uid::text
        and o.created_at > pg_catalog.now() - interval '1 hour') >= 20 then
    return false;
  end if;

  select o.status into v_status from public.organizations o where o.id = v_org;

  if cardinality(v_parts) = 3 then
    return v_status in ('draft', 'submitted', 'needs_changes')
       and v_parts[2] = any (enum_range(null::public.org_doc_type)::text[]);
  end if;

  if cardinality(v_parts) = 4 and v_parts[2] = 'change' then
    return v_status in ('approved', 'suspended')
       and exists (select 1 from public.org_change_requests r
                   where r.id = private.try_uuid(v_parts[3]) and r.org_id = v_org and r.status = 'pending');
  end if;

  return false;
end;
$$;

comment on function private.can_upload_kyc(text) is
  'kyc INSERT check: owner/manager, onboarding path while draft/submitted/needs_changes or change/{pending request} while approved/suspended, UUID file name, ≤ 20 uploads/user/hour.';

-- kyc DELETE: owner/manager, onboarding documents only, while draft/submitted/needs_changes
-- (same window as the org_documents DELETE policy). Scheduled purges use the service role.
create or replace function private.can_delete_kyc(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select cardinality(string_to_array(p_name, '/')) = 3
     and private.is_org_member(private.try_uuid(split_part(p_name, '/', 1)), '{owner,manager}')
     and private.org_has_status(private.try_uuid(split_part(p_name, '/', 1)), '{draft,submitted,needs_changes}');
$$;

comment on function private.can_delete_kyc(text) is 'kyc DELETE check: owner/manager, {org_id}/{doc_type}/… while draft/submitted/needs_changes.';

-- media write: org/{org_id}/{logo|cover|offer}/{uuid}.{ext} or user/{user_id}/avatar/{uuid}.{ext}.
-- logo/cover: owner/manager (any status except rejected/closed, so drafts can set a logo);
-- offer: owner/manager/staff of an approved org; avatar: the user themself.
create or replace function private.can_write_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts  text[] := string_to_array(p_name, '/');
  v_org    uuid;
  v_role   public.org_role;
  v_status public.org_status;
begin
  if auth.uid() is null or cardinality(v_parts) <> 4
     or v_parts[4] !~ '^[0-9a-fA-F-]{32,36}\.(webp|jpg|jpeg|png)$' then
    return false;
  end if;

  if v_parts[1] = 'user' then
    return v_parts[2] = auth.uid()::text and v_parts[3] = 'avatar';
  end if;

  if v_parts[1] <> 'org' then
    return false;
  end if;

  v_org := private.try_uuid(v_parts[2]);
  v_role := private.caller_org_role(v_org);
  select o.status into v_status from public.organizations o where o.id = v_org;

  if v_role is null or v_status is null or v_status in ('rejected', 'closed') then
    return false;
  end if;

  return case v_parts[3]
    when 'logo'  then v_role in ('owner', 'manager')
    when 'cover' then v_role in ('owner', 'manager')
    when 'offer' then v_role in ('owner', 'manager', 'staff') and v_status = 'approved'
    else false
  end;
end;
$$;

comment on function private.can_write_media(text) is
  'media INSERT/DELETE check: org logo/cover (owner/manager), offer photos (owner/manager/staff, approved org), user avatar (self). UUID file names.';

-- ===========================================================================
-- 3. storage.objects policies (RLS already enabled by Supabase)
-- ===========================================================================
create policy kyc_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc' and private.can_upload_kyc(name));

create policy kyc_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc'
    and (private.is_org_member(private.try_uuid(split_part(name, '/', 1)), '{owner,manager}')
         or (select private.is_admin()))
  );

create policy kyc_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'kyc' and private.can_delete_kyc(name));

-- media is public: reads go through the public URL (no RLS). Authenticated SELECT is limited to the
-- caller's own writable paths (needed by the Storage API for delete).
create policy media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and private.can_write_media(name));

create policy media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and private.can_write_media(name));

create policy media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and private.can_write_media(name));

-- No UPDATE policy on either bucket: objects are immutable (no upsert/overwrite).

-- ===========================================================================
-- 4. KYC purge + retention (§16)
-- ===========================================================================

-- Dispatcher callback after the Storage API removed the file. Idempotent; refuses before
-- purge_after and while the object still exists.
create or replace function public.mark_kyc_purged(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.org_documents%rowtype;
  v_now timestamptz := private.now();
begin
  select * into v_doc from public.org_documents d where d.id = p_document_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if v_doc.file_deleted_at is not null then
    return;
  end if;

  if v_doc.purge_after is null or v_doc.purge_after > v_now then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'not_due';
  end if;

  if exists (select 1 from storage.objects o where o.bucket_id = 'kyc' and o.name = v_doc.storage_path) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'object_still_exists';
  end if;

  update public.org_documents set file_deleted_at = v_now where id = p_document_id;

  perform private.audit(
    p_action      => 'document.purge',
    p_entity_type => 'org_document',
    p_entity_id   => p_document_id,
    p_org_id      => v_doc.org_id,
    p_after       => jsonb_build_object('doc_type', v_doc.doc_type, 'file_deleted_at', v_now));
end;
$$;

comment on function public.mark_kyc_purged(uuid) is
  'service_role: set org_documents.file_deleted_at after the kyc object was removed via the Storage API (PT409 when not due or still present). Metadata is kept.';

-- Nightly retention (pg_cron fs_purge, 02:30 Vietnam time). Returns counts per category.
create or replace function public.purge_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now    timestamptz := private.now();
  v_kyc    integer;
  v_rl     integer;
  v_idem   integer;
  v_outbox integer;
  v_ocr    integer;
  v_sens   integer;
  v_audit  integer;
begin
  -- 1. KYC files 30 days after the decision: one kyc_purge job per document (dedupe), handled by
  --    the dispatcher through the Storage API (+ mark_kyc_purged).
  insert into public.notification_outbox (event, aggregate_type, aggregate_id, dedupe_key, payload)
  select 'kyc_purge', 'org_document', d.id, 'kyc_purge:' || d.id,
         jsonb_build_object('document_id', d.id, 'bucket', 'kyc', 'path', d.storage_path)
  from public.org_documents d
  where d.purge_after <= v_now and d.file_deleted_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics v_kyc = row_count;

  -- 2. rate_limits: 24 h (windows are ≤ 1 day)
  delete from public.rate_limits r where r.window_start < v_now - interval '24 hours';
  get diagnostics v_rl = row_count;

  -- 3. rpc_idempotency: 7 days
  delete from public.rpc_idempotency i where i.created_at < v_now - interval '7 days';
  get diagnostics v_idem = row_count;

  -- 4. processed outbox rows: 90 days (a dead kyc_purge disappears and is re-enqueued next night)
  delete from public.notification_outbox o
   where o.status in ('done', 'dead') and o.created_at < v_now - interval '90 days';
  get diagnostics v_outbox = row_count;

  -- 5. org_change_requests decided > 12 months ago: drop the values, keep the keys
  update public.org_change_requests r
     set changes  = (select coalesce(jsonb_object_agg(k, null), '{}'::jsonb) from jsonb_object_keys(r.changes) as k),
         previous = (select coalesce(jsonb_object_agg(k, null), '{}'::jsonb) from jsonb_object_keys(r.previous) as k)
   where r.status <> 'pending' and r.reviewed_at < v_now - interval '12 months'
     and (exists (select 1 from jsonb_each(r.changes) as e where e.value <> 'null'::jsonb)
          or exists (select 1 from jsonb_each(r.previous) as e where e.value <> 'null'::jsonb));
  get diagnostics v_ocr = row_count;

  -- 6. org_sensitive of organizations closed > 12 months ago (SECURITY-PRIVACY §5 rows 4-5)
  update public.org_sensitive s
     set legal_name = null, tax_code = null, registration_no = null, representative_name = null,
         representative_title = null, representative_id_last4 = null, id_verified_at = null,
         id_verified_by = null, id_verification_method = null, contact_email = null, contact_phone = null
    from public.organizations o
   where o.id = s.org_id and o.status = 'closed' and o.closed_at < v_now - interval '12 months'
     and num_nonnulls(s.legal_name, s.tax_code, s.registration_no, s.representative_name,
                      s.representative_title, s.representative_id_last4, s.id_verified_at,
                      s.id_verified_by, s.id_verification_method, s.contact_email, s.contact_phone) > 0;
  get diagnostics v_sens = row_count;

  -- 7. audit_logs: 24 months (the only allowed DELETE on the append-only table, itself audited)
  perform set_config('fs.allow_purge', 'on', true);
  delete from public.audit_logs a where a.at < v_now - interval '24 months';
  get diagnostics v_audit = row_count;
  perform set_config('fs.allow_purge', 'off', true);

  if v_audit > 0 then
    perform private.audit(
      p_action      => 'audit.purge',
      p_entity_type => 'audit_logs',
      p_entity_id   => null,
      p_after       => jsonb_build_object('deleted', v_audit));
  end if;

  return jsonb_build_object(
    'kyc_purge_enqueued', v_kyc,
    'rate_limits', v_rl,
    'rpc_idempotency', v_idem,
    'notification_outbox', v_outbox,
    'org_change_requests_scrubbed', v_ocr,
    'org_sensitive_scrubbed', v_sens,
    'audit_logs', v_audit);
end;
$$;

comment on function public.purge_retention() is
  'Nightly retention (§16): enqueue kyc_purge for due KYC files; delete rate_limits > 24 h, rpc_idempotency > 7 d, done/dead outbox > 90 d, audit_logs > 24 months; scrub change-request values and org_sensitive of orgs closed > 12 months. service_role / cron only.';

-- ===========================================================================
-- 5. Function privileges
-- ===========================================================================
revoke all on function private.can_upload_kyc(text) from public, anon, authenticated;
revoke all on function private.can_delete_kyc(text) from public, anon, authenticated;
revoke all on function private.can_write_media(text) from public, anon, authenticated;
revoke all on function public.mark_kyc_purged(uuid) from public, anon, authenticated;
revoke all on function public.purge_retention() from public, anon, authenticated;

grant execute on function private.can_upload_kyc(text) to authenticated, service_role;
grant execute on function private.can_delete_kyc(text) to authenticated, service_role;
grant execute on function private.can_write_media(text) to authenticated, service_role;
grant execute on function public.mark_kyc_purged(uuid) to service_role;
grant execute on function public.purge_retention() to service_role;

-- ===========================================================================
-- 6. pg_cron (ARCHITECTURE §8.2). Skipped when pg_cron is not installed.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fs_purge', '30 19 * * *', 'select public.purge_retention()');
  end if;
end;
$$;

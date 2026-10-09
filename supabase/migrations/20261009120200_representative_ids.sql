-- Migration — representative_ids (B2: số CCCD người đại diện, KHÔNG thu ảnh; DATA-MODEL §2.1 org_sensitive,
-- §8.2, §16; SECURITY-PRIVACY §2.2, §5, C6; NĐ 356/2025 Điều 3–4)
-- NĐ 356/2025 Điều 4 lists photos of identity cards as SENSITIVE personal data, while Điều 3 lists the
-- personal identification number as BASIC data. FoodSave therefore never collects CCCD images: the owner
-- types the 12-digit number or scans the QR printed on chip CCCDs (parsed on the device; only number + full
-- name are sent).
-- Table:   private.org_representative_ids — the full number, in schema `private` (not exposed by PostgREST,
--          no grant to anon/authenticated). org_sensitive.representative_id_last4 stays the display copy and
--          is kept in sync (trigger drops a full number that no longer matches the last 4 digits).
-- RPCs:    set_representative_id (owner/manager), get_representative_id_summary (masked, owner/manager +
--          admin aal2), reveal_representative_id (admin aal2, audited representative_id.reveal);
--          verify_representative_id re-created to accept method video_call ("Đối chiếu qua gọi video").
-- Retention: purge_retention() re-created (body of 20261007174207_storage_retention + step 8): the full
--          number is deleted 30 days after the organization is closed (or rejected).
-- Province codes: the 63 codes of Thông tư 59/2021/TT-BCA (first 3 digits = place of birth registration;
--          numbers do not change after the 2025 province merger). Mirrored in src/features/onboarding/cccd.ts.

-- ===========================================================================
-- 1. Validation helpers
-- ===========================================================================
create or replace function private.cccd_province_valid(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_code = any ('{001,002,004,006,008,010,011,012,014,015,017,019,020,022,024,025,026,027,
                                  030,031,033,034,035,036,037,038,040,042,044,045,046,048,049,051,052,054,
                                  056,058,060,062,064,066,067,068,070,072,074,075,077,079,080,082,083,084,
                                  086,087,089,091,092,093,094,095,096}'::text[]), false);
$$;

comment on function private.cccd_province_valid(text) is
  'true for one of the 63 CCCD province codes 001–096 (Thông tư 59/2021/TT-BCA). Mirror: src/features/onboarding/cccd.ts.';

create or replace function private.is_valid_cccd(p_number text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_number ~ '^[0-9]{12}$' and private.cccd_province_valid(left(p_number, 3)), false);
$$;

comment on function private.is_valid_cccd(text) is '12 digits whose first 3 are a valid province code. NULL-safe (false).';

-- '079123451234' -> '079*****1234' (owner and admin list views never show the full number).
create or replace function private.mask_cccd(p_number text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_number ~ '^[0-9]{12}$' then left(p_number, 3) || '*****' || right(p_number, 4) end;
$$;

comment on function private.mask_cccd(text) is 'Masked CCCD: province code + ***** + last 4 digits; null when not 12 digits.';

-- ===========================================================================
-- 2. private.org_representative_ids
-- ===========================================================================
create table private.org_representative_ids (
  org_id       uuid primary key references public.organizations (id) on delete cascade,
  id_number    char(12) not null check (private.is_valid_cccd(id_number)),
  name_on_card text check (char_length(name_on_card) between 1 and 120),
  source       text not null check (source in ('manual', 'cccd_qr')),
  captured_at  timestamptz not null default now(),
  captured_by  uuid references public.profiles (id) on delete set null,
  constraint org_representative_ids_name_from_qr check (source = 'cccd_qr' or name_on_card is null)
);

comment on table private.org_representative_ids is
  'Full 12-digit CCCD number of the legal representative (basic personal data, NĐ 356 Điều 3). Never an image. Only definer RPCs touch it: owner/manager set it, owner/manager/admin read the masked form, admin aal2 reveals (audited). Deleted 30 days after the org is closed/rejected, and whenever org_sensitive.representative_id_last4 changes to other digits.';
comment on column private.org_representative_ids.name_on_card is 'Full name read from the CCCD QR (source cccd_qr) to compare with representative_name; null for manual entry. Date of birth, sex, address and issue date in the QR are discarded on the device.';
comment on column private.org_representative_ids.source is 'manual = typed by the owner/manager; cccd_qr = scanned from the QR on a chip CCCD.';

create index org_representative_ids_captured_by_idx on private.org_representative_ids (captured_by) where captured_by is not null;

alter table private.org_representative_ids enable row level security;
revoke all on table private.org_representative_ids from public, anon, authenticated;

comment on column public.org_sensitive.representative_id_last4 is
  'Last 4 digits of the representative CCCD (display, admin matching). The full number, when the owner captured it, lives only in private.org_representative_ids (admin aal2 reveal, audited); FoodSave never stores CCCD images.';

-- A full number that no longer matches the last 4 digits (change request approved, admin re-verified other
-- digits, retention scrub) is dropped: the private table never disagrees with org_sensitive.
create or replace function private.org_sensitive_sync_representative_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.org_representative_ids r
   where r.org_id = new.org_id
     and (new.representative_id_last4 is null or right(r.id_number, 4) <> new.representative_id_last4);
  return null;
end;
$$;

comment on function private.org_sensitive_sync_representative_id() is
  'AFTER UPDATE OF representative_id_last4 on org_sensitive: delete the stored full CCCD number when its last 4 digits no longer match.';

create trigger org_sensitive_sync_representative_id
  after update of representative_id_last4 on public.org_sensitive
  for each row when (new.representative_id_last4 is distinct from old.representative_id_last4)
  execute function private.org_sensitive_sync_representative_id();

-- ===========================================================================
-- 3. RPCs
-- ===========================================================================

-- Owner/manager records the representative's CCCD number. draft/needs_changes: set or replace freely
-- (a different last 4 clears a previous identity verification). approved/suspended: only a first capture
-- (orgs approved before B2), and the last 4 must match what FoodSave already recorded; changing it later
-- goes through submit_org_change_request. Returns {"masked": "079*****1234"}.
create or replace function public.set_representative_id(
  p_org_id       uuid,
  p_id_number    text,
  p_source       text,
  p_name_on_card text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_org    public.organizations%rowtype;
  v_number text := btrim(p_id_number);
  v_name   text := nullif(regexp_replace(btrim(coalesce(p_name_on_card, '')), '\s+', ' ', 'g'), '');
  v_last4  char(4);
  v_old    char(4);
  v_had    boolean;
begin
  if p_org_id is null
     or not coalesce(private.is_valid_cccd(v_number), false)
     or p_source is null or p_source not in ('manual', 'cccd_qr')
     or (p_source = 'cccd_qr' and (v_name is null or char_length(v_name) > 120)) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_id_number":"12 digits, valid province code 001-096","p_source":"manual|cccd_qr","p_name_on_card":"required for cccd_qr, <= 120 chars"}';
  end if;
  if p_source = 'manual' then
    v_name := null;
  end if;
  v_last4 := right(v_number, 4);

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_org_role(p_org_id, '{owner,manager}');

  perform private.check_rate_limit('set_representative_id:org:' || p_org_id::text, 20, interval '1 hour');

  select s.representative_id_last4 into v_old from public.org_sensitive s where s.org_id = p_org_id for update;
  v_had := exists (select 1 from private.org_representative_ids r where r.org_id = p_org_id);

  if v_org.status in ('approved', 'suspended') then
    if v_had then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'id_locked';
    end if;
    if v_old is not null and v_old <> v_last4 then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"p_id_number":"last4_mismatch"}';
    end if;
  elsif v_org.status not in ('draft', 'needs_changes') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  insert into private.org_representative_ids as r (org_id, id_number, name_on_card, source, captured_at, captured_by)
  values (p_org_id, v_number, v_name, p_source, private.now(), v_uid)
  on conflict (org_id) do update
    set id_number = excluded.id_number, name_on_card = excluded.name_on_card, source = excluded.source,
        captured_at = excluded.captured_at, captured_by = excluded.captured_by;

  if v_old is distinct from v_last4 then
    perform set_config('fs.org_change_apply', 'on', true);
    insert into public.org_sensitive (org_id, representative_id_last4)
    values (p_org_id, v_last4)
    on conflict (org_id) do update
      set representative_id_last4 = excluded.representative_id_last4,
          -- other digits = another person: a previous identity verification no longer applies
          id_verified_at = null, id_verified_by = null, id_verification_method = null;
    perform set_config('fs.org_change_apply', 'off', true);
  end if;

  -- the digits and the name are never written to the audit trail
  perform private.audit(
    p_action      => 'org.representative_id_set',
    p_entity_type => 'organization',
    p_entity_id   => p_org_id,
    p_org_id      => p_org_id,
    p_after       => jsonb_build_object('source', p_source, 'replaced', v_had));

  return jsonb_build_object('masked', private.mask_cccd(v_number));
end;
$$;

comment on function public.set_representative_id(uuid, text, text, text) is
  'Owner/manager stores the representative CCCD number (12 digits, province code 001-096; source manual|cccd_qr, name_on_card required for cccd_qr). draft/needs_changes: set/replace (new last 4 => id_verified_* cleared); approved/suspended: first capture only (PT409 id_locked otherwise) with matching last 4 (PT422 last4_mismatch). Syncs org_sensitive.representative_id_last4. Audit org.representative_id_set without digits. 20/hour per org. Returns {masked}.';

-- Masked view for the owner/manager (any org status) and admin aal2. Empty when nothing was captured.
create or replace function public.get_representative_id_summary(p_org_id uuid)
returns table (masked text, source text, name_on_card text, captured_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_uid();
  if p_org_id is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_org_id":"required"}';
  end if;
  if not (coalesce(private.is_org_member(p_org_id, '{owner,manager}'), false)
          or coalesce(private.is_admin(), false)) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  return query
    select private.mask_cccd(r.id_number), r.source, r.name_on_card, r.captured_at
    from private.org_representative_ids r
    where r.org_id = p_org_id;
end;
$$;

comment on function public.get_representative_id_summary(uuid) is
  'Masked representative CCCD (079*****1234), source, name read from the QR and capture time. Owner/manager of the org (any status) or admin aal2; others PT404. Never the full number.';

-- Full number for admin aal2 only (admin aal1 => PT403 mfa_required). Each reveal is audited.
create or replace function public.reveal_representative_id(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_admin();
  v_number text;
begin
  if p_org_id is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_org_id":"required"}';
  end if;

  select r.id_number into v_number from private.org_representative_ids r where r.org_id = p_org_id;
  if v_number is null then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  perform private.check_rate_limit('reveal_representative_id:user:' || v_uid::text, 30, interval '1 hour');

  perform private.audit(
    p_action      => 'representative_id.reveal',
    p_entity_type => 'organization',
    p_entity_id   => p_org_id,
    p_org_id      => p_org_id,
    p_after       => '{}'::jsonb);

  return v_number;
end;
$$;

comment on function public.reveal_representative_id(uuid) is
  'Admin aal2: the full representative CCCD number of an org (PT404 when none captured). Audit representative_id.reveal (no digits); 30/hour per admin.';

-- ===========================================================================
-- 4. verify_representative_id: + method video_call ("Đối chiếu qua gọi video", no screenshot kept)
-- ===========================================================================
alter table public.org_sensitive drop constraint org_sensitive_id_verification_method_check;
alter table public.org_sensitive add constraint org_sensitive_id_verification_method_check
  check (id_verification_method in ('cccd_qr', 'manual_document', 'video_call'));

comment on column public.org_sensitive.id_verification_method is
  'How the admin verified the representative: cccd_qr (QR of the chip CCCD), manual_document (document check), video_call (shown on a video call; nothing recorded).';

-- Body of 20261007174202_org_rpcs with the method list extended.
create or replace function public.verify_representative_id(p_org_id uuid, p_last4 text, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_admin();
  v_org public.organizations%rowtype;
begin
  if p_last4 is null or p_last4 !~ '^[0-9]{4}$'
     or p_method is null or p_method not in ('cccd_qr', 'manual_document', 'video_call') then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_last4":"4 digits","p_method":"cccd_qr|manual_document|video_call"}';
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.assert_not_self_dealing(p_org_id);

  if v_org.status in ('draft', 'rejected', 'closed') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  perform set_config('fs.org_change_apply', 'on', true);
  insert into public.org_sensitive (org_id, representative_id_last4, id_verified_at,
                                    id_verified_by, id_verification_method)
  values (p_org_id, p_last4, private.now(), v_uid, p_method)
  on conflict (org_id) do update
    set representative_id_last4 = excluded.representative_id_last4,
        id_verified_at = excluded.id_verified_at,
        id_verified_by = excluded.id_verified_by,
        id_verification_method = excluded.id_verification_method;
  perform set_config('fs.org_change_apply', 'off', true);

  -- the digits themselves are not written to the audit trail
  perform private.audit(
    p_action      => 'org.verify_id',
    p_entity_type => 'organization',
    p_entity_id   => p_org_id,
    p_org_id      => p_org_id,
    p_after       => jsonb_build_object('id_verification_method', p_method));
end;
$$;

comment on function public.verify_representative_id(uuid, text, text) is
  'Admin aal2 (not self) sets representative_id_last4 + id_verified_* (bypasses org_sensitive_lock); method cccd_qr|manual_document|video_call. Other digits than a stored full number drop that number (sync trigger). Audit org.verify_id without the digits.';

-- ===========================================================================
-- 5. purge_retention: + step 8 (full CCCD number 30 days after closed/rejected)
-- ===========================================================================
-- Body of 20261007174207_storage_retention unchanged except step 8 and the returned key.
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
  v_repid  integer;
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

  -- 8. full representative CCCD number 30 days after the org was closed or rejected (the last 4 digits
  --    follow org_sensitive: 12 months after closed_at, step 6)
  delete from private.org_representative_ids r
   using public.organizations o
   where o.id = r.org_id
     and ((o.status = 'closed' and o.closed_at < v_now - interval '30 days')
          or (o.status = 'rejected' and o.reviewed_at < v_now - interval '30 days'));
  get diagnostics v_repid = row_count;

  return jsonb_build_object(
    'kyc_purge_enqueued', v_kyc,
    'rate_limits', v_rl,
    'rpc_idempotency', v_idem,
    'notification_outbox', v_outbox,
    'org_change_requests_scrubbed', v_ocr,
    'org_sensitive_scrubbed', v_sens,
    'audit_logs', v_audit,
    'representative_ids_purged', v_repid);
end;
$$;

comment on function public.purge_retention() is
  'Nightly retention (§16): enqueue kyc_purge for due KYC files; delete rate_limits > 24 h, rpc_idempotency > 7 d, done/dead outbox > 90 d, audit_logs > 24 months, full representative CCCD numbers 30 d after closed/rejected; scrub change-request values and org_sensitive of orgs closed > 12 months. service_role / cron only.';

-- ===========================================================================
-- 6. Function privileges (§8.8)
-- ===========================================================================
revoke all on function private.cccd_province_valid(text) from public, anon, authenticated;
revoke all on function private.is_valid_cccd(text) from public, anon, authenticated;
revoke all on function private.mask_cccd(text) from public, anon, authenticated;
revoke all on function private.org_sensitive_sync_representative_id() from public, anon, authenticated;
revoke all on function public.set_representative_id(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.get_representative_id_summary(uuid) from public, anon, authenticated;
revoke all on function public.reveal_representative_id(uuid) from public, anon, authenticated;
revoke all on function public.verify_representative_id(uuid, text, text) from public, anon, authenticated;
revoke all on function public.purge_retention() from public, anon, authenticated;

grant execute on function public.set_representative_id(uuid, text, text, text) to authenticated;
grant execute on function public.get_representative_id_summary(uuid) to authenticated;
grant execute on function public.reveal_representative_id(uuid) to authenticated;
grant execute on function public.verify_representative_id(uuid, text, text) to authenticated;
grant execute on function public.purge_retention() to service_role;

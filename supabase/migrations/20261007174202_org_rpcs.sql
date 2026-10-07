-- Migration 5b — org_rpcs (DATA-MODEL §6.8, §8.2, §11)
-- Organization lifecycle: create_organization, submit_organization, review_organization,
--   suspend_organization, reinstate_organization, close_organization, set_org_paused,
--   verify_representative_id.
-- Legal-field changes after approval: submit_org_change_request, review_org_change_request.
-- Members: invite_member, accept_invite, update_member, remove_member.
-- Consents: grant_consent, withdraw_consent.
-- Every RPC: security definer, search_path = '', permission check, state-machine precondition with
-- stable error codes (§8.0), audit via private.audit. RPCs that take p_client_op_id use
-- rpc_idempotency (private.idem_claim / idem_store); the others are idempotent by construction
-- (documented per function). Draft org fields are edited through the §9.4 column grants, not RPCs.
-- Side effects that need P2 tables (offers/allocations/pickups) are added by P2 migrations with
-- `create or replace` (see DATA-MODEL §6.8 notes).

-- ===========================================================================
-- 1. Internal helpers
-- ===========================================================================

-- URL slug from a (Vietnamese) name: lower-case ASCII, dashes, ≤ 50 chars, 'org' when empty.
create or replace function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from left(trim(both '-' from regexp_replace(
      translate(lower(normalize(coalesce(p_text, ''), nfc)),
        'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
        repeat('a', 17) || repeat('e', 11) || repeat('i', 5) || repeat('o', 17)
          || repeat('u', 11) || repeat('y', 5) || 'd'),
      '[^a-z0-9]+', '-', 'g')), 50)), ''),
    'org');
$$;

comment on function private.slugify(text) is 'ASCII slug of a Vietnamese name (diacritics removed), ≤ 50 chars; ''org'' when nothing is left.';

-- Caller's active role in p_org, else raise: PT404 when the caller cannot see the org (not a
-- member, not admin), PT403 not_authorized when the role is not in p_roles.
create or replace function private.require_org_role(p_org uuid, p_roles public.org_role[])
returns public.org_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.org_role := private.caller_org_role(p_org);
begin
  if v_role is null then
    if private.is_admin() then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if not (v_role = any (p_roles)) then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;

  return v_role;
end;
$$;

comment on function private.require_org_role(uuid, public.org_role[]) is
  'Active role of the caller in p_org if it is one of p_roles; PT404 when the org is not visible to the caller, PT403 not_authorized otherwise.';

-- Admin decisions on an org they belong to (or created) are self-dealing (§19.1).
create or replace function private.assert_not_self_dealing(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.org_members m
             where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active')
     or exists (select 1 from public.organizations o
                where o.id = p_org and o.created_by = (select auth.uid())) then
    raise exception using errcode = 'PT403', message = 'self_dealing';
  end if;
end;
$$;

comment on function private.assert_not_self_dealing(uuid) is 'PT403 self_dealing when the caller is an active member or the creator of p_org.';

-- Validates/normalises the legal-field changes of an org_change_requests row.
-- Returns {"changes": {...trimmed...}, "errors": {...}}.
create or replace function private.normalize_legal_changes(p_changes jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key  text;
  v_val  jsonb;
  v_txt  text;
  v_norm jsonb := '{}'::jsonb;
  v_err  jsonb := '{}'::jsonb;
  v_bad  text;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    return jsonb_build_object('changes', '{}'::jsonb, 'errors', '{"p_changes":"non_empty_object"}'::jsonb);
  end if;

  for v_key, v_val in select e.key, e.value from jsonb_each(p_changes) as e loop
    if v_key not in ('legal_name', 'tax_code', 'registration_no', 'representative_name',
                     'representative_title', 'representative_id_last4') then
      v_err := v_err || jsonb_build_object(v_key, 'not_allowed');
      continue;
    end if;
    if jsonb_typeof(v_val) <> 'string' or btrim(v_val #>> '{}') = '' then
      v_err := v_err || jsonb_build_object(v_key, 'non_empty_string');
      continue;
    end if;

    v_txt := btrim(v_val #>> '{}');
    v_bad := case v_key
      when 'legal_name'              then case when char_length(v_txt) > 200 then 'max_200' end
      when 'tax_code'                then case when v_txt !~ '^[0-9]{10}(-[0-9]{3})?$' then 'format' end
      when 'registration_no'         then case when char_length(v_txt) > 60 then 'max_60' end
      when 'representative_name'     then case when char_length(v_txt) > 120 then 'max_120' end
      when 'representative_title'    then case when char_length(v_txt) > 80 then 'max_80' end
      when 'representative_id_last4' then case when v_txt !~ '^[0-9]{4}$' then 'format' end
    end;

    if v_bad is not null then
      v_err := v_err || jsonb_build_object(v_key, v_bad);
    else
      v_norm := v_norm || jsonb_build_object(v_key, v_txt);
    end if;
  end loop;

  return jsonb_build_object('changes', v_norm, 'errors', v_err);
end;
$$;

comment on function private.normalize_legal_changes(jsonb) is
  'Keys ⊂ legal columns of org_sensitive, non-empty strings matching the column checks. Returns {changes, errors}.';

-- ===========================================================================
-- 2. Organization lifecycle (§6.8)
-- ===========================================================================

-- create: any authenticated user with a confirmed email; ≤ 3 draft orgs per user; creator becomes
-- owner; empty org_sensitive row. Respects app_settings.signups_enabled.
create or replace function public.create_organization(
  p_kind         public.org_kind,
  p_name         text,
  p_subtype      text,
  p_client_op_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_resp jsonb;
  v_name text := btrim(p_name);
  v_id   uuid := gen_random_uuid();
begin
  v_resp := private.idem_claim(p_client_op_id, 'create_organization',
    private.idem_hash(jsonb_build_object('kind', p_kind, 'name', p_name, 'subtype', p_subtype)));
  if v_resp is not null then
    return (v_resp #>> '{}')::uuid;
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null)
     or exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is not null) then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'email_not_confirmed';
  end if;

  if private.setting('signups_enabled') = 'false'::jsonb then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'signups_disabled';
  end if;

  if p_kind is null
     or v_name is null or char_length(v_name) not between 2 and 160
     or p_subtype is null
     or (p_kind = 'store' and p_subtype not in ('bakery', 'restaurant', 'convenience', 'supermarket', 'other'))
     or (p_kind = 'charity' and p_subtype not in ('children_home', 'soup_kitchen', 'shelter', 'elderly_home',
                                                   'disability_center', 'religious_community', 'other')) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_kind":"required","p_name":"2-160 chars","p_subtype":"must match kind"}';
  end if;

  -- serialise per user so the draft cap cannot be raced
  perform 1 from public.profiles p where p.id = v_uid for update;

  if (select count(*) from public.organizations o
      where o.created_by = v_uid and o.status = 'draft') >= 3 then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'draft_limit';
  end if;

  insert into public.organizations (id, kind, name, slug, subtype, created_by)
  values (v_id, p_kind, v_name, private.slugify(v_name) || '-' || left(replace(v_id::text, '-', ''), 8),
          p_subtype, v_uid);

  insert into public.org_members (org_id, user_id, role, status, joined_at)
  values (v_id, v_uid, 'owner', 'active', private.now());

  insert into public.org_sensitive (org_id) values (v_id);

  perform private.audit(
    p_action       => 'org.create',
    p_entity_type  => 'organization',
    p_entity_id    => v_id,
    p_org_id       => v_id,
    p_after        => jsonb_build_object('kind', p_kind, 'name', v_name, 'subtype', p_subtype, 'status', 'draft'),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_id));
  return v_id;
end;
$$;

comment on function public.create_organization(public.org_kind, text, text, uuid) is
  'Create a draft org (caller = owner, empty org_sensitive). Email must be confirmed; ≤ 3 drafts per user; signups_enabled. Idempotent on p_client_op_id.';

-- draft | needs_changes -> submitted (owner). Requires ≥ 1 active site, the mandatory KYC document
-- for the kind and the caller's active `terms` consent.
create or replace function public.submit_organization(p_org_id uuid, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_uid();
  v_org     public.organizations%rowtype;
  v_missing jsonb := '{}'::jsonb;
begin
  if private.idem_claim(p_client_op_id, 'submit_organization',
       private.idem_hash(jsonb_build_object('org_id', p_org_id))) is not null then
    return;
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_org_role(p_org_id, '{owner}');

  if v_org.status not in ('draft', 'needs_changes') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  if not exists (select 1 from public.sites s where s.org_id = p_org_id and s.is_active) then
    v_missing := v_missing || '{"sites":"at_least_one_site"}'::jsonb;
  end if;

  if not exists (select 1 from public.org_documents d
                 where d.org_id = p_org_id and d.change_request_id is null and d.file_deleted_at is null
                   and d.doc_type = any (case v_org.kind
                                           when 'store' then '{business_license}'::public.org_doc_type[]
                                           else '{establishment_decision,operating_license}'::public.org_doc_type[]
                                         end)) then
    v_missing := v_missing || jsonb_build_object('documents',
      case v_org.kind when 'store' then 'business_license' else 'establishment_decision_or_operating_license' end);
  end if;

  if not private.has_consent(v_uid, 'terms') then
    v_missing := v_missing || '{"consent":"terms"}'::jsonb;
  end if;

  if v_missing <> '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = v_missing::text;
  end if;

  update public.organizations
     set status = 'submitted', submitted_at = private.now()
   where id = p_org_id;

  perform private.enqueue('org_submitted', 'organization', p_org_id,
    'org_submitted:' || p_org_id || ':' || p_client_op_id,
    jsonb_build_object('org_id', p_org_id, 'kind', v_org.kind));

  perform private.audit(
    p_action       => 'org.submit',
    p_entity_type  => 'organization',
    p_entity_id    => p_org_id,
    p_org_id       => p_org_id,
    p_before       => jsonb_build_object('status', v_org.status),
    p_after        => jsonb_build_object('status', 'submitted'),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.submit_organization(uuid, uuid) is
  'draft|needs_changes -> submitted (owner). Needs ≥ 1 active site, mandatory document by kind, active terms consent (PT422 detail lists what is missing). Outbox org_submitted.';

-- submitted -> approved | needs_changes | rejected (admin aal2, not a member/creator of the org).
create or replace function public.review_organization(
  p_org_id       uuid,
  p_decision     text,
  p_reason       text,
  p_client_op_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_admin();
  v_org    public.organizations%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_new    public.org_status;
  v_now    timestamptz := private.now();
begin
  if private.idem_claim(p_client_op_id, 'review_organization',
       private.idem_hash(jsonb_build_object('org_id', p_org_id, 'decision', p_decision, 'reason', p_reason))) is not null then
    return;
  end if;

  if p_decision is null or p_decision not in ('approve', 'request_changes', 'reject') then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_decision":"approve|request_changes|reject"}';
  end if;
  if (p_decision <> 'approve' and v_reason is null) or char_length(v_reason) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_reason":"required unless approve, ≤ 1000 chars"}';
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.assert_not_self_dealing(p_org_id);

  if v_org.status <> 'submitted' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  v_new := case p_decision
             when 'approve' then 'approved'::public.org_status
             when 'request_changes' then 'needs_changes'::public.org_status
             else 'rejected'::public.org_status
           end;

  update public.organizations
     set status = v_new,
         reviewed_by = v_uid,
         reviewed_at = v_now,
         rejection_reason = case when p_decision = 'approve' then null else v_reason end
   where id = p_org_id;

  -- KYC files are deleted 30 days after the onboarding decision (§16)
  if p_decision in ('approve', 'reject') then
    update public.org_documents
       set purge_after = v_now + interval '30 days'
     where org_id = p_org_id and change_request_id is null
       and purge_after is null and file_deleted_at is null;
  end if;

  perform private.enqueue('org_reviewed', 'organization', p_org_id,
    'org_reviewed:' || p_org_id || ':' || p_client_op_id,
    jsonb_build_object('org_id', p_org_id, 'decision', p_decision));

  perform private.audit(
    p_action       => 'org.review',
    p_entity_type  => 'organization',
    p_entity_id    => p_org_id,
    p_org_id       => p_org_id,
    p_before       => jsonb_build_object('status', v_org.status),
    p_after        => jsonb_build_object('status', v_new, 'decision', p_decision),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.review_organization(uuid, text, text, uuid) is
  'Onboarding review (admin aal2, not self): submitted -> approved|needs_changes|rejected; reason required unless approve; approve/reject set org_documents.purge_after = now + 30 days. Outbox org_reviewed.';

-- approved -> suspended (admin aal2). P2 adds the cascade of §6.8/§7 C14 (cancel open offers and
-- not-yet-picked allocations) with `create or replace`.
create or replace function public.suspend_organization(p_org_id uuid, p_reason text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      public.organizations%rowtype;
  v_reason   text := nullif(btrim(p_reason), '');
  v_audit_id bigint;
begin
  perform private.require_admin();
  if private.idem_claim(p_client_op_id, 'suspend_organization',
       private.idem_hash(jsonb_build_object('org_id', p_org_id, 'reason', p_reason))) is not null then
    return;
  end if;

  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_reason":"required, ≤ 1000 chars"}';
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.assert_not_self_dealing(p_org_id);

  if v_org.status <> 'approved' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  update public.organizations set status = 'suspended' where id = p_org_id;

  v_audit_id := private.audit(
    p_action       => 'org.suspend',
    p_entity_type  => 'organization',
    p_entity_id    => p_org_id,
    p_org_id       => p_org_id,
    p_before       => jsonb_build_object('status', v_org.status),
    p_after        => jsonb_build_object('status', 'suspended'),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  -- the reason stays in audit_logs (payload carries ids only)
  perform private.enqueue('org_suspended', 'organization', p_org_id,
    'org_suspended:' || p_org_id || ':' || p_client_op_id,
    jsonb_build_object('org_id', p_org_id, 'audit_id', v_audit_id));

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.suspend_organization(uuid, text, uuid) is
  'approved -> suspended (admin aal2, not self, reason required). Outbox org_suspended {org_id, audit_id}. P2 adds the offer/allocation cascade (C14).';

-- suspended -> approved (admin aal2).
create or replace function public.reinstate_organization(p_org_id uuid, p_note text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      public.organizations%rowtype;
  v_note     text := nullif(btrim(p_note), '');
  v_audit_id bigint;
begin
  perform private.require_admin();
  if private.idem_claim(p_client_op_id, 'reinstate_organization',
       private.idem_hash(jsonb_build_object('org_id', p_org_id, 'note', p_note))) is not null then
    return;
  end if;

  if v_note is null or char_length(v_note) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_note":"required, ≤ 1000 chars"}';
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.assert_not_self_dealing(p_org_id);

  if v_org.status <> 'suspended' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  update public.organizations set status = 'approved' where id = p_org_id;

  v_audit_id := private.audit(
    p_action       => 'org.reinstate',
    p_entity_type  => 'organization',
    p_entity_id    => p_org_id,
    p_org_id       => p_org_id,
    p_before       => jsonb_build_object('status', v_org.status),
    p_after        => jsonb_build_object('status', 'approved'),
    p_reason       => v_note,
    p_client_op_id => p_client_op_id);

  perform private.enqueue('org_reinstated', 'organization', p_org_id,
    'org_reinstated:' || p_org_id || ':' || p_client_op_id,
    jsonb_build_object('org_id', p_org_id, 'audit_id', v_audit_id));

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.reinstate_organization(uuid, text, uuid) is
  'suspended -> approved (admin aal2, not self, note required). Outbox org_reinstated {org_id, audit_id}.';

-- approved | suspended -> closed (owner, or admin aal2). Pending change requests are rejected with
-- review_note 'org_closed'. P2 adds the "no unfinished allocation" precondition.
create or replace function public.close_organization(p_org_id uuid, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_org  public.organizations%rowtype;
  v_role public.org_role;
  v_now  timestamptz := private.now();
begin
  if private.idem_claim(p_client_op_id, 'close_organization',
       private.idem_hash(jsonb_build_object('org_id', p_org_id))) is not null then
    return;
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  v_role := private.caller_org_role(p_org_id);
  if v_role is distinct from 'owner' and not private.is_admin() then
    if v_role is null and exists (select 1 from public.profiles p
                                  where p.id = v_uid and p.platform_role = 'admin' and p.deleted_at is null) then
      raise exception using errcode = 'PT403', message = 'mfa_required';
    end if;
    perform private.require_org_role(p_org_id, '{owner}');
  end if;

  if v_org.status not in ('approved', 'suspended') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  update public.organizations set status = 'closed', closed_at = v_now where id = p_org_id;

  update public.org_documents d
     set purge_after = v_now + interval '30 days'
   where d.purge_after is null and d.file_deleted_at is null
     and d.change_request_id in (select r.id from public.org_change_requests r
                                 where r.org_id = p_org_id and r.status = 'pending');

  update public.org_change_requests
     set status = 'rejected', review_note = 'org_closed', reviewed_at = v_now
   where org_id = p_org_id and status = 'pending';

  perform private.audit(
    p_action       => 'org.close',
    p_entity_type  => 'organization',
    p_entity_id    => p_org_id,
    p_org_id       => p_org_id,
    p_before       => jsonb_build_object('status', v_org.status),
    p_after        => jsonb_build_object('status', 'closed'),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.close_organization(uuid, uuid) is
  'approved|suspended -> closed (owner or admin aal2). Pending change requests -> rejected (org_closed). org_sensitive is purged 12 months after closed_at (purge_retention).';

-- Pause / resume receiving and posting (owner, manager of an approved org). Idempotent: setting the
-- current value again is a no-op without audit.
create or replace function public.set_org_paused(p_org_id uuid, p_paused boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    public.organizations%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  perform private.require_uid();

  if p_paused is null or char_length(v_reason) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_paused":"required","p_reason":"≤ 1000 chars"}';
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_org_role(p_org_id, '{owner,manager}');

  if v_org.status <> 'approved' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  if not p_paused then
    v_reason := null;
  end if;

  if v_org.is_paused = p_paused and v_org.paused_reason is not distinct from v_reason then
    return;
  end if;

  update public.organizations
     set is_paused = p_paused, paused_reason = v_reason
   where id = p_org_id;

  perform private.audit(
    p_action      => case when p_paused then 'org.pause' else 'org.resume' end,
    p_entity_type => 'organization',
    p_entity_id   => p_org_id,
    p_org_id      => p_org_id,
    p_before      => jsonb_build_object('is_paused', v_org.is_paused),
    p_after       => jsonb_build_object('is_paused', p_paused),
    p_reason      => v_reason);
end;
$$;

comment on function public.set_org_paused(uuid, boolean, text) is
  'Owner/manager of an approved org toggles is_paused (+ reason). No-op when unchanged.';

-- Admin aal2 records the verified last 4 digits of the representative CCCD. Idempotent (re-verifying
-- overwrites with the same values). Not allowed for draft/rejected/closed orgs.
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
     or p_method is null or p_method not in ('cccd_qr', 'manual_document') then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_last4":"4 digits","p_method":"cccd_qr|manual_document"}';
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
  'Admin aal2 (not self) sets representative_id_last4 + id_verified_* (bypasses org_sensitive_lock). Audit org.verify_id without the digits.';

-- ===========================================================================
-- 3. Legal-field change requests (§2.1 org_change_requests, §6.8)
-- ===========================================================================

create or replace function public.submit_org_change_request(
  p_org_id       uuid,
  p_changes      jsonb,
  p_reason       text,
  p_client_op_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_resp     jsonb;
  v_org      public.organizations%rowtype;
  v_checked  jsonb;
  v_changes  jsonb;
  v_previous jsonb;
  v_reason   text := nullif(btrim(p_reason), '');
  v_id       uuid;
begin
  v_resp := private.idem_claim(p_client_op_id, 'submit_org_change_request',
    private.idem_hash(jsonb_build_object('org_id', p_org_id, 'changes', p_changes, 'reason', p_reason)));
  if v_resp is not null then
    return (v_resp #>> '{}')::uuid;
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_org_role(p_org_id, '{owner}');

  if v_org.status not in ('approved', 'suspended') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  v_checked := private.normalize_legal_changes(p_changes);
  if v_checked -> 'errors' <> '{}'::jsonb or char_length(v_reason) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = (v_checked -> 'errors'
                || case when char_length(v_reason) > 1000 then '{"p_reason":"max_1000"}'::jsonb
                        else '{}'::jsonb end)::text;
  end if;
  v_changes := v_checked -> 'changes';

  if exists (select 1 from public.org_change_requests r where r.org_id = p_org_id and r.status = 'pending') then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'pending_request_exists';
  end if;

  select coalesce(jsonb_object_agg(k.key, to_jsonb(s) -> k.key), '{}'::jsonb)
    into v_previous
  from public.org_sensitive s, jsonb_object_keys(v_changes) as k(key)
  where s.org_id = p_org_id;

  insert into public.org_change_requests (org_id, changes, previous, reason, submitted_by,
                                          submitted_at, client_op_id)
  values (p_org_id, v_changes, coalesce(v_previous, '{}'::jsonb), v_reason, v_uid,
          private.now(), p_client_op_id)
  returning id into v_id;

  perform private.enqueue('org_change_submitted', 'org_change_request', v_id,
    'org_change_submitted:' || v_id,
    jsonb_build_object('org_id', p_org_id, 'request_id', v_id));

  perform private.audit(
    p_action       => 'org.change_submit',
    p_entity_type  => 'org_change_request',
    p_entity_id    => v_id,
    p_org_id       => p_org_id,
    p_after        => jsonb_build_object('status', 'pending',
                        'keys', (select jsonb_agg(k order by k) from jsonb_object_keys(v_changes) as k)),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_id));
  return v_id;
end;
$$;

comment on function public.submit_org_change_request(uuid, jsonb, text, uuid) is
  'Owner of an approved/suspended org asks to change legal fields of org_sensitive. Org stays approved. One pending request per org. Outbox org_change_submitted.';

create or replace function public.review_org_change_request(
  p_request_id   uuid,
  p_decision     text,
  p_note         text,
  p_client_op_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_admin();
  v_req  public.org_change_requests%rowtype;
  v_note text := nullif(btrim(p_note), '');
  v_now  timestamptz := private.now();
  v_c    jsonb;
begin
  if private.idem_claim(p_client_op_id, 'review_org_change_request',
       private.idem_hash(jsonb_build_object('request_id', p_request_id, 'decision', p_decision, 'note', p_note))) is not null then
    return;
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_decision":"approve|reject"}';
  end if;
  if (p_decision = 'reject' and v_note is null) or char_length(v_note) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_note":"required when reject, ≤ 1000 chars"}';
  end if;

  select * into v_req from public.org_change_requests where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform 1 from public.organizations o where o.id = v_req.org_id for update;
  perform private.assert_not_self_dealing(v_req.org_id);

  if v_req.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  if p_decision = 'approve' then
    v_c := v_req.changes;
    perform set_config('fs.org_change_apply', 'on', true);
    update public.org_sensitive s
       set legal_name           = case when v_c ? 'legal_name' then v_c ->> 'legal_name' else s.legal_name end,
           tax_code             = case when v_c ? 'tax_code' then v_c ->> 'tax_code' else s.tax_code end,
           registration_no      = case when v_c ? 'registration_no' then v_c ->> 'registration_no' else s.registration_no end,
           representative_name  = case when v_c ? 'representative_name' then v_c ->> 'representative_name' else s.representative_name end,
           representative_title = case when v_c ? 'representative_title' then v_c ->> 'representative_title' else s.representative_title end,
           representative_id_last4 = case when v_c ? 'representative_id_last4'
                                          then (v_c ->> 'representative_id_last4')::char(4)
                                          else s.representative_id_last4 end,
           -- a new representative invalidates the previous identity verification
           id_verified_at         = case when (v_c ? 'representative_name' and v_c ->> 'representative_name' is distinct from s.representative_name)
                                           or (v_c ? 'representative_id_last4' and v_c ->> 'representative_id_last4' is distinct from s.representative_id_last4::text)
                                         then null else s.id_verified_at end,
           id_verified_by         = case when (v_c ? 'representative_name' and v_c ->> 'representative_name' is distinct from s.representative_name)
                                           or (v_c ? 'representative_id_last4' and v_c ->> 'representative_id_last4' is distinct from s.representative_id_last4::text)
                                         then null else s.id_verified_by end,
           id_verification_method = case when (v_c ? 'representative_name' and v_c ->> 'representative_name' is distinct from s.representative_name)
                                           or (v_c ? 'representative_id_last4' and v_c ->> 'representative_id_last4' is distinct from s.representative_id_last4::text)
                                         then null else s.id_verification_method end
     where s.org_id = v_req.org_id;
    perform set_config('fs.org_change_apply', 'off', true);
  end if;

  update public.org_change_requests
     set status      = case when p_decision = 'approve' then 'approved'::public.org_change_status
                            else 'rejected'::public.org_change_status end,
         reviewed_by = v_uid,
         reviewed_at = v_now,
         review_note = v_note,
         applied_at  = case when p_decision = 'approve' then v_now end
   where id = p_request_id;

  update public.org_documents
     set purge_after = v_now + interval '30 days'
   where change_request_id = p_request_id and purge_after is null and file_deleted_at is null;

  perform private.enqueue('org_change_reviewed', 'org_change_request', p_request_id,
    'org_change_reviewed:' || p_request_id,
    jsonb_build_object('org_id', v_req.org_id, 'request_id', p_request_id, 'decision', p_decision));

  perform private.audit(
    p_action       => 'org.change_review',
    p_entity_type  => 'org_change_request',
    p_entity_id    => p_request_id,
    p_org_id       => v_req.org_id,
    p_before       => jsonb_build_object('status', 'pending'),
    p_after        => jsonb_build_object('status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
                        'keys', (select jsonb_agg(k order by k) from jsonb_object_keys(v_req.changes) as k)),
    p_reason       => v_note,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.review_org_change_request(uuid, text, text, uuid) is
  'Admin aal2 (not self) approves (writes changes into org_sensitive; a new representative clears id_verified_*) or rejects (note required) a pending request. Attached files purge after 30 days.';

-- ===========================================================================
-- 4. Members (§2.1 org_members / org_invitations, §8.2)
-- ===========================================================================

-- Validates site_ids ⊂ sites of p_org (null = all sites; empty array is invalid).
create or replace function private.assert_site_ids(p_org uuid, p_site_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_site_ids is null then
    return;
  end if;
  if cardinality(p_site_ids) = 0 or array_position(p_site_ids, null) is not null
     or exists (select 1 from unnest(p_site_ids) as x(site_id)
                where not exists (select 1 from public.sites s where s.id = x.site_id and s.org_id = p_org)) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_site_ids":"null (all sites) or non-empty list of sites of the org"}';
  end if;
end;
$$;

comment on function private.assert_site_ids(uuid, uuid[]) is 'PT422 unless p_site_ids is null or a non-empty subset of the org''s sites.';

-- Owner/manager of an approved org invites by email. p_token_hash = sha256(UTF-8 bytes of the token
-- string put in the link). Manager cannot invite an owner. Re-inviting the same email revokes the
-- previous open invitation. Idempotent on p_token_hash. Rate limit 30/day/org.
create or replace function public.invite_member(
  p_org_id     uuid,
  p_email      text,
  p_role       public.org_role,
  p_site_ids   uuid[],
  p_token_hash bytea
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_org   public.organizations%rowtype;
  v_role  public.org_role;
  v_email text := lower(btrim(p_email));
  v_inv   public.org_invitations%rowtype;
  v_id    uuid;
begin
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  v_role := private.require_org_role(p_org_id, '{owner,manager}');

  if v_org.status <> 'approved' then
    raise exception using errcode = 'PT403', message = 'org_not_active';
  end if;

  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or p_role is null
     or p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_email":"valid email","p_role":"required","p_token_hash":"32 bytes (sha256)"}';
  end if;
  if p_role = 'owner' and v_role <> 'owner' then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'manager_cannot_invite_owner';
  end if;
  if p_role = 'volunteer' and v_org.kind <> 'charity' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_role":"volunteer_requires_charity"}';
  end if;
  perform private.assert_site_ids(p_org_id, p_site_ids);

  -- idempotency on the token: the same invitation call replayed returns the same id
  select * into v_inv from public.org_invitations i where i.token_hash = p_token_hash;
  if found then
    if v_inv.org_id = p_org_id and v_inv.email = v_email and v_inv.role = p_role
       and v_inv.revoked_at is null then
      return v_inv.id;
    end if;
    raise exception using errcode = 'PT409', message = 'idempotency_conflict';
  end if;

  if exists (select 1 from public.org_members m join public.profiles p on p.id = m.user_id
             where m.org_id = p_org_id and m.status = 'active' and p.email = v_email) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'already_member';
  end if;

  perform private.check_rate_limit('invite_member:org:' || p_org_id, 30, interval '1 day');

  update public.org_invitations
     set revoked_at = private.now()
   where org_id = p_org_id and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.org_invitations (org_id, email, role, site_ids, token_hash, expires_at, invited_by, created_at)
  values (p_org_id, v_email, p_role, p_site_ids, p_token_hash,
          private.now() + interval '7 days', v_uid, private.now())
  returning id into v_id;

  perform private.enqueue('member_invited', 'org_invitation', v_id, 'member_invited:' || v_id,
    jsonb_build_object('invitation_id', v_id, 'org_id', p_org_id));

  -- invitee email is not copied into the audit trail
  perform private.audit(
    p_action      => 'member.invite',
    p_entity_type => 'org_invitation',
    p_entity_id   => v_id,
    p_org_id      => p_org_id,
    p_after       => jsonb_build_object('role', p_role, 'site_ids', p_site_ids));

  return v_id;
end;
$$;

comment on function public.invite_member(uuid, text, public.org_role, uuid[], bytea) is
  'Owner/manager of an approved org invites an email (manager cannot invite owner). token_hash = sha256(utf8(token)). Re-invite revokes the open one; idempotent on token_hash; 30/day/org. Outbox member_invited.';

-- Accept with the plaintext token (from the link). The caller's confirmed email must match.
-- Idempotent: accepting again by the same user returns the same org_id.
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_uid();
  v_inv       public.org_invitations%rowtype;
  v_email     text;
  v_confirmed timestamptz;
begin
  if p_token is null or char_length(p_token) not between 16 and 200 then
    raise exception using errcode = 'PT422', message = 'token_invalid';
  end if;

  select * into v_inv from public.org_invitations i
  where i.token_hash = pg_catalog.sha256(convert_to(p_token, 'UTF8'))
  for update;

  if not found or v_inv.revoked_at is not null then
    raise exception using errcode = 'PT422', message = 'token_invalid';
  end if;

  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_uid then
      return v_inv.org_id;
    end if;
    raise exception using errcode = 'PT409', message = 'token_consumed';
  end if;

  if v_inv.expires_at <= private.now() then
    raise exception using errcode = 'PT422', message = 'token_expired';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = v_uid;
  if v_confirmed is null or v_email is distinct from v_inv.email then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'email_mismatch';
  end if;

  if not exists (select 1 from public.organizations o where o.id = v_inv.org_id and o.status = 'approved') then
    raise exception using errcode = 'PT403', message = 'org_not_active';
  end if;

  insert into public.org_members as m (org_id, user_id, role, site_ids, status, invited_by, joined_at)
  values (v_inv.org_id, v_uid, v_inv.role, v_inv.site_ids, 'active', v_inv.invited_by, private.now())
  on conflict (org_id, user_id) do update
    set role = excluded.role, site_ids = excluded.site_ids, status = 'active',
        invited_by = excluded.invited_by, joined_at = excluded.joined_at
    where m.status <> 'active';

  update public.org_invitations
     set accepted_at = private.now(), accepted_by = v_uid
   where id = v_inv.id;

  perform private.audit(
    p_action      => 'member.accept',
    p_entity_type => 'org_invitation',
    p_entity_id   => v_inv.id,
    p_org_id      => v_inv.org_id,
    p_after       => jsonb_build_object('user_id', v_uid, 'role', v_inv.role));

  return v_inv.org_id;
end;
$$;

comment on function public.accept_invite(text) is
  'Accept an invitation by plaintext token (sha256 lookup, single use, 7-day expiry, confirmed email must match). Returns org_id. Idempotent for the same user.';

-- Owner changes role / site scope of an active member. Keeps ≥ 1 active owner. No-op when unchanged.
create or replace function public.update_member(
  p_org_id   uuid,
  p_user_id  uuid,
  p_role     public.org_role,
  p_site_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  v_mem public.org_members%rowtype;
begin
  perform private.require_uid();

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_org_role(p_org_id, '{owner}');

  if v_org.status = 'closed' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  select * into v_mem from public.org_members m
  where m.org_id = p_org_id and m.user_id = p_user_id and m.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if p_role is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_role":"required"}';
  end if;
  if p_role = 'volunteer' and v_org.kind <> 'charity' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_role":"volunteer_requires_charity"}';
  end if;
  perform private.assert_site_ids(p_org_id, p_site_ids);

  if v_mem.role = 'owner' and p_role <> 'owner'
     and not exists (select 1 from public.org_members m
                     where m.org_id = p_org_id and m.role = 'owner' and m.status = 'active'
                       and m.user_id <> p_user_id) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'last_owner';
  end if;

  if v_mem.role = p_role and v_mem.site_ids is not distinct from p_site_ids then
    return;
  end if;

  update public.org_members
     set role = p_role, site_ids = p_site_ids
   where org_id = p_org_id and user_id = p_user_id;

  perform private.audit(
    p_action      => 'member.update',
    p_entity_type => 'org_member',
    p_entity_id   => p_user_id,
    p_org_id      => p_org_id,
    p_before      => jsonb_build_object('role', v_mem.role, 'site_ids', v_mem.site_ids),
    p_after       => jsonb_build_object('role', p_role, 'site_ids', p_site_ids));
end;
$$;

comment on function public.update_member(uuid, uuid, public.org_role, uuid[]) is
  'Owner sets role/site_ids of an active member; cannot demote the last owner. No-op when unchanged.';

-- Owner removes a member (status removed, row kept). Cannot remove the last owner. Removing an
-- already removed member is a no-op.
create or replace function public.remove_member(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mem public.org_members%rowtype;
begin
  perform private.require_uid();

  perform 1 from public.organizations o where o.id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_org_role(p_org_id, '{owner}');

  select * into v_mem from public.org_members m
  where m.org_id = p_org_id and m.user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if v_mem.status = 'removed' then
    return;
  end if;

  if v_mem.role = 'owner' and v_mem.status = 'active'
     and not exists (select 1 from public.org_members m
                     where m.org_id = p_org_id and m.role = 'owner' and m.status = 'active'
                       and m.user_id <> p_user_id) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'last_owner';
  end if;

  update public.org_members set status = 'removed' where org_id = p_org_id and user_id = p_user_id;
  update public.profiles set active_org_id = null where id = p_user_id and active_org_id = p_org_id;

  perform private.audit(
    p_action      => 'member.remove',
    p_entity_type => 'org_member',
    p_entity_id   => p_user_id,
    p_org_id      => p_org_id,
    p_before      => jsonb_build_object('role', v_mem.role, 'status', v_mem.status),
    p_after       => jsonb_build_object('status', 'removed'));
end;
$$;

comment on function public.remove_member(uuid, uuid) is
  'Owner marks a member removed (keeps ≥ 1 active owner, clears their active_org_id). No-op when already removed.';

-- ===========================================================================
-- 5. Consents (§11)
-- ===========================================================================

-- Records the caller's consent. Same purpose + version + text already active => returns that row
-- (idempotent). A different version/text supersedes the active row (withdrawn_at = now).
create or replace function public.grant_consent(
  p_purpose        public.consent_purpose,
  p_policy_version text,
  p_text_hash      text,
  p_source         text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_old public.consents%rowtype;
  v_ua  text;
  v_id  uuid;
begin
  if p_purpose is null
     or p_policy_version is null or p_policy_version !~ '^[A-Za-z0-9._-]{1,40}$'
     or p_text_hash is null or p_text_hash !~ '^[0-9a-f]{64}$'
     or p_source is null or p_source not in ('web', 'pwa', 'invite') then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_purpose":"required","p_policy_version":"[A-Za-z0-9._-]{1,40}","p_text_hash":"sha256 hex","p_source":"web|pwa|invite"}';
  end if;

  -- serialise grants of the same user (partial unique index consents_one_active)
  perform 1 from public.profiles p where p.id = v_uid for update;

  select * into v_old from public.consents c
  where c.user_id = v_uid and c.purpose = p_purpose and c.withdrawn_at is null;

  if found then
    if v_old.policy_version = p_policy_version and v_old.text_hash = p_text_hash then
      return v_old.id;
    end if;
    update public.consents
       set withdrawn_at = greatest(private.now(), v_old.granted_at)
     where id = v_old.id;
  end if;

  begin
    v_ua := left(nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', 500);
  exception when others then
    v_ua := null;
  end;

  insert into public.consents (user_id, purpose, policy_version, granted_at, source, text_hash, user_agent)
  values (v_uid, p_purpose, p_policy_version, private.now(), p_source, p_text_hash, v_ua)
  returning id into v_id;

  perform private.audit(
    p_action      => 'consent.grant',
    p_entity_type => 'consent',
    p_entity_id   => v_id,
    p_after       => jsonb_build_object('purpose', p_purpose, 'policy_version', p_policy_version, 'source', p_source));

  return v_id;
end;
$$;

comment on function public.grant_consent(public.consent_purpose, text, text, text) is
  'Record the caller''s consent (user_agent from request headers, ip_hash left null). Idempotent for the same version/text; a new version supersedes the active row.';

-- Withdraws the caller's active consent for a purpose (no-op when none). P2 adds: location_trip
-- clears pickups.last_location of running trips.
create or replace function public.withdraw_consent(p_purpose public.consent_purpose)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id  uuid;
begin
  if p_purpose is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_purpose":"required"}';
  end if;

  update public.consents c
     set withdrawn_at = greatest(private.now(), c.granted_at)
   where c.user_id = v_uid and c.purpose = p_purpose and c.withdrawn_at is null
  returning c.id into v_id;

  if v_id is null then
    return;
  end if;

  perform private.audit(
    p_action      => 'consent.withdraw',
    p_entity_type => 'consent',
    p_entity_id   => v_id,
    p_after       => jsonb_build_object('purpose', p_purpose));
end;
$$;

comment on function public.withdraw_consent(public.consent_purpose) is
  'Withdraw the caller''s active consent for p_purpose (no-op when none). Audited.';

-- ===========================================================================
-- 6. Function privileges (§8.8)
-- ===========================================================================
revoke all on function private.slugify(text) from public, anon, authenticated;
revoke all on function private.require_org_role(uuid, public.org_role[]) from public, anon, authenticated;
revoke all on function private.assert_not_self_dealing(uuid) from public, anon, authenticated;
revoke all on function private.normalize_legal_changes(jsonb) from public, anon, authenticated;
revoke all on function private.assert_site_ids(uuid, uuid[]) from public, anon, authenticated;

revoke all on function public.create_organization(public.org_kind, text, text, uuid) from public, anon, authenticated;
revoke all on function public.submit_organization(uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_organization(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.suspend_organization(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.reinstate_organization(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.close_organization(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_org_paused(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.verify_representative_id(uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_org_change_request(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.review_org_change_request(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.invite_member(uuid, text, public.org_role, uuid[], bytea) from public, anon, authenticated;
revoke all on function public.accept_invite(text) from public, anon, authenticated;
revoke all on function public.update_member(uuid, uuid, public.org_role, uuid[]) from public, anon, authenticated;
revoke all on function public.remove_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.grant_consent(public.consent_purpose, text, text, text) from public, anon, authenticated;
revoke all on function public.withdraw_consent(public.consent_purpose) from public, anon, authenticated;

grant execute on function public.create_organization(public.org_kind, text, text, uuid) to authenticated;
grant execute on function public.submit_organization(uuid, uuid) to authenticated;
grant execute on function public.review_organization(uuid, text, text, uuid) to authenticated;
grant execute on function public.suspend_organization(uuid, text, uuid) to authenticated;
grant execute on function public.reinstate_organization(uuid, text, uuid) to authenticated;
grant execute on function public.close_organization(uuid, uuid) to authenticated;
grant execute on function public.set_org_paused(uuid, boolean, text) to authenticated;
grant execute on function public.verify_representative_id(uuid, text, text) to authenticated;
grant execute on function public.submit_org_change_request(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.review_org_change_request(uuid, text, text, uuid) to authenticated;
grant execute on function public.invite_member(uuid, text, public.org_role, uuid[], bytea) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.update_member(uuid, uuid, public.org_role, uuid[]) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.grant_consent(public.consent_purpose, text, text, text) to authenticated;
grant execute on function public.withdraw_consent(public.consent_purpose) to authenticated;

-- Migration 3/13 — identity_orgs (DATA-MODEL §2.1, §2.6, §9, §11, §14)
-- Tables: profiles, organizations, org_sensitive, org_change_requests, org_documents, org_members,
--         org_invitations, consents, trust_events, audit_logs, app_settings.
-- Functions: RLS helpers (private.is_admin, is_org_member, is_active_org_member, is_colleague,
--            org_has_status), private.audit, guard/lock/append-only triggers, handle_new_user,
--            public.grant_platform_admin / public.revoke_platform_admin.
-- audit_logs and app_settings are created here (DATA-MODEL §18 originally listed them in #7)
-- because grant_platform_admin must write audit_logs from P0.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles — 1-1 with auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  platform_role public.platform_role not null default 'user',
  email         text check (email = lower(email)),
  full_name     text not null default '' check (char_length(full_name) <= 120),
  phone         text check (phone ~ '^\+?[0-9]{9,15}$'),
  avatar_path   text check (char_length(avatar_path) <= 300),
  locale        text not null default 'vi' check (locale in ('vi', 'en')),
  active_org_id uuid, -- FK added after organizations exists
  is_demo       boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth.users row, created only by trigger private.handle_new_user (never from client metadata).';
comment on column public.profiles.platform_role is 'NEVER taken from raw_user_meta_data. Changed only by grant_platform_admin / revoke_platform_admin (B1, B2).';
comment on column public.profiles.email is 'Synced from auth.users by trigger (lower-cased); null after anonymisation.';
comment on column public.profiles.active_org_id is 'Organization the user is currently working in (users can belong to several). Must be an org the user is an active member of.';
comment on column public.profiles.deleted_at is 'Set when the profile is anonymised (SECURITY-PRIVACY 7.3).';

create unique index profiles_email_uq on public.profiles (lower(email)) where email is not null;
create unique index profiles_phone_uq on public.profiles (phone) where phone is not null;
create index profiles_active_org_id_idx on public.profiles (active_org_id) where active_org_id is not null;
create index profiles_platform_role_admin_idx on public.profiles (id) where platform_role = 'admin';

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  kind                   public.org_kind not null,
  name                   text not null check (char_length(name) between 2 and 160),
  slug                   text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  subtype                text not null,
  description            text check (char_length(description) <= 2000),
  logo_path              text check (char_length(logo_path) <= 300),
  cover_path             text check (char_length(cover_path) <= 300),
  website                text check (website ~ '^https://' and char_length(website) <= 300),
  founded_on             date,
  declared_beneficiaries integer check (declared_beneficiaries > 0),
  status                 public.org_status not null default 'draft',
  submitted_at           timestamptz,
  reviewed_by            uuid references public.profiles (id),
  reviewed_at            timestamptz,
  rejection_reason       text check (char_length(rejection_reason) <= 1000),
  trust_score            numeric(5, 2) not null default 50 check (trust_score between 0 and 100),
  is_paused              boolean not null default false,
  paused_reason          text check (char_length(paused_reason) <= 1000),
  leaderboard_opt_in     boolean not null default false,
  is_demo                boolean not null default false,
  created_by             uuid not null references public.profiles (id),
  closed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint organizations_subtype_by_kind check (
    (kind = 'store' and subtype in ('bakery', 'restaurant', 'convenience', 'supermarket', 'other'))
    or (kind = 'charity' and subtype in ('children_home', 'soup_kitchen', 'shelter', 'elderly_home',
                                         'disability_center', 'religious_community', 'other'))
  ),
  constraint organizations_beneficiaries_charity_only check (kind = 'charity' or declared_beneficiaries is null),
  constraint organizations_reason_required check (
    status not in ('rejected', 'needs_changes') or rejection_reason is not null
  ),
  constraint organizations_reviewed_required check (
    status not in ('approved', 'rejected', 'needs_changes', 'suspended')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint organizations_submitted_required check (status = 'draft' or submitted_at is not null)
);

comment on table public.organizations is 'Stores and charities. Status changes only via security definer RPCs (DATA-MODEL §6.8).';
comment on column public.organizations.kind is 'Immutable after creation (trigger private.guard_privileged_columns).';
comment on column public.organizations.status is 'Changed only by RPC; not in any UPDATE column grant (B2).';
comment on column public.organizations.trust_score is 'clamp(50 + Σ trust_events.delta, 0, 100); changed only by private.apply_trust (B6).';
comment on column public.organizations.declared_beneficiaries is 'Self-declared number of people served (charity only); fairness fallback when no proofs yet.';
comment on column public.organizations.rejection_reason is 'Used for rejected and needs_changes (onboarding review only).';
comment on column public.organizations.is_demo is 'Set only by seed / service role.';

create index organizations_status_submitted_idx on public.organizations (status, submitted_at);
create index organizations_kind_status_idx on public.organizations (kind, status);
create index organizations_is_demo_idx on public.organizations (is_demo) where is_demo;
create index organizations_created_by_idx on public.organizations (created_by);
create index organizations_reviewed_by_idx on public.organizations (reviewed_by) where reviewed_by is not null;

alter table public.profiles
  add constraint profiles_active_org_id_fkey
  foreign key (active_org_id) references public.organizations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- org_sensitive — 1-1, only owner/manager and admin (C6, B3)
-- ---------------------------------------------------------------------------
create table public.org_sensitive (
  org_id                  uuid primary key references public.organizations (id) on delete cascade,
  legal_name              text check (char_length(legal_name) <= 200),
  tax_code                text check (tax_code ~ '^[0-9]{10}(-[0-9]{3})?$'),
  registration_no         text check (char_length(registration_no) <= 60),
  representative_name     text check (char_length(representative_name) <= 120),
  representative_title    text check (char_length(representative_title) <= 80),
  representative_id_last4 char(4) check (representative_id_last4 ~ '^[0-9]{4}$'),
  id_verified_at          timestamptz,
  id_verified_by          uuid references public.profiles (id),
  id_verification_method  text check (id_verification_method in ('cccd_qr', 'manual_document')),
  contact_email           text check (contact_email = lower(contact_email) and char_length(contact_email) <= 254),
  contact_phone           text check (char_length(contact_phone) <= 20),
  updated_at              timestamptz not null default now()
);

comment on table public.org_sensitive is 'Legal / identity data of an organization. Never readable by anon or other orgs (B3).';
comment on column public.org_sensitive.tax_code is 'Mã số thuế (MST).';
comment on column public.org_sensitive.representative_id_last4 is 'Only the last 4 digits of the representative CCCD — the full number is never stored.';
comment on column public.org_sensitive.id_verified_by is 'Admin who verified the representative identity (verify_representative_id).';

create index org_sensitive_id_verified_by_idx on public.org_sensitive (id_verified_by) where id_verified_by is not null;

-- ---------------------------------------------------------------------------
-- org_change_requests — legal-field edits of an approved org (org stays approved)
-- ---------------------------------------------------------------------------
create table public.org_change_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id),
  status       public.org_change_status not null default 'pending',
  changes      jsonb not null check (jsonb_typeof(changes) = 'object'),
  previous     jsonb not null,
  reason       text check (char_length(reason) <= 1000),
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by  uuid references public.profiles (id),
  reviewed_at  timestamptz,
  review_note  text check (char_length(review_note) <= 1000),
  applied_at   timestamptz,
  client_op_id uuid not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint org_change_requests_note_on_reject check (status <> 'rejected' or review_note is not null),
  constraint org_change_requests_applied_on_approve check (status <> 'approved' or applied_at is not null)
);

comment on table public.org_change_requests is 'Requests to change legal fields of org_sensitive after approval. Written only by submit_/review_org_change_request RPCs.';
comment on column public.org_change_requests.changes is 'New values, keys ⊂ legal columns of org_sensitive (checked in RPC).';
comment on column public.org_change_requests.previous is 'Snapshot of old values when submitted (admin compares old/new).';

create unique index org_change_requests_pending_uq on public.org_change_requests (org_id) where status = 'pending';
create index org_change_requests_org_id_idx on public.org_change_requests (org_id);
create index org_change_requests_status_submitted_idx on public.org_change_requests (status, submitted_at);
create index org_change_requests_submitted_by_idx on public.org_change_requests (submitted_by);
create index org_change_requests_reviewed_by_idx on public.org_change_requests (reviewed_by) where reviewed_by is not null;

-- ---------------------------------------------------------------------------
-- org_documents — metadata of files in bucket `kyc`
-- ---------------------------------------------------------------------------
create table public.org_documents (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id),
  doc_type          public.org_doc_type not null,
  storage_path      text not null unique check (char_length(storage_path) <= 500),
  mime_type         text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes        integer not null check (size_bytes between 1 and 10485760),
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by       uuid not null default auth.uid() references public.profiles (id),
  uploaded_at       timestamptz not null default now(),
  ai_extract        jsonb,
  change_request_id uuid references public.org_change_requests (id),
  purge_after       timestamptz,
  file_deleted_at   timestamptz,
  constraint org_documents_path_in_org_folder check (storage_path like (org_id::text || '/%'))
);

comment on table public.org_documents is 'KYC document metadata; the file lives in private bucket kyc at {org_id}/... (signed URL 60 s).';
comment on column public.org_documents.change_request_id is 'Set when the file was uploaded with an org_change_requests row (path {org_id}/change/{request_id}/...).';
comment on column public.org_documents.purge_after is 'Decision time + 30 days; nightly job deletes the file via Storage API.';
comment on column public.org_documents.file_deleted_at is 'Set by mark_kyc_purged once the storage object is gone; metadata is kept.';

create index org_documents_org_id_idx on public.org_documents (org_id);
create index org_documents_uploaded_by_idx on public.org_documents (uploaded_by);
create index org_documents_change_request_id_idx on public.org_documents (change_request_id) where change_request_id is not null;
create index org_documents_purge_idx on public.org_documents (purge_after) where purge_after is not null and file_deleted_at is null;

-- ---------------------------------------------------------------------------
-- org_members
-- ---------------------------------------------------------------------------
create table public.org_members (
  org_id     uuid not null references public.organizations (id),
  user_id    uuid not null references public.profiles (id),
  role       public.org_role not null,
  site_ids   uuid[],
  status     public.member_status not null default 'active',
  invited_by uuid references public.profiles (id),
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

comment on table public.org_members is 'Membership and role inside an organization. Written only by RPCs (create_organization, accept_invite, update_member, remove_member).';
comment on column public.org_members.site_ids is 'null = all sites of the org; otherwise every element must be a site of the same org (trigger).';

create index org_members_user_status_idx on public.org_members (user_id, status);
create index org_members_invited_by_idx on public.org_members (invited_by) where invited_by is not null;

-- ---------------------------------------------------------------------------
-- org_invitations
-- ---------------------------------------------------------------------------
create table public.org_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id),
  email       text not null check (email = lower(email) and char_length(email) <= 254),
  role        public.org_role not null,
  site_ids    uuid[],
  token_hash  bytea not null unique check (octet_length(token_hash) = 32),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  invited_by  uuid not null references public.profiles (id),
  accepted_at timestamptz,
  revoked_at  timestamptz,
  accepted_by uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

comment on table public.org_invitations is 'Pending/accepted member invitations. Written only by invite_member / accept_invite RPCs.';
comment on column public.org_invitations.token_hash is 'sha256 of the 32-byte invite token; never selectable by clients.';

create unique index org_invitations_open_uq on public.org_invitations (org_id, lower(email))
  where accepted_at is null and revoked_at is null;
create index org_invitations_org_id_idx on public.org_invitations (org_id);
create index org_invitations_invited_by_idx on public.org_invitations (invited_by);
create index org_invitations_accepted_by_idx on public.org_invitations (accepted_by) where accepted_by is not null;

-- ---------------------------------------------------------------------------
-- consents (DATA-MODEL §11 = SECURITY-PRIVACY §6)
-- ---------------------------------------------------------------------------
create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  purpose        public.consent_purpose not null,
  policy_version text not null check (char_length(policy_version) <= 40),
  granted_at     timestamptz not null default now(),
  withdrawn_at   timestamptz,
  source         text not null check (source in ('web', 'pwa', 'invite')),
  text_hash      text not null check (char_length(text_hash) <= 128),
  user_agent     text check (char_length(user_agent) <= 500),
  ip_hash        text check (char_length(ip_hash) <= 128),
  constraint consents_withdrawn_after_granted check (withdrawn_at is null or withdrawn_at >= granted_at)
);

comment on table public.consents is 'Consent records (Luật 91/2025/QH15). Written only via grant_consent / withdraw_consent.';
comment on column public.consents.text_hash is 'sha256 of the consent text shown to the user.';
comment on column public.consents.ip_hash is 'HMAC of the client IP; raw IP is never stored.';

create unique index consents_one_active on public.consents (user_id, purpose) where withdrawn_at is null;
create index consents_user_id_idx on public.consents (user_id);

-- ---------------------------------------------------------------------------
-- trust_events — append-only, explains trust_score
-- ---------------------------------------------------------------------------
create table public.trust_events (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations (id),
  delta         numeric(5, 2) not null check (delta <> 0),
  reason        text not null check (reason in (
                  'delivered_on_time', 'store_cancel_after_confirm', 'store_short',
                  'charity_cancel_after_packed', 'proof_approved', 'proof_overdue',
                  'incident_upheld', 'admin_adjust')),
  rules_version smallint not null default 1,
  ref_type      text check (char_length(ref_type) <= 40),
  ref_id        uuid,
  created_at    timestamptz not null default now()
);

comment on table public.trust_events is 'Append-only trust score events, written by private.apply_trust (DATA-MODEL §2.6).';
comment on column public.trust_events.rules_version is 'Version of the (migration-coded) trust rules applied when the row was written.';

create index trust_events_org_created_idx on public.trust_events (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- audit_logs — append-only (DATA-MODEL §14)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor_id       uuid references public.profiles (id) on delete set null,
  actor_kind     text not null check (actor_kind in ('user', 'admin', 'system', 'service')),
  actor_org_role public.org_role,
  org_id         uuid,
  action         text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type    text not null check (char_length(entity_type) <= 60),
  entity_id      uuid,
  before         jsonb,
  after          jsonb,
  reason         text check (char_length(reason) <= 2000),
  request_id     text check (char_length(request_id) <= 200),
  client_op_id   uuid
);

comment on table public.audit_logs is 'Append-only audit trail written by private.audit() from every state-transition RPC and admin action.';
comment on column public.audit_logs.actor_id is 'null = system/service. FK on delete set null (the only UPDATE the append-only trigger allows).';
comment on column public.audit_logs.org_id is 'Organization context (no FK on purpose: audit rows must outlive anything they mention).';
comment on column public.audit_logs.before is 'Only changed columns; never tokens, hashes or sensitive PII.';
comment on column public.audit_logs.request_id is 'x-request-id header (request.headers GUC set by PostgREST).';

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, at desc);
create index audit_logs_org_idx on public.audit_logs (org_id, at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, at desc);

-- ---------------------------------------------------------------------------
-- app_settings (DATA-MODEL §2.6). Rows are seeded by supabase/seed/00_reference.sql.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_]+$' and char_length(key) <= 64),
  value       jsonb not null,
  description text not null check (char_length(description) <= 500),
  is_public   boolean not null default false,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

comment on table public.app_settings is 'Runtime settings and feature switches. Changed only by set_app_setting (admin aal2, audited). Anyone reads rows with is_public.';
comment on column public.app_settings.is_public is 'true = readable by anon/authenticated (e.g. signups_enabled, public_map_enabled, policy versions).';

create index app_settings_updated_by_idx on public.app_settings (updated_by) where updated_by is not null;

-- ===========================================================================
-- 2. RLS helpers (schema private, security definer, stable, search_path = '') — §9.1
-- ===========================================================================

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (select 1 from public.profiles p
                 where p.id = (select auth.uid())
                   and p.platform_role = 'admin'
                   and p.deleted_at is null);
$$;

comment on function private.is_admin() is 'true only for platform_role = admin AND JWT aal = aal2 (MFA). Admin with aal1 is not admin (C3).';

create or replace function private.is_org_member(p_org uuid, p_roles public.org_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.org_members m
                 where m.org_id = p_org
                   and m.user_id = (select auth.uid())
                   and m.status = 'active'
                   and (p_roles is null or m.role = any (p_roles)));
$$;

comment on function private.is_org_member(uuid, public.org_role[]) is 'Caller is an active member of the org (optionally with one of p_roles), any org status.';

create or replace function private.is_active_org_member(p_org uuid, p_roles public.org_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_org_member(p_org, p_roles)
     and exists (select 1 from public.organizations o
                 where o.id = p_org and o.status = 'approved');
$$;

comment on function private.is_active_org_member(uuid, public.org_role[]) is 'is_org_member AND organization approved (blocks B8 for submitted/suspended orgs).';

create or replace function private.org_has_status(p_org uuid, p_statuses public.org_status[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.organizations o
                 where o.id = p_org and o.status = any (p_statuses));
$$;

comment on function private.org_has_status(uuid, public.org_status[]) is 'Status check usable from policies of roles without SELECT on organizations.status (e.g. anon on sites).';

create or replace function private.is_colleague(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1
                 from public.org_members me
                 join public.org_members them on them.org_id = me.org_id
                 join public.organizations o on o.id = me.org_id and o.status = 'approved'
                 where me.user_id = (select auth.uid()) and me.status = 'active'
                   and them.user_id = p_user and them.status = 'active');
$$;

comment on function private.is_colleague(uuid) is 'Caller and p_user are active members of the same approved organization (profiles RLS).';

-- ===========================================================================
-- 3. private.audit — single writer of audit_logs (§14)
-- ===========================================================================
create or replace function private.audit(
  p_action       text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_org_id       uuid default null,
  p_before       jsonb default null,
  p_after        jsonb default null,
  p_reason       text default null,
  p_client_op_id uuid default null,
  p_actor_kind   text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_kind       text;
  v_org_role   public.org_role;
  v_request_id text;
  v_id         bigint;
begin
  v_kind := coalesce(
    p_actor_kind,
    case
      when v_uid is null and current_setting('role', true) = 'service_role' then 'service'
      when v_uid is null then 'system'
      when private.is_admin() then 'admin'
      else 'user'
    end);

  if v_uid is not null and p_org_id is not null then
    select m.role into v_org_role
    from public.org_members m
    where m.org_id = p_org_id and m.user_id = v_uid and m.status = 'active';
  end if;

  begin
    v_request_id := left(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-request-id', 200);
  exception when others then
    v_request_id := null;
  end;

  insert into public.audit_logs (at, actor_id, actor_kind, actor_org_role, org_id, action,
                                 entity_type, entity_id, before, after, reason, request_id, client_op_id)
  values (private.now(), v_uid, v_kind, v_org_role, p_org_id, p_action,
          p_entity_type, p_entity_id, p_before, p_after, p_reason, v_request_id, p_client_op_id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function private.audit(text, text, uuid, uuid, jsonb, jsonb, text, uuid, text) is
  'Append one audit_logs row. actor_kind derived from JWT unless given. Internal only (no EXECUTE for anon/authenticated).';

-- ===========================================================================
-- 4. Trigger functions
-- ===========================================================================

-- Layer-two defence (§9.4): privileged columns cannot change when the statement runs as
-- anon/authenticated (i.e. outside a security definer RPC). Layer one is the column grants.
create or replace function private.guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new  jsonb := to_jsonb(new);
  v_old  jsonb := to_jsonb(old);
  v_cols text[];
  v_col  text;
begin
  if tg_table_name = 'organizations' and (v_new -> 'kind') is distinct from (v_old -> 'kind') then
    raise exception using errcode = 'PT409', message = 'invalid_state',
      detail = 'organizations.kind is immutable';
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  v_cols := case tg_table_name
    when 'profiles' then
      array['id', 'platform_role', 'email', 'is_demo', 'deleted_at', 'created_at']
    when 'organizations' then
      array['id', 'status', 'submitted_at', 'reviewed_by', 'reviewed_at', 'rejection_reason',
            'trust_score', 'is_paused', 'paused_reason', 'is_demo', 'created_by', 'closed_at',
            'slug', 'created_at']
    when 'org_sensitive' then
      array['org_id', 'representative_id_last4', 'id_verified_at', 'id_verified_by',
            'id_verification_method']
    else array[]::text[]
  end;

  foreach v_col in array v_cols loop
    if (v_new -> v_col) is distinct from (v_old -> v_col) then
      raise exception using errcode = '42501', message = 'not_authorized',
        detail = format('%s.%s can only be changed by an RPC', tg_table_name, v_col);
    end if;
  end loop;

  return new;
end;
$$;

comment on function private.guard_privileged_columns() is
  'BEFORE UPDATE: raises 42501 if a privileged column changes while current_user is anon/authenticated; organizations.kind is immutable for everyone.';

-- org_sensitive legal columns are locked while the org is approved/suspended (§2.1).
-- Only review_org_change_request / verify_representative_id (definer RPCs) may bypass with
-- `set local fs.org_change_apply = 'on'`; the flag is ignored for anon/authenticated statements.
-- NOT security definer on purpose: current_user must be the statement's role so the bypass flag
-- is honoured only inside definer RPCs.
create or replace function private.org_sensitive_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('fs.org_change_apply', true) = 'on'
     and current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if private.org_has_status(new.org_id, '{approved,suspended}') and (
       new.legal_name              is distinct from old.legal_name
    or new.tax_code                is distinct from old.tax_code
    or new.registration_no         is distinct from old.registration_no
    or new.representative_name     is distinct from old.representative_name
    or new.representative_title    is distinct from old.representative_title
    or new.representative_id_last4 is distinct from old.representative_id_last4
    or new.id_verified_at          is distinct from old.id_verified_at
    or new.id_verified_by          is distinct from old.id_verified_by
    or new.id_verification_method  is distinct from old.id_verification_method
  ) then
    raise exception using errcode = 'PT409', message = 'invalid_state',
      detail = 'legal_fields_locked: use submit_org_change_request';
  end if;

  return new;
end;
$$;

comment on function private.org_sensitive_lock() is
  'BEFORE UPDATE on org_sensitive: legal/verified columns locked when org is approved/suspended (changes go through org_change_requests).';

-- org_members invariants (§2.1): volunteer only in charities; site_ids belong to the org.
-- public.sites is created by the next migration (sites_hours); plpgsql resolves it at run time.
create or replace function private.org_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.org_kind;
begin
  select o.kind into v_kind from public.organizations o where o.id = new.org_id;

  if new.role = 'volunteer' and v_kind is distinct from 'charity' then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"role":"volunteer_requires_charity"}';
  end if;

  if new.site_ids is not null and exists (
       select 1 from unnest(new.site_ids) as s(site_id)
       where not exists (select 1 from public.sites st where st.id = s.site_id and st.org_id = new.org_id)
     ) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"site_ids":"site_not_in_org"}';
  end if;

  return new;
end;
$$;

comment on function private.org_members_guard() is 'BEFORE INSERT/UPDATE on org_members: volunteer only for charity; site_ids ⊂ sites of the org.';

-- Every organization that is not closed keeps ≥ 1 active owner (deferred, so ownership can be
-- transferred inside one transaction).
create or replace function private.org_members_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and exists (select 1 from public.organizations o where o.id = old.org_id and o.status <> 'closed')
     and not exists (select 1 from public.org_members m
                     where m.org_id = old.org_id and m.role = 'owner' and m.status = 'active') then
    raise exception using errcode = 'PT409', message = 'invalid_state',
      detail = 'last_owner: an organization that is not closed needs an active owner';
  end if;
  return null;
end;
$$;

comment on function private.org_members_owner_guard() is 'Deferred constraint trigger: a non-closed organization keeps at least one active owner.';

-- Append-only tables (audit_logs, trust_events; later impact_ledger): no UPDATE/DELETE, even for
-- postgres. Exceptions: purge_retention() sets fs.allow_purge = 'on' to DELETE; the FK action
-- `on delete set null` of audit_logs.actor_id may null that single column.
create or replace function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('fs.allow_purge', true) = 'on'
     and current_user not in ('authenticated', 'anon') then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and to_jsonb(old) ? 'actor_id'
     and (to_jsonb(old) ->> 'actor_id') is not null
     and (to_jsonb(new) ->> 'actor_id') is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'append_only',
    detail = format('%s is append-only', tg_table_name);
end;
$$;

comment on function private.forbid_mutation() is 'BEFORE UPDATE/DELETE on append-only tables. Never disable this trigger (B2 checks tgenabled).';

-- Profile creation on sign-up. NEVER reads any role/status key from raw_user_meta_data (B1).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id,
          lower(new.email),
          left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end;
$$;

comment on function private.handle_new_user() is
  'AFTER INSERT on auth.users: creates profiles(id, email, full_name). platform_role always takes the column default user (B1).';

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = lower(new.email)
   where id = new.id and deleted_at is null;
  return new;
end;
$$;

comment on function private.handle_user_email_change() is 'AFTER UPDATE OF email on auth.users: keeps profiles.email in sync.';

-- ===========================================================================
-- 5. Triggers
-- ===========================================================================
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.org_sensitive
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.org_change_requests
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.org_members
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

create trigger guard_privileged_columns before update on public.profiles
  for each row execute function private.guard_privileged_columns();
create trigger guard_privileged_columns before update on public.organizations
  for each row execute function private.guard_privileged_columns();
create trigger guard_privileged_columns before update on public.org_sensitive
  for each row execute function private.guard_privileged_columns();

create trigger org_sensitive_lock before update on public.org_sensitive
  for each row execute function private.org_sensitive_lock();

create trigger org_members_guard before insert or update on public.org_members
  for each row execute function private.org_members_guard();

create constraint trigger org_members_owner_guard
  after update or delete on public.org_members
  deferrable initially deferred
  for each row execute function private.org_members_owner_guard();

create trigger forbid_mutation before update or delete on public.audit_logs
  for each row execute function private.forbid_mutation();
create trigger forbid_mutation before update or delete on public.trust_events
  for each row execute function private.forbid_mutation();

-- ===========================================================================
-- 6. Row level security + policies (§9.2)
-- ===========================================================================
alter table public.profiles            enable row level security;
alter table public.organizations       enable row level security;
alter table public.org_sensitive       enable row level security;
alter table public.org_change_requests enable row level security;
alter table public.org_documents       enable row level security;
alter table public.org_members         enable row level security;
alter table public.org_invitations     enable row level security;
alter table public.consents            enable row level security;
alter table public.trust_events        enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.app_settings        enable row level security;

-- profiles: own row; colleagues of the same approved org; admin aal2 all. U own row (whitelist).
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_colleague(id)
    or (select private.is_admin())
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (
    id = (select auth.uid())
    and (active_org_id is null or private.is_org_member(active_org_id))
  );

-- organizations: anon reads approved (public columns only, §9.4); members read their own org in
-- any status; owner/manager update whitelisted columns while draft/needs_changes/approved.
create policy organizations_select_anon on public.organizations
  for select to anon
  using (status = 'approved');

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    status = 'approved'
    or private.is_org_member(id)
    or (select private.is_admin())
  );

create policy organizations_update_owner_manager on public.organizations
  for update to authenticated
  using (
    status in ('draft', 'needs_changes', 'approved')
    and private.is_org_member(id, '{owner,manager}')
  )
  with check (
    status in ('draft', 'needs_changes', 'approved')
    and private.is_org_member(id, '{owner,manager}')
  );

-- org_sensitive: owner/manager of the org (any status) and admin aal2. Legal columns are locked by
-- trigger once approved/suspended.
create policy org_sensitive_select on public.org_sensitive
  for select to authenticated
  using (
    private.is_org_member(org_id, '{owner,manager}')
    or (select private.is_admin())
  );

create policy org_sensitive_update_owner_manager on public.org_sensitive
  for update to authenticated
  using (private.is_org_member(org_id, '{owner,manager}'))
  with check (private.is_org_member(org_id, '{owner,manager}'));

-- org_change_requests: owner/manager read their org's requests; admin aal2 all; writes via RPC.
create policy org_change_requests_select on public.org_change_requests
  for select to authenticated
  using (
    private.is_org_member(org_id, '{owner,manager}')
    or (select private.is_admin())
  );

-- org_documents: owner/manager S/I/D while onboarding (draft/submitted/needs_changes); I also for
-- a pending change request of the org; no UPDATE; admin aal2 reads.
create policy org_documents_select on public.org_documents
  for select to authenticated
  using (
    private.is_org_member(org_id, '{owner,manager}')
    or (select private.is_admin())
  );

create policy org_documents_insert_owner_manager on public.org_documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.is_org_member(org_id, '{owner,manager}')
    and (
      (change_request_id is null
        and private.org_has_status(org_id, '{draft,submitted,needs_changes}'))
      or (change_request_id is not null
        and exists (select 1 from public.org_change_requests r
                    where r.id = change_request_id
                      and r.org_id = org_documents.org_id
                      and r.status = 'pending'))
    )
  );

create policy org_documents_delete_owner_manager on public.org_documents
  for delete to authenticated
  using (
    change_request_id is null
    and private.is_org_member(org_id, '{owner,manager}')
    and private.org_has_status(org_id, '{draft,submitted,needs_changes}')
  );

-- org_members: own rows; owner/manager/staff of an approved org see the org's members; admin.
create policy org_members_select on public.org_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_active_org_member(org_id, '{owner,manager,staff}')
    or (select private.is_admin())
  );

-- org_invitations: owner/manager of an approved org; admin. token_hash is never granted.
create policy org_invitations_select on public.org_invitations
  for select to authenticated
  using (
    private.is_active_org_member(org_id, '{owner,manager}')
    or (select private.is_admin())
  );

-- consents: own rows; admin. Writes via grant_consent / withdraw_consent.
create policy consents_select on public.consents
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

-- trust_events: owner/manager/staff of the approved org; admin.
create policy trust_events_select on public.trust_events
  for select to authenticated
  using (
    private.is_active_org_member(org_id, '{owner,manager,staff}')
    or (select private.is_admin())
  );

-- audit_logs: owner/manager of the approved org see rows of their org; admin all.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (org_id is not null and private.is_active_org_member(org_id, '{owner,manager}'))
    or (select private.is_admin())
  );

-- app_settings: public keys for everyone; admin aal2 all. Writes via set_app_setting.
create policy app_settings_select_anon on public.app_settings
  for select to anon
  using (is_public);

create policy app_settings_select on public.app_settings
  for select to authenticated
  using (is_public or (select private.is_admin()));

-- ===========================================================================
-- 7. Table / column privileges (§0 "Quyền mặc định", §9.4 allow-lists)
-- ===========================================================================
revoke all on table
  public.profiles, public.organizations, public.org_sensitive, public.org_change_requests,
  public.org_documents, public.org_members, public.org_invitations, public.consents,
  public.trust_events, public.audit_logs, public.app_settings
from anon, authenticated;

-- profiles
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path, locale, active_org_id) on public.profiles to authenticated;

-- organizations
grant select (id, kind, name, slug, subtype, description, logo_path, cover_path, website,
              is_demo, leaderboard_opt_in)
  on public.organizations to anon;
grant select on public.organizations to authenticated;
grant update (name, subtype, description, logo_path, cover_path, website, founded_on,
              declared_beneficiaries, leaderboard_opt_in)
  on public.organizations to authenticated;

-- org_sensitive
grant select on public.org_sensitive to authenticated;
grant update (legal_name, tax_code, registration_no, representative_name, representative_title,
              contact_email, contact_phone)
  on public.org_sensitive to authenticated;

-- org_change_requests
grant select on public.org_change_requests to authenticated;

-- org_documents (uploaded_by defaults to auth.uid(); purge/AI columns are server-only)
grant select on public.org_documents to authenticated;
grant insert (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, change_request_id)
  on public.org_documents to authenticated;
grant delete on public.org_documents to authenticated;

-- org_members
grant select on public.org_members to authenticated;

-- org_invitations (every column except token_hash)
grant select (id, org_id, email, role, site_ids, expires_at, invited_by, accepted_at, revoked_at,
              accepted_by, created_at)
  on public.org_invitations to authenticated;

-- consents, trust_events, audit_logs
grant select on public.consents to authenticated;
grant select on public.trust_events to authenticated;
grant select on public.audit_logs to authenticated;

-- app_settings
grant select (key, value, description) on public.app_settings to anon, authenticated;

-- ===========================================================================
-- 8. Platform admin RPCs (§8.2, DEPLOYMENT §5.6)
-- ===========================================================================

-- Returns the actor kind of a caller allowed to manage platform admins, or raises.
-- Allowed: service_role (PostgREST with the service key), a direct postgres/supabase_admin
-- session without SET ROLE (SQL Editor, bootstrap script, migrations), or admin aal2.
create or replace function private.require_admin_manager()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  if v_role = 'service_role' then
    return 'service';
  end if;

  if v_role = 'none' and session_user in ('postgres', 'supabase_admin') then
    return 'service';
  end if;

  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'not_authenticated';
  end if;

  if private.is_admin() then
    return 'admin';
  end if;

  if exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.platform_role = 'admin' and p.deleted_at is null) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  end if;

  raise exception using errcode = 'PT403', message = 'not_authorized';
end;
$$;

comment on function private.require_admin_manager() is
  'Gate for grant/revoke_platform_admin: service role, direct postgres session, or admin aal2. Returns actor_kind.';

create or replace function public.grant_platform_admin(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_kind text;
  v_before     public.platform_role;
begin
  v_actor_kind := private.require_admin_manager();

  if p_user_id is null or p_reason is null or char_length(btrim(p_reason)) = 0
     or char_length(p_reason) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_user_id":"required","p_reason":"required, 1-1000 chars"}';
  end if;

  select p.platform_role into v_before
  from public.profiles p
  where p.id = p_user_id and p.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if v_before = 'admin' then
    return; -- idempotent: nothing changed, nothing to audit
  end if;

  update public.profiles set platform_role = 'admin' where id = p_user_id;

  perform private.audit(
    p_action      => 'admin.grant',
    p_entity_type => 'profile',
    p_entity_id   => p_user_id,
    p_before      => jsonb_build_object('platform_role', v_before),
    p_after       => jsonb_build_object('platform_role', 'admin'),
    p_reason      => p_reason,
    p_actor_kind  => v_actor_kind);
end;
$$;

comment on function public.grant_platform_admin(uuid, text) is
  'Grant platform admin. Only service role / postgres session / admin aal2; reason required; audited (admin.grant). The grantee must enrol TOTP before using /admin.';

create or replace function public.revoke_platform_admin(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_kind text;
  v_before     public.platform_role;
begin
  v_actor_kind := private.require_admin_manager();

  if p_user_id is null or p_reason is null or char_length(btrim(p_reason)) = 0
     or char_length(p_reason) > 1000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_user_id":"required","p_reason":"required, 1-1000 chars"}';
  end if;

  if v_actor_kind = 'admin' and p_user_id = auth.uid() then
    raise exception using errcode = 'PT403', message = 'self_dealing';
  end if;

  -- Serialise concurrent revokes: lock every admin row in id order before counting.
  perform 1 from public.profiles p where p.platform_role = 'admin' order by p.id for update;

  select p.platform_role into v_before
  from public.profiles p
  where p.id = p_user_id and p.deleted_at is null;

  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if v_before <> 'admin' then
    return; -- idempotent: nothing changed, nothing to audit
  end if;

  if not exists (select 1 from public.profiles p
                 where p.platform_role = 'admin' and p.deleted_at is null and p.id <> p_user_id) then
    raise exception using errcode = 'PT409', message = 'invalid_state',
      detail = 'last_admin: cannot revoke the last platform admin';
  end if;

  update public.profiles set platform_role = 'user' where id = p_user_id;

  perform private.audit(
    p_action      => 'admin.revoke',
    p_entity_type => 'profile',
    p_entity_id   => p_user_id,
    p_before      => jsonb_build_object('platform_role', v_before),
    p_after       => jsonb_build_object('platform_role', 'user'),
    p_reason      => p_reason,
    p_actor_kind  => v_actor_kind);
end;
$$;

comment on function public.revoke_platform_admin(uuid, text) is
  'Revoke platform admin. Same callers as grant; refuses self-revoke (admin) and revoking the last admin; audited (admin.revoke).';

-- ===========================================================================
-- 9. Function privileges (§8.8): nothing is executable unless granted here.
-- ===========================================================================
revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_org_member(uuid, public.org_role[]) to authenticated, service_role;
grant execute on function private.is_active_org_member(uuid, public.org_role[]) to authenticated, service_role;
grant execute on function private.org_has_status(uuid, public.org_status[]) to anon, authenticated, service_role;
grant execute on function private.is_colleague(uuid) to authenticated, service_role;

revoke all on function public.grant_platform_admin(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_platform_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_platform_admin(uuid, text) to authenticated, service_role;
grant execute on function public.revoke_platform_admin(uuid, text) to authenticated, service_role;

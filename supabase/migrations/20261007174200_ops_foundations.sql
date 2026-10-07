-- Migration 5a — ops_foundations (DATA-MODEL §2.6, §8.7, §8.8, §12.1, §15)
-- Tables: rate_limits, rpc_idempotency, notification_outbox (table + private.enqueue only; the
--         dispatcher, kick_dispatch trigger and the other notification tables arrive in P2 #10).
-- Functions: private.require_uid, private.require_admin, private.try_uuid, private.setting,
--            private.has_consent, private.caller_org_role, private.rate_limit_consume,
--            private.check_rate_limit, public.consume_rate_limit (service_role),
--            private.idem_hash, private.idem_claim, private.idem_store, private.enqueue.
-- rate_limits / rpc_idempotency were planned for #7 (DATA-MODEL §18); they move here because the
-- P1 onboarding RPCs already need idempotency and the app server needs auth rate limits.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- rate_limits — fixed-window counters (§15, SECURITY-PRIVACY C11)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key          text not null check (char_length(key) between 5 and 230),
  window_start timestamptz not null,
  count        integer not null default 0 check (count >= 0),
  primary key (key, window_start)
);

comment on table public.rate_limits is 'Fixed-window rate limit counters. Only definer functions / service role touch it. Purged after 24 h (purge_retention).';
comment on column public.rate_limits.key is '<action>:<scope>:<id>, e.g. publish_offer:org:<uuid>, auth_signup:ip:<hmac>. IP/email are always HMAC-hashed, never raw.';
comment on column public.rate_limits.window_start is 'date_bin(window, private.now(), 2000-01-01 00:00 +07): windows align to Vietnam midnight.';

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- rpc_idempotency — one row per client_op_id (§15)
-- ---------------------------------------------------------------------------
create table public.rpc_idempotency (
  client_op_id uuid primary key,
  actor_id     uuid not null,
  rpc_name     text not null check (rpc_name ~ '^[a-z_]{3,64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response     jsonb,
  created_at   timestamptz not null default now()
);

comment on table public.rpc_idempotency is 'Idempotency of state-changing RPCs: same client_op_id + actor + rpc + params => stored response is returned. Purged after 7 days.';
comment on column public.rpc_idempotency.actor_id is 'auth.uid() of the first call (no FK: rows are short-lived and must not block profile anonymisation).';
comment on column public.rpc_idempotency.request_hash is 'sha256 (hex) of the normalised RPC parameters (jsonb text, keys sorted).';
comment on column public.rpc_idempotency.response is 'RPC result as jsonb (JSON null for void RPCs). SQL NULL only inside the claiming transaction.';

create index rpc_idempotency_created_at_idx on public.rpc_idempotency (created_at);

-- ---------------------------------------------------------------------------
-- notification_outbox (§2.6, §12.1). Written only by private.enqueue in the same transaction as
-- the business change. Consumed by the dispatcher (P2, service role).
-- ---------------------------------------------------------------------------
create table public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  event           public.notification_event not null,
  aggregate_type  text not null check (aggregate_type ~ '^[a-z_]{2,40}$'),
  aggregate_id    uuid not null,
  dedupe_key      text not null unique check (char_length(dedupe_key) <= 200),
  payload         jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  urgency         text not null default 'normal' check (urgency in ('normal', 'urgent')),
  status          public.outbox_status not null default 'pending',
  attempts        smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text check (char_length(last_error) <= 2000),
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);

comment on table public.notification_outbox is 'Transactional outbox (§12). Insert only via private.enqueue (idempotent on dedupe_key). Admin aal2 reads; dispatcher (service role) processes.';
comment on column public.notification_outbox.payload is 'Ids and enums only: never PII, tokens or secrets.';
comment on column public.notification_outbox.next_attempt_at is 'Backoff 1m, 5m, 15m, 1h, 6h; 6th failure => dead.';

create index outbox_ready_idx on public.notification_outbox (next_attempt_at) where status = 'pending';
create index notification_outbox_created_at_idx on public.notification_outbox (created_at);

-- ===========================================================================
-- 2. Row level security + privileges
-- ===========================================================================
alter table public.rate_limits         enable row level security;
alter table public.rpc_idempotency     enable row level security;
alter table public.notification_outbox enable row level security;

-- rate_limits, rpc_idempotency: no policy at all (definer functions / service role only, §9.2).
-- notification_outbox: admin aal2 reads (§9.2); nobody writes directly.
create policy notification_outbox_select_admin on public.notification_outbox
  for select to authenticated
  using ((select private.is_admin()));

revoke all on table public.rate_limits, public.rpc_idempotency, public.notification_outbox
  from anon, authenticated;
grant select on public.notification_outbox to authenticated;

-- ===========================================================================
-- 3. Shared helpers (private, security definer, search_path = '')
-- ===========================================================================

-- Caller uid or PT401.
create or replace function private.require_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = 'PT401', message = 'not_authenticated';
  end if;
  return v_uid;
end;
$$;

comment on function private.require_uid() is 'auth.uid() or raise PT401 not_authenticated.';

-- Caller uid when admin aal2; admin aal1 => PT403 mfa_required; others => PT403 not_authorized.
create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if private.is_admin() then
    return v_uid;
  end if;

  if exists (select 1 from public.profiles p
             where p.id = v_uid and p.platform_role = 'admin' and p.deleted_at is null) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  end if;

  raise exception using errcode = 'PT403', message = 'not_authorized';
end;
$$;

comment on function private.require_admin() is 'uid of an admin aal2 caller; PT403 mfa_required for admin aal1, PT403 not_authorized otherwise.';

-- text -> uuid without raising (storage path segments, jsonb ids).
create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

comment on function private.try_uuid(text) is 'Cast text to uuid; null when it is not a uuid (used by storage policies).';

-- app_settings value (null when the key is missing).
create or replace function private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.value from public.app_settings s where s.key = p_key;
$$;

comment on function private.setting(text) is 'app_settings.value for p_key (null if missing). Internal.';

-- Active (not withdrawn) consent of a user for a purpose (§11, SECURITY-PRIVACY §6 has_consent).
create or replace function private.has_consent(p_user uuid, p_purpose public.consent_purpose)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.consents c
                 where c.user_id = p_user and c.purpose = p_purpose and c.withdrawn_at is null);
$$;

comment on function private.has_consent(uuid, public.consent_purpose) is 'true when p_user has an active consent for p_purpose.';

-- Role of the caller in an org (active membership, any org status) or null.
create or replace function private.caller_org_role(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.org_members m
  where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active';
$$;

comment on function private.caller_org_role(uuid) is 'Active org_members.role of the caller in p_org (any org status), null if not a member.';

-- ===========================================================================
-- 4. Rate limiting (§15, SECURITY-PRIVACY C11)
-- ===========================================================================

-- Increments the counter of the current window. Returns 0 when the call is allowed, otherwise the
-- number of seconds until the window resets (>= 1). Never raises for "exceeded".
create or replace function private.rate_limit_consume(p_key text, p_limit integer, p_window interval)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now   timestamptz := private.now();
  v_start timestamptz;
  v_count integer;
begin
  if p_key is null or p_key !~ '^[a-z0-9_]{1,64}:[a-z0-9_]{1,32}:[A-Za-z0-9_+/=-]{1,128}$' then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_key":"format <action>:<scope>:<id>, id = [A-Za-z0-9_+/=-]{1,128} (hash, never raw IP/email)"}';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_limit":">= 1"}';
  end if;
  if p_window is null or p_window < interval '1 second' or p_window > interval '1 day' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_window":"1 second .. 1 day"}';
  end if;

  v_start := date_bin(p_window, v_now, timestamptz '2000-01-01 00:00:00+07');

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  if v_count <= p_limit then
    return 0;
  end if;

  return greatest(1, ceil(extract(epoch from (v_start + p_window - v_now)))::integer);
end;
$$;

comment on function private.rate_limit_consume(text, integer, interval) is
  'Count one call in the current fixed window; 0 = allowed, n > 0 = exceeded (seconds until reset). Windows align to 2000-01-01 00:00 +07.';

-- For RPCs: raise PT429 rate_limited (hint = seconds to wait) when exceeded.
create or replace function private.check_rate_limit(p_key text, p_limit integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wait integer := private.rate_limit_consume(p_key, p_limit, p_window);
begin
  if v_wait > 0 then
    raise exception using errcode = 'PT429', message = 'rate_limited', hint = v_wait::text;
  end if;
end;
$$;

comment on function private.check_rate_limit(text, integer, interval) is
  'Raise PT429 rate_limited (hint = seconds) when p_key exceeded p_limit in the current window. The raise rolls the increment back, so the counter stays at the limit.';

-- For the app server (service role): auth sign-up / OTP throttling outside Supabase Auth.
create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.rate_limit_consume(p_key, p_limit, p_window) = 0;
end;
$$;

comment on function public.consume_rate_limit(text, integer, interval) is
  'service_role only. Count one call; true = allowed, false = limit exceeded (never raises for exceed). Key <action>:<scope>:<hmac>.';

-- ===========================================================================
-- 5. Idempotency (§15)
-- ===========================================================================

create or replace function private.idem_hash(p_params jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(pg_catalog.sha256(convert_to(coalesce(p_params, 'null'::jsonb)::text, 'UTF8')), 'hex');
$$;

comment on function private.idem_hash(jsonb) is 'sha256 hex of normalised RPC parameters (jsonb text output has sorted keys).';

-- Claims p_op for (caller, p_rpc, p_hash). Returns null when the claim is new (the RPC must run and
-- call idem_store), or the stored response for a replay. A concurrent claim of the same op waits on
-- the primary key until the other transaction ends (Postgres serialises it).
create or replace function private.idem_claim(p_op uuid, p_rpc text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_row public.rpc_idempotency%rowtype;
  v_n   integer;
begin
  if p_op is null then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_client_op_id":"required"}';
  end if;

  insert into public.rpc_idempotency (client_op_id, actor_id, rpc_name, request_hash, created_at)
  values (p_op, v_uid, p_rpc, p_hash, private.now())
  on conflict (client_op_id) do nothing;
  get diagnostics v_n = row_count;

  if v_n = 1 then
    return null;
  end if;

  select * into v_row from public.rpc_idempotency where client_op_id = p_op;

  if v_row.actor_id <> v_uid or v_row.rpc_name <> p_rpc or v_row.request_hash <> p_hash then
    raise exception using errcode = 'PT409', message = 'idempotency_conflict';
  end if;

  if v_row.response is null then
    raise exception using errcode = 'PT409', message = 'concurrent_update';
  end if;

  return v_row.response;
end;
$$;

comment on function private.idem_claim(uuid, text, text) is
  'Claim a client_op_id: null = new (run, then idem_store); jsonb = replay response. Different actor/rpc/params => PT409 idempotency_conflict.';

create or replace function private.idem_store(p_op uuid, p_response jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rpc_idempotency
     set response = coalesce(p_response, 'null'::jsonb)
   where client_op_id = p_op;
$$;

comment on function private.idem_store(uuid, jsonb) is 'Store the RPC response for a claimed client_op_id (JSON null for void RPCs).';

-- ===========================================================================
-- 6. Outbox writer (§12.1)
-- ===========================================================================
create or replace function private.enqueue(
  p_event          public.notification_event,
  p_aggregate_type text,
  p_aggregate_id   uuid,
  p_dedupe_key     text,
  p_payload        jsonb default '{}'::jsonb,
  p_urgency        text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notification_outbox (event, aggregate_type, aggregate_id, dedupe_key, payload, urgency)
  values (p_event, p_aggregate_type, p_aggregate_id, p_dedupe_key,
          coalesce(p_payload, '{}'::jsonb), coalesce(p_urgency, 'normal'))
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select o.id into v_id from public.notification_outbox o where o.dedupe_key = p_dedupe_key;
  end if;

  return v_id;
end;
$$;

comment on function private.enqueue(public.notification_event, text, uuid, text, jsonb, text) is
  'Insert one outbox row in the caller''s transaction; idempotent on dedupe_key (returns the existing id).';

-- ===========================================================================
-- 7. Function privileges (§8.8)
-- ===========================================================================
revoke all on function private.require_uid() from public, anon, authenticated;
revoke all on function private.require_admin() from public, anon, authenticated;
revoke all on function private.try_uuid(text) from public, anon, authenticated;
revoke all on function private.setting(text) from public, anon, authenticated;
revoke all on function private.has_consent(uuid, public.consent_purpose) from public, anon, authenticated;
revoke all on function private.caller_org_role(uuid) from public, anon, authenticated;
revoke all on function private.rate_limit_consume(text, integer, interval) from public, anon, authenticated;
revoke all on function private.check_rate_limit(text, integer, interval) from public, anon, authenticated;
revoke all on function private.idem_hash(jsonb) from public, anon, authenticated;
revoke all on function private.idem_claim(uuid, text, text) from public, anon, authenticated;
revoke all on function private.idem_store(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.enqueue(public.notification_event, text, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, integer, interval) from public, anon, authenticated;

-- try_uuid is used inside storage.objects policies evaluated as `authenticated`.
grant execute on function private.try_uuid(text) to authenticated, service_role;
grant execute on function public.consume_rate_limit(text, integer, interval) to service_role;

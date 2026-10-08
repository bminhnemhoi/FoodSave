-- Migration 8/13 — pickups_handovers (DATA-MODEL §2.3 pickups/pickup_stops/handovers/handover_lines/
-- incidents, §6.5, §6.6, §8.5, §9; SECURITY-PRIVACY C10; ROADMAP P2-11)
-- Tables: pickups, pickup_stops, handovers, handover_lines, incidents (incident RPCs: later phase).
-- RPCs:   assign_pickup (new trips; self-pickup is the P2 default), issue_handover_token,
--         peek_handover_token (addition), consume_handover_token, consume_handover_code,
--         record_dropoff.
-- Also extends P1 RPCs that need P2 tables (DATA-MODEL §6.8 notes): suspend_organization (C14
-- cascade), close_organization (no unfinished allocation), get_site_location (trip/allocation
-- branches), withdraw_consent (location_trip clears pickups.last_location).
-- Handover secrets: 32-byte token (base64url, 43 chars) + 6-digit code, returned once; only
-- sha256 hashes are stored. Ledger credits are written by private.credit_impact (migration impact).

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- pickups — trips
-- ---------------------------------------------------------------------------
create table public.pickups (
  id                       uuid primary key default gen_random_uuid(),
  charity_org_id           uuid not null references public.organizations (id),
  charity_site_id          uuid not null references public.sites (id),
  mode                     public.pickup_mode not null,
  assignee_user_id         uuid references public.profiles (id),
  status                   public.pickup_status not null default 'planned',
  planned_start_at         timestamptz,
  accepted_at              timestamptz,
  started_at               timestamptz,
  completed_at             timestamptz,
  cancelled_at             timestamptz,
  cancel_reason            text check (char_length(cancel_reason) <= 500),
  route                    extensions.geometry(linestring, 4326),
  route_distance_m         integer check (route_distance_m >= 0),
  route_duration_s         integer check (route_duration_s >= 0),
  route_provider           text check (route_provider in ('goong', 'ors', 'aws', 'fake')),
  route_computed_at        timestamptz,
  last_location            extensions.geography(point, 4326),
  last_location_at         timestamptz,
  last_location_accuracy_m integer check (last_location_accuracy_m >= 0),
  created_by               uuid not null references public.profiles (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint pickups_assignee_when_assigned check (status <> 'assigned' or mode = 'self' or assignee_user_id is not null),
  constraint pickups_no_location_when_finished check (
    status in ('planned', 'assigned', 'in_progress') or (last_location is null and last_location_at is null)),
  constraint pickups_completed_fields check (status <> 'completed' or completed_at is not null),
  constraint pickups_cancelled_fields check (status <> 'cancelled' or cancelled_at is not null)
);

comment on table public.pickups is 'Trips (volunteer or self pickup). Written only by RPCs (§6.5). Stores never read this table (only ETA via pickup_stops).';
comment on column public.pickups.assignee_user_id is 'Volunteer (mode volunteer) or charity staff (mode self, optional).';
comment on column public.pickups.last_location is 'Latest point only (rounded ~11 m), only while running, only with location_trip consent; cleared when the trip ends.';

create index pickups_charity_org_status_idx on public.pickups (charity_org_id, status);
create index pickups_assignee_status_idx on public.pickups (assignee_user_id, status) where assignee_user_id is not null;
create index pickups_charity_site_id_idx on public.pickups (charity_site_id);
create index pickups_created_by_idx on public.pickups (created_by);

-- ---------------------------------------------------------------------------
-- pickup_stops
-- ---------------------------------------------------------------------------
create table public.pickup_stops (
  id           uuid primary key default gen_random_uuid(),
  pickup_id    uuid not null references public.pickups (id) on delete cascade,
  seq          smallint not null check (seq between 1 and 6),
  kind         public.handover_kind not null,
  site_id      uuid not null references public.sites (id),
  status       public.stop_status not null default 'pending',
  eta          timestamptz,
  arrived_at   timestamptz,
  completed_at timestamptz,
  skip_reason  text check (char_length(skip_reason) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint pickup_stops_seq_uq unique (pickup_id, seq) deferrable initially deferred,
  constraint pickup_stops_site_kind_uq unique (pickup_id, site_id, kind)
);

comment on table public.pickup_stops is 'Stops of a trip: ≤ 5 pickup stops (store sites) + 1 dropoff (charity receiving site). Stores see the stops at their sites (ETA only, never the volunteer location).';

create unique index pickup_stops_one_dropoff_uq on public.pickup_stops (pickup_id) where kind = 'dropoff';
create index pickup_stops_site_status_idx on public.pickup_stops (site_id, status);

-- ---------------------------------------------------------------------------
-- handovers — one per stop
-- ---------------------------------------------------------------------------
create table public.handovers (
  id               uuid primary key default gen_random_uuid(),
  pickup_id        uuid not null references public.pickups (id),
  stop_id          uuid not null unique references public.pickup_stops (id),
  kind             public.handover_kind not null,
  token_hash       bytea check (octet_length(token_hash) = 32),
  code_hash        bytea check (octet_length(code_hash) = 32),
  token_expires_at timestamptz,
  issued_by        uuid references public.profiles (id),
  issued_at        timestamptz,
  proposed_lines   jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_lines) = 'array'),
  failed_attempts  smallint not null default 0 check (failed_attempts between 0 and 10),
  consumed_at      timestamptz,
  scanned_by       uuid references public.profiles (id),
  method           public.handover_method,
  client_op_id     uuid unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint handovers_consumed_fields check (consumed_at is null or (scanned_by is not null and method is not null)),
  constraint handovers_auto_no_token check (method is distinct from 'auto' or token_hash is null),
  constraint handovers_token_or_consumed check (consumed_at is not null or token_hash is not null),
  constraint handovers_dual_control check (scanned_by is null or method = 'auto' or scanned_by <> issued_by)
);

comment on table public.handovers is 'Handover event of a stop (pickup or dropoff). Token/code are single-use, 15-minute TTL; only sha256 hashes are stored (never selectable).';
comment on column public.handovers.token_hash is 'sha256 of the base64url token string (32 random bytes). The token itself is never stored.';
comment on column public.handovers.code_hash is 'sha256(handover_id || '':'' || 6-digit code).';
comment on column public.handovers.failed_attempts is 'Wrong 6-digit codes; ≥ handover_max_failed_attempts => locked until re-issued.';
comment on column public.handovers.scanned_by is 'Store member (pickup) / charity member (dropoff) who consumed it; for method auto the carrier who received the goods.';

create unique index handovers_token_uq on public.handovers (token_hash) where consumed_at is null and token_hash is not null;
create index handovers_token_hash_idx on public.handovers (token_hash) where token_hash is not null;
create index handovers_pickup_id_idx on public.handovers (pickup_id);
create index handovers_issued_by_idx on public.handovers (issued_by) where issued_by is not null;
create index handovers_scanned_by_idx on public.handovers (scanned_by) where scanned_by is not null;

-- ---------------------------------------------------------------------------
-- handover_lines — per-allocation reconciliation
-- ---------------------------------------------------------------------------
create table public.handover_lines (
  id            uuid primary key default gen_random_uuid(),
  handover_id   uuid not null references public.handovers (id),
  allocation_id uuid not null references public.allocations (id),
  expected_qty  numeric(12, 3) not null check (expected_qty >= 0),
  qty           numeric(12, 3) not null,
  reason        public.shortfall_reason,
  note          text check (char_length(note) <= 300),
  created_at    timestamptz not null default now(),
  constraint handover_lines_alloc_uq unique (handover_id, allocation_id),
  constraint handover_lines_qty_bounds check (qty >= 0 and qty <= expected_qty),
  constraint handover_lines_reason check (qty = expected_qty or reason is not null)
);

comment on table public.handover_lines is 'One line per allocation of a handover. Pickup: expected = qty_reserved − qty_released. Dropoff: expected = qty_picked; only quality_reject. Append-only by construction (no grants).';

create index handover_lines_allocation_id_idx on public.handover_lines (allocation_id);

-- ---------------------------------------------------------------------------
-- incidents — reports (RPCs report_incident / resolve_incident: later phase)
-- ---------------------------------------------------------------------------
create table public.incidents (
  id              uuid primary key default gen_random_uuid(),
  kind            public.incident_kind not null,
  status          public.incident_status not null default 'open',
  reporter_org_id uuid references public.organizations (id),
  subject_org_id  uuid references public.organizations (id),
  offer_id        uuid references public.offers (id),
  allocation_id   uuid references public.allocations (id),
  pickup_id       uuid references public.pickups (id),
  handover_id     uuid references public.handovers (id),
  proof_id        uuid,
  description     text not null check (char_length(description) between 10 and 2000),
  resolution      text check (char_length(resolution) <= 2000),
  reported_by     uuid not null references public.profiles (id),
  resolved_by     uuid references public.profiles (id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint incidents_has_ref check (
    kind = 'other' or num_nonnulls(offer_id, allocation_id, pickup_id, handover_id, proof_id) > 0),
  constraint incidents_resolution check (status not in ('resolved', 'dismissed') or resolution is not null)
);

comment on table public.incidents is 'Incident reports (quantity dispute, food safety, no_show…). Written by RPCs only (later phase). proof_id FK is added with proofs (P4).';

create index incidents_status_created_idx on public.incidents (status, created_at);
create index incidents_subject_org_idx on public.incidents (subject_org_id) where subject_org_id is not null;
create index incidents_reporter_org_idx on public.incidents (reporter_org_id) where reporter_org_id is not null;
create index incidents_offer_id_idx on public.incidents (offer_id) where offer_id is not null;
create index incidents_allocation_id_idx on public.incidents (allocation_id) where allocation_id is not null;
create index incidents_pickup_id_idx on public.incidents (pickup_id) where pickup_id is not null;
create index incidents_handover_id_idx on public.incidents (handover_id) where handover_id is not null;
create index incidents_reported_by_idx on public.incidents (reported_by);
create index incidents_resolved_by_idx on public.incidents (resolved_by) where resolved_by is not null;

-- allocations -> pickups / pickup_stops (columns created by offers_allocations)
alter table public.allocations
  add constraint allocations_pickup_id_fkey foreign key (pickup_id) references public.pickups (id),
  add constraint allocations_stop_id_fkey foreign key (stop_id) references public.pickup_stops (id);

create trigger set_updated_at before update on public.pickups
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.pickup_stops
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.handovers
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.incidents
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- 2. RLS helpers
-- ===========================================================================

-- Caller is the assignee of the trip and an active member of the (approved) charity.
create or replace function private.is_pickup_assignee(p_pickup uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pickups p
                 where p.id = p_pickup and p.assignee_user_id = (select auth.uid())
                   and private.is_active_org_member(p.charity_org_id));
$$;

-- Charity coordinator (owner/manager/staff with access to the receiving site) or assignee.
create or replace function private.can_see_pickup(p_pickup uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pickups p
                 where p.id = p_pickup
                   and (private.can_access_site(p.charity_site_id, '{owner,manager,staff}')
                        or (p.assignee_user_id = (select auth.uid())
                            and private.is_active_org_member(p.charity_org_id))));
$$;

-- A stop is visible to the trip's charity side and to the store owning the (pickup) stop site.
create or replace function private.can_see_stop(p_stop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pickup_stops s
                 where s.id = p_stop
                   and ((s.kind = 'pickup' and private.can_access_site(s.site_id, '{owner,manager,staff}'))
                        or private.can_see_pickup(s.pickup_id)));
$$;

create or replace function private.can_see_handover(p_handover uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.handovers h where h.id = p_handover and private.can_see_stop(h.stop_id));
$$;

-- The offer is carried by a trip assigned to the caller (volunteer view).
create or replace function private.offer_in_my_trip(p_offer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.allocations a
                 join public.pickups p on p.id = a.pickup_id
                 where a.offer_id = p_offer and p.assignee_user_id = (select auth.uid())
                   and private.is_active_org_member(p.charity_org_id));
$$;

comment on function private.is_pickup_assignee(uuid) is 'RLS: caller is the assignee of the trip (active member of its approved charity).';
comment on function private.can_see_pickup(uuid) is 'RLS: charity owner/manager/staff of the receiving site, or the assignee.';
comment on function private.can_see_stop(uuid) is 'RLS: store of a pickup stop site, or whoever can see the trip.';
comment on function private.can_see_handover(uuid) is 'RLS: visibility of a handover follows its stop.';
comment on function private.offer_in_my_trip(uuid) is 'RLS: volunteer sees the offers carried by their trips.';

-- ===========================================================================
-- 3. Row level security + policies (§9.2)
-- ===========================================================================
alter table public.pickups        enable row level security;
alter table public.pickup_stops   enable row level security;
alter table public.handovers      enable row level security;
alter table public.handover_lines enable row level security;
alter table public.incidents      enable row level security;

create policy pickups_select on public.pickups
  for select to authenticated
  using (
    private.can_access_site(charity_site_id, '{owner,manager,staff}')
    or (assignee_user_id = (select auth.uid()) and private.is_active_org_member(charity_org_id))
    or (select private.is_admin())
  );

create policy pickup_stops_select on public.pickup_stops
  for select to authenticated
  using (
    (kind = 'pickup' and private.can_access_site(site_id, '{owner,manager,staff}'))
    or private.can_see_pickup(pickup_id)
    or (select private.is_admin())
  );

create policy handovers_select on public.handovers
  for select to authenticated
  using (private.can_see_stop(stop_id) or (select private.is_admin()));

create policy handover_lines_select on public.handover_lines
  for select to authenticated
  using (private.can_see_handover(handover_id) or (select private.is_admin()));

create policy incidents_select on public.incidents
  for select to authenticated
  using (
    (reporter_org_id is not null and private.is_active_org_member(reporter_org_id, '{owner,manager,staff}'))
    or (subject_org_id is not null and private.is_active_org_member(subject_org_id, '{owner,manager,staff}'))
    or reported_by = (select auth.uid())
    or (select private.is_admin())
  );

-- Volunteer branches of the offers_allocations policies (§9.2 column V).
create policy allocations_select_trip on public.allocations
  for select to authenticated
  using (pickup_id is not null and private.is_pickup_assignee(pickup_id));

create policy offers_select_trip on public.offers
  for select to authenticated
  using (private.offer_in_my_trip(id));

-- ===========================================================================
-- 4. Table / column privileges (§9.4)
-- ===========================================================================
revoke all on table public.pickups, public.pickup_stops, public.handovers, public.handover_lines,
  public.incidents from anon, authenticated;

grant select on public.pickups to authenticated;
grant select on public.pickup_stops to authenticated;
-- every column except token_hash / code_hash
grant select (id, pickup_id, stop_id, kind, token_expires_at, issued_by, issued_at, proposed_lines,
              failed_attempts, consumed_at, scanned_by, method, client_op_id, created_at, updated_at)
  on public.handovers to authenticated;
grant select on public.handover_lines to authenticated;
grant select on public.incidents to authenticated;

-- ===========================================================================
-- 5. Internal helpers
-- ===========================================================================

-- Token validity condition 3 (§2.3): now inside [lower − g, least(upper + g, expires_at)] of the
-- pickup window of EVERY assigned allocation at the stop.
create or replace function private.pickup_window_ok(p_stop_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.allocations a
    join public.offers o on o.id = a.offer_id
    where a.stop_id = p_stop_id and a.status = 'assigned'
      and not (p_at >= lower(o.pickup_window)
                        - private.setting_num('handover_window_grace_minutes', 30) * interval '1 minute'
               and p_at <= least(upper(o.pickup_window)
                                 + private.setting_num('handover_window_grace_minutes', 30) * interval '1 minute',
                                 o.expires_at)));
$$;

comment on function private.pickup_window_ok(uuid, timestamptz) is
  'Pickup token/code usable at p_at: within [lower(window) − grace, least(upper(window) + grace, expires_at)] for every assigned allocation of the stop.';

-- Validates p_lines against the allocations of a handover and normalises them to
-- [{allocation_id, qty, expected, reason, note}]. Pickup: expected = qty_reserved − qty_released,
-- reasons store_short|quality_reject|capacity|no_show. Dropoff: expected = qty_picked, reason
-- quality_reject only. quality_reject needs a note (SECURITY-PRIVACY §8.2). Must cover exactly
-- p_alloc_ids. PT422 validation_failed {"p_lines": code, "allocation_id": …}.
create or replace function private.check_handover_lines(p_lines jsonb, p_kind public.handover_kind,
                                                        p_alloc_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e          jsonb;
  v_out      jsonb := '[]'::jsonb;
  v_seen     uuid[] := '{}';
  v_id       uuid;
  a          public.allocations%rowtype;
  v_expected numeric;
  v_qty      numeric;
  v_reason   text;
  v_note     text;
  v_missing  uuid;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_lines":"array_required"}';
  end if;

  for e in select x from jsonb_array_elements(p_lines) x loop
    if jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('allocation_id', 'qty', 'reason', 'note')) then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_lines":"line_format"}';
    end if;

    v_id := private.try_uuid(e ->> 'allocation_id');
    if v_id is null or not (v_id = any (p_alloc_ids)) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'unknown_allocation', 'allocation_id', e -> 'allocation_id')::text;
    end if;
    if v_id = any (v_seen) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'duplicate_allocation', 'allocation_id', v_id)::text;
    end if;
    v_seen := v_seen || v_id;

    select * into a from public.allocations where id = v_id;
    v_expected := case p_kind when 'pickup' then a.qty_reserved - a.qty_released else a.qty_picked end;

    -- is distinct from: a line without a "qty" key gives jsonb_typeof(null) = null, and `null <> 'number'`
    -- is null, which skipped this raise (proposed_lines stored qty null; consume/dropoff hit 23502).
    if jsonb_typeof(e -> 'qty') is distinct from 'number' then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'qty_required', 'allocation_id', v_id)::text;
    end if;
    v_qty := (e ->> 'qty')::numeric;
    if v_qty < 0 or v_qty > v_expected then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'qty_out_of_range', 'allocation_id', v_id, 'max', v_expected)::text;
    end if;
    if a.unit not in ('kg', 'liter') and v_qty <> trunc(v_qty) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'integer_required', 'allocation_id', v_id)::text;
    end if;

    v_reason := case when jsonb_typeof(e -> 'reason') = 'string' then e ->> 'reason' end;
    if v_qty = v_expected then
      v_reason := null;
    elsif v_reason is null then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'reason_required', 'allocation_id', v_id)::text;
    elsif (p_kind = 'pickup' and v_reason not in ('store_short', 'quality_reject', 'capacity', 'no_show'))
          or (p_kind = 'dropoff' and v_reason <> 'quality_reject') then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'reason_not_allowed', 'allocation_id', v_id)::text;
    end if;

    v_note := case when jsonb_typeof(e -> 'note') = 'string' then nullif(btrim(e ->> 'note'), '') end;
    if char_length(v_note) > 300 then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'note_too_long', 'allocation_id', v_id)::text;
    end if;
    if v_reason = 'quality_reject' and v_note is null then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'note_required', 'allocation_id', v_id)::text;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'allocation_id', v_id, 'qty', v_qty, 'expected', v_expected, 'reason', v_reason, 'note', v_note));
  end loop;

  select x into v_missing from unnest(p_alloc_ids) x where not (x = any (v_seen)) limit 1;
  if v_missing is not null then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('p_lines', 'missing_allocation', 'allocation_id', v_missing)::text;
  end if;

  return v_out;
end;
$$;

comment on function private.check_handover_lines(jsonb, public.handover_kind, uuid[]) is
  'Validate handover lines (exact cover, qty ≤ expected, integers, reasons, quality_reject note) and normalise them with expected quantities.';

-- Max wrong 6-digit codes before a handover locks. Clamped to 1..10: failed_attempts is capped at 10
-- (CHECK + least()), so a setting above 10 would otherwise mean "never locks".
create or replace function private.handover_max_attempts()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select least(greatest(private.setting_num('handover_max_failed_attempts', 5)::integer, 1), 10);
$$;

revoke all on function private.handover_max_attempts() from public, anon, authenticated;

-- Counts one wrong 6-digit code (§6.6 note: no raise, the update must commit). Returns attempts left.
create or replace function private.bump_failed_attempt(p_handover_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n   integer;
  v_max integer := private.handover_max_attempts();
begin
  update public.handovers
     set failed_attempts = least(failed_attempts + 1, 10)
   where id = p_handover_id
  returning failed_attempts into v_n;

  perform private.audit(
    p_action      => 'handover.code_fail',
    p_entity_type => 'handover',
    p_entity_id   => p_handover_id,
    p_after       => jsonb_build_object('failed_attempts', v_n));

  return greatest(v_max - v_n, 0);
end;
$$;

comment on function private.bump_failed_attempt(uuid) is 'failed_attempts + 1 (audited handover.code_fail); returns the attempts left before the lock.';

-- Ends a trip that has nothing left to carry, or runs the automatic dropoff of a self pickup once
-- every pickup stop is done/skipped. Returns the dropoff result (jsonb) when one happened.
create or replace function private.refresh_pickup(p_pickup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p     public.pickups%rowtype;
  v_now timestamptz := private.now();
begin
  select * into p from public.pickups where id = p_pickup_id for update;
  if not found or p.status in ('completed', 'cancelled') then
    return null;
  end if;

  if exists (select 1 from public.pickup_stops s
             where s.pickup_id = p.id and s.kind = 'pickup' and s.status in ('pending', 'arrived')) then
    return null;
  end if;

  if exists (select 1 from public.allocations a where a.pickup_id = p.id and a.status = 'picked_up') then
    if p.mode = 'self' then
      return private.auto_dropoff(p.id);
    end if;
    return null;
  end if;

  if exists (select 1 from public.allocations a where a.pickup_id = p.id and a.status = 'delivered') then
    return null;
  end if;

  -- nothing to carry any more: the trip is cancelled
  update public.pickup_stops
     set status = 'skipped', skip_reason = 'nothing_to_deliver'
   where pickup_id = p.id and status in ('pending', 'arrived');
  update public.pickups
     set status = 'cancelled', cancelled_at = v_now, cancel_reason = 'no_allocations',
         last_location = null, last_location_at = null, last_location_accuracy_m = null
   where id = p.id;

  perform private.enqueue('pickup_cancelled', 'pickup', p.id, 'pickup_cancelled:' || p.id,
    jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'reason', 'no_allocations'));
  perform private.audit(
    p_action      => 'pickup.cancel',
    p_entity_type => 'pickup',
    p_entity_id   => p.id,
    p_org_id      => p.charity_org_id,
    p_before      => jsonb_build_object('status', p.status),
    p_after       => '{"status":"cancelled","reason":"no_allocations"}',
    p_actor_kind  => 'system');
  return null;
end;
$$;

comment on function private.refresh_pickup(uuid) is
  'After a stop changes: self trip with every pickup stop done/skipped => automatic dropoff; trip with nothing left => cancelled (pickup_cancelled).';

-- Removes an allocation (already moved to its new status) from its trip (§6.4, C2/C4/C8). An emptied
-- stop is skipped; the trip is refreshed. Lock order: pickups → pickup_stops.
create or replace function private.detach_allocation(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pickup uuid;
  v_stop   uuid;
begin
  select a.pickup_id, a.stop_id into v_pickup, v_stop from public.allocations a where a.id = p_allocation_id;
  if v_pickup is null then
    return;
  end if;

  perform 1 from public.pickups p where p.id = v_pickup for update;

  update public.allocations set pickup_id = null, stop_id = null, assigned_at = null where id = p_allocation_id;

  if v_stop is not null and not exists (select 1 from public.allocations a where a.stop_id = v_stop) then
    update public.pickup_stops
       set status = 'skipped', skip_reason = 'no_allocations'
     where id = v_stop and status in ('pending', 'arrived');
  end if;

  perform private.refresh_pickup(v_pickup);
end;
$$;

comment on function private.detach_allocation(uuid) is 'Detach an allocation from its trip; empty stop => skipped; refresh_pickup.';

-- Dropoff core (record_dropoff, and the automatic dropoff of self pickups). Lines are normalised by
-- check_handover_lines. Writes lines, delivers allocations, credits the impact ledger per line
-- with qty > 0 (same transaction), trust +1 both sides, completes the trip.
create or replace function private.apply_dropoff(p_handover_id uuid, p_lines jsonb, p_method public.handover_method,
                                                 p_scanned_by uuid, p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h          public.handovers%rowtype;
  p          public.pickups%rowtype;
  l          jsonb;
  a          public.allocations%rowtype;
  v_now      timestamptz := private.now();
  v_line_id  uuid;
  v_qty      numeric;
  v_ledger   bigint;
  v_ledgers  bigint[] := '{}';
  v_orgs     uuid[] := '{}';
  v_org      uuid;
  v_store    uuid[] := '{}';
  v_tot      record;
  v_due      interval := private.setting_num('proof_due_hours', 48) * interval '1 hour';
begin
  select * into h from public.handovers where id = p_handover_id;
  select * into p from public.pickups where id = h.pickup_id;

  if p_method <> 'auto' then
    update public.handovers
       set consumed_at = v_now, scanned_by = p_scanned_by, method = p_method, client_op_id = p_client_op_id
     where id = h.id and consumed_at is null;
    if not found then
      raise exception using errcode = 'PT409', message = 'token_consumed';
    end if;
  end if;

  for l in select x from jsonb_array_elements(p_lines) x loop
    select * into a from public.allocations where id = (l ->> 'allocation_id')::uuid;
    v_qty := (l ->> 'qty')::numeric;

    insert into public.handover_lines (handover_id, allocation_id, expected_qty, qty, reason, note)
    values (h.id, a.id, (l ->> 'expected')::numeric, v_qty, (l ->> 'reason')::public.shortfall_reason, l ->> 'note')
    returning id into v_line_id;

    update public.allocations
       set status = 'delivered', qty_delivered = v_qty, delivered_at = v_now, closed_at = v_now,
           proof_due_at = v_now + v_due,
           shortfall_reason = coalesce(shortfall_reason,
                                       case when v_qty < a.qty_picked then 'quality_reject'::public.shortfall_reason end),
           shortfall_note = coalesce(shortfall_note, l ->> 'note')
     where id = a.id;

    if v_qty > 0 then
      v_ledger := private.credit_impact(v_line_id);
      if v_ledger is not null then
        v_ledgers := v_ledgers || v_ledger;
      end if;
      v_orgs := v_orgs || a.store_org_id || a.charity_org_id;
    end if;
    if not (a.store_org_id = any (v_store)) then
      v_store := v_store || a.store_org_id;
    end if;

    perform private.after_allocation_change(a, false);
  end loop;

  update public.pickup_stops
     set status = 'done', completed_at = v_now, arrived_at = coalesce(arrived_at, v_now)
   where id = h.stop_id;
  update public.pickups
     set status = 'completed', completed_at = v_now, started_at = coalesce(started_at, v_now),
         last_location = null, last_location_at = null, last_location_accuracy_m = null
   where id = p.id;

  -- trust +1 per side per delivery (DATA-MODEL §2.1 trust_events: "+1 mỗi bên"), deduplicated so splitting
  -- one delivery into many lines cannot inflate trust; org id order (deadlock-free)
  for v_org in select distinct x from unnest(v_orgs) x order by x loop
    perform private.apply_trust(v_org, 1, 'delivered_on_time', 'handover', h.id);
  end loop;

  select coalesce(sum(il.kg), 0) as kg, coalesce(sum(il.co2e_kg), 0) as co2e_kg,
         sum(il.water_l) as water_l, coalesce(sum(il.meals), 0) as meals
    into v_tot
  from public.impact_ledger il where il.id = any (v_ledgers);

  perform private.enqueue('delivery_completed', 'pickup', p.id, 'delivery_completed:' || h.id,
    jsonb_build_object('pickup_id', p.id, 'handover_id', h.id, 'charity_org_id', p.charity_org_id,
                       'store_org_ids', to_jsonb(v_store), 'kg', v_tot.kg));

  perform private.audit(
    p_action       => 'handover.dropoff',
    p_entity_type  => 'handover',
    p_entity_id    => h.id,
    p_org_id       => p.charity_org_id,
    p_after        => jsonb_build_object('method', p_method, 'pickup_id', p.id,
                                         'lines', jsonb_array_length(p_lines), 'kg', v_tot.kg),
    p_client_op_id => p_client_op_id);

  return jsonb_build_object('ok', true, 'handover_id', h.id, 'pickup_id', p.id,
                            'ledger_ids', to_jsonb(v_ledgers), 'kg', v_tot.kg, 'co2e_kg', v_tot.co2e_kg,
                            'water_l', v_tot.water_l, 'meals', v_tot.meals);
end;
$$;

comment on function private.apply_dropoff(uuid, jsonb, public.handover_method, uuid, uuid) is
  'Dropoff core: handover consumed, lines, allocations delivered (proof_due_at), ledger credit per line with qty > 0, trust +1 both sides, trip completed (location cleared), outbox delivery_completed. Returns {ok, ledger_ids, kg, co2e_kg, water_l, meals}.';

-- Automatic dropoff of a self pickup (handover method auto, no token; ESG-METHODOLOGY §6.3).
create or replace function private.auto_dropoff(p_pickup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stop     public.pickup_stops%rowtype;
  v_receiver uuid;
  v_id       uuid;
  v_lines    jsonb;
begin
  select * into v_stop from public.pickup_stops s
  where s.pickup_id = p_pickup_id and s.kind = 'dropoff' for update;
  if not found or v_stop.status not in ('pending', 'arrived') then
    return null;
  end if;

  -- the carrier who showed the pickup QR received the goods
  select h.issued_by into v_receiver
  from public.handovers h join public.pickup_stops s on s.id = h.stop_id
  where s.pickup_id = p_pickup_id and h.kind = 'pickup' and h.consumed_at is not null
  order by h.consumed_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('allocation_id', a.id, 'qty', a.qty_picked,
                                               'expected', a.qty_picked, 'reason', null, 'note', null)
                            order by a.id), '[]'::jsonb)
    into v_lines
  from public.allocations a where a.pickup_id = p_pickup_id and a.status = 'picked_up';

  insert into public.handovers (pickup_id, stop_id, kind, consumed_at, scanned_by, method)
  values (p_pickup_id, v_stop.id, 'dropoff', private.now(), coalesce(v_receiver, auth.uid()), 'auto')
  on conflict (stop_id) do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;

  return private.apply_dropoff(v_id, v_lines, 'auto', coalesce(v_receiver, auth.uid()), null);
end;
$$;

comment on function private.auto_dropoff(uuid) is 'Self pickup: once every pickup stop is done/skipped, a dropoff handover (method auto) delivers every picked_up allocation in full.';

-- Pickup consumption core (token or code). Validates in the order: store membership, state,
-- validity (consumed / locked / TTL / window), dual control, lines, then the code (wrong code =>
-- failed_attempts + 1 and {ok:false}, no raise).
create or replace function private.consume_pickup(p_handover_id uuid, p_code text, p_lines jsonb,
                                                  p_method public.handover_method, p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  h          public.handovers%rowtype;
  s          public.pickup_stops%rowtype;
  p          public.pickups%rowtype;
  l          jsonb;
  a          public.allocations%rowtype;
  v_ids      uuid[];
  v_lines    jsonb;
  v_now      timestamptz := private.now();
  v_max      integer := private.handover_max_attempts();
  v_qty      numeric;
  v_short    numeric;
  v_reason   public.shortfall_reason;
  v_result   jsonb := '[]'::jsonb;
  v_short_st uuid[] := '{}';
  v_org      uuid;
  v_dropoff  jsonb;
  v_offer    uuid;
begin
  select * into h from public.handovers where id = p_handover_id;
  select * into s from public.pickup_stops where id = h.stop_id;

  -- access first, kind second: a non-member must not learn that a dropoff handover id exists (§8.0)
  if not private.can_access_site(s.site_id, '{owner,manager,staff}') then
    if p_method = 'code' then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'wrong_store';
  end if;
  if h.kind <> 'pickup' then
    raise exception using errcode = 'PT422', message = 'token_invalid', detail = 'not_a_pickup_handover';
  end if;

  -- global lock order: needs → offers → allocations → pickups → pickup_stops → handovers
  v_ids := array(select al.id from public.allocations al where al.stop_id = s.id and al.status = 'assigned' order by al.id);
  perform 1 from public.needs n
  where n.id in (select al.need_id from public.allocations al where al.id = any (v_ids) and al.need_id is not null)
  order by n.id for update;
  perform 1 from public.offers o
  where o.id in (select al.offer_id from public.allocations al where al.id = any (v_ids))
  order by o.id for update;
  perform 1 from public.allocations al where al.id = any (v_ids) order by al.id for update;
  select * into p from public.pickups where id = h.pickup_id for update;
  select * into s from public.pickup_stops where id = h.stop_id for update;
  select * into h from public.handovers where id = p_handover_id for update;
  v_ids := array(select al.id from public.allocations al where al.stop_id = s.id and al.status = 'assigned' order by al.id);

  if h.consumed_at is not null then
    raise exception using errcode = 'PT409', message = 'token_consumed', detail = h.consumed_at::text;
  end if;
  if h.failed_attempts >= v_max then
    raise exception using errcode = 'PT422', message = 'token_locked';
  end if;
  if h.token_expires_at is null or v_now > h.token_expires_at then
    raise exception using errcode = 'PT422', message = 'token_expired';
  end if;
  if s.status not in ('pending', 'arrived') or p.status not in ('planned', 'assigned', 'in_progress')
     or cardinality(v_ids) = 0 then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if not private.pickup_window_ok(s.id, v_now) then
    raise exception using errcode = 'PT422', message = 'token_expired', detail = 'outside_pickup_window';
  end if;
  if h.issued_by = v_uid then
    raise exception using errcode = 'PT403', message = 'self_dealing';
  end if;

  v_lines := private.check_handover_lines(p_lines, 'pickup', v_ids);

  if p_method = 'code'
     and h.code_hash is distinct from sha256(convert_to(h.id::text || ':' || coalesce(p_code, ''), 'UTF8')) then
    return jsonb_build_object('ok', false, 'error', 'code_invalid',
                              'attempts_left', private.bump_failed_attempt(h.id));
  end if;

  update public.handovers
     set consumed_at = v_now, scanned_by = v_uid, method = p_method, client_op_id = p_client_op_id
   where id = h.id and consumed_at is null;

  for l in select x from jsonb_array_elements(v_lines) x loop
    select * into a from public.allocations where id = (l ->> 'allocation_id')::uuid;
    v_qty := (l ->> 'qty')::numeric;
    v_short := (l ->> 'expected')::numeric - v_qty;
    v_reason := (l ->> 'reason')::public.shortfall_reason;

    insert into public.handover_lines (handover_id, allocation_id, expected_qty, qty, reason, note)
    values (h.id, a.id, (l ->> 'expected')::numeric, v_qty, v_reason, l ->> 'note');

    if v_qty = 0 then
      update public.allocations
         set status = 'cancelled', closed_at = v_now, picked_at = v_now, cancel_actor = 'system',
             cancel_reason = 'nothing_picked:' || v_reason, shortfall_reason = v_reason,
             shortfall_note = l ->> 'note'
       where id = a.id;
    else
      update public.allocations
         set status = 'picked_up', qty_picked = v_qty, picked_at = v_now,
             shortfall_reason = v_reason, shortfall_note = l ->> 'note'
       where id = a.id;
    end if;

    -- §4.5: only capacity / no_show shortfalls go back to the lot, and only before its deadline
    if v_short > 0 and v_reason in ('capacity', 'no_show')
       and (select o.effective_deadline from public.offers o where o.id = a.offer_id) > v_now then
      perform private.release_qty(a.id, v_short);
    end if;
    if v_short > 0 and v_reason = 'store_short' then
      v_short_st := v_short_st || a.store_org_id;
    end if;

    perform private.after_allocation_change(a, v_reason in ('store_short', 'quality_reject'));
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'allocation_id', a.id, 'status', case when v_qty = 0 then 'cancelled' else 'picked_up' end,
      'qty_picked', v_qty));
  end loop;

  for v_offer in select distinct al.offer_id from public.allocations al where al.id = any (v_ids) order by 1 loop
    perform private.refresh_offer(v_offer);
  end loop;

  update public.pickup_stops
     set status = 'done', completed_at = v_now, arrived_at = coalesce(arrived_at, v_now)
   where id = s.id;
  update public.pickups
     set status = 'in_progress', started_at = coalesce(started_at, v_now)
   where id = p.id and status in ('planned', 'assigned');

  for v_org in select x from unnest(v_short_st) x order by x loop
    perform private.apply_trust(v_org, -1, 'store_short', 'handover', h.id);
  end loop;

  perform private.enqueue('pickup_handover_done', 'pickup', p.id, 'pickup_handover_done:' || h.id,
    jsonb_build_object('pickup_id', p.id, 'stop_id', s.id, 'handover_id', h.id,
                       'charity_org_id', p.charity_org_id, 'store_site_id', s.site_id));

  perform private.audit(
    p_action       => 'handover.pickup',
    p_entity_type  => 'handover',
    p_entity_id    => h.id,
    p_org_id       => (select si.org_id from public.sites si where si.id = s.site_id),
    p_after        => jsonb_build_object('method', p_method, 'pickup_id', p.id, 'lines', v_result),
    p_client_op_id => p_client_op_id);

  v_dropoff := private.refresh_pickup(p.id);

  return jsonb_build_object('ok', true, 'handover_id', h.id, 'pickup_id', p.id,
                            'allocations', v_result, 'dropoff', v_dropoff);
end;
$$;

comment on function private.consume_pickup(uuid, text, jsonb, public.handover_method, uuid) is
  'Pickup handover core shared by consume_handover_token / consume_handover_code (§6.4, §6.6, C9).';

-- ===========================================================================
-- 6. Trip RPC
-- ===========================================================================

-- assign_pickup (§8.5). P2 creates new trips only (p_plan.pickup_id is P3). mode self is the P2
-- default ("Tự đến lấy"); stops are generated when omitted (pickup stops by earliest deadline,
-- then the receiving site as dropoff).
create or replace function public.assign_pickup(p_plan jsonb, p_client_op_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_uid();
  v_resp      jsonb;
  v_cs        public.sites%rowtype;
  v_mode      public.pickup_mode;
  v_assignee  uuid;
  v_role      public.org_role;
  v_ids       uuid[];
  v_n         integer;
  a           public.allocations%rowtype;
  v_now       timestamptz := private.now();
  v_sites     uuid[];
  v_max_stops integer := private.setting_num('max_pickup_stops', 5)::integer;
  v_pickup    uuid := gen_random_uuid();
  v_stops     jsonb;
  e           jsonb;
  v_route     extensions.geometry;
  v_start     timestamptz;
  v_stop_id   uuid;
  v_unknown   text[];
begin
  v_resp := private.idem_claim(p_client_op_id, 'assign_pickup', private.idem_hash(p_plan));
  if v_resp is not null then
    return (v_resp #>> '{}')::uuid;
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_plan":"object_required"}';
  end if;
  select array_agg(k) into v_unknown from jsonb_object_keys(p_plan) k
  where k not in ('pickup_id', 'allocation_ids', 'mode', 'assignee_user_id', 'charity_site_id',
                  'planned_start_at', 'stops', 'route');
  if v_unknown is not null then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('unknown_keys', to_jsonb(v_unknown))::text;
  end if;
  if p_plan ? 'pickup_id' and jsonb_typeof(p_plan -> 'pickup_id') <> 'null' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"pickup_id":"not_supported_yet"}';
  end if;

  select * into v_cs from public.sites s where s.id = private.try_uuid(p_plan ->> 'charity_site_id');
  if not found then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"charity_site_id":"required"}';
  end if;
  perform private.require_site_role(v_cs.id, '{owner,manager,staff}');
  if not exists (select 1 from public.organizations o where o.id = v_cs.org_id and o.kind = 'charity') then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"charity_site_id":"not_a_charity_site"}';
  end if;

  if not (coalesce(p_plan ->> 'mode', '') in ('volunteer', 'self')) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"mode":"volunteer|self"}';
  end if;
  v_mode := (p_plan ->> 'mode')::public.pickup_mode;

  if p_plan ? 'assignee_user_id' and jsonb_typeof(p_plan -> 'assignee_user_id') <> 'null' then
    v_assignee := private.try_uuid(p_plan ->> 'assignee_user_id');
    select m.role into v_role from public.org_members m
    where m.org_id = v_cs.org_id and m.user_id = v_assignee and m.status = 'active';
    if v_role is null
       or (v_mode = 'volunteer' and v_role not in ('volunteer', 'staff'))
       or (v_mode = 'self' and v_role not in ('owner', 'manager', 'staff')) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"assignee_user_id":"must be an active volunteer/staff (volunteer mode) or owner/manager/staff (self mode) of the charity"}';
    end if;
  end if;

  if p_plan ? 'planned_start_at' and jsonb_typeof(p_plan -> 'planned_start_at') <> 'null' then
    v_start := private.try_timestamptz(p_plan ->> 'planned_start_at');
    if v_start is null then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"planned_start_at":"ISO-8601 with offset"}';
    end if;
  end if;

  -- is distinct from: without the key jsonb_typeof is null, the whole test was null and an empty
  -- trip (dropoff stop only, pickup_assigned sent) was created.
  if jsonb_typeof(p_plan -> 'allocation_ids') is distinct from 'array' or jsonb_array_length(p_plan -> 'allocation_ids') = 0
     or exists (select 1 from jsonb_array_elements_text(p_plan -> 'allocation_ids') x where private.try_uuid(x) is null) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"allocation_ids":"non-empty uuid array"}';
  end if;
  v_ids := array(select distinct private.try_uuid(x) from jsonb_array_elements_text(p_plan -> 'allocation_ids') x order by 1);

  -- lock the allocations (ORDER BY id) and check each one
  perform 1 from public.allocations al where al.id = any (v_ids) order by al.id for update;
  select count(*) into v_n from public.allocations al where al.id = any (v_ids);
  if v_n <> cardinality(v_ids) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  for a in select * from public.allocations al where al.id = any (v_ids) order by al.id loop
    if a.charity_org_id <> v_cs.org_id then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    if a.charity_site_id <> v_cs.id then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('allocation_ids', 'other_receiving_site', 'allocation_id', a.id)::text;
    end if;
    if a.status <> 'confirmed' or a.pickup_id is not null then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = a.id::text;
    end if;
    if exists (select 1 from public.offers o
               where o.id = a.offer_id and (o.status not in ('open', 'fully_allocated') or o.effective_deadline <= v_now)) then
      raise exception using errcode = 'PT409', message = 'deadline_passed', detail = a.id::text;
    end if;
  end loop;

  v_sites := array(select distinct al.store_site_id from public.allocations al where al.id = any (v_ids));
  if cardinality(v_sites) > v_max_stops then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('allocation_ids', 'too_many_stops', 'max', v_max_stops)::text;
  end if;

  -- stops: given (validated) or generated
  if p_plan ? 'stops' and jsonb_typeof(p_plan -> 'stops') <> 'null' then
    v_stops := p_plan -> 'stops';
    if jsonb_typeof(v_stops) <> 'array'
       or jsonb_array_length(v_stops) <> cardinality(v_sites) + 1
       or exists (select 1 from jsonb_array_elements(v_stops) x
                  where jsonb_typeof(x) <> 'object' or private.try_uuid(x ->> 'site_id') is null
                     or coalesce(x ->> 'kind', '') not in ('pickup', 'dropoff')
                     or jsonb_typeof(x -> 'seq') <> 'number'
                     or (x ? 'eta' and jsonb_typeof(x -> 'eta') <> 'null' and private.try_timestamptz(x ->> 'eta') is null))
       or (select count(*) from jsonb_array_elements(v_stops) x where x ->> 'kind' = 'dropoff'
             and private.try_uuid(x ->> 'site_id') = v_cs.id) <> 1
       or (select array_agg(private.try_uuid(x ->> 'site_id') order by private.try_uuid(x ->> 'site_id'))
           from jsonb_array_elements(v_stops) x where x ->> 'kind' = 'pickup')
          is distinct from (select array_agg(si order by si) from unnest(v_sites) si)
       or (select array_agg((x ->> 'seq')::numeric order by (x ->> 'seq')::numeric) from jsonb_array_elements(v_stops) x)
          is distinct from (select array_agg(g::numeric order by g) from generate_series(1, cardinality(v_sites) + 1) g) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"stops":"one pickup stop per store site + one dropoff at charity_site_id, seq 1..n"}';
    end if;
  else
    select jsonb_agg(x order by (x ->> 'seq')::int) into v_stops from (
      select jsonb_build_object('site_id', q.site_id, 'kind', 'pickup', 'seq', row_number() over (order by q.deadline, q.site_id)) x
      from (select al.store_site_id as site_id, min(o.effective_deadline) as deadline
            from public.allocations al join public.offers o on o.id = al.offer_id
            where al.id = any (v_ids) group by al.store_site_id) q
      union all
      select jsonb_build_object('site_id', v_cs.id, 'kind', 'dropoff', 'seq', cardinality(v_sites) + 1)
    ) s;
  end if;

  if p_plan ? 'route' and jsonb_typeof(p_plan -> 'route') = 'object' then
    begin
      v_route := extensions.st_setsrid(extensions.st_geomfromgeojson((p_plan -> 'route' -> 'geojson')::text), 4326);
    exception when others then
      v_route := null;
    end;
    if v_route is null or extensions.geometrytype(v_route) <> 'LINESTRING'
       or coalesce(p_plan -> 'route' ->> 'provider', '') not in ('goong', 'ors', 'aws', 'fake') then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"route":"{geojson: LineString, distance_m, duration_s, provider: goong|ors|aws|fake}"}';
    end if;
  end if;

  insert into public.pickups (id, charity_org_id, charity_site_id, mode, assignee_user_id, status,
                              planned_start_at, route, route_distance_m, route_duration_s, route_provider,
                              route_computed_at, created_by)
  values (v_pickup, v_cs.org_id, v_cs.id, v_mode, v_assignee,
          case when v_assignee is not null then 'assigned'::public.pickup_status else 'planned'::public.pickup_status end,
          v_start, v_route,
          case when v_route is not null then (p_plan -> 'route' ->> 'distance_m')::numeric::integer end,
          case when v_route is not null then (p_plan -> 'route' ->> 'duration_s')::numeric::integer end,
          case when v_route is not null then p_plan -> 'route' ->> 'provider' end,
          case when v_route is not null then v_now end,
          v_uid);

  for e in select x from jsonb_array_elements(v_stops) x loop
    insert into public.pickup_stops (pickup_id, seq, kind, site_id, eta)
    values (v_pickup, (e ->> 'seq')::smallint, (e ->> 'kind')::public.handover_kind, (e ->> 'site_id')::uuid,
            private.try_timestamptz(e ->> 'eta'))
    returning id into v_stop_id;

    if e ->> 'kind' = 'pickup' then
      update public.allocations
         set status = 'assigned', pickup_id = v_pickup, stop_id = v_stop_id, assigned_at = v_now
       where id = any (v_ids) and store_site_id = (e ->> 'site_id')::uuid;
    end if;
  end loop;

  if v_assignee is not null then
    perform private.enqueue('pickup_assigned', 'pickup', v_pickup, 'pickup_assigned:' || v_pickup || ':' || v_assignee,
      jsonb_build_object('pickup_id', v_pickup, 'charity_org_id', v_cs.org_id, 'assignee_user_id', v_assignee,
                         'mode', v_mode));
  end if;

  perform private.audit(
    p_action       => 'pickup.assign',
    p_entity_type  => 'pickup',
    p_entity_id    => v_pickup,
    p_org_id       => v_cs.org_id,
    p_after        => jsonb_build_object('mode', v_mode, 'allocation_ids', to_jsonb(v_ids),
                                         'stops', cardinality(v_sites) + 1, 'assigned', v_assignee is not null),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_pickup));
  return v_pickup;
end;
$$;

comment on function public.assign_pickup(jsonb, uuid) is
  'Create a trip for confirmed allocations of one receiving site (charity owner/manager/staff). p_plan {allocation_ids[], mode volunteer|self, charity_site_id, assignee_user_id?, planned_start_at?, stops?[{site_id, seq, kind, eta?}], route?}. Allocations -> assigned. pickup_id (re-plan) is not supported in P2. Returns pickup_id.';

-- ===========================================================================
-- 7. Handover RPCs (§6.6)
-- ===========================================================================

-- Issues (or re-issues) the QR token + 6-digit code of a stop. Secrets are returned once; a replay
-- of the same client_op_id returns handover_id/expires_at with null token/code (issue again with a
-- new client_op_id). Re-issuing invalidates the previous token/code and resets failed_attempts.
create or replace function public.issue_handover_token(p_stop_id uuid, p_lines jsonb, p_client_op_id uuid)
returns table (handover_id uuid, token text, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_uid();
  v_resp    jsonb;
  s         public.pickup_stops%rowtype;
  p         public.pickups%rowtype;
  h         public.handovers%rowtype;
  v_now     timestamptz := private.now();
  v_ids     uuid[];
  v_lines   jsonb := '[]'::jsonb;
  v_token   text;
  v_code    text;
  v_id      uuid;
  v_expires timestamptz;
begin
  v_resp := private.idem_claim(p_client_op_id, 'issue_handover_token',
    private.idem_hash(jsonb_build_object('stop_id', p_stop_id, 'lines', p_lines)));
  if v_resp is not null then
    return query select (v_resp ->> 'handover_id')::uuid, null::text, null::text, (v_resp ->> 'expires_at')::timestamptz;
    return;
  end if;

  select * into s from public.pickup_stops ps where ps.id = p_stop_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  select * into p from public.pickups pk where pk.id = s.pickup_id;

  -- only the carrier issues: the assignee, or (self pickup) charity owner/manager/staff.
  -- coalesce: a self trip has no assignee, and `not (null or false)` is null, which would skip the raise.
  if not coalesce((p.assignee_user_id = v_uid and private.is_active_org_member(p.charity_org_id))
                  or (p.mode = 'self' and private.can_access_site(p.charity_site_id, '{owner,manager,staff}')), false) then
    if private.can_see_pickup(p.id) then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  perform 1 from public.pickups pk where pk.id = p.id for update;
  select * into s from public.pickup_stops ps where ps.id = p_stop_id for update;
  select * into p from public.pickups pk where pk.id = s.pickup_id;

  if not (p.status in ('assigned', 'in_progress') or (p.mode = 'self' and p.status = 'planned'))
     or s.status not in ('pending', 'arrived') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  if s.kind = 'pickup' then
    v_ids := array(select al.id from public.allocations al where al.stop_id = s.id and al.status = 'assigned' order by al.id);
    if cardinality(v_ids) = 0 then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'no_allocations';
    end if;
    if not private.pickup_window_ok(s.id, v_now) then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'outside_pickup_window';
    end if;
  else
    if p.mode = 'self' then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'auto_dropoff';
    end if;
    if exists (select 1 from public.pickup_stops ps
               where ps.pickup_id = p.id and ps.kind = 'pickup' and ps.status in ('pending', 'arrived')) then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'pickups_pending';
    end if;
    v_ids := array(select al.id from public.allocations al where al.pickup_id = p.id and al.status = 'picked_up' order by al.id);
    if cardinality(v_ids) = 0 then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'nothing_to_deliver';
    end if;
  end if;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    v_lines := private.check_handover_lines(p_lines, s.kind, v_ids);
  elsif p_lines is not null and jsonb_typeof(p_lines) not in ('array', 'null') then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_lines":"array_required"}';
  end if;

  perform private.check_rate_limit('issue_handover:stop:' || s.id::text, 10, interval '10 minutes');

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_expires := v_now + private.setting_num('handover_token_ttl_minutes', 15) * interval '1 minute';

  select * into h from public.handovers hv where hv.stop_id = s.id for update;
  if found then
    if h.consumed_at is not null then
      raise exception using errcode = 'PT409', message = 'token_consumed', detail = h.consumed_at::text;
    end if;
    v_id := h.id;
    update public.handovers
       set token_hash = sha256(convert_to(v_token, 'UTF8')),
           code_hash = sha256(convert_to(v_id::text || ':' || v_code, 'UTF8')),
           token_expires_at = v_expires, issued_by = v_uid, issued_at = v_now,
           proposed_lines = v_lines, failed_attempts = 0
     where id = v_id;
  else
    v_id := gen_random_uuid();
    insert into public.handovers (id, pickup_id, stop_id, kind, token_hash, code_hash, token_expires_at,
                                  issued_by, issued_at, proposed_lines)
    values (v_id, p.id, s.id, s.kind, sha256(convert_to(v_token, 'UTF8')),
            sha256(convert_to(v_id::text || ':' || v_code, 'UTF8')), v_expires, v_uid, v_now, v_lines);
  end if;

  perform private.audit(
    p_action       => 'handover.issue',
    p_entity_type  => 'handover',
    p_entity_id    => v_id,
    p_org_id       => p.charity_org_id,
    p_after        => jsonb_build_object('kind', s.kind, 'stop_id', s.id, 'expires_at', v_expires,
                                         'reissue', h.id is not null),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, jsonb_build_object('handover_id', v_id, 'expires_at', v_expires));
  return query select v_id, v_token, v_code, v_expires;
end;
$$;

comment on function public.issue_handover_token(uuid, jsonb, uuid) is
  'Carrier (assignee; self pickup: charity owner/manager/staff) issues the stop QR token (32 bytes base64url) + 6-digit code, TTL handover_token_ttl_minutes. Pickup: only within the pickup window ± grace. Dropoff: all pickup stops done/skipped (volunteer mode; self = automatic). Rate limit 10/10 min/stop. Secrets returned once; only hashes stored.';

-- Read-only preview of a scanned QR for the counterpart (store at pickup, charity at dropoff):
-- who carries what, expected and proposed quantities. Addition to §8.5 (UI needs it before
-- confirming quantities, PRD US-STO-17 AC1). Does not consume or count attempts.
create or replace function public.peek_handover_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h     public.handovers%rowtype;
  s     public.pickup_stops%rowtype;
  p     public.pickups%rowtype;
  v_now timestamptz := private.now();
  v_lines jsonb;
begin
  perform private.require_uid();
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = 'PT422', message = 'token_invalid';
  end if;

  select * into h from public.handovers hv
  where hv.token_hash = sha256(convert_to(p_token, 'UTF8'))
  order by (hv.consumed_at is null) desc, hv.issued_at desc
  limit 1;
  if not found then
    raise exception using errcode = 'PT422', message = 'token_invalid';
  end if;
  select * into s from public.pickup_stops ps where ps.id = h.stop_id;
  select * into p from public.pickups pk where pk.id = h.pickup_id;

  if h.kind = 'pickup' and not private.can_access_site(s.site_id, '{owner,manager,staff}') then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'wrong_store';
  elsif h.kind = 'dropoff' and not private.can_access_site(p.charity_site_id, '{owner,manager,staff}') then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'wrong_org';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'allocation_id', a.id, 'offer_id', a.offer_id, 'title', o.title, 'category_code', o.category_code,
           'unit', a.unit, 'unit_weight_kg', a.unit_weight_kg_snapshot,
           'expected_qty', case h.kind when 'pickup' then a.qty_reserved - a.qty_released else a.qty_picked end,
           'proposed_qty', (select (pl ->> 'qty')::numeric from jsonb_array_elements(h.proposed_lines) pl
                            where pl ->> 'allocation_id' = a.id::text limit 1))
           order by a.id), '[]'::jsonb)
    into v_lines
  from public.allocations a join public.offers o on o.id = a.offer_id
  where (h.kind = 'pickup' and a.stop_id = s.id and a.status = 'assigned')
     or (h.kind = 'dropoff' and a.pickup_id = p.id and a.status = 'picked_up');

  return jsonb_build_object(
    'handover_id', h.id, 'kind', h.kind, 'stop_id', s.id, 'pickup_id', p.id, 'site_id', s.site_id,
    'charity_org_id', p.charity_org_id,
    'charity_name', (select o.name from public.organizations o where o.id = p.charity_org_id),
    'carrier_name', (select pr.full_name from public.profiles pr where pr.id = h.issued_by),
    'carrier_avatar_path', (select pr.avatar_path from public.profiles pr where pr.id = h.issued_by),
    'expires_at', h.token_expires_at, 'consumed_at', h.consumed_at,
    'expired', h.token_expires_at is null or v_now > h.token_expires_at,
    'locked', h.failed_attempts >= private.handover_max_attempts(),
    'in_window', h.kind = 'dropoff' or private.pickup_window_ok(s.id, v_now),
    'lines', v_lines);
end;
$$;

comment on function public.peek_handover_token(text) is
  'Preview a scanned handover token (store member of the pickup stop site / charity member of the receiving site): carrier, charity, lines with expected and proposed quantities, validity flags. No state change.';

-- Store scans the QR (pickup).
create or replace function public.consume_handover_token(p_token text, p_lines jsonb, p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp jsonb;
  v_hash bytea;
  v_id   uuid;
begin
  perform private.require_uid();
  v_hash := sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  v_resp := private.idem_claim(p_client_op_id, 'consume_handover_token',
    private.idem_hash(jsonb_build_object('token_hash', encode(v_hash, 'hex'), 'lines', p_lines)));
  if v_resp is not null then
    return v_resp;
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = 'PT422', message = 'token_invalid';
  end if;
  select hv.id into v_id from public.handovers hv
  where hv.token_hash = v_hash
  order by (hv.consumed_at is null) desc, hv.issued_at desc
  limit 1;
  if v_id is null then
    raise exception using errcode = 'PT422', message = 'token_invalid';
  end if;

  v_resp := private.consume_pickup(v_id, null, p_lines, 'qr', p_client_op_id);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.consume_handover_token(text, jsonb, uuid) is
  'Pickup handover by QR (store owner/manager/staff of the stop site). Errors: token_invalid, not_authorized wrong_store, token_consumed, token_locked, token_expired (TTL or outside_pickup_window), self_dealing, validation_failed (lines). Returns {ok, handover_id, pickup_id, allocations[], dropoff (self pickup: ledger result)}.';

-- Store types the 6-digit code (pickup). Wrong code => {ok:false, error:'code_invalid', attempts_left}.
create or replace function public.consume_handover_code(p_handover_id uuid, p_code text, p_lines jsonb,
                                                        p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp jsonb;
begin
  perform private.require_uid();
  v_resp := private.idem_claim(p_client_op_id, 'consume_handover_code',
    private.idem_hash(jsonb_build_object('handover_id', p_handover_id,
                                         'code_hash', encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex'),
                                         'lines', p_lines)));
  if v_resp is not null then
    return v_resp;
  end if;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_code":"6 digits"}';
  end if;
  if not exists (select 1 from public.handovers hv where hv.id = p_handover_id) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  v_resp := private.consume_pickup(p_handover_id, p_code, p_lines, 'code', p_client_op_id);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.consume_handover_code(uuid, text, jsonb, uuid) is
  'Pickup handover by 6-digit code (fallback). Same checks as consume_handover_token; a wrong code does not raise: failed_attempts + 1 and {ok:false, error:code_invalid, attempts_left}; locked at handover_max_failed_attempts until re-issued.';

-- Charity confirms the dropoff (volunteer trip) by scanning the carrier's QR or typing the code.
create or replace function public.record_dropoff(p_handover_id uuid, p_secret text, p_lines jsonb, p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_resp   jsonb;
  h        public.handovers%rowtype;
  p        public.pickups%rowtype;
  s        public.pickup_stops%rowtype;
  v_ids    uuid[];
  v_lines  jsonb;
  v_now    timestamptz := private.now();
  v_max    integer := private.handover_max_attempts();
  v_method public.handover_method;
begin
  v_resp := private.idem_claim(p_client_op_id, 'record_dropoff',
    private.idem_hash(jsonb_build_object('handover_id', p_handover_id,
                                         'secret_hash', encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex'),
                                         'lines', p_lines)));
  if v_resp is not null then
    return v_resp;
  end if;

  select * into h from public.handovers hv where hv.id = p_handover_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  select * into p from public.pickups pk where pk.id = h.pickup_id;
  if not private.can_access_site(p.charity_site_id, '{owner,manager,staff}') then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if h.kind <> 'dropoff' then
    raise exception using errcode = 'PT422', message = 'token_invalid', detail = 'not_a_dropoff_handover';
  end if;

  -- lock order: allocations → pickups → pickup_stops → handovers
  v_ids := array(select al.id from public.allocations al where al.pickup_id = p.id and al.status = 'picked_up' order by al.id);
  perform 1 from public.allocations al where al.id = any (v_ids) order by al.id for update;
  select * into p from public.pickups pk where pk.id = h.pickup_id for update;
  select * into s from public.pickup_stops ps where ps.id = h.stop_id for update;
  select * into h from public.handovers hv where hv.id = p_handover_id for update;
  v_ids := array(select al.id from public.allocations al where al.pickup_id = p.id and al.status = 'picked_up' order by al.id);

  if h.consumed_at is not null then
    raise exception using errcode = 'PT409', message = 'token_consumed', detail = h.consumed_at::text;
  end if;
  if h.failed_attempts >= v_max then
    raise exception using errcode = 'PT422', message = 'token_locked';
  end if;
  if h.token_expires_at is null or v_now > h.token_expires_at then
    raise exception using errcode = 'PT422', message = 'token_expired';
  end if;
  if p.status <> 'in_progress' or s.status not in ('pending', 'arrived') or cardinality(v_ids) = 0
     or exists (select 1 from public.pickup_stops ps
                where ps.pickup_id = p.id and ps.kind = 'pickup' and ps.status in ('pending', 'arrived')) then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if h.issued_by = v_uid then
    raise exception using errcode = 'PT403', message = 'self_dealing';
  end if;

  v_lines := private.check_handover_lines(p_lines, 'dropoff', v_ids);

  if p_secret ~ '^[0-9]{6}$' then
    if h.code_hash is distinct from sha256(convert_to(h.id::text || ':' || p_secret, 'UTF8')) then
      v_resp := jsonb_build_object('ok', false, 'error', 'code_invalid',
                                   'attempts_left', private.bump_failed_attempt(h.id));
      perform private.idem_store(p_client_op_id, v_resp);
      return v_resp;
    end if;
    v_method := 'code';
  elsif p_secret ~ '^[A-Za-z0-9_-]{43}$' and h.token_hash = sha256(convert_to(p_secret, 'UTF8')) then
    v_method := 'qr';
  else
    raise exception using errcode = 'PT422', message = 'token_invalid';
  end if;

  v_resp := private.apply_dropoff(h.id, v_lines, v_method, v_uid, p_client_op_id);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.record_dropoff(uuid, text, jsonb, uuid) is
  'Dropoff (charity owner/manager/staff of the receiving site, ≠ issuer). p_secret = QR token or 6-digit code (wrong code => {ok:false, attempts_left}). Lines cover every picked_up allocation of the trip (only quality_reject, with note). Delivers, credits the impact ledger, completes the trip. Returns {ok, handover_id, pickup_id, ledger_ids, kg, co2e_kg, water_l, meals}.';

-- ===========================================================================
-- 8. P1 RPCs extended with P2 tables (DATA-MODEL §6.8 notes)
-- ===========================================================================

-- approved -> suspended (admin aal2) + C14 cascade: a suspended store's live lots are cancelled
-- (cancel_offer_core, actor admin); a suspended charity's not-yet-picked allocations are cancelled
-- (cancel_actor admin, released while the lot is live). picked_up allocations still complete.
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
  v_offer    public.offers%rowtype;
  a          public.allocations%rowtype;
  v_now      timestamptz;
  v_uid      uuid;
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

  -- C14 cascade, global lock order: needs → offers → allocations
  v_now := private.now();
  v_uid := auth.uid();
  perform 1 from public.needs n
  where n.id in (select al.need_id from public.allocations al
                 where (al.store_org_id = p_org_id or al.charity_org_id = p_org_id)
                   and al.status in ('requested', 'confirmed', 'assigned') and al.need_id is not null)
  order by n.id for update;

  if v_org.kind = 'store' then
    for v_offer in
      select * from public.offers o
      where o.org_id = p_org_id and o.status in ('open', 'fully_allocated')
      order by o.id
      for update
    loop
      perform private.cancel_offer_core(v_offer, 'admin', 'org_suspended', p_client_op_id);
    end loop;
  else
    perform 1 from public.offers o
    where o.id in (select al.offer_id from public.allocations al
                   where al.charity_org_id = p_org_id and al.status in ('requested', 'confirmed', 'assigned'))
    order by o.id for update;
    for a in
      select * from public.allocations al
      where al.charity_org_id = p_org_id and al.status in ('requested', 'confirmed', 'assigned')
      order by al.id
      for update
    loop
      update public.allocations
         set status = 'cancelled', closed_at = v_now, cancel_actor = 'admin', cancelled_by = v_uid,
             cancel_reason = 'org_suspended'
       where id = a.id;
      perform private.detach_allocation(a.id);
      if (select o.effective_deadline from public.offers o where o.id = a.offer_id) > v_now then
        perform private.release_qty(a.id, a.qty_reserved - a.qty_released);
      end if;
      perform private.refresh_offer(a.offer_id);
      perform private.enqueue('allocation_cancelled', 'allocation', a.id, 'allocation_cancelled:' || a.id,
        private.alloc_payload(a, '{"cancel_actor":"admin","cause":"org_suspended"}'));
      perform private.audit(
        p_action => 'allocation.cancel', p_entity_type => 'allocation', p_entity_id => a.id,
        p_org_id => a.store_org_id, p_before => jsonb_build_object('status', a.status),
        p_after => '{"status":"cancelled","cancel_actor":"admin","cause":"org_suspended"}',
        p_reason => 'org_suspended', p_client_op_id => p_client_op_id);
      perform private.after_allocation_change(a, false);
    end loop;
  end if;

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.suspend_organization(uuid, text, uuid) is
  'approved -> suspended (admin aal2, not self, reason required). Outbox org_suspended {org_id, audit_id}. C14: store => live lots cancelled (allocations as C11, actor admin); charity => not-yet-picked allocations cancelled (released while the lot is live).';

-- approved | suspended -> closed (owner, or admin aal2). Refused while the org still has an
-- unfinished allocation (requested/confirmed/assigned/picked_up) on either side.
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

  if exists (select 1 from public.allocations a
             where (a.store_org_id = p_org_id or a.charity_org_id = p_org_id)
               and a.status in ('requested', 'confirmed', 'assigned', 'picked_up')) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'unfinished_allocations';
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
  'approved|suspended -> closed (owner or admin aal2). PT409 invalid_state detail unfinished_allocations while any allocation of the org is requested/confirmed/assigned/picked_up. Pending change requests -> rejected (org_closed).';

-- get_site_location + P2 branches: assignee/coordinator of a running trip stopping at the site;
-- store with an unfinished allocation to a PUBLIC receiving site.
create or replace function public.get_site_location(p_site_id uuid)
returns table (lat float8, lng float8, address_line text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
begin
  perform private.require_uid();

  select * into v_site from public.sites s where s.id = p_site_id;
  if not found or not (
       private.caller_org_role(v_site.org_id) is not null
       or private.is_admin()
       or exists (select 1 from public.pickup_stops ps
                  join public.pickups p on p.id = ps.pickup_id
                  where ps.site_id = p_site_id and p.status in ('planned', 'assigned', 'in_progress')
                    and ((p.assignee_user_id = (select auth.uid()) and private.is_active_org_member(p.charity_org_id))
                         or private.can_access_site(p.charity_site_id, '{owner,manager,staff}')))
       or (v_site.visibility = 'public'
           and exists (select 1 from public.allocations a
                       where a.charity_site_id = p_site_id
                         and a.status in ('requested', 'confirmed', 'assigned', 'picked_up')
                         and private.can_access_site(a.store_site_id, '{owner,manager,staff}')))) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  return query
    select extensions.st_y(v_site.location::extensions.geometry),
           extensions.st_x(v_site.location::extensions.geometry),
           v_site.address_line;
end;
$$;

comment on function public.get_site_location(uuid) is
  'Exact lat/lng/address of a site for: members of its org, admin aal2, assignee/charity coordinator of a running trip stopping there, store with an unfinished allocation to it when the site is public. PT404 otherwise.';

-- withdraw_consent + location_trip: clears last_location of the caller's running trips.
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

  if p_purpose = 'location_trip' then
    update public.pickups
       set last_location = null, last_location_at = null, last_location_accuracy_m = null
     where assignee_user_id = v_uid and last_location is not null;
  end if;

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
  'Withdraw the caller''s active consent for p_purpose (no-op when none). location_trip also clears pickups.last_location of the caller''s trips. Audited.';

-- ===========================================================================
-- 9. Function privileges
-- ===========================================================================
revoke all on function private.is_pickup_assignee(uuid) from public, anon, authenticated;
revoke all on function private.can_see_pickup(uuid) from public, anon, authenticated;
revoke all on function private.can_see_stop(uuid) from public, anon, authenticated;
revoke all on function private.can_see_handover(uuid) from public, anon, authenticated;
revoke all on function private.offer_in_my_trip(uuid) from public, anon, authenticated;
revoke all on function private.pickup_window_ok(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.check_handover_lines(jsonb, public.handover_kind, uuid[]) from public, anon, authenticated;
revoke all on function private.bump_failed_attempt(uuid) from public, anon, authenticated;
revoke all on function private.refresh_pickup(uuid) from public, anon, authenticated;
revoke all on function private.detach_allocation(uuid) from public, anon, authenticated;
revoke all on function private.apply_dropoff(uuid, jsonb, public.handover_method, uuid, uuid) from public, anon, authenticated;
revoke all on function private.auto_dropoff(uuid) from public, anon, authenticated;
revoke all on function private.consume_pickup(uuid, text, jsonb, public.handover_method, uuid) from public, anon, authenticated;

revoke all on function public.assign_pickup(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.issue_handover_token(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.peek_handover_token(text) from public, anon, authenticated;
revoke all on function public.consume_handover_token(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.consume_handover_code(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.record_dropoff(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.suspend_organization(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.close_organization(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_site_location(uuid) from public, anon, authenticated;
revoke all on function public.withdraw_consent(public.consent_purpose) from public, anon, authenticated;

grant execute on function private.is_pickup_assignee(uuid) to authenticated, service_role;
grant execute on function private.can_see_pickup(uuid) to authenticated, service_role;
grant execute on function private.can_see_stop(uuid) to authenticated, service_role;
grant execute on function private.can_see_handover(uuid) to authenticated, service_role;
grant execute on function private.offer_in_my_trip(uuid) to authenticated, service_role;

grant execute on function public.assign_pickup(jsonb, uuid) to authenticated;
grant execute on function public.issue_handover_token(uuid, jsonb, uuid) to authenticated;
grant execute on function public.peek_handover_token(text) to authenticated;
grant execute on function public.consume_handover_token(text, jsonb, uuid) to authenticated;
grant execute on function public.consume_handover_code(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.record_dropoff(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.suspend_organization(uuid, text, uuid) to authenticated;
grant execute on function public.close_organization(uuid, uuid) to authenticated;
grant execute on function public.get_site_location(uuid) to authenticated;
grant execute on function public.withdraw_consent(public.consent_purpose) to authenticated;

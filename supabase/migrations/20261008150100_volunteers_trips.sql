-- Migration 11b — volunteers_trips (DATA-MODEL §2.1 volunteer_profiles, §2.3 pickups/pickup_stops/incidents,
-- §6.4, §6.5, §7 C5/C6/C10, §8.2 upsert_volunteer_profile, §8.5, §9.2, §11 location_trip; SECURITY-PRIVACY
-- §2.3, C9; PRD US-CHA-15…18, US-CHA-23, US-VOL-01…06, US-VOL-13; ROADMAP P3-08, P3-09, P3-12)
-- Table:   volunteer_profiles (+ RLS, allow-list grants, base_area snapped to 0.01° by trigger).
-- Columns: pickup_stops.arrival_check / arrival_note (check-in flag, no coordinates — SECURITY §5 row 10).
-- RPCs:    upsert_volunteer_profile, respond_pickup, start_pickup, update_pickup_progress, check_in_stop,
--          skip_stop, cancel_pickup, get_pickup_contacts, report_incident, resolve_incident;
--          assign_pickup re-created with re-planning of an existing trip (p_plan.pickup_id).
-- Volunteer location: only pickups.last_location (latest point, 4 decimals), only for the assignee with
-- an active location_trip consent while the trip is in_progress; never in audit_logs / outbox; cleared
-- on completion, cancellation, decline and consent withdrawal. Stores only ever see pickup_stops.eta.
-- Lock order (§6 rule 2): needs → offers → allocations (ORDER BY id) → pickups → pickup_stops → handovers.

-- ===========================================================================
-- 1. volunteer_profiles
-- ===========================================================================
create table public.volunteer_profiles (
  user_id           uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  vehicle           public.vehicle_type not null default 'motorbike',
  capacity_kg       numeric(5, 1) not null default 20 check (capacity_kg between 1 and 500),
  base_area         extensions.geography(point, 4326),
  base_area_label   text check (char_length(base_area_label) <= 120),
  availability_note text check (char_length(availability_note) <= 300),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.volunteer_profiles is 'Volunteer profile (vehicle, capacity, approximate area). Own row S/I/U; owner/manager/staff of an approved charity the volunteer belongs to read it; admin aal2 reads. Written via upsert_volunteer_profile or the column allow-list.';
comment on column public.volunteer_profiles.base_area is 'Approximate home area: always snapped to a 0.01° grid (~1.1 km) by trigger. Never a home address.';
comment on column public.volunteer_profiles.base_area_label is 'Human label of the area, e.g. "Phường Bàn Cờ".';

create index volunteer_profiles_base_area_gix on public.volunteer_profiles using gist (base_area);

create or replace function private.volunteer_profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.base_area is not null then
    new.base_area := extensions.st_snaptogrid(new.base_area::extensions.geometry, 0.01)::extensions.geography;
  end if;
  new.base_area_label := nullif(btrim(new.base_area_label), '');
  new.availability_note := nullif(btrim(new.availability_note), '');
  return new;
end;
$$;

comment on function private.volunteer_profiles_before_write() is 'BEFORE INSERT/UPDATE on volunteer_profiles: base_area snapped to 0.01° (whatever the write path), labels trimmed.';

create trigger volunteer_profiles_before_write
  before insert or update on public.volunteer_profiles
  for each row execute function private.volunteer_profiles_before_write();
create trigger set_updated_at before update on public.volunteer_profiles
  for each row execute function private.set_updated_at();

-- RLS helper: the caller is owner/manager/staff of an approved charity where p_user is an active member.
create or replace function private.can_see_volunteer(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1
                 from public.org_members them
                 join public.org_members me on me.org_id = them.org_id
                 join public.organizations o on o.id = them.org_id and o.status = 'approved' and o.kind = 'charity'
                 where them.user_id = p_user and them.status = 'active'
                   and me.user_id = (select auth.uid()) and me.status = 'active'
                   and me.role in ('owner', 'manager', 'staff'));
$$;

comment on function private.can_see_volunteer(uuid) is 'volunteer_profiles RLS: caller coordinates (owner/manager/staff) an approved charity p_user is an active member of.';

alter table public.volunteer_profiles enable row level security;

create policy volunteer_profiles_select on public.volunteer_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.can_see_volunteer(user_id) or (select private.is_admin()));

create policy volunteer_profiles_insert_own on public.volunteer_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy volunteer_profiles_update_own on public.volunteer_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.volunteer_profiles from anon, authenticated;
grant select on public.volunteer_profiles to authenticated;
grant insert (vehicle, capacity_kg, base_area, base_area_label, availability_note) on public.volunteer_profiles to authenticated;
grant update (vehicle, capacity_kg, base_area, base_area_label, availability_note) on public.volunteer_profiles to authenticated;

-- ===========================================================================
-- 2. pickup_stops: check-in flag (no coordinates are ever stored)
-- ===========================================================================
alter table public.pickup_stops
  add column arrival_check text check (arrival_check in ('geofence', 'manual', 'no_location')),
  add column arrival_note  text check (char_length(arrival_note) <= 200);

comment on column public.pickup_stops.arrival_check is 'How check_in_stop confirmed the arrival: geofence (≤ geofence_m from the exact site), manual (outside, reason given), no_location (no GPS). null when the stop was completed by a handover without check-in.';
comment on column public.pickup_stops.arrival_note is 'Reason given for a manual check-in (PRD US-VOL-06 AC2/AC3), shown to the coordinator.';

-- Realtime (ROADMAP P3-11, US-STO-22): stop status / ETA changes reach the coordination map and the
-- store ("Dự kiến tới …") through postgres_changes; RLS decides who receives each row (stores: only
-- their pickup stop). pickup_stops has no location column. pickups (last_location) is NOT published:
-- the live position goes through the private Broadcast channel of P5 (SECURITY-PRIVACY C9).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_stops') then
    alter publication supabase_realtime add table public.pickup_stops;
  end if;
end;
$$;

-- ===========================================================================
-- 3. Internal helpers
-- ===========================================================================

-- The carrier of a trip: its assignee (active member of the approved charity), or for a self pickup
-- any owner/manager/staff of the charity with access to the receiving site.
create or replace function private.is_trip_carrier(p_pickup uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (p.assignee_user_id = (select auth.uid()) and private.is_active_org_member(p.charity_org_id))
                          or (p.mode = 'self' and private.can_access_site(p.charity_site_id, '{owner,manager,staff}'))
                   from public.pickups p where p.id = p_pickup), false);
$$;

comment on function private.is_trip_carrier(uuid) is 'Assignee of the trip, or (self pickup) charity owner/manager/staff of the receiving site. NULL-safe.';

-- Refusal of a trip action: PT403 not_authorized when the caller may see the trip or the stop
-- (coordinator, assignee, store of the stop, admin), PT404 otherwise (no existence leak).
create or replace function private.raise_trip_access(p_pickup uuid, p_stop uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(private.can_see_pickup(p_pickup), false)
     or (p_stop is not null and coalesce(private.can_see_stop(p_stop), false))
     or private.is_admin() then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  raise exception using errcode = 'PT404', message = 'not_found';
end;
$$;

comment on function private.raise_trip_access(uuid, uuid) is 'Always raises: PT403 not_authorized if the trip/stop is visible to the caller, else PT404 not_found.';

-- Recomputes pickup_stops.eta of the pending stops (in seq order) from p_from at p_at with the
-- §4.7 travel model on EXACT site locations (server side only). ETAs are rounded up to the minute;
-- stores only ever read their stop's eta. Caller holds the pickup lock. Returns [{stop_id, eta}].
create or replace function private.recompute_etas(p_pickup uuid, p_from extensions.geography, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r     record;
  v_t   timestamptz := p_at;
  v_pos extensions.geography := p_from;
  v_eta timestamptz;
  v_out jsonb := '[]'::jsonb;
begin
  for r in
    select st.id, si.location
    from public.pickup_stops st join public.sites si on si.id = st.site_id
    where st.pickup_id = p_pickup and st.status = 'pending'
    order by st.seq
    for update of st
  loop
    v_t := v_t + private.travel_min(extensions.st_distance(v_pos, r.location))::float8 * interval '1 minute';
    v_eta := date_trunc('minute', v_t)
             + case when v_t > date_trunc('minute', v_t) then interval '1 minute' else interval '0' end;
    update public.pickup_stops set eta = v_eta where id = r.id;
    v_pos := r.location;
    v_out := v_out || jsonb_build_array(jsonb_build_object('stop_id', r.id, 'eta', v_eta));
  end loop;
  return v_out;
end;
$$;

comment on function private.recompute_etas(uuid, extensions.geography, timestamptz) is
  'pending stops: eta = previous point + travel_min(distance) (§4.7), cumulative, rounded up to the minute. Returns [{stop_id, eta}].';

-- '0901234567' -> '090****567' (contacts across parties never expose a full phone number).
create or replace function private.mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or btrim(p_phone) = '' then null
    when char_length(p_phone) < 7 then '****'
    else left(p_phone, 3) || repeat('*', char_length(p_phone) - 6) || right(p_phone, 3)
  end;
$$;

comment on function private.mask_phone(text) is 'Masked phone: first 3 and last 3 characters kept.';

-- ===========================================================================
-- 4. upsert_volunteer_profile (§8.2; PRD US-VOL-01 AC2, US-CHA-15)
-- ===========================================================================
-- p_payload keys: vehicle, capacity_kg, lat + lng (both null = clear the area), base_area_label,
-- availability_note. Missing keys keep the stored value (defaults on first save). The area is
-- snapped to 0.01° and must lie in app_settings.service_area_bbox. Idempotent by construction.
create or replace function public.upsert_volunteer_profile(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_old   public.volunteer_profiles%rowtype;
  v_new   public.volunteer_profiles%rowtype;
  v_err   jsonb := '{}'::jsonb;
  v_bad   text[];
  v_bbox  float8[] := private.service_area_bbox();
  v_lat   float8;
  v_lng   float8;
  v_found boolean;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_payload":"object_required"}';
  end if;
  select array_agg(k order by k) into v_bad from jsonb_object_keys(p_payload) k
  where k not in ('vehicle', 'capacity_kg', 'lat', 'lng', 'base_area_label', 'availability_note');
  if v_bad is not null then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('unknown_keys', to_jsonb(v_bad))::text;
  end if;

  select * into v_old from public.volunteer_profiles where user_id = v_uid for update;
  v_found := found;
  v_new := v_old;
  if not v_found then
    v_new.user_id := v_uid;
    v_new.vehicle := 'motorbike';
    v_new.capacity_kg := 20;
  end if;

  if p_payload ? 'vehicle' then
    if jsonb_typeof(p_payload -> 'vehicle') is distinct from 'string'
       or not ((p_payload ->> 'vehicle') = any (enum_range(null::public.vehicle_type)::text[])) then
      v_err := v_err || '{"vehicle":"motorbike|bicycle|car|on_foot"}';
    else
      v_new.vehicle := (p_payload ->> 'vehicle')::public.vehicle_type;
    end if;
  end if;

  if p_payload ? 'capacity_kg' then
    if jsonb_typeof(p_payload -> 'capacity_kg') is distinct from 'number'
       or (p_payload ->> 'capacity_kg')::numeric not between 1 and 500 then
      v_err := v_err || '{"capacity_kg":"1-500"}';
    else
      v_new.capacity_kg := round((p_payload ->> 'capacity_kg')::numeric, 1);
    end if;
  end if;

  if p_payload ? 'lat' or p_payload ? 'lng' then
    if jsonb_typeof(p_payload -> 'lat') = 'null' and jsonb_typeof(p_payload -> 'lng') = 'null' then
      v_new.base_area := null;
    elsif jsonb_typeof(p_payload -> 'lat') is distinct from 'number' or jsonb_typeof(p_payload -> 'lng') is distinct from 'number' then
      v_err := v_err || '{"location":"lat and lng numbers required together"}';
    else
      v_lat := (p_payload ->> 'lat')::float8;
      v_lng := (p_payload ->> 'lng')::float8;
      if v_lng not between v_bbox[1] and v_bbox[3] or v_lat not between v_bbox[2] and v_bbox[4] then
        v_err := v_err || '{"location":"out_of_service_area"}';
      else
        v_new.base_area := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
      end if;
    end if;
  end if;

  if p_payload ? 'base_area_label' then
    if jsonb_typeof(p_payload -> 'base_area_label') not in ('string', 'null')
       or char_length(btrim(p_payload ->> 'base_area_label')) > 120 then
      v_err := v_err || '{"base_area_label":"≤ 120 chars or null"}';
    else
      v_new.base_area_label := p_payload ->> 'base_area_label';
    end if;
  end if;

  if p_payload ? 'availability_note' then
    if jsonb_typeof(p_payload -> 'availability_note') not in ('string', 'null')
       or char_length(btrim(p_payload ->> 'availability_note')) > 300 then
      v_err := v_err || '{"availability_note":"≤ 300 chars or null"}';
    else
      v_new.availability_note := p_payload ->> 'availability_note';
    end if;
  end if;

  if v_err <> '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = v_err::text;
  end if;

  insert into public.volunteer_profiles as vp (user_id, vehicle, capacity_kg, base_area, base_area_label, availability_note)
  values (v_uid, v_new.vehicle, v_new.capacity_kg, v_new.base_area, v_new.base_area_label, v_new.availability_note)
  on conflict (user_id) do update
     set vehicle = excluded.vehicle, capacity_kg = excluded.capacity_kg, base_area = excluded.base_area,
         base_area_label = excluded.base_area_label, availability_note = excluded.availability_note;

  -- keys only: the area is personal data and stays out of audit_logs
  perform private.audit(
    p_action      => case when v_found then 'volunteer_profile.update' else 'volunteer_profile.create' end,
    p_entity_type => 'volunteer_profile',
    p_entity_id   => v_uid,
    p_after       => jsonb_build_object('keys', (select jsonb_agg(k order by k) from jsonb_object_keys(p_payload) k)));
end;
$$;

comment on function public.upsert_volunteer_profile(jsonb) is
  'The caller''s own volunteer profile: vehicle, capacity_kg (1–500), lat+lng (snapped to 0.01°, inside service_area_bbox; both null clears), base_area_label, availability_note. Unknown keys => PT422. Audited without values.';

-- ===========================================================================
-- 5. assign_pickup — new trips (P2) + re-planning an existing trip (p_plan.pickup_id, §6.5
--    planned → assigned, US-CHA-16 AC4). Unchanged behaviour for new trips.
-- ===========================================================================
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
  v_existing  uuid;
  p           public.pickups%rowtype;
  v_stops     jsonb;
  e           jsonb;
  v_route     extensions.geometry;
  v_start     timestamptz;
  v_stop_id   uuid;
  v_unknown   text[];
  v_red       boolean;
  v_removed   record;
  v_detached  integer := 0;
  v_changed   boolean;
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
    v_existing := private.try_uuid(p_plan ->> 'pickup_id');
    if v_existing is null then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"pickup_id":"uuid"}';
    end if;
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

  -- lock the allocations (ORDER BY id) — for a re-plan also those currently on the trip — then the trip
  perform 1 from public.allocations al
  where al.id = any (v_ids) or (v_existing is not null and al.pickup_id = v_existing)
  order by al.id for update;

  if v_existing is not null then
    select * into p from public.pickups pk where pk.id = v_existing for update;
    if not found or p.charity_org_id <> v_cs.org_id then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    if p.charity_site_id <> v_cs.id then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"pickup_id":"other_receiving_site"}';
    end if;
    if p.status not in ('planned', 'assigned')
       or exists (select 1 from public.handovers h where h.pickup_id = p.id and h.consumed_at is not null) then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'trip_started';
    end if;
  end if;

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
    if not ((a.status = 'confirmed' and a.pickup_id is null)
            or (v_existing is not null and a.status = 'assigned' and a.pickup_id = v_existing)) then
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

  -- N-14: urgent when the trip carries a red lot
  v_red := exists (select 1 from public.allocations al
                   join public.offers o on o.id = al.offer_id
                   join public.food_categories fc on fc.code = o.category_code
                   where al.id = any (v_ids) and public.freshness_label(o.effective_deadline, fc.perishability, v_now) = 'red');

  if v_existing is null then
    -- ---------------------------------------------------------------- new trip
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
                           'mode', v_mode),
        case when v_red then 'urgent' else 'normal' end);
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
  end if;

  -- ------------------------------------------------------------------ re-plan of trip p
  v_pickup := p.id;
  v_changed := (select array_agg(al.id order by al.id) from public.allocations al
                where al.pickup_id = p.id and al.status = 'assigned') is distinct from v_ids;

  -- allocations leaving the trip go back to confirmed (their quantities stay reserved)
  update public.allocations
     set status = 'confirmed', pickup_id = null, stop_id = null, assigned_at = null
   where pickup_id = p.id and status = 'assigned' and not (id = any (v_ids));
  get diagnostics v_detached = row_count;

  -- pickup stops whose store site leaves the plan: their store is told, their unconsumed handover
  -- (if one was issued) is dropped, the stop is deleted
  for v_removed in
    select st.id, st.site_id from public.pickup_stops st
    where st.pickup_id = p.id and st.kind = 'pickup' and not (st.site_id = any (v_sites))
    order by st.id
    for update
  loop
    if exists (select 1 from public.incidents i join public.handovers h on h.id = i.handover_id where h.stop_id = v_removed.id) then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'stop_has_incident';
    end if;
    delete from public.handovers h where h.stop_id = v_removed.id and h.consumed_at is null;
    update public.allocations set stop_id = null where stop_id = v_removed.id;
    delete from public.pickup_stops where id = v_removed.id;
    perform private.enqueue('pickup_cancelled', 'pickup', p.id, 'pickup_cancelled:' || p.id || ':stop:' || v_removed.id,
      jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'scope', 'stop',
                         'stop_id', v_removed.id, 'site_id', v_removed.site_id, 'reason', 'replanned'));
  end loop;

  -- kept stops are re-sequenced (seq is UNIQUE DEFERRABLE: deferred here, checked right after the
  -- loop), new ones inserted; a previously skipped stop that is back in the plan becomes pending again
  set constraints public.pickup_stops_seq_uq deferred;
  for e in select x from jsonb_array_elements(v_stops) x loop
    update public.pickup_stops
       set seq = (e ->> 'seq')::smallint,
           eta = coalesce(private.try_timestamptz(e ->> 'eta'), eta),
           status = case when status = 'skipped' then 'pending'::public.stop_status else status end,
           skip_reason = case when status = 'skipped' then null else skip_reason end
     where pickup_id = p.id and site_id = (e ->> 'site_id')::uuid and kind = (e ->> 'kind')::public.handover_kind
    returning id into v_stop_id;
    if v_stop_id is null then
      insert into public.pickup_stops (pickup_id, seq, kind, site_id, eta)
      values (p.id, (e ->> 'seq')::smallint, (e ->> 'kind')::public.handover_kind, (e ->> 'site_id')::uuid,
              private.try_timestamptz(e ->> 'eta'))
      returning id into v_stop_id;
      v_changed := true;
    end if;
    if e ->> 'kind' = 'pickup' then
      update public.allocations
         set status = 'assigned', pickup_id = p.id, stop_id = v_stop_id,
             assigned_at = case when status = 'assigned' then assigned_at else v_now end
       where id = any (v_ids) and store_site_id = (e ->> 'site_id')::uuid;
    end if;
    v_stop_id := null;
  end loop;
  set constraints public.pickup_stops_seq_uq immediate;

  update public.pickups
     set mode = v_mode,
         assignee_user_id = v_assignee,
         status = case when v_assignee is not null then 'assigned'::public.pickup_status else 'planned'::public.pickup_status end,
         accepted_at = case when v_assignee is not distinct from p.assignee_user_id then accepted_at end,
         planned_start_at = coalesce(v_start, planned_start_at),
         route = case when v_route is not null then v_route when v_changed then null else route end,
         route_distance_m = case when v_route is not null then (p_plan -> 'route' ->> 'distance_m')::numeric::integer
                                 when v_changed then null else route_distance_m end,
         route_duration_s = case when v_route is not null then (p_plan -> 'route' ->> 'duration_s')::numeric::integer
                                 when v_changed then null else route_duration_s end,
         route_provider = case when v_route is not null then p_plan -> 'route' ->> 'provider'
                               when v_changed then null else route_provider end,
         route_computed_at = case when v_route is not null then v_now when v_changed then null else route_computed_at end,
         last_location = case when v_assignee is not distinct from p.assignee_user_id then last_location end,
         last_location_at = case when v_assignee is not distinct from p.assignee_user_id then last_location_at end,
         last_location_accuracy_m = case when v_assignee is not distinct from p.assignee_user_id then last_location_accuracy_m end
   where id = p.id;

  if p.assignee_user_id is not null and p.assignee_user_id is distinct from v_assignee then
    perform private.enqueue('pickup_cancelled', 'pickup', p.id,
      'pickup_cancelled:' || p.id || ':unassigned:' || p.assignee_user_id || ':' || p_client_op_id,
      jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'scope', 'unassigned',
                         'user_id', p.assignee_user_id, 'reason', 'replanned'));
  end if;
  if v_assignee is not null then
    perform private.enqueue('pickup_assigned', 'pickup', p.id,
      'pickup_assigned:' || p.id || ':' || v_assignee || ':' || p_client_op_id,
      jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'assignee_user_id', v_assignee,
                         'mode', v_mode, 'replanned', v_assignee is not distinct from p.assignee_user_id),
      case when v_red then 'urgent' else 'normal' end);
  end if;

  perform private.audit(
    p_action       => 'pickup.replan',
    p_entity_type  => 'pickup',
    p_entity_id    => p.id,
    p_org_id       => v_cs.org_id,
    p_before       => jsonb_build_object('status', p.status, 'mode', p.mode, 'assigned', p.assignee_user_id is not null),
    p_after        => jsonb_build_object('mode', v_mode, 'allocation_ids', to_jsonb(v_ids), 'detached', v_detached,
                                         'stops', cardinality(v_sites) + 1, 'assigned', v_assignee is not null,
                                         'assignee_changed', v_assignee is distinct from p.assignee_user_id),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(p.id));
  return p.id;
end;
$$;

comment on function public.assign_pickup(jsonb, uuid) is
  'Charity owner/manager/staff. New trip: confirmed allocations of one receiving site -> assigned; p_plan {allocation_ids[], mode volunteer|self, charity_site_id, assignee_user_id?, planned_start_at?, stops?[{site_id, seq, kind, eta?}], route?}. Re-plan (pickup_id): trip planned/assigned without handover; allocation_ids = the new set (others back to confirmed), stops rebuilt, assignee set/replaced/cleared (accepted_at reset, location cleared), route kept unless the stops changed. Outbox pickup_assigned (urgent with a red lot) / pickup_cancelled (unassigned volunteer, dropped stops). Returns pickup_id.';

-- ===========================================================================
-- 6. Volunteer trip RPCs (§6.5)
-- ===========================================================================

-- assigned: accept (accepted_at) or decline (→ planned, assignee cleared). Assignee only.
create or replace function public.respond_pickup(p_pickup_id uuid, p_accept boolean, p_reason text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_reason text := nullif(btrim(p_reason), '');
  v_now    timestamptz := private.now();
  p        public.pickups%rowtype;
begin
  if private.idem_claim(p_client_op_id, 'respond_pickup',
       private.idem_hash(jsonb_build_object('pickup_id', p_pickup_id, 'accept', p_accept, 'reason', p_reason))) is not null then
    return;
  end if;

  if p_accept is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_accept":"required"}';
  end if;

  select * into p from public.pickups pk where pk.id = p_pickup_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if not coalesce(p.assignee_user_id = v_uid and private.is_active_org_member(p.charity_org_id), false) then
    perform private.raise_trip_access(p.id);
  end if;

  if p.status <> 'assigned' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  if p_accept then
    if p.accepted_at is not null then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'already_accepted';
    end if;
    update public.pickups set accepted_at = v_now where id = p.id;
    perform private.enqueue('volunteer_accepted', 'pickup', p.id, 'volunteer_accepted:' || p.id || ':' || v_uid,
      jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'assignee_user_id', v_uid));
    perform private.audit(
      p_action       => 'pickup.accept',
      p_entity_type  => 'pickup',
      p_entity_id    => p.id,
      p_org_id       => p.charity_org_id,
      p_after        => '{"accepted":true}',
      p_client_op_id => p_client_op_id);
  else
    if v_reason is null or char_length(v_reason) > 300 then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_reason":"required, ≤ 300 chars"}';
    end if;
    update public.pickups
       set status = 'planned', assignee_user_id = null, accepted_at = null,
           last_location = null, last_location_at = null, last_location_accuracy_m = null
     where id = p.id;
    -- the reason stays in audit_logs (payload: ids only)
    perform private.enqueue('volunteer_declined', 'pickup', p.id, 'volunteer_declined:' || p.id || ':' || p_client_op_id,
      jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'assignee_user_id', v_uid));
    perform private.audit(
      p_action       => 'pickup.decline',
      p_entity_type  => 'pickup',
      p_entity_id    => p.id,
      p_org_id       => p.charity_org_id,
      p_before       => '{"status":"assigned"}',
      p_after        => '{"status":"planned"}',
      p_reason       => v_reason,
      p_client_op_id => p_client_op_id);
  end if;

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.respond_pickup(uuid, boolean, text, uuid) is
  'Assignee of an assigned trip: accept (accepted_at; outbox volunteer_accepted) or decline with a reason (trip -> planned, assignee cleared; outbox volunteer_declined, reason only in audit_logs).';

-- assigned (or self planned) -> in_progress. Consent location_trip is NOT required (§6.5).
create or replace function public.start_pickup(p_pickup_id uuid, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_now timestamptz := private.now();
  p     public.pickups%rowtype;
begin
  if private.idem_claim(p_client_op_id, 'start_pickup',
       private.idem_hash(jsonb_build_object('pickup_id', p_pickup_id))) is not null then
    return;
  end if;

  select * into p from public.pickups pk where pk.id = p_pickup_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if not private.is_trip_carrier(p.id) then
    perform private.raise_trip_access(p.id);
  end if;

  if not (p.status = 'assigned' or (p.mode = 'self' and p.status = 'planned')) then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  update public.pickups
     set status = 'in_progress', started_at = v_now, accepted_at = coalesce(accepted_at, v_now)
   where id = p.id;

  perform private.enqueue('pickup_started', 'pickup', p.id, 'pickup_started:' || p.id,
    jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id));
  perform private.audit(
    p_action       => 'pickup.start',
    p_entity_type  => 'pickup',
    p_entity_id    => p.id,
    p_org_id       => p.charity_org_id,
    p_before       => jsonb_build_object('status', p.status),
    p_after        => '{"status":"in_progress"}',
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.start_pickup(uuid, uuid) is
  'Carrier (assignee; self pickup: charity owner/manager/staff) starts the trip: assigned (self: planned) -> in_progress, accepted_at defaulted; outbox pickup_started (coordinators + stores, ETA only).';

-- Latest volunteer position (assignee, consent location_trip, in_progress, ≥ location_min_interval_seconds
-- apart). Rounded to 4 decimals, only the latest point is kept; stop ETAs recomputed. Never audited,
-- never in the outbox, never readable by stores (pickups RLS).
create or replace function public.update_pickup_progress(p_pickup_id uuid, p_lat float8, p_lng float8,
                                                         p_accuracy_m integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_now   timestamptz := private.now();
  v_min   numeric := greatest(1, private.setting_num('location_min_interval_seconds', 30));
  p       public.pickups%rowtype;
  v_point extensions.geography;
  v_etas  jsonb;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_lat = 'NaN'::float8 or p_lng = 'NaN'::float8 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"location":"lat -90..90, lng -180..180"}';
  end if;
  if p_accuracy_m is not null and p_accuracy_m not between 0 and 100000 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_accuracy_m":"0-100000"}';
  end if;

  select * into p from public.pickups pk where pk.id = p_pickup_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if not coalesce(p.assignee_user_id = v_uid and private.is_active_org_member(p.charity_org_id), false) then
    perform private.raise_trip_access(p.id);
  end if;
  if not private.has_consent(v_uid, 'location_trip') then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'consent_required';
  end if;
  if p.status <> 'in_progress' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if p.last_location_at is not null and v_now < p.last_location_at + v_min * interval '1 second' then
    raise exception using errcode = 'PT429', message = 'rate_limited',
      hint = greatest(1, ceil(extract(epoch from (p.last_location_at + v_min * interval '1 second' - v_now))))::integer::text;
  end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(round(p_lng::numeric, 4)::float8, round(p_lat::numeric, 4)::float8),
                                   4326)::extensions.geography;
  update public.pickups
     set last_location = v_point, last_location_at = v_now, last_location_accuracy_m = p_accuracy_m
   where id = p.id;

  v_etas := private.recompute_etas(p.id, v_point, v_now);
  return jsonb_build_object('etas', v_etas);
end;
$$;

comment on function public.update_pickup_progress(uuid, float8, float8, integer) is
  'Assignee of an in_progress trip with an active location_trip consent sends the latest point (rounded to 4 decimals; only the latest is kept) at most every location_min_interval_seconds (PT429 rate_limited, hint = seconds). Recomputes pending stop ETAs. Returns {etas:[{stop_id, eta}]}. PT403 not_authorized detail consent_required without consent.';

-- Check-in at a stop: geofence against the site''s EXACT location (server side). Outside the fence
-- without a reason => {arrived:false, distance_m} and nothing changes (the app asks for a reason);
-- with p_reason => arrived (manual); without coordinates => arrived (no_location, reason optional).
create or replace function public.check_in_stop(p_stop_id uuid, p_lat float8, p_lng float8, p_client_op_id uuid,
                                                p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_resp   jsonb;
  v_now    timestamptz := private.now();
  v_reason text := nullif(btrim(p_reason), '');
  v_fence  numeric := private.setting_num('geofence_m', 100);
  s        public.pickup_stops%rowtype;
  p        public.pickups%rowtype;
  v_site   public.sites%rowtype;
  v_dist   integer;
  v_check  text;
begin
  v_resp := private.idem_claim(p_client_op_id, 'check_in_stop', private.idem_hash(jsonb_build_object(
    'stop_id', p_stop_id, 'lat', p_lat, 'lng', p_lng, 'reason', p_reason)));
  if v_resp is not null then
    return v_resp;
  end if;

  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180
                                or p_lat = 'NaN'::float8 or p_lng = 'NaN'::float8)) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"location":"lat and lng together, or both null"}';
  end if;
  if char_length(v_reason) > 200 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_reason":"≤ 200 chars"}';
  end if;

  select * into s from public.pickup_stops st where st.id = p_stop_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if not coalesce(private.is_trip_carrier(s.pickup_id), false) then
    perform private.raise_trip_access(s.pickup_id, s.id);
  end if;

  select * into p from public.pickups pk where pk.id = s.pickup_id for update;
  select * into s from public.pickup_stops st where st.id = p_stop_id for update;

  if not (p.status = 'in_progress' or (p.mode = 'self' and p.status in ('planned', 'assigned'))) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'trip_not_started';
  end if;
  if s.status <> 'pending' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if s.kind = 'dropoff' and exists (select 1 from public.pickup_stops st
                                    where st.pickup_id = p.id and st.kind = 'pickup' and st.status in ('pending', 'arrived')) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'pickups_pending';
  end if;

  select * into v_site from public.sites si where si.id = s.site_id;
  if p_lat is not null then
    v_dist := round(extensions.st_distance(v_site.location,
                      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography))::integer;
    if v_dist <= v_fence then
      v_check := 'geofence';
    elsif v_reason is null then
      v_resp := jsonb_build_object('arrived', false, 'distance_m', v_dist, 'reason_required', true);
      perform private.idem_store(p_client_op_id, v_resp);
      return v_resp;
    else
      v_check := 'manual';
    end if;
  else
    v_check := 'no_location';
  end if;

  update public.pickup_stops
     set status = 'arrived', arrived_at = v_now, arrival_check = v_check, arrival_note = v_reason
   where id = s.id;

  -- the next stops' ETAs restart from this stop (exact site location, server side)
  perform private.recompute_etas(p.id, v_site.location, v_now);

  perform private.enqueue('volunteer_checked_in', 'pickup', p.id, 'volunteer_checked_in:' || s.id,
    jsonb_build_object('pickup_id', p.id, 'stop_id', s.id, 'site_id', s.site_id, 'kind', s.kind,
                       'charity_org_id', p.charity_org_id, 'verified', v_check = 'geofence'));
  perform private.audit(
    p_action       => 'stop.check_in',
    p_entity_type  => 'pickup_stop',
    p_entity_id    => s.id,
    p_org_id       => p.charity_org_id,
    p_after        => jsonb_build_object('status', 'arrived', 'check', v_check),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  v_resp := jsonb_build_object('arrived', true, 'distance_m', v_dist, 'check', v_check);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.check_in_stop(uuid, float8, float8, uuid, text) is
  'Carrier checks in at a pending stop of a started trip (self pickups: any time). Geofence = app_settings.geofence_m from the EXACT site location. Returns {arrived, distance_m, check}: outside without p_reason => {arrived:false, distance_m, reason_required:true} (no change); with p_reason => manual; no coordinates => no_location. Outbox volunteer_checked_in; next ETAs recomputed. No coordinate is stored.';

-- C6: the carrier or a coordinator skips a pickup stop not handed over yet; its allocations go back to
-- confirmed (quantities kept). The trip is refreshed (nothing left => cancelled).
create or replace function public.skip_stop(p_stop_id uuid, p_reason text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_reason text := nullif(btrim(p_reason), '');
  s        public.pickup_stops%rowtype;
  p        public.pickups%rowtype;
  v_n      integer;
begin
  if private.idem_claim(p_client_op_id, 'skip_stop',
       private.idem_hash(jsonb_build_object('stop_id', p_stop_id, 'reason', p_reason))) is not null then
    return;
  end if;

  if v_reason is null or char_length(v_reason) > 300 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_reason":"required, ≤ 300 chars"}';
  end if;

  select * into s from public.pickup_stops st where st.id = p_stop_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  select * into p from public.pickups pk where pk.id = s.pickup_id;
  if not (coalesce(private.is_trip_carrier(p.id), false)
          or private.can_access_site(p.charity_site_id, '{owner,manager,staff}')) then
    perform private.raise_trip_access(p.id, s.id);
  end if;
  if s.kind <> 'pickup' then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'dropoff_stop';
  end if;

  -- lock order: allocations of the stop → pickup → stop
  perform 1 from public.allocations al where al.stop_id = s.id and al.status = 'assigned' order by al.id for update;
  select * into p from public.pickups pk where pk.id = s.pickup_id for update;
  select * into s from public.pickup_stops st where st.id = p_stop_id for update;

  if p.status not in ('planned', 'assigned', 'in_progress') or s.status not in ('pending', 'arrived') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  update public.allocations
     set status = 'confirmed', pickup_id = null, stop_id = null, assigned_at = null
   where stop_id = s.id and status = 'assigned';
  get diagnostics v_n = row_count;

  update public.pickup_stops set status = 'skipped', skip_reason = v_reason where id = s.id;

  perform private.enqueue('pickup_cancelled', 'pickup', p.id, 'pickup_cancelled:' || p.id || ':stop:' || s.id,
    jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'scope', 'stop',
                       'stop_id', s.id, 'site_id', s.site_id, 'reason', 'stop_skipped'));
  perform private.audit(
    p_action       => 'stop.skip',
    p_entity_type  => 'pickup_stop',
    p_entity_id    => s.id,
    p_org_id       => p.charity_org_id,
    p_before       => jsonb_build_object('status', s.status),
    p_after        => jsonb_build_object('status', 'skipped', 'allocations_back_to_confirmed', v_n),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.refresh_pickup(p.id);
  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.skip_stop(uuid, text, uuid) is
  'C6: carrier or charity coordinator (owner/manager/staff) skips a pending/arrived pickup stop (reason required): its assigned allocations -> confirmed (quantities kept), stop skipped, outbox pickup_cancelled scope stop (store + coordinators), trip refreshed.';

-- C5: charity owner/manager (or admin aal2) cancels a trip before any pickup handover: assigned
-- allocations -> confirmed (quantities kept), pending/arrived stops skipped, location cleared.
create or replace function public.cancel_pickup(p_pickup_id uuid, p_reason text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_reason text := nullif(btrim(p_reason), '');
  v_now    timestamptz := private.now();
  p        public.pickups%rowtype;
  v_actor  text;
  v_n      integer;
begin
  if private.idem_claim(p_client_op_id, 'cancel_pickup',
       private.idem_hash(jsonb_build_object('pickup_id', p_pickup_id, 'reason', p_reason))) is not null then
    return;
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_reason":"required, ≤ 500 chars"}';
  end if;

  select * into p from public.pickups pk where pk.id = p_pickup_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if private.can_access_site(p.charity_site_id, '{owner,manager}') then
    v_actor := 'charity';
  elsif private.is_admin() then
    v_actor := 'admin';
  elsif private.caller_org_role(p.charity_org_id) is null
        and exists (select 1 from public.profiles pr where pr.id = v_uid and pr.platform_role = 'admin' and pr.deleted_at is null) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  else
    perform private.raise_trip_access(p.id);
  end if;

  -- lock order: allocations of the trip → pickup → stops
  perform 1 from public.allocations al where al.pickup_id = p.id order by al.id for update;
  select * into p from public.pickups pk where pk.id = p_pickup_id for update;

  if p.status not in ('planned', 'assigned', 'in_progress') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if exists (select 1 from public.handovers h where h.pickup_id = p.id and h.kind = 'pickup' and h.consumed_at is not null) then
    -- C10: once goods left a store the trip cannot be cancelled (report_incident instead)
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'goods_picked_up';
  end if;

  update public.allocations
     set status = 'confirmed', pickup_id = null, stop_id = null, assigned_at = null
   where pickup_id = p.id and status = 'assigned';
  get diagnostics v_n = row_count;

  update public.pickup_stops
     set status = 'skipped', skip_reason = 'trip_cancelled'
   where pickup_id = p.id and status in ('pending', 'arrived');

  update public.pickups
     set status = 'cancelled', cancelled_at = v_now, cancel_reason = v_reason,
         last_location = null, last_location_at = null, last_location_accuracy_m = null
   where id = p.id;

  perform private.enqueue('pickup_cancelled', 'pickup', p.id, 'pickup_cancelled:' || p.id,
    jsonb_build_object('pickup_id', p.id, 'charity_org_id', p.charity_org_id, 'reason', 'cancelled',
                       'cancel_actor', v_actor),
    case when p.status = 'in_progress' then 'urgent' else 'normal' end);
  perform private.audit(
    p_action       => 'pickup.cancel',
    p_entity_type  => 'pickup',
    p_entity_id    => p.id,
    p_org_id       => p.charity_org_id,
    p_before       => jsonb_build_object('status', p.status),
    p_after        => jsonb_build_object('status', 'cancelled', 'allocations_back_to_confirmed', v_n, 'actor', v_actor),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.cancel_pickup(uuid, text, uuid) is
  'C5 (volunteer no-show etc.): charity owner/manager with site access, or admin aal2, cancels a planned/assigned/in_progress trip without any consumed pickup handover (PT409 goods_picked_up otherwise). Reason required. Allocations -> confirmed, stops skipped, location cleared, outbox pickup_cancelled (urgent while in_progress).';

-- Contacts of the trip parties with masked phones. Charity side (coordinators, assignee): carrier,
-- charity, every store of the trip. Store of a pickup stop: carrier + charity. Admin aal2: all.
create or replace function public.get_pickup_contacts(p_pickup_id uuid)
returns table (role text, display_name text, phone_masked text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p         public.pickups%rowtype;
  v_charity boolean;
  v_store   boolean;
  v_admin   boolean := private.is_admin();
begin
  perform private.require_uid();
  select * into p from public.pickups pk where pk.id = p_pickup_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  v_charity := coalesce(private.can_see_pickup(p.id), false);
  v_store := exists (select 1 from public.pickup_stops st
                     where st.pickup_id = p.id and st.kind = 'pickup'
                       and private.can_access_site(st.site_id, '{owner,manager,staff}'));
  if not (v_charity or v_store or v_admin) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  return query
    select case when p.mode = 'volunteer' then 'volunteer' else 'carrier' end,
           pr.full_name, private.mask_phone(pr.phone)
    from public.profiles pr
    where pr.id = p.assignee_user_id and pr.deleted_at is null
    union all
    select 'charity', o.name, private.mask_phone(os.contact_phone)
    from public.organizations o
    left join public.org_sensitive os on os.org_id = o.id
    where o.id = p.charity_org_id
    union all
    select 'store', so.name || ' — ' || si.name, private.mask_phone(os.contact_phone)
    from public.pickup_stops st
    join public.sites si on si.id = st.site_id
    join public.organizations so on so.id = si.org_id
    left join public.org_sensitive os on os.org_id = so.id
    where st.pickup_id = p.id and st.kind = 'pickup' and (v_charity or v_admin);
end;
$$;

comment on function public.get_pickup_contacts(uuid) is
  'Trip contacts with masked phones (first/last 3 digits): role volunteer|carrier (assignee), charity (org contact), store (org — site, only for the charity side and admin). Callers: coordinators/assignee, stores with a pickup stop on the trip, admin aal2; others PT404.';

-- ===========================================================================
-- 7. Incidents (§2.3 incidents, §6.4 C10, PRD US-VOL-13, US-CHA-38)
-- ===========================================================================
-- p_refs: {offer_id?, allocation_id?, pickup_id?, handover_id?} (proof_id arrives with P4). The caller
-- must be a party of every reference (store side: owner/manager/staff of the store site; charity side:
-- coordinator of the receiving site or the trip assignee). Reporter org = caller's side, subject org =
-- the other side when known. kind 'other' may come without references (reporter = an approved org
-- of the caller). Outbox incident_opened (admins, subject org, trip coordinators); urgent for
-- food_safety / no_show or a running trip.
create or replace function public.report_incident(p_kind public.incident_kind, p_description text, p_refs jsonb,
                                                  p_client_op_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_uid();
  v_resp      jsonb;
  v_desc      text := btrim(p_description);
  v_refs      jsonb := coalesce(p_refs, '{}'::jsonb);
  v_bad       text[];
  v_offer     uuid;
  v_alloc     uuid;
  v_pickup    uuid;
  v_handover  uuid;
  v_any       boolean := false;
  v_s_side    boolean := true;
  v_c_side    boolean := true;
  v_s_ok      boolean;
  v_c_ok      boolean;
  v_store     uuid;
  v_charity   uuid;
  v_reporter  uuid;
  v_subject   uuid;
  v_trip      uuid;
  a           public.allocations%rowtype;
  o           public.offers%rowtype;
  p           public.pickups%rowtype;
  h           public.handovers%rowtype;
  v_site      public.sites%rowtype;
  v_id        uuid := gen_random_uuid();
  v_urgent    boolean;
begin
  v_resp := private.idem_claim(p_client_op_id, 'report_incident', private.idem_hash(jsonb_build_object(
    'kind', p_kind, 'description', p_description, 'refs', p_refs)));
  if v_resp is not null then
    return (v_resp #>> '{}')::uuid;
  end if;

  if p_kind is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_kind":"required"}';
  end if;
  if v_desc is null or char_length(v_desc) not between 10 and 2000 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_description":"10-2000 chars"}';
  end if;
  if jsonb_typeof(v_refs) <> 'object' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_refs":"object"}';
  end if;
  if v_refs ? 'proof_id' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_refs":{"proof_id":"not_supported_yet"}}';
  end if;
  select array_agg(k order by k) into v_bad from jsonb_object_keys(v_refs) k
  where k not in ('offer_id', 'allocation_id', 'pickup_id', 'handover_id')
     or (jsonb_typeof(v_refs -> k) <> 'null' and private.try_uuid(v_refs ->> k) is null);
  if v_bad is not null then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('p_refs', 'unknown_or_invalid', 'keys', to_jsonb(v_bad))::text;
  end if;
  v_offer := private.try_uuid(v_refs ->> 'offer_id');
  v_alloc := private.try_uuid(v_refs ->> 'allocation_id');
  v_pickup := private.try_uuid(v_refs ->> 'pickup_id');
  v_handover := private.try_uuid(v_refs ->> 'handover_id');

  -- parties of each reference (PT404 when the caller is a party of none: no existence leak)
  if v_alloc is not null then
    select * into a from public.allocations x where x.id = v_alloc;
    if not found then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    v_s_ok := private.can_access_site(a.store_site_id, '{owner,manager,staff}');
    v_c_ok := private.can_access_site(a.charity_site_id, '{owner,manager,staff}')
              or (a.pickup_id is not null and private.is_pickup_assignee(a.pickup_id));
    if not (v_s_ok or v_c_ok) then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    v_s_side := v_s_side and v_s_ok;
    v_c_side := v_c_side and v_c_ok;
    v_store := a.store_org_id;
    v_charity := a.charity_org_id;
    v_trip := a.pickup_id;
    v_any := true;
  end if;

  if v_handover is not null then
    select * into h from public.handovers x where x.id = v_handover;
    if not found then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    select * into v_site from public.sites si where si.id = (select st.site_id from public.pickup_stops st where st.id = h.stop_id);
    v_c_ok := coalesce(private.can_see_pickup(h.pickup_id), false);
    v_s_ok := h.kind = 'pickup' and private.can_access_site(v_site.id, '{owner,manager,staff}');
    if not (v_s_ok or v_c_ok) then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    v_s_side := v_s_side and v_s_ok;
    v_c_side := v_c_side and v_c_ok;
    v_charity := coalesce(v_charity, (select pk.charity_org_id from public.pickups pk where pk.id = h.pickup_id));
    if h.kind = 'pickup' then
      v_store := coalesce(v_store, v_site.org_id);
    end if;
    v_trip := coalesce(v_trip, h.pickup_id);
    v_any := true;
  end if;

  if v_offer is not null then
    select * into o from public.offers x where x.id = v_offer;
    if not found or o.status = 'draft' then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    v_s_ok := private.can_access_site(o.site_id, '{owner,manager,staff}');
    v_c_ok := private.offer_allocated_to_me(o.id) or private.offer_in_my_trip(o.id);
    if not (v_s_ok or v_c_ok) then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    v_s_side := v_s_side and v_s_ok;
    v_c_side := v_c_side and v_c_ok;
    v_store := coalesce(v_store, o.org_id);
    v_any := true;
  end if;

  if v_pickup is not null then
    select * into p from public.pickups x where x.id = v_pickup;
    if not found then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    v_c_ok := coalesce(private.can_see_pickup(p.id), false);
    v_s_ok := exists (select 1 from public.pickup_stops st
                      where st.pickup_id = p.id and st.kind = 'pickup'
                        and private.can_access_site(st.site_id, '{owner,manager,staff}'));
    if not (v_s_ok or v_c_ok) then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    v_s_side := v_s_side and v_s_ok;
    v_c_side := v_c_side and v_c_ok;
    v_charity := coalesce(v_charity, p.charity_org_id);
    if v_s_ok and v_store is null then
      select si.org_id into v_store from public.pickup_stops st join public.sites si on si.id = st.site_id
      where st.pickup_id = p.id and st.kind = 'pickup' and private.can_access_site(st.site_id, '{owner,manager,staff}')
      order by st.seq limit 1;
    end if;
    v_trip := coalesce(v_trip, p.id);
    v_any := true;
  end if;

  if not v_any then
    if p_kind <> 'other' then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_refs":"required unless kind = other"}';
    end if;
    select m.org_id into v_reporter
    from public.org_members m
    join public.organizations og on og.id = m.org_id and og.status = 'approved'
    left join public.profiles pr on pr.id = m.user_id
    where m.user_id = v_uid and m.status = 'active'
    order by (m.org_id = pr.active_org_id) desc nulls last, m.created_at, m.org_id
    limit 1;
    if v_reporter is null then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
  elsif v_s_side and v_c_side then
    raise exception using errcode = 'PT403', message = 'ambiguous_actor';
  elsif v_s_side then
    v_reporter := v_store;
    v_subject := v_charity;
  elsif v_c_side then
    v_reporter := v_charity;
    v_subject := v_store;
  else
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_refs":"inconsistent_parties"}';
  end if;

  perform private.check_rate_limit('report_incident:user:' || v_uid::text, 20, interval '1 day');

  insert into public.incidents (id, kind, reporter_org_id, subject_org_id, offer_id, allocation_id, pickup_id,
                                handover_id, description, reported_by)
  values (v_id, p_kind, v_reporter, v_subject, v_offer, v_alloc, v_pickup, v_handover, v_desc, v_uid);

  v_urgent := p_kind in ('food_safety', 'no_show')
              or exists (select 1 from public.pickups pk where pk.id = v_trip and pk.status in ('assigned', 'in_progress'));
  perform private.enqueue('incident_opened', 'incident', v_id, 'incident_opened:' || v_id,
    jsonb_build_object('incident_id', v_id, 'kind', p_kind, 'reporter_org_id', v_reporter,
                       'subject_org_id', v_subject, 'pickup_id', v_trip),
    case when v_urgent then 'urgent' else 'normal' end);

  perform private.audit(
    p_action       => 'incident.report',
    p_entity_type  => 'incident',
    p_entity_id    => v_id,
    p_org_id       => v_reporter,
    p_after        => jsonb_build_object('kind', p_kind, 'subject_org_id', v_subject, 'offer_id', v_offer,
                                         'allocation_id', v_alloc, 'pickup_id', v_pickup, 'handover_id', v_handover),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_id));
  return v_id;
end;
$$;

comment on function public.report_incident(public.incident_kind, text, jsonb, uuid) is
  'Party of the referenced allocation/offer/trip/handover reports an incident (description 10–2000; refs required unless kind other; proof_id from P4). Reporter/subject orgs derived from the caller''s side (member of both => PT403 ambiguous_actor). Rate limit 20/day/user. Outbox incident_opened (urgent for food_safety/no_show or a running trip). Returns incident id.';

-- Admin aal2 (not a member of either org): open -> in_review | resolved | dismissed; in_review ->
-- resolved | dismissed. resolved = upheld => trust −5 for the subject org (incident_upheld).
create or replace function public.resolve_incident(p_incident_id uuid, p_status public.incident_status,
                                                   p_resolution text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_admin();
  v_res  text := nullif(btrim(p_resolution), '');
  v_now  timestamptz := private.now();
  i      public.incidents%rowtype;
begin
  if private.idem_claim(p_client_op_id, 'resolve_incident', private.idem_hash(jsonb_build_object(
       'incident_id', p_incident_id, 'status', p_status, 'resolution', p_resolution))) is not null then
    return;
  end if;

  if p_status is null or p_status not in ('in_review', 'resolved', 'dismissed') then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_status":"in_review|resolved|dismissed"}';
  end if;
  if (p_status in ('resolved', 'dismissed') and v_res is null) or char_length(v_res) > 2000 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_resolution":"required to resolve/dismiss, ≤ 2000 chars"}';
  end if;

  select * into i from public.incidents x where x.id = p_incident_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if i.reporter_org_id is not null then
    perform private.assert_not_self_dealing(i.reporter_org_id);
  end if;
  if i.subject_org_id is not null then
    perform private.assert_not_self_dealing(i.subject_org_id);
  end if;

  if not ((i.status = 'open' and p_status in ('in_review', 'resolved', 'dismissed'))
          or (i.status = 'in_review' and p_status in ('resolved', 'dismissed'))) then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  update public.incidents
     set status = p_status,
         resolution = coalesce(v_res, resolution),
         resolved_by = case when p_status in ('resolved', 'dismissed') then v_uid end,
         resolved_at = case when p_status in ('resolved', 'dismissed') then v_now end
   where id = i.id;

  if p_status = 'resolved' and i.subject_org_id is not null then
    perform private.apply_trust(i.subject_org_id, -5, 'incident_upheld', 'incident', i.id);
  end if;

  perform private.audit(
    p_action       => 'incident.resolve',
    p_entity_type  => 'incident',
    p_entity_id    => i.id,
    p_org_id       => i.subject_org_id,
    p_before       => jsonb_build_object('status', i.status),
    p_after        => jsonb_build_object('status', p_status, 'upheld', p_status = 'resolved'),
    p_reason       => v_res,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.resolve_incident(uuid, public.incident_status, text, uuid) is
  'Admin aal2, not a member/creator of the reporter or subject org: open -> in_review|resolved|dismissed, in_review -> resolved|dismissed (resolution required to close). resolved = upheld: trust −5 for the subject org (incident_upheld).';

-- ===========================================================================
-- 8. Function privileges (§8.8)
-- ===========================================================================
revoke all on function private.volunteer_profiles_before_write() from public, anon, authenticated;
revoke all on function private.can_see_volunteer(uuid) from public, anon, authenticated;
revoke all on function private.is_trip_carrier(uuid) from public, anon, authenticated;
revoke all on function private.raise_trip_access(uuid, uuid) from public, anon, authenticated;
revoke all on function private.recompute_etas(uuid, extensions.geography, timestamptz) from public, anon, authenticated;
revoke all on function private.mask_phone(text) from public, anon, authenticated;

revoke all on function public.upsert_volunteer_profile(jsonb) from public, anon, authenticated;
revoke all on function public.respond_pickup(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.start_pickup(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_pickup_progress(uuid, float8, float8, integer) from public, anon, authenticated;
revoke all on function public.check_in_stop(uuid, float8, float8, uuid, text) from public, anon, authenticated;
revoke all on function public.skip_stop(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_pickup(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.get_pickup_contacts(uuid) from public, anon, authenticated;
revoke all on function public.report_incident(public.incident_kind, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.resolve_incident(uuid, public.incident_status, text, uuid) from public, anon, authenticated;

-- RLS helper used inside the volunteer_profiles policy
grant execute on function private.can_see_volunteer(uuid) to authenticated, service_role;

grant execute on function public.upsert_volunteer_profile(jsonb) to authenticated;
grant execute on function public.respond_pickup(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.start_pickup(uuid, uuid) to authenticated;
grant execute on function public.update_pickup_progress(uuid, float8, float8, integer) to authenticated;
grant execute on function public.check_in_stop(uuid, float8, float8, uuid, text) to authenticated;
grant execute on function public.skip_stop(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_pickup(uuid, text, uuid) to authenticated;
grant execute on function public.get_pickup_contacts(uuid) to authenticated;
grant execute on function public.report_incident(public.incident_kind, text, jsonb, uuid) to authenticated;
grant execute on function public.resolve_incident(uuid, public.incident_status, text, uuid) to authenticated;

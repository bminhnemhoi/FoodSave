-- Migration 11a — needs_bundles (DATA-MODEL §2.3 needs/need_bundles, §4.6, §4.7, §6.2, §6.3, §7 C1/C2/C12,
-- §8.4, §9.2; ADR-007; PRD US-CHA-09…13, US-STO-12 AC3, US-STO-19; ROADMAP P3-01, P3-02, P3-04)
-- Tables needs / need_bundles exist since offers_allocations (P2) because allocations reference them.
-- RPCs:   publish_need, cancel_need, match_candidates, reserve_bundle.
-- Helpers: private.charity_cancel_allocation (C1/C2 shared by cancel_need), private.bundle_meta
--          (reserve_bundle p_meta), private.pre_score (ADR-007 §2, shared TS fixture),
--          private.offer_opened_notify_needs (trigger: bundle_options_ready).
-- Changed: private.bundle_visible — stores no longer read need_bundles (route / inputs_snapshot
--          reveal the receiving site of approximate/hidden charities; DATA-MODEL §9.2 note).
-- Needs close at needed_by through the existing cron job fs_expire_requests
-- (public.expire_stale_requests, migration offers_allocations) — nothing to add here.
-- Lock order (§6 rule 2): needs (ORDER BY id) → offers (ORDER BY id) → allocations (ORDER BY id) →
-- pickups → pickup_stops → handovers.

-- ===========================================================================
-- 1. need_bundles visibility (§9.2 deviation, documented in DATA-MODEL)
-- ===========================================================================
-- Charity owner/manager/staff with access to the need's receiving site. The store branch of P2 is
-- removed: need_bundles.route starts/ends at the charity site (exact pin) and inputs_snapshot lists
-- other stores' candidates; stores get their context from `needs` (need_supplied_by_me).
create or replace function private.bundle_visible(p_bundle uuid, p_need uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.needs n
                 where n.id = p_need and private.can_access_site(n.site_id, '{owner,manager,staff}'));
$$;

comment on function private.bundle_visible(uuid, uuid) is
  'need_bundles RLS: owner/manager/staff of the need''s charity with access to its receiving site (stores excluded: route/inputs_snapshot reveal the charity site).';

-- ===========================================================================
-- 2. Shared helpers
-- ===========================================================================

-- C1/C2 charity-side cancellation of one LOCKED allocation (caller holds need → offer → allocation
-- locks). Release while the lot is live (§4.5), −2 when the store had packed (C2), detach from the
-- trip, outbox allocation_cancelled (store + volunteer), audit. Returns the released quantity.
create or replace function private.charity_cancel_allocation(p_a public.allocations, p_reason text,
                                                             p_client_op_id uuid, p_cause text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v          public.offers%rowtype;
  v_now      timestamptz := private.now();
  v_released numeric := 0;
begin
  select * into v from public.offers where id = p_a.offer_id;

  update public.allocations
     set status = 'cancelled', closed_at = v_now, cancel_actor = 'charity', cancelled_by = auth.uid(),
         cancel_reason = p_reason
   where id = p_a.id;

  if p_a.pickup_id is not null then
    perform private.detach_allocation(p_a.id);
  end if;

  if v.effective_deadline > v_now then
    v_released := private.release_qty(p_a.id, p_a.qty_reserved - p_a.qty_released);
  end if;
  perform private.refresh_offer(p_a.offer_id);

  if p_a.status in ('confirmed', 'assigned') and p_a.packed_at is not null then
    perform private.apply_trust(p_a.charity_org_id, -2, 'charity_cancel_after_packed', 'allocation', p_a.id);
  end if;

  perform private.enqueue('allocation_cancelled', 'allocation', p_a.id, 'allocation_cancelled:' || p_a.id,
    private.alloc_payload(p_a, jsonb_build_object('cancel_actor', 'charity', 'attribution', 'charity',
                                                  'cause', p_cause)),
    case when p_a.status = 'assigned' then 'urgent' else 'normal' end);
  perform private.after_allocation_change(p_a, false);

  perform private.audit(
    p_action       => 'allocation.cancel',
    p_entity_type  => 'allocation',
    p_entity_id    => p_a.id,
    p_org_id       => p_a.charity_org_id,
    p_before       => jsonb_build_object('status', p_a.status),
    p_after        => jsonb_build_object('status', 'cancelled', 'cancel_actor', 'charity', 'cause', p_cause,
                                         'released', v_released),
    p_reason       => p_reason,
    p_client_op_id => p_client_op_id);

  return v_released;
end;
$$;

comment on function private.charity_cancel_allocation(public.allocations, text, uuid, text) is
  'C1/C2 on a locked allocation: cancelled (actor charity), released while the lot is live, −2 if packed, detached from its trip, outbox allocation_cancelled, audit. Internal.';

-- Validates + normalises reserve_bundle p_meta (§8.4). Defaults: option_rank 1, score 0,
-- est_distance_m / est_duration_s 0, algorithm_version match-v1, inputs_snapshot {}.
-- Returns the normalised object (route_geojson validated as a LineString). PT422 lists every error.
create or replace function private.bundle_meta(p_meta jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m        jsonb := coalesce(p_meta, '{}'::jsonb);
  v_err    jsonb := '{}'::jsonb;
  v_bad    text[];
  v_route  extensions.geometry;
  v_out    jsonb;
begin
  if jsonb_typeof(m) <> 'object' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_meta":"object_required"}';
  end if;

  select array_agg(k order by k) into v_bad from jsonb_object_keys(m) k
  where k not in ('option_rank', 'score', 'stop_count', 'est_distance_m', 'est_duration_s', 'route_geojson',
                  'route_provider', 'algorithm_version', 'inputs_snapshot', 'rematch_of');
  if v_bad is not null then
    v_err := v_err || jsonb_build_object('unknown_keys', to_jsonb(v_bad));
  end if;

  v_out := jsonb_build_object(
    'option_rank', 1, 'score', 0, 'est_distance_m', 0, 'est_duration_s', 0,
    'algorithm_version', 'match-v1', 'inputs_snapshot', '{}'::jsonb);

  if m ? 'option_rank' then
    if jsonb_typeof(m -> 'option_rank') is distinct from 'number' or (m ->> 'option_rank')::numeric not in (1, 2, 3) then
      v_err := v_err || '{"option_rank":"1|2|3"}';
    else
      v_out := v_out || jsonb_build_object('option_rank', (m ->> 'option_rank')::numeric::integer);
    end if;
  end if;

  if m ? 'score' then
    if jsonb_typeof(m -> 'score') is distinct from 'number' or (m ->> 'score')::numeric not between 0 and 1 then
      v_err := v_err || '{"score":"0..1"}';
    else
      v_out := v_out || jsonb_build_object('score', round((m ->> 'score')::numeric, 4));
    end if;
  end if;

  if m ? 'stop_count' then
    if jsonb_typeof(m -> 'stop_count') is distinct from 'number' or (m ->> 'stop_count')::numeric not between 1 and 5
       or (m ->> 'stop_count')::numeric <> trunc((m ->> 'stop_count')::numeric) then
      v_err := v_err || '{"stop_count":"1..5"}';
    else
      v_out := v_out || jsonb_build_object('stop_count', (m ->> 'stop_count')::numeric::integer);
    end if;
  end if;

  if m ? 'est_distance_m' then
    if jsonb_typeof(m -> 'est_distance_m') is distinct from 'number'
       or (m ->> 'est_distance_m')::numeric not between 0 and 10000000 then
      v_err := v_err || '{"est_distance_m":"0..10000000"}';
    else
      v_out := v_out || jsonb_build_object('est_distance_m', round((m ->> 'est_distance_m')::numeric)::integer);
    end if;
  end if;

  if m ? 'est_duration_s' then
    if jsonb_typeof(m -> 'est_duration_s') is distinct from 'number'
       or (m ->> 'est_duration_s')::numeric not between 0 and 10000000 then
      v_err := v_err || '{"est_duration_s":"0..10000000"}';
    else
      v_out := v_out || jsonb_build_object('est_duration_s', round((m ->> 'est_duration_s')::numeric)::integer);
    end if;
  end if;

  if m ? 'algorithm_version' then
    if jsonb_typeof(m -> 'algorithm_version') is distinct from 'string'
       or (m ->> 'algorithm_version') !~ '^match-v[0-9]{1,4}$' then
      v_err := v_err || '{"algorithm_version":"match-v<n>"}';
    else
      v_out := v_out || jsonb_build_object('algorithm_version', m ->> 'algorithm_version');
    end if;
  end if;

  if m ? 'inputs_snapshot' then
    if jsonb_typeof(m -> 'inputs_snapshot') not in ('object', 'array')
       or octet_length((m -> 'inputs_snapshot')::text) > 65536 then
      v_err := v_err || '{"inputs_snapshot":"object|array ≤ 64 KB"}';
    else
      v_out := v_out || jsonb_build_object('inputs_snapshot', m -> 'inputs_snapshot');
    end if;
  end if;

  if m ? 'rematch_of' and jsonb_typeof(m -> 'rematch_of') <> 'null' then
    if private.try_uuid(m ->> 'rematch_of') is null then
      v_err := v_err || '{"rematch_of":"uuid"}';
    else
      v_out := v_out || jsonb_build_object('rematch_of', m ->> 'rematch_of');
    end if;
  end if;

  if m ? 'route_geojson' and jsonb_typeof(m -> 'route_geojson') <> 'null' then
    begin
      v_route := extensions.st_setsrid(extensions.st_geomfromgeojson((m -> 'route_geojson')::text), 4326);
    exception when others then
      v_route := null;
    end;
    if v_route is null or extensions.geometrytype(v_route) <> 'LINESTRING'
       or coalesce(m ->> 'route_provider', '') not in ('goong', 'ors', 'aws', 'fake') then
      v_err := v_err || '{"route_geojson":"LineString with route_provider goong|ors|aws|fake"}';
    else
      v_out := v_out || jsonb_build_object('route_geojson', m -> 'route_geojson', 'route_provider', m ->> 'route_provider');
    end if;
  elsif m ? 'route_provider' and jsonb_typeof(m -> 'route_provider') <> 'null' then
    v_err := v_err || '{"route_provider":"only with route_geojson"}';
  end if;

  if v_err <> '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = v_err::text;
  end if;
  return v_out;
end;
$$;

comment on function private.bundle_meta(jsonb) is
  'Validate/normalise reserve_bundle p_meta {option_rank, score, stop_count, est_distance_m, est_duration_s, route_geojson + route_provider, algorithm_version, inputs_snapshot (≤ 64 KB), rematch_of}; PT422 validation_failed with every error.';

-- ADR-007 §2 pre_score = 0.4·u + 0.3·p + 0.1·t (no quantity fit yet), rounded to 4 decimals:
-- u = clamp(1 − hours_left / H(perishability), 0, 1) with H = 12 / 72 / 168 h (green threshold of the
-- label rules v1), p = clamp(1 − distance_km / radius_km, 0, 1), t = clamp(trust / 100, 0, 1).
-- Same fixture as src/core/matching/fixtures.json (preScore), pgTAP rpc/pre_score.test.sql.
create or replace function private.pre_score(p_deadline timestamptz, p_perishability public.perishability,
                                             p_at timestamptz, p_distance_km numeric, p_radius_km numeric,
                                             p_trust numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
           0.4 * greatest(0, least(1, 1 - (extract(epoch from (p_deadline - p_at)) / 3600.0)
                                          / case p_perishability when 'cooked' then 12 when 'fresh' then 72 else 168 end))
         + 0.3 * case when p_radius_km > 0 then greatest(0, least(1, 1 - p_distance_km / p_radius_km)) else 0 end
         + 0.1 * greatest(0, least(1, coalesce(p_trust, 0) / 100.0)),
         4);
$$;

comment on function private.pre_score(timestamptz, public.perishability, timestamptz, numeric, numeric, numeric) is
  'match_candidates pre_score (ADR-007 §2): round(0.4·urgency + 0.3·proximity + 0.1·trust, 4). Shares src/core/matching/fixtures.json (preScore).';

-- ===========================================================================
-- 3. publish_need (§6.2 tạo → open, §8.4; PRD US-CHA-09)
-- ===========================================================================
create or replace function public.publish_need(
  p_site_id         uuid,
  p_category_codes  text[],
  p_unit            public.unit_code,
  p_quantity        numeric,
  p_needed_by       timestamptz,
  p_people_to_serve integer,
  p_note            text,
  p_client_op_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_resp   jsonb;
  v_site   public.sites%rowtype;
  v_org    public.organizations%rowtype;
  v_now    timestamptz := private.now();
  v_err    jsonb := '{}'::jsonb;
  v_codes  text[];
  v_note   text := nullif(btrim(p_note), '');
  v_id     uuid := gen_random_uuid();
  v_urgent boolean;
begin
  v_resp := private.idem_claim(p_client_op_id, 'publish_need', private.idem_hash(jsonb_build_object(
    'site_id', p_site_id, 'category_codes', p_category_codes, 'unit', p_unit, 'quantity', p_quantity,
    'needed_by', p_needed_by, 'people_to_serve', p_people_to_serve, 'note', p_note)));
  if v_resp is not null then
    return (v_resp #>> '{}')::uuid;
  end if;

  -- who (PT404 before anything that depends on the site's kind or state)
  select * into v_site from public.sites s where s.id = p_site_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(p_site_id, '{owner,manager,staff}');
  select * into v_org from public.organizations o where o.id = v_site.org_id;
  if v_org.kind <> 'charity' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_site_id":"not_a_charity_site"}';
  end if;
  if v_org.is_paused then
    raise exception using errcode = 'PT403', message = 'org_not_active', detail = 'paused';
  end if;
  if not v_site.is_active then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_site_id":"inactive"}';
  end if;

  -- what (every field error at once)
  if p_category_codes is null or cardinality(p_category_codes) = 0 or array_position(p_category_codes, null) is not null then
    v_err := v_err || '{"p_category_codes":"1-3 codes"}';
  else
    -- de-duplicate keeping the caller's order
    v_codes := array(select x.c from unnest(p_category_codes) with ordinality x(c, i) group by x.c order by min(x.i));
    if cardinality(v_codes) > 3 then
      v_err := v_err || '{"p_category_codes":"1-3 codes"}';
    elsif exists (select 1 from unnest(v_codes) c
                  where not exists (select 1 from public.food_categories f where f.code = c and f.is_active)) then
      v_err := v_err || '{"p_category_codes":"unknown_or_inactive"}';
    elsif v_site.accepted_categories is not null and not (v_codes <@ v_site.accepted_categories) then
      v_err := v_err || '{"p_category_codes":"not_accepted_by_site"}';
    end if;
  end if;

  if p_unit is null then
    v_err := v_err || '{"p_unit":"required"}';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 999999 then
    v_err := v_err || '{"p_quantity":"> 0"}';
  elsif p_unit is not null and p_unit not in ('kg', 'liter') and p_quantity <> trunc(p_quantity) then
    v_err := v_err || '{"p_quantity":"integer_required"}';
  end if;

  if p_needed_by is null then
    v_err := v_err || '{"p_needed_by":"required"}';
  elsif p_needed_by <= v_now + interval '1 hour' then
    v_err := v_err || '{"p_needed_by":"min_1_hour"}';
  elsif p_needed_by > v_now + interval '7 days' then
    v_err := v_err || '{"p_needed_by":"max_7_days"}';
  end if;

  if p_people_to_serve is not null and p_people_to_serve not between 1 and 100000 then
    v_err := v_err || '{"p_people_to_serve":"1-100000"}';
  end if;
  if char_length(v_note) > 500 then
    v_err := v_err || '{"p_note":"≤ 500 chars"}';
  end if;

  if v_err <> '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = v_err::text;
  end if;

  perform private.check_rate_limit('publish_need:org:' || v_org.id::text, 30, interval '1 hour');

  insert into public.needs (id, org_id, site_id, category_codes, unit, quantity, needed_by, people_to_serve,
                            note, created_by)
  values (v_id, v_org.id, v_site.id, v_codes, p_unit, p_quantity, p_needed_by, p_people_to_serve, v_note, v_uid);

  -- PRD §10 N-06: urgent when needed within 4 hours
  v_urgent := p_needed_by <= v_now + interval '4 hours';
  perform private.enqueue('need_published', 'need', v_id, 'need_published:' || v_id,
    jsonb_build_object('need_id', v_id, 'org_id', v_org.id, 'site_id', v_site.id,
                       'category_codes', to_jsonb(v_codes), 'unit', p_unit, 'quantity', p_quantity,
                       'needed_by', p_needed_by),
    case when v_urgent then 'urgent' else 'normal' end);

  perform private.audit(
    p_action       => 'need.publish',
    p_entity_type  => 'need',
    p_entity_id    => v_id,
    p_org_id       => v_org.id,
    p_after        => jsonb_build_object('status', 'open', 'category_codes', to_jsonb(v_codes), 'unit', p_unit,
                                         'quantity', p_quantity, 'needed_by', p_needed_by),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_id));
  return v_id;
end;
$$;

comment on function public.publish_need(uuid, text[], public.unit_code, numeric, timestamptz, integer, text, uuid) is
  'Charity owner/manager/staff (approved, not paused, access to the receiving site) posts a need: 1–3 active categories accepted by the site, quantity (integer unless kg/liter), needed_by in (now + 1 h, now + 7 days]. Rate limit 30/h/org. Outbox need_published (urgent when needed within 4 h). Returns need id.';

-- ===========================================================================
-- 4. cancel_need (§6.2 → cancelled, §7 C12)
-- ===========================================================================
create or replace function public.cancel_need(p_need_id uuid, p_reason text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_reason text := nullif(btrim(p_reason), '');
  v_now    timestamptz := private.now();
  n        public.needs%rowtype;
  a        public.allocations%rowtype;
  v_n      integer := 0;
begin
  if private.idem_claim(p_client_op_id, 'cancel_need',
       private.idem_hash(jsonb_build_object('need_id', p_need_id, 'reason', p_reason))) is not null then
    return;
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_reason":"required, ≤ 500 chars"}';
  end if;

  -- lock order: need → offers (ORDER BY id) → allocations (ORDER BY id)
  select * into n from public.needs where id = p_need_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(n.site_id, '{owner,manager}');

  if n.status not in ('open', 'partially_matched', 'matched') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  -- terminal first: refresh_need keeps a terminal status and only refreshes the caches
  update public.needs set status = 'cancelled', closed_at = v_now, cancel_reason = v_reason where id = n.id;

  perform 1 from public.offers o
  where o.id in (select al.offer_id from public.allocations al
                 where al.need_id = n.id and al.status in ('requested', 'confirmed', 'assigned'))
  order by o.id for update;

  for a in
    select * from public.allocations al
    where al.need_id = n.id and al.status in ('requested', 'confirmed', 'assigned')
    order by al.id
    for update
  loop
    perform private.charity_cancel_allocation(a, v_reason, p_client_op_id, 'need_cancelled');
    v_n := v_n + 1;
  end loop;

  perform private.refresh_need(n.id);

  perform private.audit(
    p_action       => 'need.cancel',
    p_entity_type  => 'need',
    p_entity_id    => n.id,
    p_org_id       => n.org_id,
    p_before       => jsonb_build_object('status', n.status),
    p_after        => jsonb_build_object('status', 'cancelled', 'allocations_cancelled', v_n),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.cancel_need(uuid, text, uuid) is
  'Charity owner/manager (site access) cancels a live need (reason required): requested/confirmed/assigned allocations of the need are cancelled as C1/C2 (released while the lot is live, −2 if packed, detached from trips); picked_up ones complete normally (C12).';

-- ===========================================================================
-- 5. match_candidates (§8.4, ADR-007 §1)
-- ===========================================================================
-- Candidates for a need: open lots in the receiving site's radius (ST_DWithin on sites.location,
-- GIST sites_location_gix), category ∈ need ∩ accepted, unit compatible, approved unpaused store of the
-- same is_demo that the caller is not a member of, feasible (§4.7) at p_at. pre_score =
-- 0.4·u + 0.3·p + 0.1·t (ADR-007 §2). Store coordinates are public_location (approximate grid / null
-- when hidden); for non-public store sites distance_km is whole km, travel_min and ETAs 5-minute
-- steps, and pre_score uses the coarse distance (no triangulation, same rule as marketplace_offers).
create or replace function public.match_candidates(
  p_need_id          uuid,
  p_remaining        numeric default null,
  p_exclude_site_ids uuid[] default '{}',
  p_at               timestamptz default null
)
returns table (
  offer_id             uuid,
  store_org_id         uuid,
  site_id              uuid,
  category_code        text,
  unit                 public.unit_code,
  unit_weight_kg       numeric,
  qty_available        numeric,
  available_need_units numeric,
  effective_deadline   timestamptz,
  perishability        public.perishability,
  label                public.freshness_label,
  distance_km          numeric,
  travel_min           numeric,
  eta_pickup           timestamptz,
  eta_dropoff          timestamptz,
  pickup_window        tstzrange,
  trust_score          numeric,
  pre_score            numeric,
  site_lat             float8,
  site_lng             float8
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  n           public.needs%rowtype;
  v_cs        public.sites%rowtype;
  v_org       public.organizations%rowtype;
  v_now       timestamptz := private.now();
  v_at        timestamptz;
  v_remaining numeric;
  v_limit     integer := greatest(1, least(50, private.setting_num('matching_candidate_limit', 15)::integer));
  v_exclude   uuid[] := array_remove(coalesce(p_exclude_site_ids, '{}'::uuid[]), null);
  v_mine      uuid[];
begin
  perform private.require_uid();

  select * into n from public.needs x where x.id = p_need_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if not private.is_admin() then
    -- non-member => PT404 (no existence leak); unapproved charity => PT403 org_not_active (B8);
    -- volunteer / other-site manager => PT403 not_authorized
    perform private.require_site_role(n.site_id, '{owner,manager,staff}');
  end if;

  if n.status not in ('open', 'partially_matched', 'matched') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if n.needed_by <= v_now then
    raise exception using errcode = 'PT409', message = 'deadline_passed';
  end if;
  if p_remaining is not null and (p_remaining <= 0 or p_remaining > 999999999) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_remaining":"> 0"}';
  end if;
  if p_at is not null and (p_at < v_now - interval '5 minutes' or p_at > v_now + interval '7 days') then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_at":"now .. now + 7 days"}';
  end if;

  v_at := greatest(coalesce(p_at, v_now), v_now);
  v_remaining := coalesce(p_remaining, n.quantity - n.qty_in_flight - n.qty_delivered);

  select * into v_cs from public.sites s where s.id = n.site_id;
  select * into v_org from public.organizations o where o.id = n.org_id;
  if v_remaining <= 0 or not v_cs.is_active then
    return;
  end if;

  -- no self-dealing: never offer the caller's own stores (§4.8)
  v_mine := array(select m.org_id from public.org_members m where m.user_id = auth.uid() and m.status = 'active');

  return query
    with near as materialized (
      -- radius first: ST_DWithin(indexed column, constant point) => GIST sites_location_gix
      select s.id, s.org_id, s.visibility, s.public_location
      from public.sites s
      where extensions.st_dwithin(s.location, v_cs.location, (v_cs.radius_km * 1000)::float8)
        and s.is_active and s.id <> v_cs.id and s.id <> all (v_exclude)
    ), cand as (
      select o.id, o.org_id, o.site_id, o.category_code, o.unit, o.unit_weight_kg, o.qty_available,
             o.effective_deadline, o.pickup_window, fc.perishability, st.trust_score, nr.visibility,
             nr.public_location
      from near nr
      join public.offers o on o.site_id = nr.id
      join public.organizations st on st.id = o.org_id
      join public.food_categories fc on fc.code = o.category_code
      where o.status = 'open' and o.qty_available > 0 and o.effective_deadline > v_now
        and o.category_code = any (n.category_codes)
        and (v_cs.accepted_categories is null or o.category_code = any (v_cs.accepted_categories))
        and (o.unit = n.unit or n.unit = 'kg')
        and st.kind = 'store' and st.status = 'approved' and not st.is_paused
        and st.is_demo = v_org.is_demo and st.id <> n.org_id and st.id <> all (v_mine)
    ), feas as (
      select c.*, f.distance_m, f.travel_min as t_min, f.eta_pickup as eta_p, f.eta_dropoff as eta_d
      from cand c
      cross join lateral private.feasibility(c.site_id, v_cs.id, c.pickup_window, c.effective_deadline, v_at) f
      where f.feasible
    ), coarse as (
      select f.*,
             least(case when f.visibility = 'public' then round((f.distance_m / 1000.0)::numeric, 1)
                        else greatest(round((f.distance_m / 1000.0)::numeric, 0), 1) end,
                   v_cs.radius_km) as dist_km,
             case when f.visibility = 'public' then round(f.t_min, 0)
                  else ceil(f.t_min / 5) * 5 end as travel,
             case when f.visibility = 'public' then f.eta_p
                  else least(date_bin('5 minutes', f.eta_p + interval '4 minutes 59 seconds',
                                      '2000-01-01 00:00+07'::timestamptz), f.effective_deadline) end as eta_pick,
             case when f.visibility = 'public' then f.eta_d
                  else date_bin('5 minutes', f.eta_d + interval '4 minutes 59 seconds',
                                '2000-01-01 00:00+07'::timestamptz) end as eta_drop
      from feas f
    ), scored as (
      select c.*, private.pre_score(c.effective_deadline, c.perishability, v_at, c.dist_km, v_cs.radius_km, c.trust_score) as pre
      from coarse c
    )
    select sc.id, sc.org_id, sc.site_id, sc.category_code, sc.unit, sc.unit_weight_kg, sc.qty_available,
           private.to_need_units(sc.qty_available, sc.unit, sc.unit_weight_kg, n.unit),
           sc.effective_deadline, sc.perishability,
           public.freshness_label(sc.effective_deadline, sc.perishability, v_now),
           sc.dist_km, sc.travel, sc.eta_pick, sc.eta_drop, sc.pickup_window, sc.trust_score, sc.pre,
           extensions.st_y(sc.public_location::extensions.geometry),
           extensions.st_x(sc.public_location::extensions.geometry)
    from scored sc
    order by sc.pre desc, sc.dist_km, sc.id
    limit v_limit;
end;
$$;

comment on function public.match_candidates(uuid, numeric, uuid[], timestamptz) is
  'ADR-007 §1: ≤ matching_candidate_limit feasible open lots for a need (charity owner/manager/staff with site access, or admin aal2), ordered by pre_score = 0.4·urgency + 0.3·proximity + 0.1·trust. p_remaining defaults to quantity − in flight − delivered (≤ 0 => no rows); p_exclude_site_ids drops store sites (re-match); p_at ∈ [now, now + 7 d] is the feasibility time. Coordinates = public_location; non-public store sites get whole-km distance, 5-minute travel/ETAs and a pre_score from the coarse distance.';

-- ===========================================================================
-- 6. reserve_bundle (§8.4 — the 8 steps, in order)
-- ===========================================================================
create or replace function public.reserve_bundle(p_need_id uuid, p_lines jsonb, p_client_op_id uuid,
                                                 p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_uid();
  v_resp      jsonb;
  v_now       timestamptz := private.now();
  v_meta      jsonb;
  e           jsonb;
  v_i         integer := 0;
  v_lines     jsonb;
  v_ids       uuid[];
  v_hint      uuid[];
  n           public.needs%rowtype;
  v_cs        public.sites%rowtype;
  v_charity   public.organizations%rowtype;
  v           public.offers%rowtype;
  v_store     public.organizations%rowtype;
  v_ss        public.sites%rowtype;
  v_feas      record;
  l           jsonb;
  v_qty       numeric;
  v_remaining numeric;
  v_total     numeric := 0;
  v_maxw      numeric := 0;
  v_sites     uuid[] := '{}';
  v_max_stops integer := private.setting_num('max_pickup_stops', 5)::integer;
  v_rematch   uuid;
  v_bundle    uuid := gen_random_uuid();
  v_auto      boolean;
  v_status    public.allocation_status;
  v_red       boolean;
  a           public.allocations%rowtype;
  v_out       jsonb := '[]'::jsonb;
  v_offer     uuid;
begin
  -- 1. idempotency
  v_resp := private.idem_claim(p_client_op_id, 'reserve_bundle', private.idem_hash(jsonb_build_object(
    'need_id', p_need_id, 'lines', p_lines, 'meta', p_meta)));
  if v_resp is not null then
    return v_resp;
  end if;

  -- 2. lock the need (FOR UPDATE), then who / state / rate limit. The needs that step 5 may touch
  --    (stale requests on the requested lots) are locked in the same statement, ORDER BY id, so lazy
  --    expiry never takes a need lock after an offer lock (deadlock-free with expire_stale_requests /
  --    cancel_offer). v_hint = every uuid offer_id of p_lines (a superset of the normalised ids).
  v_hint := array(select distinct private.try_uuid(x ->> 'offer_id')
                  from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) x
                  where jsonb_typeof(x) = 'object' and private.try_uuid(x ->> 'offer_id') is not null);
  perform 1 from public.needs x
  where x.id = p_need_id
     or x.id in (select al.need_id from public.allocations al
                 where al.offer_id = any (v_hint) and al.status = 'requested' and al.reserved_until <= v_now
                   and al.need_id is not null)
  order by x.id
  for update;

  select * into n from public.needs x where x.id = p_need_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(n.site_id, '{owner,manager,staff}');
  select * into v_charity from public.organizations o where o.id = n.org_id;
  select * into v_cs from public.sites s where s.id = n.site_id;
  if v_charity.is_paused then
    raise exception using errcode = 'PT403', message = 'org_not_active', detail = 'paused';
  end if;
  if n.status not in ('open', 'partially_matched', 'matched') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if n.needed_by <= v_now then
    raise exception using errcode = 'PT409', message = 'deadline_passed', detail = 'needed_by';
  end if;
  if not v_cs.is_active then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"need":"receiving_site_inactive"}';
  end if;

  perform private.check_rate_limit('reserve_bundle:org:' || n.org_id::text, 60, interval '1 hour');

  -- 3. normalise p_lines: objects {offer_id, qty}, qty > 0, duplicates of a lot merged, ≤ 15 lots;
  --    ≤ 5 distinct store sites is checked once the lots are locked (step 6). p_meta validated too.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_lines":"non-empty array"}';
  end if;
  for e in select x from jsonb_array_elements(p_lines) x loop
    if jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('offer_id', 'qty'))
       or private.try_uuid(e ->> 'offer_id') is null
       or jsonb_typeof(e -> 'qty') is distinct from 'number'
       or (e ->> 'qty')::numeric <= 0 or (e ->> 'qty')::numeric > 999999 then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'line_format', 'index', v_i)::text;
    end if;
    v_i := v_i + 1;
  end loop;

  select jsonb_agg(jsonb_build_object('offer_id', g.id, 'qty', g.qty) order by g.id), array_agg(g.id order by g.id)
    into v_lines, v_ids
  from (select private.try_uuid(x ->> 'offer_id') as id, sum((x ->> 'qty')::numeric) as qty
        from jsonb_array_elements(p_lines) x group by 1) g;
  if cardinality(v_ids) > 15 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_lines":"too_many_offers","max":15}';
  end if;

  v_meta := private.bundle_meta(p_meta);
  v_rematch := private.try_uuid(v_meta ->> 'rematch_of');
  if v_rematch is not null
     and not exists (select 1 from public.need_bundles b where b.id = v_rematch and b.need_id = n.id) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"rematch_of":"not_a_bundle_of_this_need"}';
  end if;

  -- 4. lock the lots, ORDER BY id (every writer uses the same order: no deadlock)
  perform 1 from public.offers o where o.id = any (v_ids) order by o.id for update;

  -- 5. lazy expiry of stale requests on the locked lots (no cron dependency)
  foreach v_offer in array v_ids loop
    perform private.expire_requested(v_offer);
    perform private.refresh_offer(v_offer);
  end loop;
  perform private.refresh_need(n.id);
  select * into n from public.needs x where x.id = p_need_id;

  v_remaining := n.quantity - n.qty_in_flight - n.qty_delivered;
  if v_remaining <= 0 then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'need_already_covered';
  end if;

  -- 6. every line, all-or-nothing (any raise rolls the whole transaction back)
  for l in select x from jsonb_array_elements(v_lines) x loop
    v_qty := (l ->> 'qty')::numeric;
    select * into v from public.offers o where o.id = (l ->> 'offer_id')::uuid;
    if not found or v.status = 'draft' then
      raise exception using errcode = 'PT404', message = 'not_found', detail = jsonb_build_object('offer_id', l -> 'offer_id')::text;
    end if;
    select * into v_store from public.organizations o where o.id = v.org_id;
    if v_store.status <> 'approved' then
      raise exception using errcode = 'PT404', message = 'not_found', detail = jsonb_build_object('offer_id', v.id)::text;
    end if;
    if private.caller_org_role(v.org_id) is not null then
      raise exception using errcode = 'PT403', message = 'self_dealing', detail = jsonb_build_object('offer_id', v.id)::text;
    end if;
    if v.status not in ('open', 'fully_allocated') then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = jsonb_build_object('offer_id', v.id)::text;
    end if;
    if v.effective_deadline <= v_now then
      raise exception using errcode = 'PT409', message = 'deadline_passed', detail = jsonb_build_object('offer_id', v.id)::text;
    end if;
    if v_store.is_paused then
      raise exception using errcode = 'PT409', message = 'invalid_state',
        detail = jsonb_build_object('offer_id', v.id, 'reason', 'store_paused')::text;
    end if;
    if v_store.is_demo is distinct from v_charity.is_demo then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'demo_mismatch', 'offer_id', v.id)::text;
    end if;
    if not (v.category_code = any (n.category_codes)) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'category_not_in_need', 'offer_id', v.id)::text;
    end if;
    if v_cs.accepted_categories is not null and not (v.category_code = any (v_cs.accepted_categories)) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'category_not_accepted_by_site', 'offer_id', v.id)::text;
    end if;
    if v.unit is distinct from n.unit and n.unit <> 'kg' then
      raise exception using errcode = 'PT422', message = 'unit_mismatch', detail = jsonb_build_object('offer_id', v.id)::text;
    end if;
    if v.unit not in ('kg', 'liter') and v_qty <> trunc(v_qty) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'integer_required', 'offer_id', v.id)::text;
    end if;
    if v_qty > v.qty_available then
      raise exception using errcode = 'PT409', message = 'insufficient_quantity',
        detail = jsonb_build_object('offer_id', v.id, 'available', v.qty_available)::text;
    end if;

    select * into v_ss from public.sites s where s.id = v.site_id;
    if not v_ss.is_active then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('p_lines', 'store_site_inactive', 'offer_id', v.id)::text;
    end if;
    if not extensions.st_dwithin(v_ss.location, v_cs.location, (v_cs.radius_km * 1000)::float8) then
      raise exception using errcode = 'PT422', message = 'out_of_radius', detail = jsonb_build_object('offer_id', v.id)::text;
    end if;
    select * into v_feas from private.feasibility(v.site_id, v_cs.id, v.pickup_window, v.effective_deadline, v_now);
    if not coalesce(v_feas.feasible, false) then
      -- no ETAs in the error: they would reveal the travel time to a hidden/approximate store site
      raise exception using errcode = 'PT422', message = 'infeasible_timing',
        detail = jsonb_build_object('offer_id', v.id, 'effective_deadline', v.effective_deadline)::text;
    end if;

    v_total := v_total + private.to_need_units(v_qty, v.unit, v.unit_weight_kg, n.unit);
    if v.unit <> n.unit then
      v_maxw := greatest(v_maxw, v.unit_weight_kg);
    end if;
    if not (v.site_id = any (v_sites)) then
      v_sites := v_sites || v.site_id;
    end if;
  end loop;

  if cardinality(v_sites) > v_max_stops then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('p_lines', 'too_many_stops', 'max', v_max_stops)::text;
  end if;
  if v_meta ? 'stop_count' and (v_meta ->> 'stop_count')::integer <> cardinality(v_sites) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('stop_count', 'mismatch', 'expected', cardinality(v_sites))::text;
  end if;
  -- never more than the remaining need; converting counted units to kg may overshoot by less than
  -- one unit (ADR-007 P2)
  if v_total > v_remaining and (v_maxw = 0 or v_total - v_remaining >= v_maxw) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('p_lines', 'exceeds_need', 'remaining', v_remaining)::text;
  end if;

  -- 7. bundle + allocations (auto-accept per store site) + commit the quantities
  insert into public.need_bundles (id, need_id, option_rank, qty_target, score, stop_count, est_distance_m,
                                   est_duration_s, route, route_provider, algorithm_version, inputs_snapshot,
                                   rematch_of, client_op_id, created_by)
  values (v_bundle, n.id, (v_meta ->> 'option_rank')::smallint, v_remaining, (v_meta ->> 'score')::numeric,
          cardinality(v_sites), (v_meta ->> 'est_distance_m')::integer, (v_meta ->> 'est_duration_s')::integer,
          case when v_meta ? 'route_geojson'
               then extensions.st_setsrid(extensions.st_geomfromgeojson((v_meta -> 'route_geojson')::text), 4326) end,
          v_meta ->> 'route_provider', v_meta ->> 'algorithm_version', v_meta -> 'inputs_snapshot',
          v_rematch, p_client_op_id, v_uid);

  for l in select x from jsonb_array_elements(v_lines) x loop
    v_qty := (l ->> 'qty')::numeric;
    select * into v from public.offers o where o.id = (l ->> 'offer_id')::uuid;
    select * into v_ss from public.sites s where s.id = v.site_id;

    v_auto := coalesce(private.setting('auto_accept_enabled'), 'true'::jsonb) <> 'false'::jsonb
              and (v_ss.auto_accept_mode = 'all'
                   or (v_ss.auto_accept_mode = 'trusted' and v_charity.trust_score >= v_ss.auto_accept_min_trust));
    v_status := case when v_auto then 'confirmed'::public.allocation_status else 'requested'::public.allocation_status end;

    insert into public.allocations (offer_id, store_org_id, store_site_id, charity_org_id, charity_site_id,
                                    need_id, bundle_id, unit, unit_weight_kg_snapshot, qty_reserved, status,
                                    reserved_until, requested_by, requested_at, confirmed_at, auto_confirmed)
    values (v.id, v.org_id, v.site_id, n.org_id, n.site_id, n.id, v_bundle, v.unit, v.unit_weight_kg, v_qty,
            v_status,
            case when v_auto then null
                 else least(v_now + private.setting_num('request_ttl_minutes', 120) * interval '1 minute',
                            v.effective_deadline) end,
            v_uid, v_now, case when v_auto then v_now end, v_auto)
    returning * into a;

    update public.offers set qty_committed = qty_committed + v_qty where id = v.id;

    v_red := public.freshness_label(v.effective_deadline,
               (select fc.perishability from public.food_categories fc where fc.code = v.category_code), v_now) = 'red';
    perform private.enqueue('allocation_requested', 'allocation', a.id, 'allocation_requested:' || a.id,
      private.alloc_payload(a, jsonb_build_object('qty', v_qty, 'auto_confirmed', v_auto)),
      case when v_red then 'urgent' else 'normal' end);
    if v_auto then
      perform private.enqueue('allocation_confirmed', 'allocation', a.id, 'allocation_confirmed:' || a.id,
        private.alloc_payload(a, '{"auto_confirmed":true}'));
    end if;

    perform private.audit(
      p_action       => 'allocation.request',
      p_entity_type  => 'allocation',
      p_entity_id    => a.id,
      p_org_id       => n.org_id,
      p_after        => jsonb_build_object('status', v_status, 'offer_id', v.id, 'qty', v_qty,
                                           'auto_confirmed', v_auto, 'bundle_id', v_bundle),
      p_client_op_id => p_client_op_id);

    v_out := v_out || jsonb_build_array(jsonb_build_object('id', a.id, 'offer_id', v.id, 'status', v_status));
  end loop;

  -- 8. derived states, audit, stored response
  foreach v_offer in array v_ids loop
    perform private.refresh_offer(v_offer);
  end loop;
  perform private.refresh_need(n.id);
  perform private.refresh_bundle(v_bundle);

  perform private.audit(
    p_action       => 'bundle.reserve',
    p_entity_type  => 'need_bundle',
    p_entity_id    => v_bundle,
    p_org_id       => n.org_id,
    p_after        => jsonb_build_object('need_id', n.id, 'lines', jsonb_array_length(v_lines),
                                         'stop_count', cardinality(v_sites), 'qty_target', v_remaining,
                                         'option_rank', (v_meta ->> 'option_rank')::integer,
                                         'algorithm_version', v_meta ->> 'algorithm_version',
                                         'rematch_of', v_rematch),
    p_client_op_id => p_client_op_id);

  v_resp := jsonb_build_object('bundle_id', v_bundle, 'allocations', v_out);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.reserve_bundle(uuid, jsonb, uuid, jsonb) is
  'Atomic multi-lot reservation for a need (charity owner/manager/staff, approved, not paused, site access), DATA-MODEL §8.4 steps 1–8 in order: idempotent; locks need (+ needs touched by lazy expiry) then lots ORDER BY id; lazy expiry; per line: lot open, qty ≤ available, category ∈ need ∩ accepted, unit compatible, integers, same is_demo, no self-dealing, radius, feasibility; ≤ 5 store sites; total ≤ remaining (+ < 1 unit when converting to kg). Inserts need_bundles (client_op_id) + allocations (auto-accept per store site), commits quantities, refreshes lot/need/bundle, outbox allocation_requested/confirmed, audit. Returns {bundle_id, allocations:[{id, offer_id, status}]}.';

-- ===========================================================================
-- 7. bundle_options_ready when a matching lot opens (§6.3, PRD US-CHA-12 AC2)
-- ===========================================================================
-- AFTER UPDATE of offers.status draft -> open (publish_offer): every live need (open /
-- partially_matched, not past needed_by) of an approved, unpaused charity of the same is_demo whose
-- receiving site is in radius, accepts the category, has a compatible unit and for which the lot is
-- feasible gets one bundle_options_ready (dedupe per need × lot; at most 50 needs per lot).
create or replace function private.offer_opened_notify_needs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now   timestamptz := private.now();
  v_store public.organizations%rowtype;
  v_ss    public.sites%rowtype;
  r       record;
begin
  select * into v_store from public.organizations o where o.id = new.org_id;
  select * into v_ss from public.sites s where s.id = new.site_id;
  if v_store.status <> 'approved' or v_store.is_paused or new.effective_deadline is null then
    return null;
  end if;

  for r in
    select nd.id, nd.org_id
    from public.needs nd
    join public.sites cs on cs.id = nd.site_id and cs.is_active
    join public.organizations co on co.id = nd.org_id
    where nd.status in ('open', 'partially_matched') and nd.needed_by > v_now
      and new.category_code = any (nd.category_codes)
      and (cs.accepted_categories is null or new.category_code = any (cs.accepted_categories))
      and (new.unit = nd.unit or nd.unit = 'kg')
      and co.status = 'approved' and not co.is_paused and co.is_demo = v_store.is_demo and co.id <> new.org_id
      and extensions.st_dwithin(v_ss.location, cs.location, (cs.radius_km * 1000)::float8)
      and coalesce((select f.feasible
                    from private.feasibility(new.site_id, cs.id, new.pickup_window, new.effective_deadline, v_now) f),
                   false)
    order by nd.needed_by, nd.id
    limit 50
  loop
    perform private.enqueue('bundle_options_ready', 'need', r.id, 'bundle_options_ready:' || r.id || ':' || new.id,
      jsonb_build_object('need_id', r.id, 'org_id', r.org_id, 'offer_id', new.id, 'cause', 'offer_published'));
  end loop;
  return null;
end;
$$;

comment on function private.offer_opened_notify_needs() is
  'AFTER UPDATE trigger on offers (draft -> open): outbox bundle_options_ready for each live need the new lot could serve (radius, category, unit, demo, feasibility; ≤ 50 needs).';

create trigger offers_opened_notify_needs
  after update of status on public.offers
  for each row
  when (old.status = 'draft' and new.status = 'open')
  execute function private.offer_opened_notify_needs();

-- ===========================================================================
-- 8. Function privileges (§8.8)
-- ===========================================================================
revoke all on function private.charity_cancel_allocation(public.allocations, text, uuid, text) from public, anon, authenticated;
revoke all on function private.bundle_meta(jsonb) from public, anon, authenticated;
revoke all on function private.pre_score(timestamptz, public.perishability, timestamptz, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function private.offer_opened_notify_needs() from public, anon, authenticated;

revoke all on function public.publish_need(uuid, text[], public.unit_code, numeric, timestamptz, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_need(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.match_candidates(uuid, numeric, uuid[], timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_bundle(uuid, jsonb, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.publish_need(uuid, text[], public.unit_code, numeric, timestamptz, integer, text, uuid) to authenticated;
grant execute on function public.cancel_need(uuid, text, uuid) to authenticated;
grant execute on function public.match_candidates(uuid, numeric, uuid[], timestamptz) to authenticated;
grant execute on function public.reserve_bundle(uuid, jsonb, uuid, jsonb) to authenticated;

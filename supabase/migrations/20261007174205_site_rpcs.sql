-- Migration 5c — site_rpcs (DATA-MODEL §2.1 sites/site_hours, §8.2, P1-05, P1-06)
-- upsert_site (service-area bbox check), set_site_hours (replace all, overlap check incl. overnight
-- and week wrap), get_site_location (exact pin for allowed callers), count_stores_within (P1-05).
-- site_closures keep the direct owner/manager RLS writes of migration 4 (§9.4): no RPC.

-- ===========================================================================
-- 1. Helpers
-- ===========================================================================

-- Service area as [min_lng, min_lat, max_lng, max_lat] (WGS84). app_settings.service_area_bbox,
-- falling back to the new TP.HCM (former HCMC + Bình Dương + Bà Rịa–Vũng Tàu, mainland).
create or replace function private.service_area_bbox()
returns float8[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_val jsonb := private.setting('service_area_bbox');
begin
  if v_val is not null and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 4 then
    return array[(v_val ->> 0)::float8, (v_val ->> 1)::float8, (v_val ->> 2)::float8, (v_val ->> 3)::float8];
  end if;
  return array[106.33, 10.30, 107.60, 11.55]::float8[];
end;
$$;

comment on function private.service_area_bbox() is
  'Service bbox [min_lng, min_lat, max_lng, max_lat] from app_settings.service_area_bbox (default: mainland TP.HCM after the 2025 merger).';

-- Caller may manage (write) a site: owner of the org, or manager whose site_ids is null or contains
-- the site. p_site_id null = creating a new site (owner, or unrestricted manager). Any org status;
-- the caller checks the status.
create or replace function private.can_manage_site(p_org uuid, p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.org_members m
                 where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
                   and (m.role = 'owner'
                        or (m.role = 'manager'
                            and (m.site_ids is null
                                 or (p_site_id is not null and p_site_id = any (m.site_ids))))));
$$;

comment on function private.can_manage_site(uuid, uuid) is
  'Owner, or manager scoped to the site (site_ids null = all). p_site_id null = create (owner or unrestricted manager).';

-- ===========================================================================
-- 2. upsert_site
-- ===========================================================================
-- p_site keys: id?, name, address_line, ward, city, lat, lng, location_source, location_accuracy_m,
-- visibility, radius_km, accepted_categories, capacity_kg, auto_accept_mode, auto_accept_min_trust.
-- Insert: name, address_line, lat, lng required; missing keys take the column defaults (visibility
-- defaults to 'approximate' for charities). Update (id given): missing keys keep their value.
-- First site of an org becomes is_primary. Exact address/location never go to audit_logs.
create or replace function public.upsert_site(p_org_id uuid, p_site jsonb, p_client_op_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp   jsonb;
  v_org    public.organizations%rowtype;
  v_old    public.sites%rowtype;
  v_is_new boolean;
  v_id     uuid;
  v_err    jsonb := '{}'::jsonb;
  v_bad    text[];
  v_bbox   float8[] := private.service_area_bbox();
  -- parsed values
  v_name   text;
  v_addr   text;
  v_ward   text;
  v_city   text;
  v_lat    float8;
  v_lng    float8;
  v_src    public.location_source;
  v_acc    integer;
  v_vis    public.site_visibility;
  v_radius numeric;
  v_cats   text[];
  v_cap    numeric;
  v_mode   public.auto_accept_mode;
  v_trust  numeric;
  v_loc    extensions.geography;
begin
  perform private.require_uid();
  v_resp := private.idem_claim(p_client_op_id, 'upsert_site',
    private.idem_hash(jsonb_build_object('org_id', p_org_id, 'site', p_site)));
  if v_resp is not null then
    return (v_resp #>> '{}')::uuid;
  end if;

  if p_site is null or jsonb_typeof(p_site) <> 'object' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_site":"object"}';
  end if;

  select array_agg(k order by k) into v_bad
  from jsonb_object_keys(p_site) as k
  where k not in ('id', 'name', 'address_line', 'ward', 'city', 'lat', 'lng', 'location_source',
                  'location_accuracy_m', 'visibility', 'radius_km', 'accepted_categories',
                  'capacity_kg', 'auto_accept_mode', 'auto_accept_min_trust');
  if v_bad is not null then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('unknown_keys', v_bad)::text;
  end if;

  -- lock the org: serialises site creation (is_primary) and status checks
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found or private.caller_org_role(p_org_id) is null then
    if found and private.is_admin() then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  v_is_new := p_site -> 'id' is null or jsonb_typeof(p_site -> 'id') = 'null';
  if not v_is_new then
    v_id := private.try_uuid(p_site ->> 'id');
    select * into v_old from public.sites s where s.id = v_id and s.org_id = p_org_id for update;
    if not found then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
  end if;

  if not private.can_manage_site(p_org_id, case when v_is_new then null else v_id end) then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;

  if v_org.status in ('rejected', 'closed') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  -- ---- parse + validate (collect every error) ----
  -- text fields
  if p_site ? 'name' then
    v_name := btrim(p_site ->> 'name');
    if jsonb_typeof(p_site -> 'name') <> 'string' or char_length(v_name) not between 1 and 120 then
      v_err := v_err || '{"name":"1-120 chars"}';
    end if;
  elsif v_is_new then
    v_err := v_err || '{"name":"required"}';
  else
    v_name := v_old.name;
  end if;

  if p_site ? 'address_line' then
    v_addr := btrim(p_site ->> 'address_line');
    if jsonb_typeof(p_site -> 'address_line') <> 'string' or char_length(v_addr) not between 1 and 300 then
      v_err := v_err || '{"address_line":"1-300 chars"}';
    end if;
  elsif v_is_new then
    v_err := v_err || '{"address_line":"required"}';
  else
    v_addr := v_old.address_line;
  end if;

  if p_site ? 'ward' then
    v_ward := nullif(btrim(p_site ->> 'ward'), '');
    if jsonb_typeof(p_site -> 'ward') not in ('string', 'null') or char_length(v_ward) > 120 then
      v_err := v_err || '{"ward":"≤ 120 chars or null"}';
    end if;
  else
    v_ward := case when v_is_new then null else v_old.ward end;
  end if;

  if p_site ? 'city' then
    v_city := btrim(p_site ->> 'city');
    if jsonb_typeof(p_site -> 'city') <> 'string' or char_length(v_city) not between 1 and 120 then
      v_err := v_err || '{"city":"1-120 chars"}';
    end if;
  else
    v_city := case when v_is_new then 'Thành phố Hồ Chí Minh' else v_old.city end;
  end if;

  -- location: lat and lng travel together
  if p_site ? 'lat' or p_site ? 'lng' then
    if jsonb_typeof(p_site -> 'lat') is distinct from 'number' or jsonb_typeof(p_site -> 'lng') is distinct from 'number' then
      v_err := v_err || '{"location":"lat and lng numbers required together"}';
    else
      v_lat := round((p_site ->> 'lat')::numeric, 6)::float8;
      v_lng := round((p_site ->> 'lng')::numeric, 6)::float8;
      if v_lng not between v_bbox[1] and v_bbox[3] or v_lat not between v_bbox[2] and v_bbox[4] then
        v_err := v_err || '{"location":"out_of_service_area"}';
      else
        v_loc := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
      end if;
    end if;
  elsif v_is_new then
    v_err := v_err || '{"location":"required"}';
  else
    v_loc := v_old.location;
  end if;

  -- enums and numbers (casts can fail: map to validation errors)
  begin
    v_src := case when p_site ? 'location_source' then (p_site ->> 'location_source')::public.location_source
                  when v_is_new then 'pin'::public.location_source else v_old.location_source end;
    if v_src is null then v_err := v_err || '{"location_source":"pin|geocode|gps"}'; end if;
  exception when invalid_text_representation then
    v_err := v_err || '{"location_source":"pin|geocode|gps"}';
  end;

  begin
    v_vis := case when p_site ? 'visibility' then (p_site ->> 'visibility')::public.site_visibility
                  when v_is_new then case when v_org.kind = 'charity' then 'approximate'::public.site_visibility
                                          else 'public'::public.site_visibility end
                  else v_old.visibility end;
    if v_vis is null then v_err := v_err || '{"visibility":"public|approximate|hidden"}'; end if;
  exception when invalid_text_representation then
    v_err := v_err || '{"visibility":"public|approximate|hidden"}';
  end;

  begin
    v_mode := case when p_site ? 'auto_accept_mode' then (p_site ->> 'auto_accept_mode')::public.auto_accept_mode
                   when v_is_new then 'off'::public.auto_accept_mode else v_old.auto_accept_mode end;
    if v_mode is null then v_err := v_err || '{"auto_accept_mode":"off|all|trusted"}'; end if;
  exception when invalid_text_representation then
    v_err := v_err || '{"auto_accept_mode":"off|all|trusted"}';
  end;

  if p_site ? 'location_accuracy_m' then
    if jsonb_typeof(p_site -> 'location_accuracy_m') = 'null' then
      v_acc := null;
    elsif jsonb_typeof(p_site -> 'location_accuracy_m') <> 'number'
          or (p_site ->> 'location_accuracy_m')::numeric not between 0 and 100000 then
      v_err := v_err || '{"location_accuracy_m":"0-100000 or null"}';
    else
      v_acc := round((p_site ->> 'location_accuracy_m')::numeric)::integer;
    end if;
  else
    v_acc := case when v_is_new or p_site ? 'lat' then null else v_old.location_accuracy_m end;
  end if;

  if p_site ? 'radius_km' then
    if jsonb_typeof(p_site -> 'radius_km') <> 'number'
       or (p_site ->> 'radius_km')::numeric not between 0.5 and 30 then
      v_err := v_err || '{"radius_km":"0.5-30"}';
    else
      v_radius := round((p_site ->> 'radius_km')::numeric, 1);
    end if;
  else
    v_radius := case when v_is_new then 5 else v_old.radius_km end;
  end if;

  if p_site ? 'accepted_categories' then
    if jsonb_typeof(p_site -> 'accepted_categories') = 'null' then
      v_cats := null;
    elsif jsonb_typeof(p_site -> 'accepted_categories') <> 'array'
          or jsonb_array_length(p_site -> 'accepted_categories') not between 1 and 50
          or exists (select 1 from jsonb_array_elements(p_site -> 'accepted_categories') as e
                     where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z_]{2,32}$') then
      v_err := v_err || '{"accepted_categories":"null (all) or 1-50 category codes"}';
    else
      select array_agg(distinct e) into v_cats
      from jsonb_array_elements_text(p_site -> 'accepted_categories') as e;
    end if;
  else
    v_cats := case when v_is_new then null else v_old.accepted_categories end;
  end if;

  if p_site ? 'capacity_kg' then
    if jsonb_typeof(p_site -> 'capacity_kg') = 'null' then
      v_cap := null;
    elsif jsonb_typeof(p_site -> 'capacity_kg') <> 'number'
          or (p_site ->> 'capacity_kg')::numeric <= 0 or (p_site ->> 'capacity_kg')::numeric > 1000000 then
      v_err := v_err || '{"capacity_kg":"> 0 and ≤ 1000000, or null"}';
    else
      v_cap := round((p_site ->> 'capacity_kg')::numeric, 1);
    end if;
  else
    v_cap := case when v_is_new then null else v_old.capacity_kg end;
  end if;

  if p_site ? 'auto_accept_min_trust' then
    if jsonb_typeof(p_site -> 'auto_accept_min_trust') <> 'number'
       or (p_site ->> 'auto_accept_min_trust')::numeric not between 0 and 100 then
      v_err := v_err || '{"auto_accept_min_trust":"0-100"}';
    else
      v_trust := round((p_site ->> 'auto_accept_min_trust')::numeric, 2);
    end if;
  else
    v_trust := case when v_is_new then 60 else v_old.auto_accept_min_trust end;
  end if;

  if v_err <> '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = v_err::text;
  end if;

  -- ---- write ----
  if v_is_new then
    insert into public.sites (org_id, name, is_primary, address_line, ward, city, location,
                              location_source, location_accuracy_m, visibility, radius_km,
                              accepted_categories, capacity_kg, auto_accept_mode, auto_accept_min_trust)
    values (p_org_id, v_name,
            not exists (select 1 from public.sites s where s.org_id = p_org_id),
            v_addr, v_ward, v_city, v_loc, v_src, v_acc, v_vis, v_radius, v_cats, v_cap, v_mode, v_trust)
    returning id into v_id;
  else
    update public.sites
       set name = v_name, address_line = v_addr, ward = v_ward, city = v_city, location = v_loc,
           location_source = v_src, location_accuracy_m = v_acc, visibility = v_vis,
           radius_km = v_radius, accepted_categories = v_cats, capacity_kg = v_cap,
           auto_accept_mode = v_mode, auto_accept_min_trust = v_trust
     where id = v_id;
  end if;

  perform private.audit(
    p_action       => case when v_is_new then 'site.create' else 'site.update' end,
    p_entity_type  => 'site',
    p_entity_id    => v_id,
    p_org_id       => p_org_id,
    p_after        => jsonb_build_object(
                        'name', v_name, 'ward', v_ward, 'city', v_city, 'visibility', v_vis,
                        'radius_km', v_radius, 'accepted_categories', v_cats, 'capacity_kg', v_cap,
                        'auto_accept_mode', v_mode, 'auto_accept_min_trust', v_trust,
                        'location_changed', v_is_new or not extensions.st_equals(v_loc::extensions.geometry, v_old.location::extensions.geometry),
                        'address_changed', v_is_new or v_addr is distinct from v_old.address_line),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_id));
  return v_id;
end;
$$;

comment on function public.upsert_site(uuid, jsonb, uuid) is
  'Create/update a site of the org (owner, or manager scoped to the site). Validates fields and that lat/lng lie in app_settings.service_area_bbox (PT422 {"location":"out_of_service_area"}). Idempotent on p_client_op_id.';

-- ===========================================================================
-- 3. set_site_hours — replace all intervals of a site
-- ===========================================================================
-- p_hours = [{dow 0-6 (0 = Sunday), opens "HH:MM", closes "HH:MM", closes_next_day bool}]; [] = no
-- hours = open 24/7. closes_next_day = false needs closes > opens; true needs closes ≤ opens (e.g.
-- 18:00 → 02:00, or 18:00 → 00:00). Intervals must not overlap, overnight ones and Saturday → Sunday
-- wrap included. Idempotent by construction (replace-all); unchanged hours still re-audit.
create or replace function public.set_site_hours(p_site_id uuid, p_hours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_org  public.organizations%rowtype;
  v_el   jsonb;
  v_i    integer := 0;
  v_dow  integer;
  v_open time;
  v_clos time;
  v_next boolean;
  v_norm jsonb := '[]'::jsonb;
  v_bad  text[];
begin
  perform private.require_uid();

  select * into v_site from public.sites s where s.id = p_site_id for update;
  if not found or private.caller_org_role(v_site.org_id) is null then
    if found and private.is_admin() then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if not private.can_manage_site(v_site.org_id, p_site_id) then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;

  select * into v_org from public.organizations o where o.id = v_site.org_id;
  if v_org.status in ('rejected', 'closed') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 42 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_hours":"array of ≤ 42 intervals"}';
  end if;

  for v_el in select e from jsonb_array_elements(p_hours) as e loop
    v_i := v_i + 1;
    if jsonb_typeof(v_el) <> 'object' then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'error', 'object_required')::text;
    end if;
    select array_agg(k) into v_bad from jsonb_object_keys(v_el) as k
    where k not in ('dow', 'opens', 'closes', 'closes_next_day');
    if v_bad is not null then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'unknown_keys', v_bad)::text;
    end if;

    begin
      if jsonb_typeof(v_el -> 'dow') <> 'number' or jsonb_typeof(v_el -> 'opens') <> 'string'
         or jsonb_typeof(v_el -> 'closes') <> 'string'
         or jsonb_typeof(coalesce(v_el -> 'closes_next_day', 'false'::jsonb)) <> 'boolean'
         or (v_el ->> 'opens') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
         or (v_el ->> 'closes') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
        raise exception using errcode = '22023';
      end if;
      v_dow  := (v_el ->> 'dow')::integer;
      v_open := (v_el ->> 'opens')::time;
      v_clos := (v_el ->> 'closes')::time;
      v_next := coalesce((v_el ->> 'closes_next_day')::boolean, false);
      if v_dow not between 0 and 6 or (v_el ->> 'dow')::numeric <> v_dow then
        raise exception using errcode = '22023';
      end if;
    exception when others then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1,
                   'error', 'dow 0-6, opens/closes HH:MM, closes_next_day boolean')::text;
    end;

    if (not v_next and v_clos <= v_open) or (v_next and v_clos > v_open) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1,
                   'error', 'closes must be after opens (or ≤ opens with closes_next_day)')::text;
    end if;

    v_norm := v_norm || jsonb_build_array(jsonb_build_object(
      'dow', v_dow, 'opens', to_char(v_open, 'HH24:MI:SS'), 'closes', to_char(v_clos, 'HH24:MI:SS'),
      'closes_next_day', v_next));
  end loop;

  -- overlap: intervals as seconds of the week [start, end); compare also shifted by one week so
  -- Saturday overnight intervals collide with early Sunday ones.
  if exists (
    with iv as (
      select row_number() over () as rn,
             x.dow * 86400 + extract(epoch from x.opens)::integer as s,
             x.dow * 86400 + extract(epoch from x.closes)::integer
               + case when x.closes_next_day then 86400 else 0 end as e
      from jsonb_to_recordset(v_norm) as x(dow integer, opens time, closes time, closes_next_day boolean)
    )
    select 1 from iv a join iv b on a.rn < b.rn
    where int4range(a.s, a.e) && int4range(b.s, b.e)
       or int4range(a.s + 604800, a.e + 604800) && int4range(b.s, b.e)
       or int4range(a.s, a.e) && int4range(b.s + 604800, b.e + 604800)
  ) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_hours":"overlap"}';
  end if;

  delete from public.site_hours h where h.site_id = p_site_id;
  insert into public.site_hours (site_id, dow, opens, closes, closes_next_day)
  select p_site_id, x.dow, x.opens, x.closes, x.closes_next_day
  from jsonb_to_recordset(v_norm) as x(dow smallint, opens time, closes time, closes_next_day boolean);

  perform private.audit(
    p_action      => 'site.set_hours',
    p_entity_type => 'site',
    p_entity_id   => p_site_id,
    p_org_id      => v_site.org_id,
    p_after       => jsonb_build_object('hours', v_norm));
end;
$$;

comment on function public.set_site_hours(uuid, jsonb) is
  'Replace all opening intervals of a site (owner, or manager scoped to the site). [] = 24/7. Validates format, closes_next_day rule and overlaps (overnight + week wrap).';

-- ===========================================================================
-- 4. get_site_location — exact pin / address for allowed callers
-- ===========================================================================
-- P1: members (active, any role) of the site's org and admin aal2. P2 adds: assignee/coordinator of
-- a running pickup stopping at the site; store with an unfinished allocation to a public charity
-- site. Anyone else gets PT404 (no enumeration).
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
  if not found or not (private.caller_org_role(v_site.org_id) is not null or private.is_admin()) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  return query
    select extensions.st_y(v_site.location::extensions.geometry),
           extensions.st_x(v_site.location::extensions.geometry),
           v_site.address_line;
end;
$$;

comment on function public.get_site_location(uuid) is
  'Exact lat/lng/address of a site for members of its org and admin aal2 (P2 extends to trip participants). PT404 otherwise.';

-- ===========================================================================
-- 5. count_stores_within (P1-05) — stores around a charity receiving point
-- ===========================================================================
create or replace function public.count_stores_within(p_site_id uuid, p_radius_km numeric)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_demo boolean;
begin
  perform private.require_uid();

  select * into v_site from public.sites s where s.id = p_site_id;
  if not found or not (private.caller_org_role(v_site.org_id) is not null or private.is_admin()) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if p_radius_km is null or p_radius_km not between 0.5 and 30 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_radius_km":"0.5-30"}';
  end if;

  select o.is_demo into v_demo from public.organizations o where o.id = v_site.org_id;

  return (
    select count(*)::integer
    from public.sites st
    join public.organizations o on o.id = st.org_id
    where o.kind = 'store' and o.status = 'approved' and o.is_demo = v_demo
      and st.is_active and st.id <> p_site_id
      and extensions.st_dwithin(st.location, v_site.location, (p_radius_km * 1000)::float8)
  );
end;
$$;

comment on function public.count_stores_within(uuid, numeric) is
  'Number of active sites of approved stores (same is_demo) within p_radius_km (0.5-30) of the site, geodesic ST_DWithin on sites.location (GIST). Members of the site''s org and admin aal2.';

-- ===========================================================================
-- 6. Function privileges
-- ===========================================================================
revoke all on function private.service_area_bbox() from public, anon, authenticated;
revoke all on function private.can_manage_site(uuid, uuid) from public, anon, authenticated;
revoke all on function public.upsert_site(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.set_site_hours(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_site_location(uuid) from public, anon, authenticated;
revoke all on function public.count_stores_within(uuid, numeric) from public, anon, authenticated;

grant execute on function public.upsert_site(uuid, jsonb, uuid) to authenticated;
grant execute on function public.set_site_hours(uuid, jsonb) to authenticated;
grant execute on function public.get_site_location(uuid) to authenticated;
grant execute on function public.count_stores_within(uuid, numeric) to authenticated;

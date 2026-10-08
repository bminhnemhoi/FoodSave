-- Migration 11d — needs_nearby (PRD US-STO-20 AC1–AC3, F-27 "Nhu cầu gần bạn"; DATA-MODEL §8.4, §9.2,
-- SECURITY-PRIVACY §2.3; ROADMAP P3-07)
-- RPC: public.needs_nearby(p_store_site_id, p_category_codes) — live needs whose receiving site radius
-- covers one of the caller's store sites, at public precision only.
--
-- Why an RPC: stores may already SELECT live needs (needs_select) and the public columns of sites, but
-- "inside the charity's radius" needs sites.location, which no client role can read (§9.4). The
-- function measures on the exact pins and returns only coarse results:
--   * coordinates = sites.public_location (exact only for public sites, ~550 m grid for approximate,
--     null for hidden);
--   * distance_km = 0.1 km for public sites, whole km (≥ 1, ≤ ceil(radius)) for approximate, NULL for
--     hidden (same rule as private.need_recipients: a store with several branches must not
--     triangulate a shelter);
--   * no address line, no note (free text may hold personal data), no contact, no member data.
-- Same domain filters as need_recipients (need_published): approved charity of the same is_demo, live
-- status, before needed_by, active receiving site, store site categories (accepted_categories null =
-- all) overlap the need. Paused charities are left out (reserve_bundle refuses them anyway) and so are
-- needs of any org the caller belongs to (no self-dealing, §4.8).

create or replace function public.needs_nearby(
  p_store_site_id  uuid default null,
  p_category_codes text[] default null
)
returns table (
  need_id          uuid,
  charity_org_id   uuid,
  charity_name     text,
  charity_subtype  text,
  category_codes   text[],
  unit             public.unit_code,
  quantity         numeric,
  qty_in_flight    numeric,
  qty_delivered    numeric,
  qty_remaining    numeric,
  needed_by        timestamptz,
  people_to_serve  integer,
  status           public.need_status,
  store_site_id    uuid,
  distance_km      numeric,
  site_visibility  public.site_visibility,
  site_ward        text,
  site_city        text,
  site_lat         float8,
  site_lng         float8
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := private.require_uid();
  v_now   timestamptz := private.now();
  v_cats  text[] := array_remove(p_category_codes, null);
  v_mine  uuid[];
  v_sites uuid[];
  v_kind  public.org_kind;
begin
  if coalesce(cardinality(v_cats), 0) = 0 then
    v_cats := null;                                  -- null / '{}' / '{NULL}' => no category filter
  elsif cardinality(v_cats) > 20 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_category_codes":"≤ 20 codes"}';
  end if;

  if p_store_site_id is not null then
    -- PT404 unknown site / not a member, PT403 org_not_active (B8), PT403 not_authorized (role/scope)
    perform private.require_site_role(p_store_site_id, '{owner,manager,staff}');
    select o.kind into v_kind
    from public.sites s join public.organizations o on o.id = s.org_id
    where s.id = p_store_site_id;
    if v_kind <> 'store' then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_store_site_id":"not_a_store_site"}';
    end if;
    v_sites := array[p_store_site_id];
  else
    -- every active store site the caller may act on (= can_access_site inlined: one pass, no per-row call)
    v_sites := array(
      select s.id
      from public.org_members m
      join public.organizations o on o.id = m.org_id and o.kind = 'store' and o.status = 'approved'
      join public.sites s on s.org_id = o.id and s.is_active
      where m.user_id = v_uid and m.status = 'active' and m.role in ('owner', 'manager', 'staff')
        and (m.site_ids is null or s.id = any (m.site_ids)));
  end if;

  if coalesce(cardinality(v_sites), 0) = 0 then
    return;
  end if;

  -- no self-dealing: never list the needs of an org the caller belongs to (any role, any status)
  v_mine := array(select m.org_id from public.org_members m where m.user_id = v_uid and m.status = 'active');

  return query
    with mine as materialized (
      select s.id, s.location, s.accepted_categories, o.is_demo
      from public.sites s
      join public.organizations o on o.id = s.org_id
      where s.id = any (v_sites) and s.is_active and o.kind = 'store' and o.status = 'approved'
    ), cand as (
      select n.id as nid, n.org_id as norg, co.name as cname, co.subtype as csub, n.category_codes as cats,
             n.unit as nunit, n.quantity as nqty, n.qty_in_flight as nfly, n.qty_delivered as ndel,
             n.needed_by as nby, n.people_to_serve as npeople, n.status as nstatus,
             cs.visibility as vis, cs.ward as cward, cs.city as ccity, cs.public_location as cpub,
             cs.radius_km as cradius, ms.id as ssite,
             extensions.st_distance(ms.location, cs.location) as d_m
      from mine ms
      -- 30 km = the largest allowed radius (sites.radius_km CHECK 0.5–30): a constant distance lets the
      -- GIST index sites_location_gix serve the join; the exact per-site radius is checked next
      join public.sites cs
        on extensions.st_dwithin(cs.location, ms.location, 30000::float8)
       and extensions.st_dwithin(cs.location, ms.location, (cs.radius_km * 1000)::float8)
      join public.needs n on n.site_id = cs.id
      join public.organizations co on co.id = n.org_id
      where cs.is_active
        and n.status in ('open', 'partially_matched', 'matched') and n.needed_by > v_now
        and co.kind = 'charity' and co.status = 'approved' and not co.is_paused
        and co.is_demo = ms.is_demo
        and not (n.org_id = any (v_mine))
        and (ms.accepted_categories is null or ms.accepted_categories && n.category_codes)
        and (v_cats is null or n.category_codes && v_cats)
    ), nearest as (
      -- one row per need, measured from the caller's nearest store site
      select distinct on (c.nid) c.*
      from cand c
      order by c.nid, c.d_m, c.ssite
    )
    select nr.nid, nr.norg, nr.cname, nr.csub, nr.cats, nr.nunit, nr.nqty, nr.nfly, nr.ndel,
           greatest(nr.nqty - nr.nfly - nr.ndel, 0),
           nr.nby, nr.npeople, nr.nstatus, nr.ssite,
           case nr.vis
             when 'public' then round((nr.d_m / 1000.0)::numeric, 1)
             when 'approximate' then least(greatest(round((nr.d_m / 1000.0)::numeric, 0), 1), ceil(nr.cradius))
             else null
           end,
           nr.vis, nr.cward, nr.ccity,
           extensions.st_y(nr.cpub::extensions.geometry),
           extensions.st_x(nr.cpub::extensions.geometry)
    from nearest nr
    order by (nr.nqty - nr.nfly - nr.ndel > 0) desc, nr.nby, nr.d_m, nr.nid
    limit 100;
end;
$$;

comment on function public.needs_nearby(uuid, text[]) is
  'US-STO-20 "Nhu cầu gần bạn": live needs (open/partially_matched/matched, before needed_by) of approved, unpaused charities of the same is_demo whose receiving-site radius covers one of the caller''s store sites (owner/manager/staff with site access; p_store_site_id narrows to one site), categories overlapping the store site''s accepted_categories (null = all) and p_category_codes (null/empty = all); the caller''s own orgs excluded. One row per need from the nearest store site, ≤ 100 rows, still-missing first then needed_by. Privacy: coordinates = public_location (approximate grid / null when hidden), distance 0.1 km public / whole km approximate / null hidden, ward + city only, no note or address.';

revoke all on function public.needs_nearby(uuid, text[]) from public, anon, authenticated;
grant execute on function public.needs_nearby(uuid, text[]) to authenticated;

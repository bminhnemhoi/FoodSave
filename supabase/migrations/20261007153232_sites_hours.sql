-- Migration 4/13 — sites_hours (DATA-MODEL §2.1 sites/site_hours/site_closures, §4.2, §8.1, §9)
-- Tables: sites, site_hours, site_closures.
-- Functions: private.can_access_site, public.site_close_at, private.is_open_at.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- sites — store branches / charity receiving points
-- ---------------------------------------------------------------------------
create table public.sites (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id),
  name                  text not null check (char_length(name) between 1 and 120),
  is_primary            boolean not null default false,
  address_line          text not null check (char_length(address_line) <= 300),
  ward                  text check (char_length(ward) <= 120),
  city                  text not null default 'Thành phố Hồ Chí Minh' check (char_length(city) <= 120),
  location              extensions.geography(point, 4326) not null,
  location_source       public.location_source not null default 'pin',
  location_accuracy_m   integer check (location_accuracy_m >= 0),
  visibility            public.site_visibility not null default 'public',
  public_location       extensions.geography(point, 4326) generated always as (
                          case visibility
                            when 'public' then location
                            when 'approximate' then
                              extensions.st_snaptogrid(location::extensions.geometry, 0.005)::extensions.geography
                            else null
                          end
                        ) stored,
  public_address        text generated always as (
                          case
                            when visibility = 'public' then address_line
                            else coalesce(ward || ', ', '') || city
                          end
                        ) stored,
  radius_km             numeric(4, 1) not null default 5 check (radius_km between 0.5 and 30),
  accepted_categories   text[],
  capacity_kg           numeric(8, 1) check (capacity_kg > 0),
  auto_accept_mode      public.auto_accept_mode not null default 'off',
  auto_accept_min_trust numeric(5, 2) not null default 60 check (auto_accept_min_trust between 0 and 100),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.sites is 'Store branches and charity receiving points. Written only via upsert_site (RPC). Exact location/address only via get_site_location.';
comment on column public.sites.address_line is 'SENSITIVE: not granted to anon/authenticated (§9.4); read through get_site_location.';
comment on column public.sites.ward is 'Phường/xã/đặc khu (2-level administration since 2025-07-01). There is NO district column.';
comment on column public.sites.location is 'SENSITIVE exact pin (source of truth). Not granted to anon/authenticated (§9.4).';
comment on column public.sites.visibility is 'public = exact; approximate = ~550 m grid; hidden = no coordinates (e.g. shelters).';
comment on column public.sites.public_location is 'Generated: exact when public, snapped to a 0.005° grid when approximate, null when hidden.';
comment on column public.sites.public_address is 'Generated: address_line when public, otherwise "ward, city".';
comment on column public.sites.radius_km is 'Charity: service radius. Store: radius for "needs near you".';
comment on column public.sites.accepted_categories is 'Charity: accepted food categories (null = all). Store: usual categories (filters need notifications).';
comment on column public.sites.auto_accept_min_trust is 'Minimum charity trust_score when auto_accept_mode = trusted.';

create unique index sites_one_primary_uq on public.sites (org_id) where is_primary;
create index sites_org_id_idx on public.sites (org_id);
create index sites_location_gix on public.sites using gist (location);
create index sites_public_location_gix on public.sites using gist (public_location);

-- ---------------------------------------------------------------------------
-- site_hours — local opening hours (Asia/Ho_Chi_Minh). No rows for a site = open 24/7.
-- ---------------------------------------------------------------------------
create table public.site_hours (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  dow             smallint not null check (dow between 0 and 6),
  opens           time not null,
  closes          time not null,
  closes_next_day boolean not null default false,
  constraint site_hours_order check (closes_next_day or closes > opens),
  constraint site_hours_unique unique (site_id, dow, opens)
);

comment on table public.site_hours is 'Opening hours (store) / receiving hours (charity), local time. No rows = 24/7. Replaced as a whole by set_site_hours (RPC, overlap check).';
comment on column public.site_hours.dow is '0 = Sunday (matches extract(dow)).';
comment on column public.site_hours.closes_next_day is 'Interval closes after midnight on the following local day.';

-- site_hours_unique (site_id, dow, opens) also serves the site_id FK.

-- ---------------------------------------------------------------------------
-- site_closures — local dates on which a site is closed
-- ---------------------------------------------------------------------------
create table public.site_closures (
  site_id   uuid not null references public.sites (id) on delete cascade,
  closed_on date not null,
  reason    text check (char_length(reason) <= 200),
  primary key (site_id, closed_on)
);

comment on table public.site_closures is 'Closure days (local date). An overnight interval is skipped when its START day is a closure day.';

create trigger set_updated_at before update on public.sites
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- 2. Helpers and calendar functions
-- ===========================================================================

create or replace function private.can_access_site(p_site uuid, p_roles public.org_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sites s
                 join public.org_members m on m.org_id = s.org_id
                 join public.organizations o on o.id = s.org_id and o.status = 'approved'
                 where s.id = p_site and m.user_id = (select auth.uid()) and m.status = 'active'
                   and (p_roles is null or m.role = any (p_roles))
                   and (m.site_ids is null or p_site = any (m.site_ids)));
$$;

comment on function private.can_access_site(uuid, public.org_role[]) is
  'Caller is an active member (optionally with p_roles) of the approved org owning the site and is allowed on that site (site_ids null = all).';

-- §4.2: next closing time strictly after p_at, in Asia/Ho_Chi_Minh, skipping closure days.
-- null = no hours declared (24/7) — least() then ignores it.
create or replace function public.site_close_at(p_site_id uuid, p_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select ((p_at at time zone 'Asia/Ho_Chi_Minh')::date + d) as local_day
    from generate_series(-1, 7) as d                     -- -1: overnight interval from the day before
  ), intervals as (
    select ((dd.local_day + h.closes)
            + case when h.closes_next_day then interval '1 day' else interval '0' end)
           at time zone 'Asia/Ho_Chi_Minh' as closes_at
    from days dd
    join public.site_hours h
      on h.site_id = p_site_id and h.dow = extract(dow from dd.local_day)
    where not exists (select 1 from public.site_closures c
                      where c.site_id = p_site_id and c.closed_on = dd.local_day)
  )
  select min(closes_at) from intervals where closes_at > p_at;
$$;

comment on function public.site_close_at(uuid, timestamptz) is
  'Next local closing time after p_at (Asia/Ho_Chi_Minh), skipping closure days; null when the site declares no hours (24/7). Used for offers.effective_deadline (§4.2).';

-- Whether the site is open at p_at. No hours = open 24/7 except on closure days.
create or replace function private.is_open_at(p_site_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_site_id is null or p_at is null then null
    when not exists (select 1 from public.site_hours h where h.site_id = p_site_id) then
      not exists (select 1 from public.site_closures c
                  where c.site_id = p_site_id
                    and c.closed_on = (p_at at time zone 'Asia/Ho_Chi_Minh')::date)
    else exists (
      select 1
      from generate_series(-1, 0) as d,
           lateral (select ((p_at at time zone 'Asia/Ho_Chi_Minh')::date + d) as local_day) dd
      join public.site_hours h
        on h.site_id = p_site_id and h.dow = extract(dow from dd.local_day)
      where not exists (select 1 from public.site_closures c
                        where c.site_id = p_site_id and c.closed_on = dd.local_day)
        and p_at >= ((dd.local_day + h.opens) at time zone 'Asia/Ho_Chi_Minh')
        and p_at <  (((dd.local_day + h.closes)
                      + case when h.closes_next_day then interval '1 day' else interval '0' end)
                     at time zone 'Asia/Ho_Chi_Minh'))
  end;
$$;

comment on function private.is_open_at(uuid, timestamptz) is
  'true when p_at falls in an opening interval (overnight intervals included) of a non-closure day; no hours = 24/7 except closure days.';

-- ===========================================================================
-- 3. Row level security + policies (§9.2)
-- ===========================================================================
alter table public.sites         enable row level security;
alter table public.site_hours    enable row level security;
alter table public.site_closures enable row level security;

-- sites: anon sees active sites of approved orgs (public columns only); members also see every
-- site of their own org; admin all. Writes: RPC only.
create policy sites_select_anon on public.sites
  for select to anon
  using (is_active and private.org_has_status(org_id, '{approved}'));

create policy sites_select on public.sites
  for select to authenticated
  using (
    (is_active and private.org_has_status(org_id, '{approved}'))
    or private.is_org_member(org_id)
    or (select private.is_admin())
  );

-- site_hours / site_closures: readable whenever the parent site is readable (RLS of sites applies
-- inside the sub-query). site_hours writes: RPC set_site_hours. site_closures: owner/manager of
-- an approved org with access to the site.
create policy site_hours_select on public.site_hours
  for select to anon, authenticated
  using (exists (select 1 from public.sites s where s.id = site_id));

create policy site_closures_select on public.site_closures
  for select to anon, authenticated
  using (exists (select 1 from public.sites s where s.id = site_id));

create policy site_closures_insert_owner_manager on public.site_closures
  for insert to authenticated
  with check (private.can_access_site(site_id, '{owner,manager}'));

create policy site_closures_update_owner_manager on public.site_closures
  for update to authenticated
  using (private.can_access_site(site_id, '{owner,manager}'))
  with check (private.can_access_site(site_id, '{owner,manager}'));

create policy site_closures_delete_owner_manager on public.site_closures
  for delete to authenticated
  using (private.can_access_site(site_id, '{owner,manager}'));

-- ===========================================================================
-- 4. Table / column privileges (§9.4)
-- ===========================================================================
revoke all on table public.sites, public.site_hours, public.site_closures from anon, authenticated;

grant select (id, org_id, name, ward, city, public_location, public_address, visibility, is_active)
  on public.sites to anon;
-- every column except location and address_line (exact data via get_site_location)
grant select (id, org_id, name, is_primary, ward, city, location_source, location_accuracy_m,
              visibility, public_location, public_address, radius_km, accepted_categories,
              capacity_kg, auto_accept_mode, auto_accept_min_trust, is_active, created_at, updated_at)
  on public.sites to authenticated;

grant select on public.site_hours to anon, authenticated;

grant select on public.site_closures to anon, authenticated;
grant insert (site_id, closed_on, reason) on public.site_closures to authenticated;
grant update (closed_on, reason) on public.site_closures to authenticated;
grant delete on public.site_closures to authenticated;

-- ===========================================================================
-- 5. Function privileges
-- ===========================================================================
revoke all on function private.can_access_site(uuid, public.org_role[]) from public, anon, authenticated;
revoke all on function private.is_open_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.site_close_at(uuid, timestamptz) from public, anon, authenticated;

grant execute on function private.can_access_site(uuid, public.org_role[]) to authenticated, service_role;
grant execute on function private.is_open_at(uuid, timestamptz) to service_role;
grant execute on function public.site_close_at(uuid, timestamptz) to authenticated, service_role;

-- Migration 7/13 — offers_allocations (DATA-MODEL §2.3, §4.1–§4.8, §6.1–§6.4, §7, §8.3, §8.4, §9;
-- ROADMAP P2-03, P2-09)
-- Tables: offers, needs, need_bundles (P3 RPCs; created here because allocations reference them),
--         allocations (pickup_id / stop_id FKs are added by pickups_handovers).
-- RPCs:   create_offer (addition), update_offer, update_offer_quantity, publish_offer, cancel_offer,
--         marketplace_offers, request_offer, confirm_allocation, reject_allocation,
--         cancel_allocation, mark_allocation_packed, expire_stale_requests, close_expired_offers,
--         notify_turned_red.
-- Helpers that touch pickups (private.detach_allocation, private.refresh_pickup) and the impact
-- ledger are created by later migrations of this phase; plpgsql resolves them at run time.
-- Lock order (§6 rule 2): needs → offers (ORDER BY id) → allocations (ORDER BY id) → pickups →
-- pickup_stops → handovers.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- offers — one item / one category per lot
-- ---------------------------------------------------------------------------
create table public.offers (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id),
  site_id             uuid not null references public.sites (id),
  category_code       text not null references public.food_categories (code),
  title               text not null check (char_length(title) between 2 and 120),
  description         text check (char_length(description) <= 1000),
  quantity            numeric(12, 3) not null check (quantity > 0),
  unit                public.unit_code not null,
  unit_weight_kg      numeric(10, 3) not null check (unit_weight_kg > 0 and unit_weight_kg <= 1000),
  weight_source       public.weight_source not null,
  expires_at          timestamptz not null,
  expiry_is_date_only boolean not null default false,
  pickup_window       tstzrange not null check (
                        not isempty(pickup_window) and lower_inc(pickup_window)
                        and not lower_inf(pickup_window) and not upper_inf(pickup_window)),
  effective_deadline  timestamptz,
  safety_attested_at  timestamptz,
  safety_attested_by  uuid references public.profiles (id),
  status              public.offer_status not null default 'draft',
  qty_committed       numeric(12, 3) not null default 0,
  qty_available       numeric(12, 3) generated always as (quantity - qty_committed) stored,
  qty_unclaimed       numeric(12, 3) check (qty_unclaimed >= 0),
  photo_paths         text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  ai_assisted         boolean not null default false,
  published_at        timestamptz,
  red_notified_at     timestamptz,
  closed_at           timestamptz,
  cancel_reason       text check (char_length(cancel_reason) <= 500),
  created_by          uuid not null default auth.uid() references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint offers_qty_committed_bounds check (0 <= qty_committed and qty_committed <= quantity),
  constraint offers_deadline_before_expiry check (effective_deadline <= expires_at),
  constraint offers_integer_qty check (
    unit in ('kg', 'liter')
    or (quantity = trunc(quantity) and qty_committed = trunc(qty_committed)
        and coalesce(qty_unclaimed, 0) = trunc(coalesce(qty_unclaimed, 0)))),
  constraint offers_kg_unit_weight check (unit <> 'kg' or unit_weight_kg = 1),
  constraint offers_published_fields check (
    status = 'draft'
    or (effective_deadline is not null and safety_attested_at is not null and published_at is not null)),
  constraint offers_closed_fields check (status not in ('completed', 'expired', 'cancelled') or closed_at is not null),
  constraint offers_window_before_deadline check (effective_deadline is null or lower(pickup_window) < effective_deadline)
);

comment on table public.offers is 'Donation lots. Store members insert/edit drafts directly (RLS + column allow-list) or via create_offer/update_offer; every status change goes through RPCs (§6.1).';
comment on column public.offers.unit_weight_kg is 'kg per unit. Trigger fills the category default (weight_source = category_default) when null and unit = default unit; 1 for kg.';
comment on column public.offers.expires_at is 'Date-only expiry is stored as 23:59 Asia/Ho_Chi_Minh (§4.3, expiry_is_date_only).';
comment on column public.offers.effective_deadline is 'least(expires_at, upper(pickup_window), site_close_at(site, greatest(now, lower(pickup_window)))) computed by publish_offer/update_offer (§4.2). Labels are computed from it at read time (ADR-005).';
comment on column public.offers.qty_committed is 'Σ(qty_reserved − qty_released) of every allocation of the lot, maintained by RPCs under the offer row lock (§4.4).';
comment on column public.offers.qty_unclaimed is 'qty_available when the lot closed (completed/expired/cancelled).';
comment on column public.offers.photo_paths is 'Paths in bucket media, each org/{org_id}/offer/{name}.{webp|jpg|jpeg|png} (trigger).';
comment on column public.offers.red_notified_at is 'Set once the offer_turned_red outbox event was enqueued (publish_offer when red at publish, or notify_turned_red cron).';

-- ---------------------------------------------------------------------------
-- needs — charity needs (P3 RPCs: publish_need, cancel_need, reserve_bundle)
-- ---------------------------------------------------------------------------
create table public.needs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id),
  site_id         uuid not null references public.sites (id),
  category_codes  text[] not null check (cardinality(category_codes) between 1 and 3),
  unit            public.unit_code not null,
  quantity        numeric(12, 3) not null check (quantity > 0),
  needed_by       timestamptz not null,
  people_to_serve integer check (people_to_serve > 0),
  note            text check (char_length(note) <= 500),
  status          public.need_status not null default 'open',
  qty_in_flight   numeric(12, 3) not null default 0 check (qty_in_flight >= 0),
  qty_delivered   numeric(12, 3) not null default 0 check (qty_delivered >= 0),
  closed_at       timestamptz,
  cancel_reason   text check (char_length(cancel_reason) <= 500),
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint needs_integer_qty check (unit in ('kg', 'liter') or quantity = trunc(quantity))
);

comment on table public.needs is 'Charity needs. Status is derived (private.refresh_need, §4.6); written only by RPCs (P3).';
comment on column public.needs.category_codes is 'Interchangeable categories (1–3); every element exists in food_categories (trigger).';
comment on column public.needs.qty_in_flight is 'Cache R + P in need units (§4.6).';
comment on column public.needs.qty_delivered is 'Cache D in need units (§4.6).';

-- ---------------------------------------------------------------------------
-- need_bundles — chosen matching option (P3)
-- ---------------------------------------------------------------------------
create table public.need_bundles (
  id              uuid primary key default gen_random_uuid(),
  need_id         uuid not null references public.needs (id),
  status          public.bundle_status not null default 'proposed',
  option_rank     smallint not null check (option_rank between 1 and 3),
  qty_target      numeric(12, 3) not null check (qty_target > 0),
  score           numeric(6, 4) not null check (score between 0 and 1),
  stop_count      smallint not null check (stop_count between 1 and 5),
  est_distance_m  integer not null check (est_distance_m >= 0),
  est_duration_s  integer not null check (est_duration_s >= 0),
  route           extensions.geometry(linestring, 4326),
  route_provider  text check (route_provider in ('goong', 'ors', 'aws', 'fake')),
  algorithm_version text not null check (algorithm_version ~ '^match-v[0-9]+$'),
  inputs_snapshot jsonb not null,
  rematch_of      uuid references public.need_bundles (id),
  client_op_id    uuid not null unique,
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.need_bundles is 'Matching option chosen by the charity (reserve_bundle, P3). Status derived from its allocations (private.refresh_bundle, §6.3).';

-- ---------------------------------------------------------------------------
-- allocations — one offer → one charity
-- ---------------------------------------------------------------------------
create table public.allocations (
  id                      uuid primary key default gen_random_uuid(),
  offer_id                uuid not null references public.offers (id),
  store_org_id            uuid not null references public.organizations (id),
  store_site_id           uuid not null references public.sites (id),
  charity_org_id          uuid not null references public.organizations (id),
  charity_site_id         uuid not null references public.sites (id),
  need_id                 uuid references public.needs (id),
  bundle_id               uuid references public.need_bundles (id),
  unit                    public.unit_code not null,
  unit_weight_kg_snapshot numeric(10, 3) not null check (unit_weight_kg_snapshot > 0),
  qty_reserved            numeric(12, 3) not null check (qty_reserved > 0),
  qty_picked              numeric(12, 3) not null default 0,
  qty_delivered           numeric(12, 3) not null default 0,
  qty_released            numeric(12, 3) not null default 0 check (qty_released >= 0),
  kg_delivered            numeric(12, 3) generated always as (round(qty_delivered * unit_weight_kg_snapshot, 3)) stored,
  status                  public.allocation_status not null default 'requested',
  shortfall_reason        public.shortfall_reason,
  shortfall_note          text check (char_length(shortfall_note) <= 500),
  reserved_until          timestamptz,
  pickup_id               uuid,
  stop_id                 uuid,
  requested_by            uuid not null references public.profiles (id),
  requested_at            timestamptz not null default now(),
  confirmed_at            timestamptz,
  confirmed_by            uuid references public.profiles (id),
  auto_confirmed          boolean not null default false,
  assigned_at             timestamptz,
  picked_at               timestamptz,
  delivered_at            timestamptz,
  packed_at               timestamptz,
  packed_by               uuid references public.profiles (id),
  proof_due_at            timestamptz,
  closed_at               timestamptz,
  cancelled_by            uuid references public.profiles (id),
  cancel_actor            text check (cancel_actor in ('charity', 'store', 'admin', 'system')),
  cancel_reason           text check (char_length(cancel_reason) <= 500),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint alloc_distinct_orgs check (charity_org_id <> store_org_id),
  constraint alloc_bundle_needs_need check (bundle_id is null or need_id is not null),
  constraint alloc_qty_order check (qty_reserved >= qty_picked and qty_picked >= qty_delivered and qty_delivered >= 0),
  constraint alloc_release_bound check (qty_picked + qty_released <= qty_reserved),
  constraint alloc_integer_qty check (
    unit in ('kg', 'liter')
    or (qty_reserved = trunc(qty_reserved) and qty_picked = trunc(qty_picked)
        and qty_delivered = trunc(qty_delivered) and qty_released = trunc(qty_released))),
  constraint alloc_requested_ttl check (status <> 'requested' or reserved_until is not null),
  constraint alloc_assigned_pickup check (status <> 'assigned' or (pickup_id is not null and stop_id is not null)),
  constraint alloc_delivered_fields check (status <> 'delivered' or (delivered_at is not null and proof_due_at is not null)),
  constraint alloc_shortfall_reason check (
    status not in ('picked_up', 'delivered') or qty_picked + qty_released = qty_reserved or shortfall_reason is not null),
  constraint alloc_cancel_fields check (status <> 'cancelled' or cancel_actor is not null),
  constraint alloc_closed_fields check (status not in ('delivered', 'cancelled', 'rejected', 'expired') or closed_at is not null),
  constraint alloc_packed_by check (packed_at is null or packed_by is not null)
);

comment on table public.allocations is 'Allocation of an offer to a charity (§6.4). Written only by security definer RPCs; quantity invariants are CHECKs (§4.1).';
comment on column public.allocations.store_org_id is 'Copied from the offer (Realtime filters, fast RLS).';
comment on column public.allocations.unit_weight_kg_snapshot is 'kg per unit frozen at request time (ESG-METHODOLOGY §2.3).';
comment on column public.allocations.qty_released is 'Quantity given back to the offer (§4.5).';
comment on column public.allocations.reserved_until is 'Store must answer before this (least(now + request_ttl_minutes, effective_deadline)).';
comment on column public.allocations.pickup_id is 'Trip carrying the allocation (FK added by pickups_handovers).';
comment on column public.allocations.cancel_actor is 'Who ended it: charity|store|admin|system. Also set for rejections (store) — cancel_reason then holds the rejection reason.';
comment on column public.allocations.packed_at is '"Đã đóng gói" (mark_allocation_packed); undo within 2 minutes.';
comment on column public.allocations.closed_at is 'When the allocation reached a terminal state (delivered, cancelled, rejected, expired).';

-- ===========================================================================
-- 2. Indexes (§3) — every FK column is indexed
-- ===========================================================================
create index offers_org_status_idx on public.offers (org_id, status);
create index offers_open_idx on public.offers (category_code, effective_deadline)
  where status = 'open' and qty_available > 0;
create index offers_live_deadline_idx on public.offers (effective_deadline)
  where status in ('open', 'fully_allocated');
create index offers_red_pending_idx on public.offers (effective_deadline)
  where status in ('open', 'fully_allocated') and red_notified_at is null;
create index offers_site_id_idx on public.offers (site_id);
create index offers_category_code_idx on public.offers (category_code);
create index offers_created_by_idx on public.offers (created_by);
create index offers_safety_attested_by_idx on public.offers (safety_attested_by) where safety_attested_by is not null;

create index needs_org_status_idx on public.needs (org_id, status);
create index needs_live_idx on public.needs (needed_by) where status in ('open', 'partially_matched', 'matched');
create index needs_site_id_idx on public.needs (site_id);
create index needs_created_by_idx on public.needs (created_by);

create index need_bundles_need_status_idx on public.need_bundles (need_id, status);
create index need_bundles_rematch_of_idx on public.need_bundles (rematch_of) where rematch_of is not null;
create index need_bundles_created_by_idx on public.need_bundles (created_by);

create index allocations_offer_status_idx on public.allocations (offer_id, status);
create index allocations_store_org_status_idx on public.allocations (store_org_id, status);
create index allocations_charity_org_status_idx on public.allocations (charity_org_id, status);
create index allocations_store_site_id_idx on public.allocations (store_site_id);
create index allocations_charity_site_id_idx on public.allocations (charity_site_id);
create index allocations_need_id_idx on public.allocations (need_id) where need_id is not null;
create index allocations_bundle_id_idx on public.allocations (bundle_id) where bundle_id is not null;
create index allocations_pickup_id_idx on public.allocations (pickup_id) where pickup_id is not null;
create index allocations_stop_id_idx on public.allocations (stop_id) where stop_id is not null;
create index allocations_requested_ttl_idx on public.allocations (reserved_until) where status = 'requested';
create index allocations_proof_due_idx on public.allocations (proof_due_at) where status = 'delivered';
create index allocations_requested_by_idx on public.allocations (requested_by);
create index allocations_confirmed_by_idx on public.allocations (confirmed_by) where confirmed_by is not null;
create index allocations_packed_by_idx on public.allocations (packed_by) where packed_by is not null;
create index allocations_cancelled_by_idx on public.allocations (cancelled_by) where cancelled_by is not null;

-- ===========================================================================
-- 3. Trigger functions + triggers
-- ===========================================================================

-- offers: site belongs to the (store) org; category exists (active when chosen); unit weight
-- default / kg = 1; media paths inside org/{org_id}/offer/.
create or replace function private.offers_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat      public.food_categories%rowtype;
  v_site_org uuid;
  v_kind     public.org_kind;
  v_path     text;
begin
  if tg_op = 'INSERT' or new.site_id is distinct from old.site_id or new.org_id is distinct from old.org_id then
    select s.org_id into v_site_org from public.sites s where s.id = new.site_id;
    select o.kind into v_kind from public.organizations o where o.id = new.org_id;
    if v_site_org is distinct from new.org_id or v_kind is distinct from 'store' then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"site_id":"not_a_site_of_this_store"}';
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.category_code is distinct from old.category_code
     or new.unit is distinct from old.unit
     or new.unit_weight_kg is distinct from old.unit_weight_kg
     or new.weight_source is distinct from old.weight_source then
    select * into v_cat from public.food_categories c where c.code = new.category_code;
    if not found
       or (not v_cat.is_active and (tg_op = 'INSERT' or new.category_code is distinct from old.category_code)) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"category_code":"unknown_or_inactive"}';
    end if;

    if new.unit = 'kg' then
      new.unit_weight_kg := 1;
      new.weight_source := 'declared';
    else
      -- a category/unit change re-derives a weight that was only the category default
      if tg_op = 'UPDATE' and old.weight_source = 'category_default'
         and new.unit_weight_kg is not distinct from old.unit_weight_kg
         and (new.category_code is distinct from old.category_code or new.unit is distinct from old.unit) then
        new.unit_weight_kg := null;
      end if;

      if new.unit_weight_kg is null then
        if new.unit = v_cat.default_unit then
          new.unit_weight_kg := v_cat.default_unit_weight_kg;
          new.weight_source := 'category_default';
        else
          raise exception using errcode = 'PT422', message = 'validation_failed',
            detail = '{"unit_weight_kg":"required_for_unit"}';
        end if;
      elsif new.weight_source is null
            or (new.weight_source = 'category_default'
                and not (new.unit = v_cat.default_unit and new.unit_weight_kg = v_cat.default_unit_weight_kg)) then
        new.weight_source := 'declared';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or new.photo_paths is distinct from old.photo_paths or new.org_id is distinct from old.org_id then
    foreach v_path in array coalesce(new.photo_paths, '{}') loop
      if v_path is null
         or v_path !~ ('^org/' || new.org_id::text || '/offer/[A-Za-z0-9_-]{1,80}\.(webp|jpg|jpeg|png)$') then
        raise exception using errcode = 'PT422', message = 'validation_failed',
          detail = '{"photo_paths":"must be org/{org_id}/offer/{name}.{webp|jpg|jpeg|png}"}';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

comment on function private.offers_before_write() is
  'BEFORE INSERT/UPDATE on offers: site in the store org, category active, unit weight default (category_default) / kg = 1, media path prefix.';

-- needs: categories exist (distinct), site belongs to the (charity) org.
create or replace function private.needs_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(new.category_codes) c(code)
             where c.code is null or not exists (select 1 from public.food_categories f where f.code = c.code))
     or (select count(distinct c) from unnest(new.category_codes) c) <> cardinality(new.category_codes) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"category_codes":"unknown_or_duplicate"}';
  end if;

  if tg_op = 'INSERT' or new.site_id is distinct from old.site_id or new.org_id is distinct from old.org_id then
    if not exists (select 1 from public.sites s join public.organizations o on o.id = s.org_id
                   where s.id = new.site_id and s.org_id = new.org_id and o.kind = 'charity') then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"site_id":"not_a_site_of_this_charity"}';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.needs_before_write() is 'BEFORE INSERT/UPDATE on needs: category_codes exist (no duplicates); site belongs to the charity org.';

-- Layer-two defence (§9.4) extended with offers: the status/approval/quantity-commitment columns
-- cannot change when the statement runs as anon/authenticated (outside a definer RPC).
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
    when 'offers' then
      array['id', 'org_id', 'status', 'qty_committed', 'qty_unclaimed', 'effective_deadline',
            'published_at', 'safety_attested_at', 'safety_attested_by', 'red_notified_at',
            'closed_at', 'cancel_reason', 'ai_assisted', 'created_by', 'created_at']
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
  'BEFORE UPDATE: raises 42501 if a privileged column changes while current_user is anon/authenticated (profiles, organizations, org_sensitive, offers); organizations.kind is immutable for everyone.';

create trigger set_updated_at before update on public.offers
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.needs
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.need_bundles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.allocations
  for each row execute function private.set_updated_at();

create trigger offers_before_write
  before insert or update of org_id, site_id, category_code, unit, unit_weight_kg, weight_source, photo_paths
  on public.offers
  for each row execute function private.offers_before_write();

create trigger guard_privileged_columns before update on public.offers
  for each row execute function private.guard_privileged_columns();

create trigger needs_before_write before insert or update of org_id, site_id, category_codes on public.needs
  for each row execute function private.needs_before_write();

-- ===========================================================================
-- 4. RLS helpers (private, security definer, stable)
-- ===========================================================================

-- Caller is an active member (optionally with p_roles) of at least one APPROVED org of p_kind.
create or replace function private.is_kind_member(p_kind public.org_kind, p_roles public.org_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.org_members m
                 join public.organizations o on o.id = m.org_id
                 where m.user_id = (select auth.uid()) and m.status = 'active'
                   and o.kind = p_kind and o.status = 'approved'
                   and (p_roles is null or m.role = any (p_roles)));
$$;

comment on function private.is_kind_member(public.org_kind, public.org_role[]) is
  'Caller is an active member (roles optional) of an approved org of p_kind (B8: unapproved orgs never qualify).';

-- The offer has an allocation whose receiving site the caller (charity owner/manager/staff) may access.
create or replace function private.offer_allocated_to_me(p_offer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.allocations a
                 where a.offer_id = p_offer
                   and private.can_access_site(a.charity_site_id, '{owner,manager,staff}'));
$$;

comment on function private.offer_allocated_to_me(uuid) is 'offers RLS: a charity sees offers it holds allocations on (any status).';

-- The need has an allocation from a store site the caller may access.
create or replace function private.need_supplied_by_me(p_need uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.allocations a
                 where a.need_id = p_need
                   and private.can_access_site(a.store_site_id, '{owner,manager,staff}'));
$$;

comment on function private.need_supplied_by_me(uuid) is 'needs RLS: a store sees needs it supplies through an allocation.';

-- need_bundles visibility: owner/manager/staff of the need''s charity, or a store supplying it.
create or replace function private.bundle_visible(p_bundle uuid, p_need uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.needs n
                 where n.id = p_need and private.is_active_org_member(n.org_id, '{owner,manager,staff}'))
      or exists (select 1 from public.allocations a
                 where a.bundle_id = p_bundle
                   and private.can_access_site(a.store_site_id, '{owner,manager,staff}'));
$$;

comment on function private.bundle_visible(uuid, uuid) is 'need_bundles RLS: charity owning the need, or a store with an allocation in the bundle.';

-- ===========================================================================
-- 5. Row level security + policies (§9.2)
-- ===========================================================================
alter table public.offers       enable row level security;
alter table public.needs        enable row level security;
alter table public.need_bundles enable row level security;
alter table public.allocations  enable row level security;

-- offers: SM own lots (site scope); CM open lots of approved stores + lots they hold allocations
-- on; admin aal2. Volunteers (lots of their trips) get a policy in pickups_handovers.
create policy offers_select on public.offers
  for select to authenticated
  using (
    private.can_access_site(site_id, '{owner,manager,staff}')
    or (status in ('open', 'fully_allocated')
        and private.org_has_status(org_id, '{approved}')
        and (select private.is_kind_member('charity', '{owner,manager,staff}')))
    or private.offer_allocated_to_me(id)
    or (select private.is_admin())
  );

create policy offers_insert_store on public.offers
  for insert to authenticated
  with check (
    status = 'draft'
    and created_by = (select auth.uid())
    and private.can_access_site(site_id, '{owner,manager,staff}')
  );

create policy offers_update_draft on public.offers
  for update to authenticated
  using (status = 'draft' and private.can_access_site(site_id, '{owner,manager,staff}'))
  with check (status = 'draft' and private.can_access_site(site_id, '{owner,manager,staff}'));

create policy offers_delete_draft on public.offers
  for delete to authenticated
  using (status = 'draft' and private.can_access_site(site_id, '{owner,manager,staff}'));

-- needs: members of the charity (any role); stores read live needs of approved charities and needs
-- they supply; admin. Writes: RPC (P3).
create policy needs_select on public.needs
  for select to authenticated
  using (
    private.is_active_org_member(org_id)
    or (status in ('open', 'partially_matched', 'matched')
        and private.org_has_status(org_id, '{approved}')
        and (select private.is_kind_member('store', '{owner,manager,staff}')))
    or private.need_supplied_by_me(id)
    or (select private.is_admin())
  );

create policy need_bundles_select on public.need_bundles
  for select to authenticated
  using (private.bundle_visible(id, need_id) or (select private.is_admin()));

-- allocations: store side (site scope), charity side (receiving-site scope), admin. Volunteers of
-- the assigned trip: policy in pickups_handovers.
create policy allocations_select on public.allocations
  for select to authenticated
  using (
    private.can_access_site(store_site_id, '{owner,manager,staff}')
    or private.can_access_site(charity_site_id, '{owner,manager,staff}')
    or (select private.is_admin())
  );

-- ===========================================================================
-- 6. Table / column privileges (§9.4)
-- ===========================================================================
revoke all on table public.offers, public.needs, public.need_bundles, public.allocations from anon, authenticated;

grant select on public.offers to authenticated;
grant insert (org_id, site_id, category_code, title, description, quantity, unit, unit_weight_kg,
              weight_source, expires_at, expiry_is_date_only, pickup_window, photo_paths, ai_assisted)
  on public.offers to authenticated;
grant update (title, description, photo_paths, category_code, quantity, unit, unit_weight_kg,
              weight_source, expires_at, expiry_is_date_only, pickup_window, site_id)
  on public.offers to authenticated;
grant delete on public.offers to authenticated;

grant select on public.needs to authenticated;
grant select on public.need_bundles to authenticated;
grant select on public.allocations to authenticated;

-- ===========================================================================
-- 7. Internal helpers
-- ===========================================================================

-- Caller's role on the org of p_site when they may act on that site with p_roles. Errors:
-- PT404 not_found (site unknown / caller not a member; admins get PT403 not_authorized),
-- PT403 org_not_active (org not approved), PT403 not_authorized (role or site scope).
create or replace function private.require_site_role(p_site uuid, p_roles public.org_role[])
returns public.org_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_status public.org_status;
  v_role   public.org_role;
begin
  select s.org_id, o.status into v_org, v_status
  from public.sites s join public.organizations o on o.id = s.org_id
  where s.id = p_site;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  v_role := private.caller_org_role(v_org);
  if v_role is null then
    if private.is_admin() then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if v_status <> 'approved' then
    raise exception using errcode = 'PT403', message = 'org_not_active';
  end if;

  if not private.can_access_site(p_site, p_roles) then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;

  return v_role;
end;
$$;

comment on function private.require_site_role(uuid, public.org_role[]) is
  'Role of the caller in the site''s approved org when allowed on the site with p_roles; PT404 / PT403 org_not_active / PT403 not_authorized otherwise.';

-- §4.7: minutes to travel p_distance_m (crow-fly × detour ÷ speed + buffer; app_settings).
create or replace function private.travel_min(p_distance_m float8)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round((p_distance_m / 1000.0)::numeric * private.setting_num('matching_detour_factor', 1.4)
               / nullif(private.setting_num('matching_speed_kmh', 18), 0) * 60
               + private.setting_num('matching_buffer_minutes', 10), 2);
$$;

comment on function private.travel_min(float8) is 'travel_min = distance_km × matching_detour_factor ÷ matching_speed_kmh × 60 + matching_buffer_minutes (§4.7, ADR-007).';

-- §4.7 feasibility of picking an offer up from p_store_site and dropping it at p_charity_site.
create or replace function private.feasibility(
  p_store_site   uuid,
  p_charity_site uuid,
  p_window       tstzrange,
  p_deadline     timestamptz,
  p_at           timestamptz,
  out distance_m  float8,
  out travel_min  numeric,
  out eta_pickup  timestamptz,
  out eta_dropoff timestamptz,
  out feasible    boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select extensions.st_distance(s.location, c.location) into distance_m
  from public.sites s, public.sites c
  where s.id = p_store_site and c.id = p_charity_site;

  travel_min := private.travel_min(distance_m);
  eta_pickup := greatest(p_at + travel_min::float8 * interval '1 minute', lower(p_window));
  eta_dropoff := eta_pickup + travel_min::float8 * interval '1 minute';
  feasible := distance_m is not null
              and eta_pickup <= p_deadline
              and coalesce(private.is_open_at(p_charity_site, eta_dropoff), false);
end;
$$;

comment on function private.feasibility(uuid, uuid, tstzrange, timestamptz, timestamptz) is
  '§4.7: eta_pickup = greatest(at + travel, lower(window)) ≤ deadline and the receiving site is open at eta_dropoff.';

-- §4.2 + PRD US-STO-07 AC5: validates the pickup window of an offer and returns its effective
-- deadline at p_at. Raises PT422 validation_failed with a jsonb detail.
create or replace function private.offer_effective_deadline(p_offer public.offers, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start    timestamptz := greatest(p_at, lower(p_offer.pickup_window));
  v_close    timestamptz;
  v_deadline timestamptz;
  v_lead     numeric := private.setting_num('min_publish_lead_minutes', 30);
begin
  if upper(p_offer.pickup_window) <= p_at then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"pickup_window":"ended"}';
  end if;
  if upper(p_offer.pickup_window) > p_offer.expires_at then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('pickup_window', 'after_expiry', 'suggested_end', p_offer.expires_at)::text;
  end if;
  if not coalesce(private.is_open_at(p_offer.site_id, v_start), false) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"pickup_window":"outside_hours"}';
  end if;

  v_close := public.site_close_at(p_offer.site_id, v_start);
  if v_close is not null and upper(p_offer.pickup_window) > v_close then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('pickup_window', 'after_close', 'suggested_end', v_close)::text;
  end if;

  v_deadline := least(p_offer.expires_at, upper(p_offer.pickup_window), v_close);

  if v_deadline - v_start < v_lead * interval '1 minute' then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('pickup_window', 'too_short', 'min_minutes', v_lead)::text;
  end if;

  return v_deadline;
end;
$$;

comment on function private.offer_effective_deadline(public.offers, timestamptz) is
  'effective_deadline = least(expires_at, upper(pickup_window), site_close_at(site, greatest(at, lower(window)))) after validating the window (open at start, ends before closing/expiry, ≥ min_publish_lead_minutes).';

-- Applies a create/update payload to an offer row (no write). Keys: site_id (create only, handled
-- by the caller), category_code, title, description, quantity, unit, unit_weight_kg (null =
-- category default), expiry {date}|{datetime}, pickup_start, pickup_end (ISO with offset),
-- photo_paths, ai_assisted. Raises PT422 validation_failed with every field error at once.
create or replace function private.apply_offer_patch(p_row public.offers, p_patch jsonb, p_create boolean)
returns public.offers
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     jsonb := '{}'::jsonb;
  v_allowed text[] := array['category_code', 'title', 'description', 'quantity', 'unit', 'unit_weight_kg',
                            'expiry', 'pickup_start', 'pickup_end', 'photo_paths', 'ai_assisted', 'site_id'];
  v_unknown text[];
  v_cat     public.food_categories%rowtype;
  v_txt     text;
  v_start   timestamptz := lower(p_row.pickup_window);
  v_end     timestamptz := upper(p_row.pickup_window);
  v_exp     record;
  v_val     jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_payload":"object_required"}';
  end if;

  select array_agg(k order by k) into v_unknown from jsonb_object_keys(p_patch) k where not (k = any (v_allowed));
  if v_unknown is not null then
    v_err := v_err || jsonb_build_object('unknown_keys', to_jsonb(v_unknown));
  end if;

  if p_patch ? 'category_code' then
    select * into v_cat from public.food_categories c
    where c.code = (p_patch ->> 'category_code') and c.is_active;
    if not found then
      v_err := v_err || '{"category_code":"unknown_or_inactive"}'::jsonb;
    else
      p_row.category_code := v_cat.code;
    end if;
  elsif p_row.category_code is not null then
    select * into v_cat from public.food_categories c where c.code = p_row.category_code;
  end if;

  if p_patch ? 'title' then
    v_txt := btrim(p_patch ->> 'title');
    if jsonb_typeof(p_patch -> 'title') <> 'string' or char_length(v_txt) not between 2 and 120 then
      v_err := v_err || '{"title":"2-120 chars"}'::jsonb;
    else
      p_row.title := v_txt;
    end if;
  end if;

  if p_patch ? 'description' then
    if jsonb_typeof(p_patch -> 'description') = 'null' then
      p_row.description := null;
    elsif jsonb_typeof(p_patch -> 'description') <> 'string' or char_length(btrim(p_patch ->> 'description')) > 1000 then
      v_err := v_err || '{"description":"≤ 1000 chars"}'::jsonb;
    else
      p_row.description := nullif(btrim(p_patch ->> 'description'), '');
    end if;
  end if;

  if p_patch ? 'unit' then
    if jsonb_typeof(p_patch -> 'unit') <> 'string'
       or not ((p_patch ->> 'unit') = any (enum_range(null::public.unit_code)::text[])) then
      v_err := v_err || '{"unit":"unknown"}'::jsonb;
    else
      p_row.unit := (p_patch ->> 'unit')::public.unit_code;
    end if;
  elsif p_create and v_cat.code is not null then
    p_row.unit := v_cat.default_unit;
  end if;

  if p_patch ? 'quantity' then
    if jsonb_typeof(p_patch -> 'quantity') <> 'number'
       or (p_patch ->> 'quantity')::numeric <= 0 or (p_patch ->> 'quantity')::numeric > 999999999 then
      v_err := v_err || '{"quantity":"> 0"}'::jsonb;
    else
      p_row.quantity := (p_patch ->> 'quantity')::numeric;
    end if;
  end if;

  if p_patch ? 'unit_weight_kg' then
    if jsonb_typeof(p_patch -> 'unit_weight_kg') = 'null' then
      p_row.unit_weight_kg := null;              -- trigger fills the category default
      p_row.weight_source := null;
    elsif jsonb_typeof(p_patch -> 'unit_weight_kg') <> 'number'
          or (p_patch ->> 'unit_weight_kg')::numeric <= 0 or (p_patch ->> 'unit_weight_kg')::numeric > 1000 then
      v_err := v_err || '{"unit_weight_kg":"0 < kg ≤ 1000"}'::jsonb;
    else
      p_row.unit_weight_kg := (p_patch ->> 'unit_weight_kg')::numeric;
      p_row.weight_source := 'declared';
    end if;
  end if;

  if p_patch ? 'expiry' then
    select * into v_exp from private.parse_expiry(p_patch -> 'expiry');
    if v_exp.expires_at is null then
      v_err := v_err || '{"expiry":"{date: YYYY-MM-DD} or {datetime: ISO-8601 with offset}"}'::jsonb;
    else
      p_row.expires_at := v_exp.expires_at;
      p_row.expiry_is_date_only := v_exp.is_date_only;
    end if;
  end if;

  if p_patch ? 'pickup_start' then
    v_start := private.try_timestamptz(p_patch ->> 'pickup_start');
    if v_start is null then
      v_err := v_err || '{"pickup_start":"ISO-8601 with offset"}'::jsonb;
    end if;
  end if;
  if p_patch ? 'pickup_end' then
    v_end := private.try_timestamptz(p_patch ->> 'pickup_end');
    if v_end is null then
      v_err := v_err || '{"pickup_end":"ISO-8601 with offset"}'::jsonb;
    end if;
  end if;
  if (p_patch ? 'pickup_start' or p_patch ? 'pickup_end') and v_start is not null and v_end is not null then
    if v_end <= v_start then
      v_err := v_err || '{"pickup_window":"end_before_start"}'::jsonb;
    else
      p_row.pickup_window := tstzrange(v_start, v_end, '[)');
    end if;
  end if;

  if p_patch ? 'photo_paths' then
    v_val := p_patch -> 'photo_paths';
    if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) > 4
       or exists (select 1 from jsonb_array_elements(v_val) e where jsonb_typeof(e) <> 'string') then
      v_err := v_err || '{"photo_paths":"array of ≤ 4 strings"}'::jsonb;
    else
      p_row.photo_paths := array(select jsonb_array_elements_text(v_val));
    end if;
  end if;

  if p_patch ? 'ai_assisted' then
    if jsonb_typeof(p_patch -> 'ai_assisted') <> 'boolean' then
      v_err := v_err || '{"ai_assisted":"boolean"}'::jsonb;
    else
      p_row.ai_assisted := (p_patch ->> 'ai_assisted')::boolean;
    end if;
  end if;

  if p_create then
    if p_row.category_code is null and not v_err ? 'category_code' then
      v_err := v_err || '{"category_code":"required"}'::jsonb;
    end if;
    if p_row.title is null and not v_err ? 'title' then
      v_err := v_err || '{"title":"required"}'::jsonb;
    end if;
    if p_row.quantity is null and not v_err ? 'quantity' then
      v_err := v_err || '{"quantity":"required"}'::jsonb;
    end if;
    if p_row.expires_at is null and not v_err ? 'expiry' then
      v_err := v_err || '{"expiry":"required"}'::jsonb;
    end if;
    if p_row.pickup_window is null and not (v_err ? 'pickup_start' or v_err ? 'pickup_end' or v_err ? 'pickup_window') then
      v_err := v_err || '{"pickup_window":"pickup_start and pickup_end required"}'::jsonb;
    end if;
  end if;

  if p_row.quantity is not null and p_row.unit is not null and p_row.unit not in ('kg', 'liter')
     and p_row.quantity <> trunc(p_row.quantity) then
    v_err := v_err || '{"quantity":"integer_required"}'::jsonb;
  end if;

  if v_err <> '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = v_err::text;
  end if;

  return p_row;
end;
$$;

comment on function private.apply_offer_patch(public.offers, jsonb, boolean) is
  'Validate + apply a create_offer/update_offer payload to an offers row (no write). PT422 validation_failed lists every field error.';

-- §4.6 conversion of an allocation quantity into need units.
create or replace function private.to_need_units(p_qty numeric, p_unit public.unit_code,
                                                 p_unit_weight_kg numeric, p_need_unit public.unit_code)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_unit = p_need_unit then
    return p_qty;
  elsif p_need_unit = 'kg' then
    return p_qty * p_unit_weight_kg;
  end if;
  raise exception using errcode = 'PT422', message = 'unit_mismatch';
end;
$$;

comment on function private.to_need_units(numeric, public.unit_code, numeric, public.unit_code) is 'qty in need units: same unit => qty; need in kg => qty × unit_weight_kg; else PT422 unit_mismatch (§4.6).';

-- Trust score (§2.6 trust_events): append the event and recompute clamp(50 + Σ delta, 0, 100).
create or replace function private.apply_trust(p_org uuid, p_delta numeric, p_reason text,
                                               p_ref_type text default null, p_ref_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- serialise per org: without this row lock a concurrent apply_trust blocked on the UPDATE
  -- below re-checks the row but keeps its old snapshot for Σ delta (lost update of trust_score).
  perform 1 from public.organizations o where o.id = p_org for update;

  insert into public.trust_events (org_id, delta, reason, rules_version, ref_type, ref_id, created_at)
  values (p_org, p_delta, p_reason, 1, p_ref_type, p_ref_id, private.now());

  update public.organizations o
     set trust_score = greatest(0, least(100, 50 + coalesce(
           (select sum(t.delta) from public.trust_events t where t.org_id = p_org), 0)))
   where o.id = p_org;
end;
$$;

comment on function private.apply_trust(uuid, numeric, text, text, uuid) is
  'Trust table v1 (§2.6): one trust_events row + organizations.trust_score = clamp(50 + Σ delta, 0, 100). Internal.';

-- Gives p_qty of an allocation back to its offer (§4.5) unless the offer is already closed.
-- Caller holds the offer + allocation locks. Returns the released quantity.
create or replace function private.release_qty(p_allocation_id uuid, p_qty numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer  uuid;
  v_status public.offer_status;
begin
  if p_qty is null or p_qty <= 0 then
    return 0;
  end if;

  select a.offer_id, o.status into v_offer, v_status
  from public.allocations a join public.offers o on o.id = a.offer_id
  where a.id = p_allocation_id;

  if v_status not in ('open', 'fully_allocated') then
    return 0;   -- a closed lot never takes quantity back
  end if;

  update public.allocations set qty_released = qty_released + p_qty where id = p_allocation_id;
  update public.offers set qty_committed = qty_committed - p_qty where id = v_offer;
  return p_qty;
end;
$$;

comment on function private.release_qty(uuid, numeric) is 'Return quantity to the offer (qty_released += q, qty_committed -= q) unless the offer is closed (§4.5).';

-- open <-> fully_allocated, and fully_allocated -> completed once nothing is live and something was
-- picked (§6.1). Caller holds the offer row lock.
create or replace function private.refresh_offer(p_offer_id uuid)
returns public.offer_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v     public.offers%rowtype;
  v_new public.offer_status;
  v_now timestamptz := private.now();
begin
  select * into v from public.offers where id = p_offer_id;
  if not found or v.status not in ('open', 'fully_allocated') then
    return v.status;
  end if;

  v_new := v.status;
  if v.qty_available <= 0 then
    v_new := 'fully_allocated';
    if not exists (select 1 from public.allocations a
                   where a.offer_id = v.id and a.status in ('requested', 'confirmed', 'assigned'))
       and exists (select 1 from public.allocations a where a.offer_id = v.id and a.qty_picked > 0) then
      v_new := 'completed';
    end if;
  elsif v.status = 'fully_allocated' and v.effective_deadline > v_now then
    v_new := 'open';
  end if;

  if v_new <> v.status then
    update public.offers
       set status = v_new,
           closed_at = case when v_new = 'completed' then v_now else closed_at end,
           qty_unclaimed = case when v_new = 'completed' then quantity - qty_committed else qty_unclaimed end
     where id = v.id;

    if v_new = 'completed' then
      perform private.audit(
        p_action      => 'offer.complete',
        p_entity_type => 'offer',
        p_entity_id   => v.id,
        p_org_id      => v.org_id,
        p_before      => jsonb_build_object('status', v.status),
        p_after       => jsonb_build_object('status', v_new));
    end if;
  end if;

  return v_new;
end;
$$;

comment on function private.refresh_offer(uuid) is 'Derived offer status: open <-> fully_allocated by qty_available; fully_allocated -> completed when no live allocation remains and something was picked.';

-- §4.6 derived need status + caches (status frozen once terminal).
create or replace function private.refresh_need(p_need_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v   public.needs%rowtype;
  v_r numeric;
  v_p numeric;
  v_d numeric;
  v_status public.need_status;
begin
  select * into v from public.needs where id = p_need_id;
  if not found then
    return;
  end if;

  select coalesce(sum(private.to_need_units(a.qty_reserved - a.qty_released, a.unit, a.unit_weight_kg_snapshot, v.unit))
                    filter (where a.status in ('requested', 'confirmed', 'assigned')), 0),
         coalesce(sum(private.to_need_units(a.qty_picked, a.unit, a.unit_weight_kg_snapshot, v.unit))
                    filter (where a.status = 'picked_up'), 0),
         coalesce(sum(private.to_need_units(a.qty_delivered, a.unit, a.unit_weight_kg_snapshot, v.unit))
                    filter (where a.status = 'delivered'), 0)
    into v_r, v_p, v_d
  from public.allocations a where a.need_id = p_need_id;

  v_status := case
    when v.status in ('fulfilled', 'closed_partial', 'expired', 'cancelled') then v.status
    when v_d >= v.quantity then 'fulfilled'
    when v_r + v_p + v_d >= v.quantity then 'matched'
    when v_r + v_p + v_d > 0 then 'partially_matched'
    else 'open'
  end;

  update public.needs
     set qty_in_flight = v_r + v_p,
         qty_delivered = v_d,
         status = v_status,
         closed_at = case when v_status = 'fulfilled' and closed_at is null then private.now() else closed_at end
   where id = p_need_id
     and (qty_in_flight, qty_delivered, status) is distinct from (v_r + v_p, v_d, v_status);
end;
$$;

comment on function private.refresh_need(uuid) is 'Need caches (R+P, D) and derived status per §4.6; terminal statuses are kept.';

-- §6.3 derived bundle status; bundle_confirmed outbox when it becomes confirmed.
create or replace function private.refresh_bundle(p_bundle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v      public.need_bundles%rowtype;
  v_live integer;
  v_ok   integer;
  v_new  public.bundle_status;
begin
  select * into v from public.need_bundles where id = p_bundle_id;
  if not found then
    return;
  end if;

  select count(*) filter (where a.status = 'requested'),
         count(*) filter (where a.status in ('confirmed', 'assigned', 'picked_up', 'delivered'))
    into v_live, v_ok
  from public.allocations a where a.bundle_id = p_bundle_id;

  v_new := case
    when v_live > 0 and v_ok = 0 then 'proposed'
    when v_live > 0 then 'partially_confirmed'
    when v_ok > 0 then 'confirmed'
    else 'cancelled'
  end;

  if v_new is distinct from v.status then
    update public.need_bundles set status = v_new where id = p_bundle_id;
    if v_new = 'confirmed' then
      perform private.enqueue('bundle_confirmed', 'need_bundle', p_bundle_id,
        'bundle_confirmed:' || p_bundle_id,
        jsonb_build_object('bundle_id', p_bundle_id, 'need_id', v.need_id));
    end if;
  end if;
end;
$$;

comment on function private.refresh_bundle(uuid) is 'Bundle status from its allocations (§6.3: live/ok counts); outbox bundle_confirmed once.';

-- Ids-only payload of allocation events.
create or replace function private.alloc_payload(p_a public.allocations, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'allocation_id', p_a.id, 'offer_id', p_a.offer_id,
    'store_org_id', p_a.store_org_id, 'store_site_id', p_a.store_site_id,
    'charity_org_id', p_a.charity_org_id, 'charity_site_id', p_a.charity_site_id,
    'pickup_id', p_a.pickup_id, 'need_id', p_a.need_id, 'bundle_id', p_a.bundle_id)
    || coalesce(p_extra, '{}'::jsonb);
$$;

comment on function private.alloc_payload(public.allocations, jsonb) is 'Outbox payload of allocation events (ids and enums only, no PII).';

-- Side effects shared by every allocation transition: need/bundle refresh and, when the store side
-- caused a bundle allocation to die, bundle_shortfall (§6.3).
create or replace function private.after_allocation_change(p_a public.allocations, p_store_caused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_a.need_id is not null then
    perform private.refresh_need(p_a.need_id);
  end if;
  if p_a.bundle_id is not null then
    perform private.refresh_bundle(p_a.bundle_id);
    if p_store_caused then
      perform private.enqueue('bundle_shortfall', 'need_bundle', p_a.bundle_id,
        'bundle_shortfall:' || p_a.bundle_id || ':' || p_a.id,
        jsonb_build_object('bundle_id', p_a.bundle_id, 'need_id', p_a.need_id, 'allocation_id', p_a.id));
    end if;
  end if;
end;
$$;

comment on function private.after_allocation_change(public.allocations, boolean) is 'Refresh need/bundle of an allocation; bundle_shortfall when the store side ended it (reject, expiry, store cancel).';

-- Locks need (if any) → offer → allocation in the global order and returns the allocation
-- (all-null row when it does not exist).
create or replace function private.lock_allocation(p_allocation_id uuid)
returns public.allocations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer uuid;
  v_need  uuid;
  v       public.allocations%rowtype;
begin
  select a.offer_id, a.need_id into v_offer, v_need from public.allocations a where a.id = p_allocation_id;
  if not found then
    return v;
  end if;
  if v_need is not null then
    perform 1 from public.needs n where n.id = v_need for update;
  end if;
  perform 1 from public.offers o where o.id = v_offer for update;
  select * into v from public.allocations a where a.id = p_allocation_id for update;
  return v;
end;
$$;

comment on function private.lock_allocation(uuid) is 'Lock need → offer → allocation (global lock order, §6) and return the allocation row.';

-- requested -> expired for allocations of a LOCKED offer whose reserved_until passed (§6.4 lazy
-- expiry, C7): full release, outbox allocation_expired (+ bundle_shortfall), audit (system).
create or replace function private.expire_requested(p_offer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v     public.allocations%rowtype;
  v_n   integer := 0;
begin
  for v in
    select * from public.allocations a
    where a.offer_id = p_offer_id and a.status = 'requested' and a.reserved_until <= v_now
    order by a.id
    for update
  loop
    update public.allocations set status = 'expired', closed_at = v_now where id = v.id;
    perform private.release_qty(v.id, v.qty_reserved - v.qty_released);
    perform private.enqueue('allocation_expired', 'allocation', v.id, 'allocation_expired:' || v.id,
      private.alloc_payload(v, '{"reason":"request_ttl"}'));
    perform private.audit(
      p_action      => 'allocation.expire',
      p_entity_type => 'allocation',
      p_entity_id   => v.id,
      p_org_id      => v.store_org_id,
      p_before      => '{"status":"requested"}',
      p_after       => '{"status":"expired","reason":"request_ttl"}',
      p_actor_kind  => 'system');
    perform private.after_allocation_change(v, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function private.expire_requested(uuid) is 'Lazy expiry of stale requests on a locked offer (§6.4, C7). Returns the number expired.';

-- ===========================================================================
-- 8. Offer RPCs (§6.1, §8.3)
-- ===========================================================================

-- create_offer (addition to §8.3): draft lot from a validated payload, so the client never converts
-- time zones itself (§4.3: expiry {date}|{datetime}). Drafts may also be inserted directly (RLS).
create or replace function public.create_offer(p_payload jsonb, p_client_op_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_resp jsonb;
  v_site public.sites%rowtype;
  v_kind public.org_kind;
  v_row  public.offers%rowtype;
begin
  v_resp := private.idem_claim(p_client_op_id, 'create_offer', private.idem_hash(p_payload));
  if v_resp is not null then
    return (v_resp #>> '{}')::uuid;
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or private.try_uuid(p_payload ->> 'site_id') is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"site_id":"required"}';
  end if;

  select * into v_site from public.sites s where s.id = private.try_uuid(p_payload ->> 'site_id');
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(v_site.id, '{owner,manager,staff}');

  select o.kind into v_kind from public.organizations o where o.id = v_site.org_id;
  if v_kind <> 'store' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"site_id":"not_a_store_site"}';
  end if;
  if not v_site.is_active then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"site_id":"inactive"}';
  end if;

  v_row.id := gen_random_uuid();
  v_row.org_id := v_site.org_id;
  v_row.site_id := v_site.id;
  v_row.photo_paths := '{}';
  v_row.ai_assisted := false;
  v_row.expiry_is_date_only := false;
  v_row := private.apply_offer_patch(v_row, p_payload - 'site_id', true);

  insert into public.offers (id, org_id, site_id, category_code, title, description, quantity, unit,
                             unit_weight_kg, weight_source, expires_at, expiry_is_date_only, pickup_window,
                             photo_paths, ai_assisted, created_by)
  values (v_row.id, v_row.org_id, v_row.site_id, v_row.category_code, v_row.title, v_row.description,
          v_row.quantity, v_row.unit, v_row.unit_weight_kg, v_row.weight_source, v_row.expires_at,
          v_row.expiry_is_date_only, v_row.pickup_window, v_row.photo_paths, v_row.ai_assisted, v_uid);

  perform private.audit(
    p_action       => 'offer.create',
    p_entity_type  => 'offer',
    p_entity_id    => v_row.id,
    p_org_id       => v_row.org_id,
    p_after        => jsonb_build_object('status', 'draft', 'category_code', v_row.category_code,
                                         'quantity', v_row.quantity, 'unit', v_row.unit),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_row.id));
  return v_row.id;
end;
$$;

comment on function public.create_offer(jsonb, uuid) is
  'Create a draft offer (store owner/manager/staff with access to the site, approved org). Payload: site_id, category_code, title, description?, quantity, unit? (category default), unit_weight_kg? (null = category default), expiry {date}|{datetime}, pickup_start, pickup_end, photo_paths?, ai_assisted?. Idempotent.';

-- update_offer: drafts — any key; open/fully_allocated — title/description/photo_paths always,
-- other keys only while the lot has no allocation (effective_deadline recomputed + re-validated).
create or replace function public.update_offer(p_offer_id uuid, p_patch jsonb, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_old      public.offers%rowtype;
  v_new      public.offers%rowtype;
  v_keys     text[];
  v_site     public.sites%rowtype;
  v_deadline timestamptz;
begin
  if private.idem_claim(p_client_op_id, 'update_offer',
       private.idem_hash(jsonb_build_object('offer_id', p_offer_id, 'patch', p_patch))) is not null then
    return;
  end if;

  select * into v_old from public.offers where id = p_offer_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(v_old.site_id, '{owner,manager,staff}');

  if v_old.status not in ('draft', 'open', 'fully_allocated') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_patch":"non_empty_object"}';
  end if;

  select array_agg(k) into v_keys from jsonb_object_keys(p_patch) k;

  if v_old.status <> 'draft' then
    if p_patch ? 'quantity' or p_patch ? 'ai_assisted' then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"quantity":"use_update_offer_quantity","ai_assisted":"create_only"}';
    end if;
    if exists (select 1 from unnest(v_keys) k where k not in ('title', 'description', 'photo_paths'))
       and exists (select 1 from public.allocations a where a.offer_id = p_offer_id) then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'offer_has_allocations';
    end if;
  end if;

  v_new := private.apply_offer_patch(v_old, p_patch, false);

  if p_patch ? 'site_id' then
    select * into v_site from public.sites s where s.id = private.try_uuid(p_patch ->> 'site_id');
    if not found or v_site.org_id <> v_old.org_id then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"site_id":"not_a_site_of_this_store"}';
    end if;
    perform private.require_site_role(v_site.id, '{owner,manager,staff}');
    if not v_site.is_active then
      raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"site_id":"inactive"}';
    end if;
    v_new.site_id := v_site.id;
  end if;

  v_deadline := v_old.effective_deadline;
  if v_old.status <> 'draft'
     and (p_patch ? 'expiry' or p_patch ? 'pickup_start' or p_patch ? 'pickup_end' or p_patch ? 'site_id') then
    v_deadline := private.offer_effective_deadline(v_new, private.now());
  end if;

  update public.offers
     set category_code = v_new.category_code,
         title = v_new.title,
         description = v_new.description,
         quantity = v_new.quantity,
         unit = v_new.unit,
         unit_weight_kg = v_new.unit_weight_kg,
         weight_source = v_new.weight_source,
         expires_at = v_new.expires_at,
         expiry_is_date_only = v_new.expiry_is_date_only,
         pickup_window = v_new.pickup_window,
         photo_paths = v_new.photo_paths,
         ai_assisted = v_new.ai_assisted,
         site_id = v_new.site_id,
         effective_deadline = v_deadline
   where id = p_offer_id;

  perform private.audit(
    p_action       => 'offer.update',
    p_entity_type  => 'offer',
    p_entity_id    => p_offer_id,
    p_org_id       => v_old.org_id,
    p_before       => jsonb_build_object('effective_deadline', v_old.effective_deadline),
    p_after        => jsonb_build_object('keys', to_jsonb(v_keys), 'effective_deadline', v_deadline),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.update_offer(uuid, jsonb, uuid) is
  'Edit an offer (store owner/manager/staff). Draft: any key. Open: title/description/photo_paths anytime; other keys only without allocations (effective_deadline recomputed, PT409 offer_has_allocations otherwise). quantity => update_offer_quantity.';

-- update_offer_quantity: new quantity ≥ qty_committed (PRD US-STO-12 AC2).
create or replace function public.update_offer_quantity(p_offer_id uuid, p_new_quantity numeric,
                                                        p_reason text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v        public.offers%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if private.idem_claim(p_client_op_id, 'update_offer_quantity',
       private.idem_hash(jsonb_build_object('offer_id', p_offer_id, 'quantity', p_new_quantity, 'reason', p_reason))) is not null then
    return;
  end if;

  select * into v from public.offers where id = p_offer_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(v.site_id, '{owner,manager,staff}');

  if v.status not in ('draft', 'open', 'fully_allocated') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if p_new_quantity is null or p_new_quantity <= 0 or p_new_quantity > 999999999
     or (v.unit not in ('kg', 'liter') and p_new_quantity <> trunc(p_new_quantity))
     or char_length(v_reason) > 500 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_new_quantity":"> 0, integer unless kg/liter","p_reason":"≤ 500 chars"}';
  end if;
  if p_new_quantity < v.qty_committed then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('p_new_quantity', 'below_committed', 'qty_committed', v.qty_committed)::text;
  end if;

  update public.offers set quantity = p_new_quantity where id = p_offer_id;
  perform private.refresh_offer(p_offer_id);

  perform private.audit(
    p_action       => 'offer.update_quantity',
    p_entity_type  => 'offer',
    p_entity_id    => p_offer_id,
    p_org_id       => v.org_id,
    p_before       => jsonb_build_object('quantity', v.quantity),
    p_after        => jsonb_build_object('quantity', p_new_quantity),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.update_offer_quantity(uuid, numeric, text, uuid) is
  'Change offer quantity (store owner/manager/staff); never below qty_committed (PT422 below_committed); re-derives open/fully_allocated.';

-- draft -> open (§6.1).
create or replace function public.publish_offer(p_offer_id uuid, p_safety_attested boolean, p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_resp     jsonb;
  v          public.offers%rowtype;
  v_org      public.organizations%rowtype;
  v_site     public.sites%rowtype;
  v_cat      public.food_categories%rowtype;
  v_now      timestamptz := private.now();
  v_deadline timestamptz;
  v_label    public.freshness_label;
begin
  v_resp := private.idem_claim(p_client_op_id, 'publish_offer',
    private.idem_hash(jsonb_build_object('offer_id', p_offer_id, 'safety_attested', p_safety_attested)));
  if v_resp is not null then
    return v_resp;
  end if;

  select * into v from public.offers where id = p_offer_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(v.site_id, '{owner,manager,staff}');

  select * into v_org from public.organizations where id = v.org_id;
  if v_org.is_paused then
    raise exception using errcode = 'PT403', message = 'org_not_active', detail = 'paused';
  end if;

  if v.status <> 'draft' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if p_safety_attested is distinct from true then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_safety_attested":"required"}';
  end if;

  select * into v_site from public.sites where id = v.site_id;
  if not v_site.is_active then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"site_id":"inactive"}';
  end if;
  select * into v_cat from public.food_categories where code = v.category_code;
  if not v_cat.is_active then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"category_code":"inactive"}';
  end if;

  v_deadline := private.offer_effective_deadline(v, v_now);

  perform private.check_rate_limit('publish_offer:org:' || v.org_id::text, 60, interval '1 hour');

  v_label := public.freshness_label(v_deadline, v_cat.perishability, v_now);

  update public.offers
     set status = 'open',
         effective_deadline = v_deadline,
         published_at = v_now,
         safety_attested_at = v_now,
         safety_attested_by = v_uid,
         red_notified_at = case when v_label = 'red' then v_now end
   where id = p_offer_id;

  perform private.enqueue('offer_published', 'offer', p_offer_id, 'offer_published:' || p_offer_id,
    jsonb_build_object('offer_id', p_offer_id, 'store_org_id', v.org_id, 'site_id', v.site_id,
                       'category_code', v.category_code, 'label', v_label, 'effective_deadline', v_deadline),
    case when v_label = 'red' then 'urgent' else 'normal' end);

  perform private.audit(
    p_action       => 'offer.publish',
    p_entity_type  => 'offer',
    p_entity_id    => p_offer_id,
    p_org_id       => v.org_id,
    p_before       => jsonb_build_object('status', 'draft'),
    p_after        => jsonb_build_object('status', 'open', 'effective_deadline', v_deadline, 'label', v_label),
    p_client_op_id => p_client_op_id);

  v_resp := jsonb_build_object('effective_deadline', v_deadline, 'label', v_label);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.publish_offer(uuid, boolean, uuid) is
  'draft -> open (store owner/manager/staff, approved, not paused). Safety attestation required; computes effective_deadline (§4.2) after validating the window; rate limit 60/h/org; outbox offer_published (urgent when red at publish). Returns {effective_deadline, label}.';

-- Shared cascade of cancel_offer and suspend_organization (C11, C14). The caller holds the locks
-- on the needs of the lot's allocations and on the lot. p_actor: store | admin. Every live
-- allocation ends: requested => rejected (released); confirmed/assigned => cancelled store_short
-- (not released, detached from its trip; trust −5 when the store itself cancels). The lot ends
-- completed when something was picked, otherwise cancelled.
create or replace function private.cancel_offer_core(p_offer public.offers, p_actor text, p_reason text,
                                                     p_client_op_id uuid)
returns public.offer_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  a     public.allocations%rowtype;
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
  v_new public.offer_status;
begin
  for a in
    select * from public.allocations al
    where al.offer_id = p_offer.id and al.status in ('requested', 'confirmed', 'assigned')
    order by al.id
    for update
  loop
    if a.status = 'requested' then
      update public.allocations
         set status = 'rejected', closed_at = v_now, cancel_actor = p_actor, cancelled_by = v_uid,
             cancel_reason = p_reason
       where id = a.id;
      perform private.release_qty(a.id, a.qty_reserved - a.qty_released);
      perform private.enqueue('allocation_rejected', 'allocation', a.id, 'allocation_rejected:' || a.id,
        private.alloc_payload(a, '{"reason":"offer_cancelled"}'));
      perform private.audit(
        p_action => 'allocation.reject', p_entity_type => 'allocation', p_entity_id => a.id,
        p_org_id => a.store_org_id, p_before => '{"status":"requested"}',
        p_after => '{"status":"rejected","cause":"offer_cancelled"}', p_reason => p_reason,
        p_client_op_id => p_client_op_id);
    else
      update public.allocations
         set status = 'cancelled', closed_at = v_now, cancel_actor = p_actor, cancelled_by = v_uid,
             cancel_reason = p_reason, shortfall_reason = 'store_short'
       where id = a.id;
      perform private.detach_allocation(a.id);
      if p_actor = 'store' then
        perform private.apply_trust(a.store_org_id, -5, 'store_cancel_after_confirm', 'allocation', a.id);
      end if;
      perform private.enqueue('allocation_cancelled', 'allocation', a.id, 'allocation_cancelled:' || a.id,
        private.alloc_payload(a, jsonb_build_object('cancel_actor', p_actor, 'cause', 'offer_cancelled')),
        case when a.status = 'assigned' then 'urgent' else 'normal' end);
      perform private.audit(
        p_action => 'allocation.cancel', p_entity_type => 'allocation', p_entity_id => a.id,
        p_org_id => a.store_org_id, p_before => jsonb_build_object('status', a.status),
        p_after => jsonb_build_object('status', 'cancelled', 'cancel_actor', p_actor, 'cause', 'offer_cancelled'),
        p_reason => p_reason, p_client_op_id => p_client_op_id);
    end if;
    perform private.after_allocation_change(a, true);
  end loop;

  v_new := case
    when exists (select 1 from public.allocations al where al.offer_id = p_offer.id and al.qty_picked > 0)
      then 'completed'::public.offer_status
    else 'cancelled'::public.offer_status
  end;

  update public.offers
     set status = v_new, closed_at = v_now, cancel_reason = p_reason,
         qty_unclaimed = quantity - qty_committed
   where id = p_offer.id;

  perform private.audit(
    p_action       => case when v_new = 'completed' then 'offer.complete' else 'offer.cancel' end,
    p_entity_type  => 'offer',
    p_entity_id    => p_offer.id,
    p_org_id       => p_offer.org_id,
    p_before       => jsonb_build_object('status', p_offer.status),
    p_after        => jsonb_build_object('status', v_new, 'actor', p_actor),
    p_reason       => p_reason,
    p_client_op_id => p_client_op_id);

  return v_new;
end;
$$;

comment on function private.cancel_offer_core(public.offers, text, text, uuid) is
  'Cascade of cancel_offer / suspend_organization (C11, C14) on a locked live lot. Returns the final lot status (completed|cancelled).';

-- open|fully_allocated -> cancelled, or completed when something was already picked (C11).
create or replace function public.cancel_offer(p_offer_id uuid, p_reason text, p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_resp   jsonb;
  v        public.offers%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_actor  text;
  v_new    public.offer_status;
begin
  v_resp := private.idem_claim(p_client_op_id, 'cancel_offer',
    private.idem_hash(jsonb_build_object('offer_id', p_offer_id, 'reason', p_reason)));
  if v_resp is not null then
    return v_resp;
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_reason":"required, ≤ 500 chars"}';
  end if;

  -- lock order: needs of the lot's allocations, then the lot
  perform 1 from public.needs n
  where n.id in (select al.need_id from public.allocations al where al.offer_id = p_offer_id and al.need_id is not null)
  order by n.id for update;

  select * into v from public.offers where id = p_offer_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if private.can_access_site(v.site_id, '{owner,manager}') then
    v_actor := 'store';
  elsif private.is_admin() then
    v_actor := 'admin';
  elsif private.caller_org_role(v.org_id) is null
        and exists (select 1 from public.profiles p where p.id = v_uid and p.platform_role = 'admin' and p.deleted_at is null) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  else
    perform private.require_site_role(v.site_id, '{owner,manager}');
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;

  if v.status not in ('open', 'fully_allocated') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  v_new := private.cancel_offer_core(v, v_actor, v_reason, p_client_op_id);

  v_resp := jsonb_build_object('status', v_new);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.cancel_offer(uuid, text, uuid) is
  'Store owner/manager or admin aal2 closes a live offer (reason required). requested => rejected (released); confirmed/assigned => cancelled store_short, not released, trust −5 each when the store cancels (C11). Lot ends completed when something was picked, else cancelled. Returns {status}.';

-- §8.3 marketplace: feasible open lots within the receiving site''s radius / accepted categories.
-- Store coordinates are public_location only (approximate = snapped grid, hidden = null).
create or replace function public.marketplace_offers(
  p_charity_site_id uuid,
  p_labels          public.freshness_label[] default null,
  p_max_km          numeric default null,
  p_max_travel_min  integer default null,
  p_category_codes  text[] default null
)
returns table (
  offer_id            uuid,
  title               text,
  category_code       text,
  unit                public.unit_code,
  qty_available       numeric,
  unit_weight_kg      numeric,
  effective_deadline  timestamptz,
  label               public.freshness_label,
  distance_km         numeric,
  travel_min          numeric,
  eta_pickup          timestamptz,
  store_org_id        uuid,
  store_name          text,
  trust_score         numeric,
  site_id             uuid,
  site_lat            float8,
  site_lng            float8,
  site_is_approximate boolean,
  photo_path          text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cs   public.sites%rowtype;
  v_org  public.organizations%rowtype;
  v_role public.org_role;
  v_now  timestamptz := private.now();
begin
  perform private.require_uid();

  select * into v_cs from public.sites s where s.id = p_charity_site_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  select * into v_org from public.organizations o where o.id = v_cs.org_id;

  if not private.is_admin() then
    v_role := private.caller_org_role(v_cs.org_id);
    if v_role is null then
      raise exception using errcode = 'PT404', message = 'not_found';
    end if;
    if v_org.status <> 'approved' then
      return;                                -- B8: unapproved charities see nothing
    end if;
    if not private.can_access_site(p_charity_site_id, '{owner,manager,staff}') then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
  end if;

  if v_org.kind <> 'charity' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_charity_site_id":"not_a_charity_site"}';
  end if;
  if (p_max_km is not null and (p_max_km <= 0 or p_max_km > 100))
     or (p_max_travel_min is not null and (p_max_travel_min <= 0 or p_max_travel_min > 1440)) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_max_km":"0-100","p_max_travel_min":"1-1440"}';
  end if;
  if not v_cs.is_active then
    return;
  end if;

  return query
    with cand as (
      select o.id, o.title, o.category_code, o.unit, o.qty_available, o.unit_weight_kg,
             o.effective_deadline, o.pickup_window, o.org_id, o.site_id, o.photo_paths,
             st.name as store_name, st.trust_score, s.public_location, s.visibility,
             fc.perishability
      from public.offers o
      join public.sites s on s.id = o.site_id
      join public.organizations st on st.id = o.org_id
      join public.food_categories fc on fc.code = o.category_code
      where o.status = 'open' and o.qty_available > 0 and o.effective_deadline > v_now
        and st.status = 'approved' and not st.is_paused and st.is_demo = v_org.is_demo and st.id <> v_org.id
        and s.is_active
        and extensions.st_dwithin(s.location, v_cs.location, (v_cs.radius_km * 1000)::float8)
        and (v_cs.accepted_categories is null or o.category_code = any (v_cs.accepted_categories))
        and (p_category_codes is null or o.category_code = any (p_category_codes))
    ), feas as (
      -- Non-public store sites: distance to whole km, travel to 5 min, ETA to 5 min, and the filters use
      -- the coarse values too — a charity with several receiving sites must not triangulate a hidden site.
      select c.*, f.feasible,
             case when c.visibility = 'public' then round((f.distance_m / 1000.0)::numeric, 1)
                  else greatest(round((f.distance_m / 1000.0)::numeric, 0), 1) end as dist_km,
             case when c.visibility = 'public' then round(f.travel_min, 0)
                  else ceil(f.travel_min / 5) * 5 end as travel,
             case when c.visibility = 'public' then f.eta_pickup
                  else date_bin('5 minutes', f.eta_pickup + interval '4 minutes 59 seconds',
                                '2000-01-01 00:00+07'::timestamptz) end as eta,
             public.freshness_label(c.effective_deadline, c.perishability, v_now) as lbl
      from cand c
      cross join lateral private.feasibility(c.site_id, v_cs.id, c.pickup_window, c.effective_deadline, v_now) f
    )
    select f.id, f.title, f.category_code, f.unit, f.qty_available, f.unit_weight_kg,
           f.effective_deadline, f.lbl,
           f.dist_km,
           f.travel,
           f.eta, f.org_id, f.store_name, f.trust_score, f.site_id,
           extensions.st_y(f.public_location::extensions.geometry),
           extensions.st_x(f.public_location::extensions.geometry),
           f.visibility = 'approximate',
           f.photo_paths[1]
    from feas f
    where f.feasible
      and (p_labels is null or f.lbl = any (p_labels))
      and (p_max_km is null or f.dist_km <= p_max_km)
      and (p_max_travel_min is null or f.travel <= p_max_travel_min)
    order by case f.lbl when 'red' then 0 when 'yellow' then 1 when 'green' then 2 else 3 end,
             f.dist_km, f.id;
end;
$$;

comment on function public.marketplace_offers(uuid, public.freshness_label[], numeric, integer, text[]) is
  'Kho tặng: feasible (§4.7) open offers of approved, unpaused stores (same is_demo) within the receiving site radius and accepted categories; ordered red → yellow → green, then distance. Unapproved charity => empty (B8). Coordinates = public_location (approximate grid / null when hidden).';

-- Charity requests p_qty of an offer for one of its receiving sites (§6.4, PRD US-CHA-08).
create or replace function public.request_offer(p_offer_id uuid, p_qty numeric, p_charity_site_id uuid,
                                                p_client_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_resp     jsonb;
  v_cs       public.sites%rowtype;
  v_charity  public.organizations%rowtype;
  v          public.offers%rowtype;
  v_store    public.organizations%rowtype;
  v_ss       public.sites%rowtype;
  v_feas     record;
  v_now      timestamptz := private.now();
  v_auto     boolean;
  v_status   public.allocation_status;
  a          public.allocations%rowtype;
begin
  v_resp := private.idem_claim(p_client_op_id, 'request_offer',
    private.idem_hash(jsonb_build_object('offer_id', p_offer_id, 'qty', p_qty, 'charity_site_id', p_charity_site_id)));
  if v_resp is not null then
    return v_resp;
  end if;

  -- requesting side
  select * into v_cs from public.sites s where s.id = p_charity_site_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(p_charity_site_id, '{owner,manager,staff}');
  select * into v_charity from public.organizations o where o.id = v_cs.org_id;
  if v_charity.kind <> 'charity' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_charity_site_id":"not_a_charity_site"}';
  end if;
  if v_charity.is_paused then
    raise exception using errcode = 'PT403', message = 'org_not_active', detail = 'paused';
  end if;
  if not v_cs.is_active then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_charity_site_id":"inactive"}';
  end if;

  perform private.check_rate_limit('request_offer:org:' || v_charity.id::text, 60, interval '1 hour');

  -- the lot (row lock serialises concurrent requests: no over-allocation)
  select * into v from public.offers o where o.id = p_offer_id for update;
  if not found or v.status = 'draft' then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  select * into v_store from public.organizations o where o.id = v.org_id;
  if v_store.status <> 'approved' then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if private.caller_org_role(v.org_id) is not null then
    raise exception using errcode = 'PT403', message = 'self_dealing';
  end if;

  perform private.expire_requested(p_offer_id);       -- lazy expiry on the locked lot (C7)
  perform private.refresh_offer(p_offer_id);
  select * into v from public.offers o where o.id = p_offer_id;

  if v.status not in ('open', 'fully_allocated') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if v.effective_deadline <= v_now then
    raise exception using errcode = 'PT409', message = 'deadline_passed';
  end if;
  if v_store.is_paused then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'store_paused';
  end if;
  if v_store.is_demo <> v_charity.is_demo then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_offer_id":"demo_mismatch"}';
  end if;
  if p_qty is null or p_qty <= 0 or (v.unit not in ('kg', 'liter') and p_qty <> trunc(p_qty)) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = jsonb_build_object('p_qty', case when p_qty is not null and p_qty > 0 then 'integer_required' else '> 0' end)::text;
  end if;
  if p_qty > v.qty_available then
    raise exception using errcode = 'PT409', message = 'insufficient_quantity',
      detail = jsonb_build_object('available', v.qty_available)::text;
  end if;

  select * into v_ss from public.sites s where s.id = v.site_id;
  if not extensions.st_dwithin(v_ss.location, v_cs.location, (v_cs.radius_km * 1000)::float8) then
    raise exception using errcode = 'PT422', message = 'out_of_radius';
  end if;
  if v_cs.accepted_categories is not null and not (v.category_code = any (v_cs.accepted_categories)) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"category_code":"not_accepted_by_site"}';
  end if;
  select * into v_feas from private.feasibility(v.site_id, v_cs.id, v.pickup_window, v.effective_deadline, v_now);
  if not v_feas.feasible then
    -- no ETAs in the error: they would reveal the travel time to a hidden/approximate store site
    raise exception using errcode = 'PT422', message = 'infeasible_timing',
      detail = jsonb_build_object('effective_deadline', v.effective_deadline)::text;
  end if;

  v_auto := coalesce(private.setting('auto_accept_enabled'), 'true'::jsonb) <> 'false'::jsonb
            and (v_ss.auto_accept_mode = 'all'
                 or (v_ss.auto_accept_mode = 'trusted' and v_charity.trust_score >= v_ss.auto_accept_min_trust));
  v_status := case when v_auto then 'confirmed'::public.allocation_status else 'requested'::public.allocation_status end;

  insert into public.allocations (offer_id, store_org_id, store_site_id, charity_org_id, charity_site_id,
                                  unit, unit_weight_kg_snapshot, qty_reserved, status, reserved_until,
                                  requested_by, requested_at, confirmed_at, auto_confirmed)
  values (v.id, v.org_id, v.site_id, v_charity.id, v_cs.id,
          v.unit, v.unit_weight_kg, p_qty, v_status,
          case when v_auto then null
               else least(v_now + private.setting_num('request_ttl_minutes', 120) * interval '1 minute', v.effective_deadline) end,
          v_uid, v_now, case when v_auto then v_now end, v_auto)
  returning * into a;

  update public.offers set qty_committed = qty_committed + p_qty where id = v.id;
  perform private.refresh_offer(v.id);

  perform private.enqueue('allocation_requested', 'allocation', a.id, 'allocation_requested:' || a.id,
    private.alloc_payload(a, jsonb_build_object('qty', p_qty, 'auto_confirmed', v_auto)),
    case when public.freshness_label(v.effective_deadline,
                                     (select fc.perishability from public.food_categories fc where fc.code = v.category_code),
                                     v_now) = 'red' then 'urgent' else 'normal' end);
  if v_auto then
    perform private.enqueue('allocation_confirmed', 'allocation', a.id, 'allocation_confirmed:' || a.id,
      private.alloc_payload(a, '{"auto_confirmed":true}'));
  end if;

  perform private.audit(
    p_action       => 'allocation.request',
    p_entity_type  => 'allocation',
    p_entity_id    => a.id,
    p_org_id       => v_charity.id,
    p_after        => jsonb_build_object('status', v_status, 'offer_id', v.id, 'qty', p_qty, 'auto_confirmed', v_auto),
    p_client_op_id => p_client_op_id);

  v_resp := jsonb_build_object('allocation_id', a.id, 'status', v_status);
  perform private.idem_store(p_client_op_id, v_resp);
  return v_resp;
end;
$$;

comment on function public.request_offer(uuid, numeric, uuid, uuid) is
  'Atomic reservation (charity owner/manager/staff of an approved, unpaused charity with access to the receiving site). Locks the offer row, lazily expires stale requests, checks quantity/radius/category/feasibility/demo/self-dealing; auto-accept per store site. Returns {allocation_id, status}. PT409 insufficient_quantity detail {available}.';

-- requested -> confirmed (store).
create or replace function public.confirm_allocation(p_allocation_id uuid, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  a     public.allocations%rowtype;
  v     public.offers%rowtype;
  v_now timestamptz := private.now();
begin
  if private.idem_claim(p_client_op_id, 'confirm_allocation',
       private.idem_hash(jsonb_build_object('allocation_id', p_allocation_id))) is not null then
    return;
  end if;

  a := private.lock_allocation(p_allocation_id);
  if a.id is null then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(a.store_site_id, '{owner,manager,staff}');

  if a.status <> 'requested' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  select * into v from public.offers where id = a.offer_id;
  if v.status not in ('open', 'fully_allocated') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if v.effective_deadline <= v_now or a.reserved_until <= v_now then
    raise exception using errcode = 'PT409', message = 'deadline_passed',
      detail = case when a.reserved_until <= v_now then 'reserved_until' else 'effective_deadline' end;
  end if;

  update public.allocations
     set status = 'confirmed', confirmed_at = v_now, confirmed_by = v_uid
   where id = a.id;

  perform private.enqueue('allocation_confirmed', 'allocation', a.id, 'allocation_confirmed:' || a.id,
    private.alloc_payload(a));
  perform private.after_allocation_change(a, false);

  perform private.audit(
    p_action       => 'allocation.confirm',
    p_entity_type  => 'allocation',
    p_entity_id    => a.id,
    p_org_id       => a.store_org_id,
    p_before       => '{"status":"requested"}',
    p_after        => '{"status":"confirmed"}',
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.confirm_allocation(uuid, uuid) is
  'requested -> confirmed (store owner/manager/staff of the offer site). PT409 deadline_passed when reserved_until/effective_deadline passed. Outbox allocation_confirmed.';

-- requested -> rejected (store, reason required, full release, C3).
create or replace function public.reject_allocation(p_allocation_id uuid, p_reason text, p_client_op_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  a        public.allocations%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_now    timestamptz := private.now();
begin
  if private.idem_claim(p_client_op_id, 'reject_allocation',
       private.idem_hash(jsonb_build_object('allocation_id', p_allocation_id, 'reason', p_reason))) is not null then
    return;
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_reason":"required, ≤ 500 chars"}';
  end if;

  a := private.lock_allocation(p_allocation_id);
  if a.id is null then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(a.store_site_id, '{owner,manager,staff}');

  if a.status <> 'requested' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  update public.allocations
     set status = 'rejected', closed_at = v_now, cancel_actor = 'store', cancelled_by = v_uid,
         cancel_reason = v_reason
   where id = a.id;
  perform private.release_qty(a.id, a.qty_reserved - a.qty_released);
  perform private.refresh_offer(a.offer_id);

  perform private.enqueue('allocation_rejected', 'allocation', a.id, 'allocation_rejected:' || a.id,
    private.alloc_payload(a));
  perform private.after_allocation_change(a, true);

  perform private.audit(
    p_action       => 'allocation.reject',
    p_entity_type  => 'allocation',
    p_entity_id    => a.id,
    p_org_id       => a.store_org_id,
    p_before       => '{"status":"requested"}',
    p_after        => '{"status":"rejected"}',
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.reject_allocation(uuid, text, uuid) is
  'requested -> rejected (store owner/manager/staff, reason required): full release, outbox allocation_rejected (+ bundle_shortfall). C3.';

-- §7 cancellation matrix C1, C2, C4, C13. The caller's side is derived from memberships.
create or replace function public.cancel_allocation(p_allocation_id uuid, p_reason text, p_client_op_id uuid,
                                                    p_attribution text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_uid();
  a           public.allocations%rowtype;
  v           public.offers%rowtype;
  v_reason    text := nullif(btrim(p_reason), '');
  v_c_role    public.org_role;
  v_s_role    public.org_role;
  v_actor     text;
  v_side      text;           -- who bears the consequences: charity | store | neutral
  v_now       timestamptz := private.now();
  v_released  numeric := 0;
begin
  if private.idem_claim(p_client_op_id, 'cancel_allocation',
       private.idem_hash(jsonb_build_object('allocation_id', p_allocation_id, 'reason', p_reason,
                                            'attribution', p_attribution))) is not null then
    return;
  end if;

  a := private.lock_allocation(p_allocation_id);
  if a.id is null then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  v_c_role := private.caller_org_role(a.charity_org_id);
  v_s_role := private.caller_org_role(a.store_org_id);
  -- side role checks go through can_access_site (site scope + approved org) like every other RPC:
  -- the bare org role let a manager scoped to another site cancel allocations of this one.
  if v_c_role is not null and v_s_role is not null then
    raise exception using errcode = 'PT403', message = 'ambiguous_actor';
  elsif v_c_role is not null then
    if not private.can_access_site(a.charity_site_id, '{owner,manager}') then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    v_actor := 'charity';
    v_side := 'charity';
  elsif v_s_role is not null then
    if not private.can_access_site(a.store_site_id, '{owner,manager}') then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    v_actor := 'store';
    v_side := 'store';
  elsif private.is_admin() then
    v_actor := 'admin';
    if p_attribution is null or p_attribution not in ('store', 'charity', 'neutral') then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = '{"p_attribution":"store|charity|neutral required for admin"}';
    end if;
    v_side := p_attribution;
  elsif exists (select 1 from public.profiles p where p.id = v_uid and p.platform_role = 'admin' and p.deleted_at is null) then
    raise exception using errcode = 'PT403', message = 'mfa_required';
  else
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  if (v_actor in ('store', 'admin') and v_reason is null) or char_length(v_reason) > 500 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_reason":"required for store/admin, ≤ 500 chars"}';
  end if;

  if a.status not in ('requested', 'confirmed', 'assigned') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  if v_actor = 'store' and a.status = 'requested' then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'use_reject_allocation';
  end if;

  select * into v from public.offers where id = a.offer_id;

  update public.allocations
     set status = 'cancelled', closed_at = v_now, cancel_actor = v_actor, cancelled_by = v_uid,
         cancel_reason = v_reason,
         shortfall_reason = case when v_side = 'store' then 'store_short'::public.shortfall_reason else shortfall_reason end
   where id = a.id;

  if a.pickup_id is not null then
    perform private.detach_allocation(a.id);
  end if;

  -- §4.5: give back only when the store side is not at fault and the lot is still live
  if v_side <> 'store' and v.effective_deadline > v_now then
    v_released := private.release_qty(a.id, a.qty_reserved - a.qty_released);
  end if;
  perform private.refresh_offer(a.offer_id);

  if v_side = 'store' and a.status in ('confirmed', 'assigned') then
    perform private.apply_trust(a.store_org_id, -5, 'store_cancel_after_confirm', 'allocation', a.id);
  elsif v_side = 'charity' and a.status in ('confirmed', 'assigned') and a.packed_at is not null then
    perform private.apply_trust(a.charity_org_id, -2, 'charity_cancel_after_packed', 'allocation', a.id);
  end if;

  perform private.enqueue('allocation_cancelled', 'allocation', a.id, 'allocation_cancelled:' || a.id,
    private.alloc_payload(a, jsonb_build_object('cancel_actor', v_actor, 'attribution', v_side)),
    case when a.status = 'assigned' then 'urgent' else 'normal' end);
  perform private.after_allocation_change(a, v_side = 'store');

  perform private.audit(
    p_action       => 'allocation.cancel',
    p_entity_type  => 'allocation',
    p_entity_id    => a.id,
    p_org_id       => case when v_actor = 'charity' then a.charity_org_id else a.store_org_id end,
    p_before       => jsonb_build_object('status', a.status),
    p_after        => jsonb_build_object('status', 'cancelled', 'cancel_actor', v_actor, 'attribution', v_side,
                                         'released', v_released),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.cancel_allocation(uuid, text, uuid, text) is
  'Cancellation matrix §7: charity owner/manager (C1/C2: release, −2 if packed), store owner/manager (C4: confirmed/assigned only, reason, store_short, no release, −5), admin aal2 (C13: reason + p_attribution store|charity|neutral). Member of both sides => PT403 ambiguous_actor. Detaches from the trip.';

-- "Đã đóng gói" (no state change): set or undo (within 2 minutes) packed_at.
create or replace function public.mark_allocation_packed(p_allocation_id uuid, p_client_op_id uuid,
                                                         p_packed boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  a     public.allocations%rowtype;
  v_now timestamptz := private.now();
begin
  if private.idem_claim(p_client_op_id, 'mark_allocation_packed',
       private.idem_hash(jsonb_build_object('allocation_id', p_allocation_id, 'packed', p_packed))) is not null then
    return;
  end if;

  if p_packed is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_packed":"required"}';
  end if;

  a := private.lock_allocation(p_allocation_id);
  if a.id is null then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_site_role(a.store_site_id, '{owner,manager,staff}');

  if a.status not in ('confirmed', 'assigned') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  if p_packed then
    if a.packed_at is not null then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'already_packed';
    end if;
    update public.allocations set packed_at = v_now, packed_by = v_uid where id = a.id;
    perform private.enqueue('allocation_packed', 'allocation', a.id, 'allocation_packed:' || a.id,
      private.alloc_payload(a));
  else
    if a.packed_at is null or v_now > a.packed_at + interval '2 minutes' then
      raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'undo_window_passed';
    end if;
    update public.allocations set packed_at = null, packed_by = null where id = a.id;
  end if;

  perform private.audit(
    p_action       => case when p_packed then 'allocation.pack' else 'allocation.unpack' end,
    p_entity_type  => 'allocation',
    p_entity_id    => a.id,
    p_org_id       => a.store_org_id,
    p_before       => jsonb_build_object('packed_at', a.packed_at),
    p_after        => jsonb_build_object('packed', p_packed),
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, 'null'::jsonb);
end;
$$;

comment on function public.mark_allocation_packed(uuid, uuid, boolean) is
  'Store owner/manager/staff marks a confirmed/assigned allocation packed (outbox allocation_packed, once) or undoes it within 2 minutes (no notification).';

-- ===========================================================================
-- 9. Jobs (pg_cron, service_role)
-- ===========================================================================

-- Expire requests past reserved_until (C7) and close needs past needed_by (§6.2).
create or replace function public.expire_stale_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now   timestamptz := private.now();
  v_offer uuid;
  v_need  public.needs%rowtype;
  v_n     integer := 0;
  v_new   public.need_status;
begin
  perform 1 from public.needs n
  where n.id in (select a.need_id from public.allocations a
                 where a.status = 'requested' and a.reserved_until <= v_now and a.need_id is not null)
  order by n.id for update;

  for v_offer in
    select distinct a.offer_id from public.allocations a
    where a.status = 'requested' and a.reserved_until <= v_now
    order by 1
  loop
    perform 1 from public.offers o where o.id = v_offer for update;
    v_n := v_n + private.expire_requested(v_offer);
    perform private.refresh_offer(v_offer);
  end loop;

  for v_need in
    select * from public.needs n
    where n.status in ('open', 'partially_matched', 'matched') and n.needed_by <= v_now
    order by n.id
    for update
  loop
    perform private.refresh_need(v_need.id);
    select * into v_need from public.needs n where n.id = v_need.id;
    continue when v_need.status not in ('open', 'partially_matched', 'matched');
    v_new := case when v_need.qty_delivered > 0 then 'closed_partial'::public.need_status else 'expired'::public.need_status end;
    update public.needs set status = v_new, closed_at = v_now where id = v_need.id;
    perform private.enqueue('need_closed', 'need', v_need.id, 'need_closed:' || v_need.id,
      jsonb_build_object('need_id', v_need.id, 'org_id', v_need.org_id, 'status', v_new));
    perform private.audit(
      p_action      => 'need.close',
      p_entity_type => 'need',
      p_entity_id   => v_need.id,
      p_org_id      => v_need.org_id,
      p_before      => jsonb_build_object('status', v_need.status),
      p_after       => jsonb_build_object('status', v_new),
      p_actor_kind  => 'system');
  end loop;

  return v_n;
end;
$$;

comment on function public.expire_stale_requests() is
  'Cron: requested allocations past reserved_until => expired (released, outbox allocation_expired); needs past needed_by => closed_partial|expired (outbox need_closed). Returns the number of allocations expired.';

-- Close lots past effective_deadline (§6.1, C8). Assigned allocations of a running trip keep the
-- lot open until least(effective_deadline + grace, expires_at) (token validity, §2.3).
create or replace function public.close_expired_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now   timestamptz := private.now();
  v_grace interval := private.setting_num('handover_window_grace_minutes', 30) * interval '1 minute';
  v_id    uuid;
  v       public.offers%rowtype;
  a       public.allocations%rowtype;
  v_new   public.offer_status;
  v_n     integer := 0;
begin
  perform 1 from public.needs n
  where n.id in (select al.need_id from public.allocations al
                 join public.offers o on o.id = al.offer_id
                 where o.status in ('open', 'fully_allocated') and o.effective_deadline <= v_now
                   and al.need_id is not null)
  order by n.id for update;

  for v_id in
    select o.id from public.offers o
    where o.status in ('open', 'fully_allocated') and o.effective_deadline <= v_now
    order by o.id
  loop
    select * into v from public.offers o where o.id = v_id for update;
    continue when v.status not in ('open', 'fully_allocated') or v.effective_deadline > v_now;

    -- grace for trips already under way (self pickups count as under way)
    continue when exists (
      select 1 from public.allocations al
      join public.pickups p on p.id = al.pickup_id
      where al.offer_id = v.id and al.status = 'assigned'
        and (p.status = 'in_progress' or (p.mode = 'self' and p.status in ('planned', 'assigned')))
        and v_now < least(v.effective_deadline + v_grace, v.expires_at));

    for a in
      select * from public.allocations al
      where al.offer_id = v.id and al.status in ('requested', 'confirmed', 'assigned')
      order by al.id
      for update
    loop
      if a.status = 'requested' then
        update public.allocations set status = 'expired', closed_at = v_now where id = a.id;
        perform private.release_qty(a.id, a.qty_reserved - a.qty_released);
      else
        update public.allocations
           set status = 'expired', closed_at = v_now, shortfall_reason = 'no_show'
         where id = a.id;
        if a.pickup_id is not null then
          perform private.detach_allocation(a.id);
        end if;
      end if;
      perform private.enqueue('allocation_expired', 'allocation', a.id, 'allocation_expired:' || a.id,
        private.alloc_payload(a, jsonb_build_object('reason', 'offer_deadline', 'previous_status', a.status)));
      perform private.audit(
        p_action      => 'allocation.expire',
        p_entity_type => 'allocation',
        p_entity_id   => a.id,
        p_org_id      => a.store_org_id,
        p_before      => jsonb_build_object('status', a.status),
        p_after       => jsonb_build_object('status', 'expired', 'reason', 'offer_deadline'),
        p_actor_kind  => 'system');
      perform private.after_allocation_change(a, a.status = 'requested');
    end loop;

    v_new := case
      when exists (select 1 from public.allocations al where al.offer_id = v.id and al.qty_picked > 0)
        then 'completed'::public.offer_status
      else 'expired'::public.offer_status
    end;

    update public.offers
       set status = v_new, closed_at = v_now, qty_unclaimed = quantity - qty_committed
     where id = v.id;

    if v_new = 'expired' then
      perform private.enqueue('offer_expired', 'offer', v.id, 'offer_expired:' || v.id,
        jsonb_build_object('offer_id', v.id, 'store_org_id', v.org_id, 'site_id', v.site_id));
    end if;

    perform private.audit(
      p_action      => case when v_new = 'completed' then 'offer.complete' else 'offer.expire' end,
      p_entity_type => 'offer',
      p_entity_id   => v.id,
      p_org_id      => v.org_id,
      p_before      => jsonb_build_object('status', v.status),
      p_after       => jsonb_build_object('status', v_new),
      p_actor_kind  => 'system');

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function public.close_expired_offers() is
  'Cron: lots past effective_deadline => completed (something picked) or expired. requested => expired (released); confirmed/assigned => expired no_show (not released, stop skipped) — except assigned allocations of a running/self trip within least(deadline + grace, expires_at). Outbox allocation_expired / offer_expired. Returns the number of lots closed.';

-- Enqueue offer_turned_red once per lot (ADR-005 point 5).
create or replace function public.notify_turned_red()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
  v     record;
  v_n   integer := 0;
begin
  for v in
    select o.id, o.org_id, o.site_id, o.category_code, o.effective_deadline
    from public.offers o
    join public.food_categories fc on fc.code = o.category_code
    where o.status in ('open', 'fully_allocated') and o.red_notified_at is null
      and o.effective_deadline > v_now
      and public.freshness_label(o.effective_deadline, fc.perishability, v_now) = 'red'
    order by o.id
    for update of o skip locked
  loop
    update public.offers set red_notified_at = v_now where id = v.id;
    perform private.enqueue('offer_turned_red', 'offer', v.id, 'offer_turned_red:' || v.id,
      jsonb_build_object('offer_id', v.id, 'store_org_id', v.org_id, 'site_id', v.site_id,
                         'category_code', v.category_code, 'effective_deadline', v.effective_deadline),
      'urgent');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function public.notify_turned_red() is 'Cron: open lots that just became red => red_notified_at + outbox offer_turned_red (urgent), once per lot.';

-- ===========================================================================
-- 10. Function privileges (§8.8)
-- ===========================================================================
revoke all on function private.offers_before_write() from public, anon, authenticated;
revoke all on function private.needs_before_write() from public, anon, authenticated;
revoke all on function private.guard_privileged_columns() from public, anon, authenticated;
revoke all on function private.is_kind_member(public.org_kind, public.org_role[]) from public, anon, authenticated;
revoke all on function private.offer_allocated_to_me(uuid) from public, anon, authenticated;
revoke all on function private.need_supplied_by_me(uuid) from public, anon, authenticated;
revoke all on function private.bundle_visible(uuid, uuid) from public, anon, authenticated;
revoke all on function private.require_site_role(uuid, public.org_role[]) from public, anon, authenticated;
revoke all on function private.travel_min(float8) from public, anon, authenticated;
revoke all on function private.feasibility(uuid, uuid, tstzrange, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.offer_effective_deadline(public.offers, timestamptz) from public, anon, authenticated;
revoke all on function private.apply_offer_patch(public.offers, jsonb, boolean) from public, anon, authenticated;
revoke all on function private.to_need_units(numeric, public.unit_code, numeric, public.unit_code) from public, anon, authenticated;
revoke all on function private.apply_trust(uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function private.release_qty(uuid, numeric) from public, anon, authenticated;
revoke all on function private.refresh_offer(uuid) from public, anon, authenticated;
revoke all on function private.refresh_need(uuid) from public, anon, authenticated;
revoke all on function private.refresh_bundle(uuid) from public, anon, authenticated;
revoke all on function private.alloc_payload(public.allocations, jsonb) from public, anon, authenticated;
revoke all on function private.after_allocation_change(public.allocations, boolean) from public, anon, authenticated;
revoke all on function private.lock_allocation(uuid) from public, anon, authenticated;
revoke all on function private.expire_requested(uuid) from public, anon, authenticated;
revoke all on function private.cancel_offer_core(public.offers, text, text, uuid) from public, anon, authenticated;

revoke all on function public.create_offer(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_offer(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_offer_quantity(uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.publish_offer(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.cancel_offer(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.marketplace_offers(uuid, public.freshness_label[], numeric, integer, text[]) from public, anon, authenticated;
revoke all on function public.request_offer(uuid, numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_allocation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_allocation(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_allocation(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_allocation_packed(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.expire_stale_requests() from public, anon, authenticated;
revoke all on function public.close_expired_offers() from public, anon, authenticated;
revoke all on function public.notify_turned_red() from public, anon, authenticated;

-- RLS helpers used inside policies evaluated as `authenticated`
grant execute on function private.is_kind_member(public.org_kind, public.org_role[]) to authenticated, service_role;
grant execute on function private.offer_allocated_to_me(uuid) to authenticated, service_role;
grant execute on function private.need_supplied_by_me(uuid) to authenticated, service_role;
grant execute on function private.bundle_visible(uuid, uuid) to authenticated, service_role;

grant execute on function public.create_offer(jsonb, uuid) to authenticated;
grant execute on function public.update_offer(uuid, jsonb, uuid) to authenticated;
grant execute on function public.update_offer_quantity(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.publish_offer(uuid, boolean, uuid) to authenticated;
grant execute on function public.cancel_offer(uuid, text, uuid) to authenticated;
grant execute on function public.marketplace_offers(uuid, public.freshness_label[], numeric, integer, text[]) to authenticated;
grant execute on function public.request_offer(uuid, numeric, uuid, uuid) to authenticated;
grant execute on function public.confirm_allocation(uuid, uuid) to authenticated;
grant execute on function public.reject_allocation(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_allocation(uuid, text, uuid, text) to authenticated;
grant execute on function public.mark_allocation_packed(uuid, uuid, boolean) to authenticated;
grant execute on function public.expire_stale_requests() to service_role;
grant execute on function public.close_expired_offers() to service_role;
grant execute on function public.notify_turned_red() to service_role;

-- ===========================================================================
-- 11. pg_cron (ARCHITECTURE §8.2). Correctness never depends on these jobs (RPCs expire lazily
-- and always compare effective_deadline with now); they keep data and notifications fresh.
-- Skipped when pg_cron is not installed.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fs_expire_requests', '* * * * *', 'select public.expire_stale_requests()');
    perform cron.schedule('fs_close_offers', '* * * * *', 'select public.close_expired_offers()');
    perform cron.schedule('fs_turned_red', '* * * * *', 'select public.notify_turned_red()');
  end if;
end;
$$;

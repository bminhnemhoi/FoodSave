-- Migration 9/13 — impact (DATA-MODEL §2.5, §9.3, §13; ESG-METHODOLOGY §2–§3, §6.1; ADR-009;
-- ROADMAP P2-13)
-- Tables: impact_factors (immutable; v1 rows seeded by supabase/seed/00_reference.sql),
--         impact_ledger (append-only credit/reversal), impact_public_daily (anon-safe aggregate).
-- Views (security_invoker): public_impact_stats, public_org_cards.
-- Functions: private.credit_impact (called by record_dropoff / automatic dropoff in the same
--            transaction), private.ledger_immutable, private.ledger_to_public_daily,
--            public.reverse_impact, public.activate_impact_factors.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

create table public.impact_factors (
  id           uuid primary key default gen_random_uuid(),
  version      text not null check (version ~ '^v[0-9]+$'),
  metric       text not null check (metric in ('co2e_kg_per_kg', 'water_l_per_kg', 'kg_per_meal')),
  value        numeric(12, 4) not null check (value > 0),
  unit         text not null check (char_length(unit) between 1 and 40),
  source_title text not null check (char_length(source_title) between 1 and 300),
  source_url   text not null check (source_url ~ '^https://' and char_length(source_url) <= 500),
  source_page  text check (char_length(source_page) <= 60),
  derivation   text not null check (char_length(derivation) between 1 and 500),
  valid_from   date not null,
  approved_adr text not null check (char_length(approved_adr) between 1 and 200),
  created_at   timestamptz not null default now(),
  constraint impact_factors_version_metric_uq unique (version, metric)
);

comment on table public.impact_factors is 'Versioned impact factors with sources (ADR-009). Immutable: new versions are inserted by migration/seed + ADR and activated with activate_impact_factors.';
comment on column public.impact_factors.derivation is 'How the value was derived, e.g. 3.3 Gt CO2e / 1.6 Gt ≈ 2.06 → 2.0.';

create table public.impact_ledger (
  id                bigint generated always as identity primary key,
  entry_type        public.ledger_entry_type not null,
  handover_line_id  uuid not null references public.handover_lines (id),
  reverses_entry_id bigint references public.impact_ledger (id),
  allocation_id     uuid not null references public.allocations (id),
  offer_id          uuid not null references public.offers (id),
  store_org_id      uuid not null references public.organizations (id),
  charity_org_id    uuid not null references public.organizations (id),
  store_site_id     uuid not null references public.sites (id),
  category_code     text not null references public.food_categories (code),
  occurred_at       timestamptz not null,
  kg                numeric(12, 3) not null,
  co2e_kg           numeric(12, 3) not null,
  water_l           numeric(14, 2),
  meals             numeric(12, 2) not null,
  factor_version    text not null check (factor_version ~ '^v[0-9]+$'),
  is_demo           boolean not null,
  reason            text check (char_length(reason) <= 1000),
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  constraint ledger_sign check (
    (entry_type = 'credit' and kg > 0 and co2e_kg > 0 and reverses_entry_id is null)
    or (entry_type = 'reversal' and kg < 0 and co2e_kg < 0 and reverses_entry_id is not null and reason is not null))
);

comment on table public.impact_ledger is 'Append-only impact ledger (§13): exactly one credit per dropoff handover line (qty > 0), written at dropoff; corrections are negative reversals (reverse_impact). Never updated or deleted.';
comment on column public.impact_ledger.occurred_at is 'Credit: dropoff time. Reversal: when the reversal was created (ESG-METHODOLOGY §6.1).';
comment on column public.impact_ledger.kg is 'Signed: credit > 0, reversal < 0. kg = handover_lines.qty × allocations.unit_weight_kg_snapshot.';
comment on column public.impact_ledger.water_l is 'null when the factor version has no water_l_per_kg.';
comment on column public.impact_ledger.meals is 'kg / kg_per_meal (stored with 2 decimals, floored only for display).';

create unique index impact_ledger_credit_uq on public.impact_ledger (handover_line_id) where entry_type = 'credit';
create index impact_ledger_handover_line_idx on public.impact_ledger (handover_line_id);
create index impact_ledger_reverses_idx on public.impact_ledger (reverses_entry_id) where reverses_entry_id is not null;
create index impact_ledger_store_occurred_idx on public.impact_ledger (store_org_id, occurred_at);
create index impact_ledger_charity_occurred_idx on public.impact_ledger (charity_org_id, occurred_at);
create index impact_ledger_occurred_idx on public.impact_ledger (occurred_at);
create index impact_ledger_allocation_idx on public.impact_ledger (allocation_id);
create index impact_ledger_offer_idx on public.impact_ledger (offer_id);
create index impact_ledger_store_site_idx on public.impact_ledger (store_site_id);
create index impact_ledger_category_idx on public.impact_ledger (category_code);
create index impact_ledger_created_by_idx on public.impact_ledger (created_by) where created_by is not null;

create table public.impact_public_daily (
  day        date not null,
  cell_key   text not null check (char_length(cell_key) <= 200),
  ward       text check (char_length(ward) <= 120),
  kg         numeric(14, 3) not null default 0,
  co2e_kg    numeric(14, 3) not null default 0,
  meals      numeric(14, 3) not null default 0,
  deliveries integer not null default 0,
  is_demo    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (day, cell_key, is_demo)
);

comment on table public.impact_public_daily is 'Anon-safe daily aggregate of impact_ledger by grid cell (public store sites) or ward (approximate/hidden). Maintained only by trigger private.ledger_to_public_daily.';
comment on column public.impact_public_daily.cell_key is 'ST_GeoHash(ST_SnapToGrid(store public_location, 0.005), 7) for public sites, else ward:<ward or city>.';
comment on column public.impact_public_daily.deliveries is 'Number of credit lines (reversals do not decrement).';

-- ===========================================================================
-- 2. Triggers
-- ===========================================================================

create trigger forbid_mutation before update or delete on public.impact_factors
  for each row execute function private.forbid_mutation();

-- §13: append-only; the single exception is demo_reset() deleting demo rows (fs.demo_reset = 'on').
create or replace function private.ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_demo
     and current_setting('fs.demo_reset', true) = 'on'
     and current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  raise exception using errcode = '42501', message = 'append_only', detail = 'impact_ledger is append-only';
end;
$$;

comment on function private.ledger_immutable() is 'BEFORE UPDATE/DELETE on impact_ledger: always refused, except DELETE of demo rows inside demo_reset() (fs.demo_reset = on).';

create trigger ledger_immutable before update or delete on public.impact_ledger
  for each row execute function private.ledger_immutable();

create or replace function private.ledger_to_public_daily()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_cell text;
begin
  select * into v_site from public.sites s where s.id = new.store_site_id;
  v_cell := case
    when v_site.visibility = 'public' and v_site.public_location is not null then
      extensions.st_geohash(extensions.st_snaptogrid(v_site.public_location::extensions.geometry, 0.005), 7)
    else 'ward:' || coalesce(v_site.ward, v_site.city)
  end;

  insert into public.impact_public_daily as d (day, cell_key, ward, kg, co2e_kg, meals, deliveries, is_demo, updated_at)
  values ((new.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date, v_cell, v_site.ward,
          new.kg, new.co2e_kg, new.meals, case when new.entry_type = 'credit' then 1 else 0 end,
          new.is_demo, pg_catalog.now())
  on conflict (day, cell_key, is_demo) do update
    set kg = d.kg + excluded.kg,
        co2e_kg = d.co2e_kg + excluded.co2e_kg,
        meals = d.meals + excluded.meals,
        deliveries = d.deliveries + excluded.deliveries,
        ward = coalesce(excluded.ward, d.ward),
        updated_at = excluded.updated_at;
  return null;
end;
$$;

comment on function private.ledger_to_public_daily() is 'AFTER INSERT on impact_ledger: adds the (signed) row to impact_public_daily (VN day, grid cell or ward).';

create trigger ledger_to_public_daily after insert on public.impact_ledger
  for each row execute function private.ledger_to_public_daily();

-- ===========================================================================
-- 3. Ledger writers
-- ===========================================================================

-- One credit per dropoff line with qty > 0 (idempotent on the partial unique index). Factors of
-- app_settings.impact_factor_version (ESG-METHODOLOGY §2.3, §3).
create or replace function private.credit_impact(p_handover_line_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  l         public.handover_lines%rowtype;
  h         public.handovers%rowtype;
  a         public.allocations%rowtype;
  v_cat     text;
  v_version text := coalesce(private.setting('impact_factor_version') #>> '{}', 'v1');
  v_co2     numeric;
  v_water   numeric;
  v_meal    numeric;
  v_kg      numeric;
  v_demo    boolean;
  v_id      bigint;
begin
  select * into l from public.handover_lines where id = p_handover_line_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  select * into h from public.handovers where id = l.handover_id;
  if h.kind <> 'dropoff' or l.qty <= 0 then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'credit_requires_dropoff_line_with_qty';
  end if;

  select il.id into v_id from public.impact_ledger il
  where il.handover_line_id = l.id and il.entry_type = 'credit';
  if v_id is not null then
    return v_id;
  end if;

  select * into a from public.allocations where id = l.allocation_id;
  select o.category_code into v_cat from public.offers o where o.id = a.offer_id;
  select org.is_demo into v_demo from public.organizations org where org.id = a.store_org_id;

  select f.value into v_co2 from public.impact_factors f where f.version = v_version and f.metric = 'co2e_kg_per_kg';
  select f.value into v_water from public.impact_factors f where f.version = v_version and f.metric = 'water_l_per_kg';
  select f.value into v_meal from public.impact_factors f where f.version = v_version and f.metric = 'kg_per_meal';
  if v_co2 is null or v_meal is null then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'impact_factors_missing';
  end if;

  v_kg := round(l.qty * a.unit_weight_kg_snapshot, 3);
  if v_kg <= 0 then
    return null;
  end if;

  insert into public.impact_ledger (entry_type, handover_line_id, allocation_id, offer_id, store_org_id,
                                    charity_org_id, store_site_id, category_code, occurred_at, kg, co2e_kg,
                                    water_l, meals, factor_version, is_demo, created_by)
  values ('credit', l.id, a.id, a.offer_id, a.store_org_id, a.charity_org_id, a.store_site_id, v_cat,
          coalesce(h.consumed_at, private.now()), v_kg, greatest(round(v_kg * v_co2, 3), 0.001),
          case when v_water is not null then round(v_kg * v_water, 2) end,
          round(v_kg / v_meal, 2), v_version, v_demo, auth.uid())
  on conflict (handover_line_id) where entry_type = 'credit' do nothing
  returning id into v_id;

  if v_id is null then
    select il.id into v_id from public.impact_ledger il
    where il.handover_line_id = l.id and il.entry_type = 'credit';
  end if;
  return v_id;
end;
$$;

comment on function private.credit_impact(uuid) is
  'Credit one dropoff handover line: kg = qty × unit_weight_kg_snapshot; co2e = kg × co2e_kg_per_kg; water = kg × water_l_per_kg (null if no factor); meals = kg / kg_per_meal; factor_version = app_settings.impact_factor_version. Idempotent per line.';

-- §13 / ESG-METHODOLOGY §6.1: partial, repeatable reversal of a credit (admin aal2).
create or replace function public.reverse_impact(p_handover_line_id uuid, p_kg numeric, p_reason text,
                                                 p_client_op_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_admin();
  v_resp      jsonb;
  c           public.impact_ledger%rowtype;
  v_reason    text := nullif(btrim(p_reason), '');
  v_done      numeric;
  v_remaining numeric;
  v_kg        numeric;
  v_ratio     numeric;
  v_id        bigint;
begin
  v_resp := private.idem_claim(p_client_op_id, 'reverse_impact',
    private.idem_hash(jsonb_build_object('handover_line_id', p_handover_line_id, 'kg', p_kg, 'reason', p_reason)));
  if v_resp is not null then
    return (v_resp #>> '{}')::bigint;
  end if;

  -- p_kg is taken at ledger precision (kg numeric(12,3)): unrounded, 0 < p_kg < 0.0005 was stored as
  -- -0.000 (23514 ledger_sign instead of PT422), and co2e/water/meals were pro-rated on a kg that
  -- differs from the stored one (0.1234 => kg -0.123 but co2e of 0.1234).
  if v_reason is null or char_length(v_reason) > 1000 or (p_kg is not null and round(p_kg, 3) <= 0) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_reason":"required, ≤ 1000 chars","p_kg":"> 0 or null (= everything left)"}';
  end if;

  select * into c from public.impact_ledger il
  where il.handover_line_id = p_handover_line_id and il.entry_type = 'credit'
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.assert_not_self_dealing(c.store_org_id);
  perform private.assert_not_self_dealing(c.charity_org_id);

  select coalesce(sum(-il.kg), 0) into v_done from public.impact_ledger il where il.reverses_entry_id = c.id;
  v_remaining := c.kg - v_done;
  v_kg := round(coalesce(p_kg, v_remaining), 3);
  if v_kg <= 0 or v_kg > v_remaining then
    raise exception using errcode = 'PT409', message = 'invalid_state',
      detail = jsonb_build_object('remaining_kg', v_remaining)::text;
  end if;

  v_ratio := v_kg / c.kg;
  insert into public.impact_ledger (entry_type, handover_line_id, reverses_entry_id, allocation_id, offer_id,
                                    store_org_id, charity_org_id, store_site_id, category_code, occurred_at,
                                    kg, co2e_kg, water_l, meals, factor_version, is_demo, reason, created_by)
  values ('reversal', c.handover_line_id, c.id, c.allocation_id, c.offer_id, c.store_org_id, c.charity_org_id,
          c.store_site_id, c.category_code, private.now(),
          -v_kg, -greatest(round(c.co2e_kg * v_ratio, 3), 0.001),
          case when c.water_l is not null then -round(c.water_l * v_ratio, 2) end,
          -round(c.meals * v_ratio, 2), c.factor_version, c.is_demo, v_reason, v_uid)
  returning id into v_id;

  perform private.audit(
    p_action       => 'ledger.reverse',
    p_entity_type  => 'impact_ledger',
    p_entity_id    => null,
    p_org_id       => c.store_org_id,
    p_before       => jsonb_build_object('credit_id', c.id, 'credit_kg', c.kg, 'reversed_kg', v_done),
    p_after        => jsonb_build_object('reversal_id', v_id, 'kg', -v_kg, 'handover_line_id', c.handover_line_id),
    p_reason       => v_reason,
    p_client_op_id => p_client_op_id);

  perform private.idem_store(p_client_op_id, to_jsonb(v_id));
  return v_id;
end;
$$;

comment on function public.reverse_impact(uuid, numeric, text, uuid) is
  'Admin aal2 (not a member of either side): negative reversal of a credit, p_kg > 0 or null = everything left; Σ reversals ≤ credit (PT409 invalid_state {remaining_kg}); co2e/water/meals pro rata with the credit''s factor_version. Returns the reversal id.';

-- Switch app_settings.impact_factor_version (admin aal2). The version needs co2e_kg_per_kg and
-- kg_per_meal; water_l_per_kg is optional (ledger water_l null without it).
create or replace function public.activate_impact_factors(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_admin();
  v_before jsonb := private.setting('impact_factor_version');
begin
  if p_version is null
     or not exists (select 1 from public.impact_factors f where f.version = p_version and f.metric = 'co2e_kg_per_kg')
     or not exists (select 1 from public.impact_factors f where f.version = p_version and f.metric = 'kg_per_meal') then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_version":"unknown or missing co2e_kg_per_kg / kg_per_meal"}';
  end if;

  if v_before = to_jsonb(p_version) then
    return;
  end if;

  insert into public.app_settings (key, value, description, is_public, updated_by)
  values ('impact_factor_version', to_jsonb(p_version),
          'Phiên bản hệ số tác động đang dùng (chỉ đổi bằng activate_impact_factors)', false, v_uid)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;

  perform private.audit(
    p_action      => 'settings.update',
    p_entity_type => 'app_setting',
    p_entity_id   => null,
    p_before      => jsonb_build_object('key', 'impact_factor_version', 'value', v_before),
    p_after       => jsonb_build_object('key', 'impact_factor_version', 'value', p_version));
end;
$$;

comment on function public.activate_impact_factors(text) is
  'Admin aal2 switches app_settings.impact_factor_version to a complete factor version (co2e_kg_per_kg + kg_per_meal). Audited settings.update. No-op when unchanged.';

-- ===========================================================================
-- 4. RLS + privileges
-- ===========================================================================
alter table public.impact_factors      enable row level security;
alter table public.impact_ledger       enable row level security;
alter table public.impact_public_daily enable row level security;

create policy impact_factors_select on public.impact_factors
  for select to anon, authenticated
  using (true);

create policy impact_ledger_select on public.impact_ledger
  for select to authenticated
  -- store staff has no ESG access (PRD US-STO-06 AC2); charity staff carries goods and sees what it delivered
  using (
    private.is_active_org_member(store_org_id, '{owner,manager}')
    or private.is_active_org_member(charity_org_id, '{owner,manager,staff}')
    or (select private.is_admin())
  );

create policy impact_public_daily_select on public.impact_public_daily
  for select to anon, authenticated
  using (true);

revoke all on table public.impact_factors, public.impact_ledger, public.impact_public_daily from anon, authenticated;

grant select on public.impact_factors to anon, authenticated;
grant select on public.impact_ledger to authenticated;
grant select on public.impact_public_daily to anon, authenticated;

-- ===========================================================================
-- 5. Public views (security_invoker, §9.3)
-- ===========================================================================

create view public.public_impact_stats
with (security_invoker = true)
as
select
  coalesce(sum(d.kg) filter (where not d.is_demo), 0)::numeric(14, 3)          as kg_total,
  coalesce(sum(d.co2e_kg) filter (where not d.is_demo), 0)::numeric(14, 3)     as co2e_kg_total,
  coalesce(sum(d.meals) filter (where not d.is_demo), 0)::numeric(14, 3)       as meals_total,
  coalesce(sum(d.deliveries) filter (where not d.is_demo), 0)::bigint          as deliveries_total,
  coalesce(sum(d.kg) filter (where not d.is_demo
                               and d.day > (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30), 0)::numeric(14, 3) as kg_30d,
  coalesce(sum(d.kg) filter (where d.is_demo), 0)::numeric(14, 3)              as demo_kg_total,
  max(d.updated_at)                                                             as updated_at
from public.impact_public_daily d;

comment on view public.public_impact_stats is 'Public impact counters (real data only; demo kg separately). security_invoker over impact_public_daily — never over impact_ledger.';

-- anon needs is_primary to pick the primary site (harmless public flag)
grant select (is_primary) on public.sites to anon;

create view public.public_org_cards
with (security_invoker = true)
as
select o.id, o.kind, o.name, o.subtype, o.logo_path, s.ward,
       extensions.st_y(s.public_location::extensions.geometry) as public_lat,
       extensions.st_x(s.public_location::extensions.geometry) as public_lng,
       o.is_demo
from public.organizations o
left join public.sites s on s.org_id = o.id and s.is_primary and s.is_active
where private.org_has_status(o.id, '{approved}');

comment on view public.public_org_cards is 'Public organization cards (approved orgs only): safe columns + primary-site ward and public_location (snapped / null when hidden). security_invoker.';

-- Supabase default privileges grant INSERT/UPDATE/DELETE/TRUNCATE on new relations: read-only views
revoke all on public.public_impact_stats, public.public_org_cards from public, anon, authenticated;
grant select on public.public_impact_stats to anon, authenticated;
grant select on public.public_org_cards to anon, authenticated;

-- ===========================================================================
-- 6. Function privileges
-- ===========================================================================
revoke all on function private.ledger_immutable() from public, anon, authenticated;
revoke all on function private.ledger_to_public_daily() from public, anon, authenticated;
revoke all on function private.credit_impact(uuid) from public, anon, authenticated;
revoke all on function public.reverse_impact(uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.activate_impact_factors(text) from public, anon, authenticated;

grant execute on function public.reverse_impact(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.activate_impact_factors(text) to authenticated;

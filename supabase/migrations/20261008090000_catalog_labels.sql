-- Migration 6/13 — catalog_labels (DATA-MODEL §2.2, §4.2, §4.3, §8.1, ADR-005; ROADMAP P2-01, P2-02)
-- Tables: food_categories, label_rules (reference data seeded by supabase/seed/00_reference.sql).
-- Functions: public.freshness_label (immutable, label_rules version 1, same fixture as
--            src/core/labels), private.date_only_expiry, private.parse_expiry,
--            private.try_timestamptz, private.setting_num.
-- Units are the enum public.unit_code (DATA-MODEL §1); there is no unit table.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- food_categories — reference list (Vietnamese names, perishability, default unit/weight)
-- ---------------------------------------------------------------------------
create table public.food_categories (
  code                   text primary key check (code ~ '^[a-z_]{2,32}$'),
  name_vi                text not null check (char_length(name_vi) between 1 and 80),
  perishability          public.perishability not null,
  default_unit           public.unit_code not null,
  default_unit_weight_kg numeric(8, 3) not null check (default_unit_weight_kg > 0),
  icon                   text not null check (icon ~ '^[a-z0-9-]{1,40}$'),
  sort_order             smallint not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint food_categories_kg_weight check (default_unit <> 'kg' or default_unit_weight_kg = 1)
);

comment on table public.food_categories is 'Food categories (reference data, seed 00_reference.sql). Everyone reads; admin aal2 may insert/update (RLS). perishability drives the freshness label thresholds.';
comment on column public.food_categories.default_unit_weight_kg is 'Estimated kg per default unit (ESG-METHODOLOGY §2.3); offers fall back to it with weight_source = category_default.';
comment on column public.food_categories.icon is 'lucide icon name (kebab-case).';

-- ---------------------------------------------------------------------------
-- label_rules — versioned label thresholds (documentation + fixture source, ADR-005)
-- ---------------------------------------------------------------------------
create table public.label_rules (
  version        integer not null check (version >= 1),
  perishability  public.perishability not null,
  green_above    interval not null,
  red_below      interval not null,
  effective_from timestamptz not null,
  note           text check (char_length(note) <= 500),
  primary key (version, perishability),
  constraint label_rules_order check (red_below < green_above)
);

comment on table public.label_rules is 'Label thresholds per version. freshness_label() hard-codes the active version (ADR-005); changing thresholds = new migration (new rows + function + src/core/labels/fixtures.json). Immutable (forbid_mutation).';
comment on column public.label_rules.green_above is 'remaining > green_above => green; remaining = green_above is still yellow.';
comment on column public.label_rules.red_below is 'remaining < red_below => red; remaining = red_below is still yellow.';

create trigger set_updated_at before update on public.food_categories
  for each row execute function private.set_updated_at();

create trigger forbid_mutation before update or delete on public.label_rules
  for each row execute function private.forbid_mutation();

-- ===========================================================================
-- 2. Pure functions
-- ===========================================================================

-- §8.1 — label_rules version 1. Boundaries: exactly 12 h / 4 h (cooked), 72 h / 24 h (fresh),
-- 7 d / 3 d (packaged) are yellow; deadline <= at is expired. Same fixture as src/core/labels.
create or replace function public.freshness_label(
  p_deadline      timestamptz,
  p_perishability public.perishability,
  p_at            timestamptz
)
returns public.freshness_label
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_deadline is null or p_perishability is null or p_at is null then null
    when p_deadline <= p_at then 'expired'::public.freshness_label
    when p_deadline - p_at < case p_perishability
           when 'cooked' then interval '4 hours'
           when 'fresh'  then interval '24 hours'
           else interval '3 days' end then 'red'::public.freshness_label
    when p_deadline - p_at <= case p_perishability
           when 'cooked' then interval '12 hours'
           when 'fresh'  then interval '72 hours'
           else interval '7 days' end then 'yellow'::public.freshness_label
    else 'green'::public.freshness_label
  end;
$$;

comment on function public.freshness_label(timestamptz, public.perishability, timestamptz) is
  'Xanh/Vàng/Đỏ label at p_at for an effective deadline (label_rules v1, ADR-005). Never stored. Shared fixture: src/core/labels/fixtures.json (pgTAP rpc/freshness_label.test.sql).';

-- §4.3 — a date-only expiry means 23:59 Asia/Ho_Chi_Minh of that date.
create or replace function private.date_only_expiry(p_date date)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ((p_date + time '23:59')::timestamp at time zone 'Asia/Ho_Chi_Minh');
$$;

comment on function private.date_only_expiry(date) is 'Date-only expiry => 23:59 of that local date (Asia/Ho_Chi_Minh), DATA-MODEL §4.3.';

-- ISO-8601 text WITH an explicit offset (or Z) -> timestamptz; null when missing/invalid.
-- Clients never send local times without an offset (DATA-MODEL §4.3).
create or replace function private.try_timestamptz(p_text text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_text is null or p_text !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
    return null;
  end if;
  return p_text::timestamptz;
exception when others then
  return null;
end;
$$;

comment on function private.try_timestamptz(text) is 'ISO-8601 with explicit offset/Z -> timestamptz, else null (never depends on the session time zone).';

-- {"date": "YYYY-MM-DD"} | {"datetime": "<ISO with offset>"} -> (expires_at, is_date_only).
-- Returns nulls when the value is malformed (callers raise PT422).
create or replace function private.parse_expiry(p_expiry jsonb, out expires_at timestamptz, out is_date_only boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_date date;
begin
  expires_at := null;
  is_date_only := null;
  if p_expiry is null or jsonb_typeof(p_expiry) <> 'object' then
    return;
  end if;

  if p_expiry ? 'date' and not p_expiry ? 'datetime' and jsonb_typeof(p_expiry -> 'date') = 'string'
     and (p_expiry ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      v_date := (p_expiry ->> 'date')::date;
    exception when others then
      return;
    end;
    expires_at := private.date_only_expiry(v_date);
    is_date_only := true;
  elsif p_expiry ? 'datetime' and not p_expiry ? 'date' and jsonb_typeof(p_expiry -> 'datetime') = 'string' then
    expires_at := private.try_timestamptz(p_expiry ->> 'datetime');
    if expires_at is not null then
      is_date_only := false;
    end if;
  end if;
end;
$$;

comment on function private.parse_expiry(jsonb) is 'Expiry payload {date} (=> 23:59 VN, date-only) or {datetime with offset}. Nulls when malformed.';

-- Numeric app_settings value with a default (setting missing / not a number).
create or replace function private.setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
     from public.app_settings s where s.key = p_key),
    p_default);
$$;

comment on function private.setting_num(text, numeric) is 'app_settings numeric value for p_key, or p_default when missing / not a number. Internal.';

-- ===========================================================================
-- 3. Row level security + policies (§9.2)
-- ===========================================================================
alter table public.food_categories enable row level security;
alter table public.label_rules     enable row level security;

-- Everyone (anon included) reads the catalogue; admin aal2 maintains food_categories.
create policy food_categories_select on public.food_categories
  for select to anon, authenticated
  using (true);

create policy food_categories_insert_admin on public.food_categories
  for insert to authenticated
  with check ((select private.is_admin()));

create policy food_categories_update_admin on public.food_categories
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- label_rules: read-only for everyone; rows only change through migrations (ADR-005).
create policy label_rules_select on public.label_rules
  for select to anon, authenticated
  using (true);

-- ===========================================================================
-- 4. Table / column privileges (§9.4)
-- ===========================================================================
revoke all on table public.food_categories, public.label_rules from anon, authenticated;

grant select on public.food_categories to anon, authenticated;
grant insert (code, name_vi, perishability, default_unit, default_unit_weight_kg, icon, sort_order, is_active)
  on public.food_categories to authenticated;
grant update (name_vi, default_unit, default_unit_weight_kg, icon, sort_order, is_active)
  on public.food_categories to authenticated;

grant select on public.label_rules to anon, authenticated;

-- ===========================================================================
-- 5. Function privileges
-- ===========================================================================
revoke all on function public.freshness_label(timestamptz, public.perishability, timestamptz) from public, anon, authenticated;
revoke all on function private.date_only_expiry(date) from public, anon, authenticated;
revoke all on function private.try_timestamptz(text) from public, anon, authenticated;
revoke all on function private.parse_expiry(jsonb) from public, anon, authenticated;
revoke all on function private.setting_num(text, numeric) from public, anon, authenticated;

grant execute on function public.freshness_label(timestamptz, public.perishability, timestamptz) to anon, authenticated, service_role;

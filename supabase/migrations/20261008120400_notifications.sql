-- Migration 10/13 — notifications (DATA-MODEL §2.6, §9.2, §9.4, §12, §16; ARCHITECTURE §8, §9;
-- SECURITY-PRIVACY C1, C5, C16; ROADMAP P2-14, P2-15)
-- Tables: notifications, notification_deliveries, notification_preferences, push_subscriptions
--         (notification_outbox exists since ops_foundations; push sending is P5 — table + RLS only).
-- Jobs (service_role only): claim_outbox_batch, complete_outbox, resolve_recipients, dispatch_outbox,
--         claim_email_deliveries, complete_email_delivery, purge_notifications.
-- App:    mark_notifications_read (authenticated, security invoker => RLS).
-- Wiring: private.kick_dispatch (pg_net + Vault secrets + pgcrypto HMAC), statement trigger on
--         notification_outbox, pg_cron fs_dispatch_tick (every minute, only when work is due) and
--         fs_purge_notifications. Missing Vault secrets (local dev, CI) => kick is a quiet no-op.
-- Titles/bodies are rendered here in Vietnamese from ids in the outbox payload, per recipient. They
-- carry org names, lot titles, quantities, times and crow-fly distance only — never an address or a
-- coordinate (hidden/approximate sites stay private, C8).

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- notifications — one row per recipient (in-app inbox; email bookkeeping hangs off it)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  org_id        uuid references public.organizations (id) on delete set null,
  outbox_id     uuid references public.notification_outbox (id) on delete set null,
  event         public.notification_event not null,
  title         text not null check (char_length(title) between 1 and 140),
  body          text not null default '' check (char_length(body) <= 500),
  link_path     text check (
                  char_length(link_path) <= 300 and link_path ~ '^/' and link_path !~ '^//'
                  and link_path !~ '[[:space:]\\]'),
  urgency       text not null default 'normal' check (urgency in ('normal', 'urgent')),
  channels      public.notify_channel[] not null default '{in_app}' check (cardinality(channels) between 1 and 3),
  deliver_after timestamptz not null default now(),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint notifications_outbox_user_uq unique (outbox_id, user_id)
);

comment on table public.notifications is 'Per-recipient notifications (§12). Inserted only by dispatch_outbox (service role); the user reads own rows once deliver_after has passed and may only set read_at.';
comment on column public.notifications.org_id is 'Organization context of the recipient (charity/store/org of the event); null for admin-only rows.';
comment on column public.notifications.outbox_id is 'Source outbox row. UNIQUE (outbox_id, user_id) makes the fan-out idempotent.';
comment on column public.notifications.title is 'Vietnamese, rendered server-side. Org names / lot titles / quantities only — no address or coordinates.';
comment on column public.notifications.link_path is 'Internal path (starts with a single "/"), opened by the notification center.';
comment on column public.notifications.channels is 'Channels chosen at fan-out (preferences + defaults): in_app = visible in the bell; email = dispatcher sends it once deliver_after has passed.';
comment on column public.notifications.deliver_after is 'Fairness wave (§12.3): created_at + wave × fairness_wave_minutes. Hidden (RLS) and not emailed before.';

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_org_id_idx on public.notifications (org_id) where org_id is not null;
create index notifications_email_due_idx on public.notifications (deliver_after) where 'email' = any (channels);
create index notifications_created_at_idx on public.notifications (created_at);

-- ---------------------------------------------------------------------------
-- notification_deliveries — email/push attempts (in-app needs none)
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  notification_id     uuid not null references public.notifications (id) on delete cascade,
  channel             public.notify_channel not null,
  target              text not null check (char_length(target) between 1 and 128),
  status              public.delivery_status,
  attempts            smallint not null default 1 check (attempts between 1 and 10),
  locked_until        timestamptz,
  provider_message_id text check (char_length(provider_message_id) <= 300),
  error               text check (char_length(error) <= 500),
  attempted_at        timestamptz not null default now(),
  primary key (notification_id, channel, target),
  constraint notification_deliveries_in_flight check (status is not null or locked_until is not null)
);

comment on table public.notification_deliveries is 'One row per notification × channel × target. Written only by claim_email_deliveries / complete_email_delivery (service role). Admin aal2 reads.';
comment on column public.notification_deliveries.target is '"email" for e-mail; sha256 of the endpoint for push (P5). Never an e-mail address.';
comment on column public.notification_deliveries.status is 'null = being sent (lease in locked_until); sent | failed | skipped. Failed e-mails are retried up to 3 attempts (5 min × attempts backoff).';

create index notification_deliveries_retry_idx on public.notification_deliveries (attempted_at)
  where status is distinct from 'sent';

-- ---------------------------------------------------------------------------
-- notification_preferences — per user × event × channel (no row = default, private.email_by_default)
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event      public.notification_event not null,
  channel    public.notify_channel not null,
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, event, channel)
);

comment on table public.notification_preferences is 'Explicit choices only; defaults: in-app on for every event, e-mail per private.email_by_default, push off until P5. in_app of mandatory events (private.notify_mandatory) cannot be disabled (trigger).';

-- ---------------------------------------------------------------------------
-- push_subscriptions — Web Push endpoints (sending arrives in P5)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint        text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh          text not null check (char_length(p256dh) between 16 and 200),
  auth            text not null check (char_length(auth) between 8 and 100),
  user_agent      text check (char_length(user_agent) <= 300),
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failed_count    smallint not null default 0 check (failed_count >= 0),
  disabled_at     timestamptz
);

comment on table public.push_subscriptions is 'Browser push subscriptions of the user (P5 sends). p256dh/auth are never selectable by clients; 404/410 from the push service => disabled_at.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ===========================================================================
-- 2. Triggers on the new tables
-- ===========================================================================

-- In-app is mandatory for allocation_*, pickup_*, proof_reviewed/overdue, org_reviewed/suspended/
-- reinstated, incident_opened (PRD §10 "bắt buộc"; DATA-MODEL §2.6).
create or replace function private.notify_mandatory(p_event public.notification_event)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_event::text like 'allocation\_%' or p_event::text like 'pickup\_%'
      or p_event in ('proof_reviewed', 'proof_overdue', 'org_reviewed', 'org_suspended', 'org_reinstated',
                     'incident_opened', 'member_invited');
$$;

comment on function private.notify_mandatory(public.notification_event) is 'true when the in-app channel of the event cannot be turned off.';

create or replace function private.notification_preferences_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'in_app' and not new.enabled and private.notify_mandatory(new.event) then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"enabled":"mandatory"}';
  end if;
  if new.event = 'kyc_purge' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"event":"internal"}';
  end if;
  return new;
end;
$$;

comment on function private.notification_preferences_guard() is 'Blocks turning off in-app for mandatory events and preferences for internal jobs.';

create trigger notification_preferences_guard
  before insert or update on public.notification_preferences
  for each row execute function private.notification_preferences_guard();

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- 3. Row level security + privileges (§9.2, §9.4)
-- ===========================================================================
alter table public.notifications            enable row level security;
alter table public.notification_deliveries  enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions       enable row level security;

-- notifications: own rows, once deliver_after passed and when in-app was chosen; read_at only.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and deliver_after <= now() and 'in_app' = any (channels));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and deliver_after <= now() and 'in_app' = any (channels))
  with check (user_id = (select auth.uid()));

-- notification_deliveries: admin aal2 reads (support); written by the dispatcher only.
create policy notification_deliveries_select_admin on public.notification_deliveries
  for select to authenticated
  using ((select private.is_admin()));

-- notification_preferences / push_subscriptions: own rows, every operation.
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_preferences_delete_own on public.notification_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.notifications, public.notification_deliveries,
                    public.notification_preferences, public.push_subscriptions
  from anon, authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select on public.notification_deliveries to authenticated;

grant select, delete on public.notification_preferences to authenticated;
grant insert (event, channel, enabled) on public.notification_preferences to authenticated;
grant update (enabled) on public.notification_preferences to authenticated;

grant select (id, user_id, endpoint, user_agent, created_at, last_success_at, failed_count, disabled_at)
  on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;
grant update (p256dh, auth, user_agent) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

-- Realtime (ARCHITECTURE §9): the bell listens to INSERT on notifications filtered by user_id; RLS
-- above decides who receives each change.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ===========================================================================
-- 4. Formatting helpers (Vietnamese, DESIGN-SYSTEM §16.4)
-- ===========================================================================

-- 1234.5 => '1.234,5' (vi-VN separators; trailing zeros dropped).
create or replace function private.fmt_num(p_value numeric, p_decimals integer default 1)
returns text
language sql
immutable
set search_path = ''
as $$
  with r as (select round(abs(p_value), greatest(p_decimals, 0)) as v),
       parts as (select trunc(r.v)::text as i, r.v - trunc(r.v) as f from r)
  select case when p_value is null then null else
           (case when p_value < 0 and (select v from r) > 0 then '-' else '' end)
           || regexp_replace(parts.i, '(\d)(?=(\d{3})+$)', '\1.', 'g')
           || case when parts.f = 0 then '' else ',' || rtrim(substr(parts.f::text, 3), '0') end
         end
  from parts;
$$;

comment on function private.fmt_num(numeric, integer) is 'vi-VN number text: dot thousands, comma decimals, no trailing zeros.';

-- 30 loaf => '30 ổ'; 2.5 kg => '2,5 kg'.
create or replace function private.fmt_qty(p_qty numeric, p_unit public.unit_code)
returns text
language sql
stable
set search_path = ''
as $$
  select private.fmt_num(p_qty, case when p_unit in ('kg', 'liter') then 1 else 0 end) || ' ' ||
         case p_unit
           when 'piece' then 'cái' when 'loaf' then 'ổ' when 'box' then 'hộp' when 'portion' then 'suất'
           when 'bottle' then 'chai' when 'bag' then 'túi' when 'kg' then 'kg' when 'liter' then 'lít'
           else coalesce(p_unit::text, '')
         end;
$$;

comment on function private.fmt_qty(numeric, public.unit_code) is 'Quantity + Vietnamese unit label (cái, ổ, hộp, suất, chai, túi, kg, lít).';

-- '21:00' (same Vietnam day as p_now) or '21:00 ngày 09/10'.
create or replace function private.fmt_vn_time(p_at timestamptz, p_now timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_at is null then null
    when (p_at at time zone 'Asia/Ho_Chi_Minh')::date = (p_now at time zone 'Asia/Ho_Chi_Minh')::date
      then to_char(p_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI')
    else to_char(p_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM')
  end;
$$;

comment on function private.fmt_vn_time(timestamptz, timestamptz) is 'HH24:MI in Asia/Ho_Chi_Minh, with the date when it is not p_now''s Vietnam day.';

-- '850 m' / '2,4 km' (crow-fly; never coordinates).
create or replace function private.fmt_distance(p_m float8)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_m is null or p_m < 0 then null
    when round(p_m / 10) * 10 < 1000 then private.fmt_num((round(p_m / 10) * 10)::numeric, 0) || ' m'
    else private.fmt_num((p_m / 1000)::numeric, 1) || ' km'
  end;
$$;

comment on function private.fmt_distance(float8) is 'Distance text like formatDistance (src/lib/format.ts): < 1 km in metres (10 m), else km with one decimal.';

-- ===========================================================================
-- 5. Recipient resolution (§12.2, §12.3)
-- ===========================================================================

-- Active admins (in-app only).
create or replace function private.admin_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.platform_role = 'admin' and p.deleted_at is null;
$$;

comment on function private.admin_ids() is 'Profiles with platform_role admin (not anonymised).';

-- Owner/manager/staff of an approved org who may act on p_site (site_ids null or containing it).
create or replace function private.site_staff(p_site uuid)
returns table (user_id uuid, org_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.org_id
  from public.sites s
  join public.organizations o on o.id = s.org_id and o.status = 'approved'
  join public.org_members m on m.org_id = s.org_id and m.status = 'active'
                           and m.role in ('owner', 'manager', 'staff')
                           and (m.site_ids is null or s.id = any (m.site_ids))
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where s.id = p_site;
$$;

comment on function private.site_staff(uuid) is 'owner/manager/staff of the site''s approved org with access to the site (§12.2 "quyền điểm").';

-- Active members of an org with one of p_roles, whatever the org status (org_* events).
create or replace function private.org_staff(p_org uuid, p_roles public.org_role[])
returns table (user_id uuid, org_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.org_id
  from public.org_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where m.org_id = p_org and m.status = 'active' and m.role = any (p_roles);
$$;

comment on function private.org_staff(uuid, public.org_role[]) is 'Active members of p_org with a role in p_roles (any org status).';

-- Assignee of a trip, as volunteer (volunteer role) or charity staff (self pickup).
create or replace function private.pickup_assignee(p_pickup uuid)
returns table (user_id uuid, org_id uuid, audience text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.assignee_user_id, p.charity_org_id,
         case when m.role = 'volunteer' then 'volunteer' else 'charity' end
  from public.pickups p
  join public.profiles pr on pr.id = p.assignee_user_id and pr.deleted_at is null
  left join public.org_members m on m.org_id = p.charity_org_id and m.user_id = p.assignee_user_id
                                and m.status = 'active'
  where p.id = p_pickup and p.assignee_user_id is not null;
$$;

comment on function private.pickup_assignee(uuid) is 'Trip assignee with audience volunteer|charity.';

-- Events that have a resolver. Others (P3–P5 events not emitted yet) are dead-lettered with
-- last_error unsupported_event so they are visible to ops instead of silently dropped.
create or replace function private.notify_supported(p_event public.notification_event)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_event in (
    'offer_published', 'offer_turned_red', 'offer_expired',
    'allocation_requested', 'allocation_confirmed', 'allocation_rejected', 'allocation_expired',
    'allocation_cancelled', 'allocation_packed',
    'pickup_assigned', 'pickup_cancelled', 'pickup_handover_done', 'delivery_completed',
    'need_closed', 'bundle_confirmed', 'bundle_shortfall',
    'org_submitted', 'org_change_submitted', 'org_reviewed', 'org_change_reviewed',
    'org_suspended', 'org_reinstated', 'member_invited');
$$;

comment on function private.notify_supported(public.notification_event) is 'Events dispatch_outbox knows how to fan out (member_invited: e-mail sent by the server action, no in-app row).';

-- offer_published / offer_turned_red (§12.2 rows 1–2, §12.3 fairness).
create or replace function private.offer_recipients(p_o public.notification_outbox)
returns table (user_id uuid, org_id uuid, wave smallint, audience text, distance_m float8)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v        public.offers%rowtype;
  v_store  public.organizations%rowtype;
  v_now    timestamptz := private.now();
  v_urgent boolean := p_o.urgency = 'urgent' or p_o.event = 'offer_turned_red';
  v_waves  integer := greatest(1, least(10, private.setting_num('fairness_wave_count', 3)::integer));
  v_day    text := to_char(v_now at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
begin
  select * into v from public.offers x where x.id = private.try_uuid(p_o.payload ->> 'offer_id');
  if not found then
    return;
  end if;

  -- every admin hears about every new lot (in-app, wave 0)
  return query select a.id, null::uuid, 0::smallint, 'admin'::text, null::float8 from private.admin_ids() a(id);

  select * into v_store from public.organizations s where s.id = v.org_id;
  if v.status <> 'open' or v.qty_available <= 0 or v.effective_deadline <= v_now
     or v_store.status <> 'approved' or v_store.is_paused then
    return;                                  -- nothing left to request: charities are not disturbed
  end if;

  return query
    with cand as (
      select cs.id as site_id, cs.org_id, f.distance_m
      from public.sites ss
      join public.sites cs on cs.is_active
      join public.organizations co on co.id = cs.org_id
      cross join lateral private.feasibility(v.site_id, cs.id, v.pickup_window, v.effective_deadline, v_now) f
      where ss.id = v.site_id
        and co.kind = 'charity' and co.status = 'approved' and not co.is_paused
        and co.is_demo = v_store.is_demo and co.id <> v.org_id
        and extensions.st_dwithin(ss.location, cs.location, (cs.radius_km * 1000)::float8)
        and (cs.accepted_categories is null or v.category_code = any (cs.accepted_categories))
        and f.feasible
    ), orgs as (
      select distinct c.org_id from cand c
    ), ranked as (
      -- ratio = kg received in 30 days ÷ people served (declared beneficiaries until proofs exist, P4)
      select g.org_id,
             row_number() over (order by fr.ratio, md5(g.org_id::text || v_day)) as rn,
             count(*) over () as n
      from orgs g
      cross join lateral (
        select coalesce((select sum(il.kg) from public.impact_ledger il
                         where il.charity_org_id = g.org_id and il.occurred_at >= v_now - interval '30 days'), 0)
               / greatest(coalesce((select o2.declared_beneficiaries from public.organizations o2
                                    where o2.id = g.org_id), 1), 1)::numeric as ratio
      ) fr
    )
    select m.user_id, c.org_id,
           (case when v_urgent then 0 else ((r.rn - 1) * v_waves) / r.n end)::smallint,
           'charity'::text, min(c.distance_m)
    from cand c
    join ranked r on r.org_id = c.org_id
    join public.org_members m on m.org_id = c.org_id and m.status = 'active'
                             and m.role in ('owner', 'manager', 'staff')
                             and (m.site_ids is null or c.site_id = any (m.site_ids))
    join public.profiles pr on pr.id = m.user_id and pr.deleted_at is null
    group by m.user_id, c.org_id, r.rn, r.n;
end;
$$;

comment on function private.offer_recipients(public.notification_outbox) is
  '§12.2/§12.3: admins (wave 0) + owner/manager/staff of approved, unpaused charities (same is_demo) with an active receiving site in radius, accepting the category and feasible (§4.7); non-urgent lots are split into fairness waves (kg 30 d ÷ beneficiaries, md5 daily rotation).';

-- Recipients of one outbox row: (user, org context, fairness wave, audience, distance).
-- audience: charity | store | volunteer | admin | org. A user may appear more than once
-- (dispatch_outbox keeps one row per user).
create or replace function public.resolve_recipients(p_outbox_id uuid)
returns table (user_id uuid, org_id uuid, wave smallint, audience text, distance_m float8)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o       public.notification_outbox%rowtype;
  p       jsonb;
  v_actor text;
  v_pick  uuid;
  v_need  uuid;
begin
  select * into o from public.notification_outbox x where x.id = p_outbox_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  p := o.payload;
  v_pick := private.try_uuid(p ->> 'pickup_id');

  case o.event
    when 'offer_published', 'offer_turned_red' then
      return query select * from private.offer_recipients(o);

    when 'allocation_requested' then
      return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                   from private.site_staff(private.try_uuid(p ->> 'store_site_id')) s;

    when 'offer_expired' then
      return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                   from private.site_staff(private.try_uuid(p ->> 'site_id')) s;

    when 'allocation_confirmed', 'allocation_rejected', 'allocation_expired', 'allocation_packed' then
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from private.site_staff(private.try_uuid(p ->> 'charity_site_id')) s;
      if o.event in ('allocation_expired', 'allocation_packed') and v_pick is not null then
        return query select a.user_id, a.org_id, 0::smallint, a.audience, null::float8
                     from private.pickup_assignee(v_pick) a;
      end if;

    when 'allocation_cancelled' then
      v_actor := coalesce(p ->> 'cancel_actor', 'admin');
      if v_actor in ('store', 'admin') then
        return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                     from private.site_staff(private.try_uuid(p ->> 'charity_site_id')) s;
      end if;
      if v_actor in ('charity', 'admin') then
        return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                     from private.site_staff(private.try_uuid(p ->> 'store_site_id')) s;
      end if;
      if v_pick is not null then
        return query select a.user_id, a.org_id, 0::smallint, a.audience, null::float8
                     from private.pickup_assignee(v_pick) a;
      end if;
      if v_actor = 'store' then                  -- N-19: admins follow store cancellations
        return query select a.id, null::uuid, 0::smallint, 'admin'::text, null::float8 from private.admin_ids() a(id);
      end if;

    when 'pickup_assigned' then
      return query select a.user_id, a.org_id, 0::smallint, a.audience, null::float8
                   from private.pickup_assignee(v_pick) a
                   where a.user_id = private.try_uuid(p ->> 'assignee_user_id');

    when 'pickup_cancelled' then
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.pickups pk
                   cross join lateral private.site_staff(pk.charity_site_id) s
                   where pk.id = v_pick;
      return query select a.user_id, a.org_id, 0::smallint, a.audience, null::float8
                   from private.pickup_assignee(v_pick) a;
      return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                   from (select distinct st.site_id from public.pickup_stops st
                         where st.pickup_id = v_pick and st.kind = 'pickup') x
                   cross join lateral private.site_staff(x.site_id) s;

    when 'pickup_handover_done' then
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.pickups pk
                   cross join lateral private.site_staff(pk.charity_site_id) s
                   where pk.id = v_pick;

    when 'delivery_completed' then
      return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                   from (select distinct a.store_site_id from public.allocations a
                         where a.pickup_id = v_pick and a.status = 'delivered') x
                   cross join lateral private.site_staff(x.store_site_id) s;

    when 'need_closed', 'bundle_confirmed', 'bundle_shortfall' then
      v_need := private.try_uuid(p ->> 'need_id');
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.needs n
                   cross join lateral private.site_staff(n.site_id) s
                   where n.id = v_need;

    when 'org_submitted', 'org_change_submitted' then
      return query select a.id, null::uuid, 0::smallint, 'admin'::text, null::float8 from private.admin_ids() a(id);

    when 'org_reviewed', 'org_change_reviewed', 'org_suspended', 'org_reinstated' then
      return query select s.user_id, s.org_id, 0::smallint, 'org'::text, null::float8
                   from private.org_staff(private.try_uuid(p ->> 'org_id'), '{owner,manager}') s;

    else
      return;                                  -- member_invited (e-mail only), kyc_purge, unsupported
  end case;
end;
$$;

comment on function public.resolve_recipients(uuid) is
  'service_role: recipients of an outbox row per DATA-MODEL §12.2 (user_id, org_id context, fairness wave, audience charity|store|volunteer|admin|org, distance_m for offer events).';

-- ===========================================================================
-- 6. Rendering (title, body, link) and channel defaults
-- ===========================================================================
create or replace function private.render_notification(
  p_o          public.notification_outbox,
  p_audience   text,
  p_org        uuid,
  p_distance_m float8,
  out title     text,
  out body      text,
  out link_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p          jsonb := p_o.payload;
  v_now      timestamptz := private.now();
  v_urgent   boolean := p_o.urgency = 'urgent';
  v_prefix   text := case when p_o.urgency = 'urgent' then 'GẤP · ' else '' end;
  v_offer    public.offers%rowtype;
  v_alloc    public.allocations%rowtype;
  v_org      public.organizations%rowtype;
  v_store    text;
  v_charity  text;
  v_lot      text;
  v_qty      text;
  v_dist     text := private.fmt_distance(p_distance_m);
  v_kg       numeric;
  v_actor    text;
  v_portal   text;
begin
  if p ? 'allocation_id' then
    select * into v_alloc from public.allocations a where a.id = private.try_uuid(p ->> 'allocation_id');
  end if;
  if p ? 'offer_id' then
    select * into v_offer from public.offers x where x.id = private.try_uuid(p ->> 'offer_id');
  end if;
  select s.name into v_store from public.organizations s
   where s.id = coalesce(v_offer.org_id, v_alloc.store_org_id, private.try_uuid(p ->> 'store_org_id'));
  select c.name into v_charity from public.organizations c
   where c.id = coalesce(v_alloc.charity_org_id, private.try_uuid(p ->> 'charity_org_id'));
  v_store := coalesce(v_store, 'Cửa hàng');
  v_charity := coalesce(v_charity, 'Tổ chức');
  v_lot := coalesce(v_offer.title, 'lô tặng');
  v_qty := coalesce(private.fmt_qty(coalesce((p ->> 'qty')::numeric, v_alloc.qty_reserved), v_alloc.unit), '');

  case p_o.event
    when 'offer_published', 'offer_turned_red' then
      v_qty := private.fmt_qty(case when v_offer.qty_available > 0 then v_offer.qty_available else v_offer.quantity end,
                               v_offer.unit);
      if p_audience = 'admin' then
        title := v_prefix || case when p_o.event = 'offer_turned_red' then 'Lô chuyển Đỏ: ' else 'Lô mới: ' end || v_lot;
        body := v_store || ' · ' || coalesce(v_qty, '') || ' · hạn ' ||
                coalesce(private.fmt_vn_time(v_offer.effective_deadline, v_now), '—') || '.';
        link_path := '/admin/offers?offer=' || v_offer.id;
      elsif v_urgent or p_o.event = 'offer_turned_red' then
        title := 'GẤP · Lô Đỏ gần bạn: ' || v_lot;
        body := 'GẤP · ' || v_store || ' có ' || coalesce(v_qty || ' ', '') || v_lot || ' (Đỏ)' ||
                coalesce(', cách ' || v_dist, '') || ', cần lấy trước ' ||
                coalesce(private.fmt_vn_time(v_offer.effective_deadline, v_now), '—') || '.';
        link_path := '/charity/donations?offer=' || v_offer.id;
      else
        title := 'Lô mới gần bạn: ' || v_lot;
        body := v_store || ' tặng ' || coalesce(v_qty || ' ', '') || v_lot || coalesce(', cách ' || v_dist, '') ||
                '. Lấy trước ' || coalesce(private.fmt_vn_time(v_offer.effective_deadline, v_now), '—') || '.';
        link_path := '/charity/donations?offer=' || v_offer.id;
      end if;

    when 'allocation_requested' then
      if coalesce((p ->> 'auto_confirmed')::boolean, false) then
        title := v_prefix || 'Đã tự chấp nhận yêu cầu: ' || v_lot;
        body := v_charity || ' sẽ nhận ' || v_qty || '. Chuẩn bị hàng trước ' ||
                coalesce(private.fmt_vn_time(v_offer.effective_deadline, v_now), '—') || '.';
      else
        title := v_prefix || 'Yêu cầu nhận lô mới: ' || v_lot;
        body := v_charity || ' muốn nhận ' || v_qty || '. Hãy trả lời trước ' ||
                coalesce(private.fmt_vn_time(v_alloc.reserved_until, v_now), '—') ||
                ', sau đó yêu cầu tự hết hạn.';
      end if;
      link_path := '/store/inventory?offer=' || v_offer.id;

    when 'allocation_confirmed' then
      title := 'Yêu cầu đã được chấp nhận: ' || v_lot;
      body := v_store || ' đồng ý tặng ' || v_qty || '. Hãy đến lấy trước ' ||
              coalesce(private.fmt_vn_time(v_offer.effective_deadline, v_now), '—') || '.';
      link_path := '/charity/pickups?allocation=' || v_alloc.id;

    when 'allocation_rejected' then
      title := 'Yêu cầu chưa được chấp nhận: ' || v_lot;
      body := case when p ->> 'reason' = 'offer_cancelled'
                   then v_store || ' đã hủy lô này. Hãy chọn lô khác trong Kho tặng.'
                   else v_store || ' chưa thể tặng lô này lúc này. Hãy chọn lô khác trong Kho tặng.' end;
      link_path := '/charity/donations';

    when 'allocation_expired' then
      title := 'Yêu cầu đã hết hạn: ' || v_lot;
      body := case when p ->> 'reason' = 'request_ttl'
                   then v_store || ' chưa trả lời kịp nên yêu cầu nhận ' || v_qty || ' đã hết hạn.'
                   else 'Lô đã quá hạn lấy hàng nên phân bổ ' || v_qty || ' đã kết thúc.' end;
      link_path := case when p_audience = 'volunteer' then '/volunteer/trips' else '/charity/donations' end;

    when 'allocation_cancelled' then
      v_actor := coalesce(p ->> 'cancel_actor', 'admin');
      if p_audience = 'store' then
        title := case when v_actor = 'charity' then 'Tổ chức đã hủy yêu cầu: ' else 'FoodSave đã hủy phân bổ: ' end || v_lot;
        body := case when v_actor = 'charity'
                     then v_charity || ' không nhận ' || v_qty || ' nữa.'
                     else 'Phân bổ ' || v_qty || ' cho ' || v_charity || ' đã bị hủy.' end;
        link_path := '/store/inventory?offer=' || v_offer.id;
      elsif p_audience = 'admin' then
        title := v_prefix || 'Cửa hàng hủy sau xác nhận: ' || v_lot;
        body := v_store || ' đã hủy ' || v_qty || ' của ' || v_charity || '.';
        link_path := '/admin/allocations?allocation=' || v_alloc.id;
      elsif p_audience = 'volunteer' then
        title := v_prefix || 'Lô trong chuyến đã bị hủy: ' || v_lot;
        body := v_store || ' — ' || v_qty || ' không còn trong chuyến của bạn.';
        link_path := '/volunteer/trips';
      else
        title := v_prefix || case when v_actor = 'store' then 'Cửa hàng đã hủy phân bổ: '
                                  when v_actor = 'charity' then 'Đã hủy yêu cầu: '
                                  else 'FoodSave đã hủy phân bổ: ' end || v_lot;
        body := case when v_actor = 'store' then v_store || ' đã hủy ' || v_qty || '.'
                     when v_actor = 'charity' then 'Yêu cầu nhận ' || v_qty || ' đã được hủy.'
                     else 'Phân bổ ' || v_qty || ' từ ' || v_store || ' đã bị hủy.' end ||
                case when v_urgent then ' Chuyến đang chạy cần điều chỉnh.' else '' end;
        link_path := '/charity/pickups?allocation=' || v_alloc.id;
      end if;

    when 'allocation_packed' then
      title := 'Hàng đã đóng gói: ' || v_lot;
      body := v_store || ' đã đóng gói ' || v_qty || ', sẵn sàng để lấy.';
      link_path := case when p_audience = 'volunteer' then '/volunteer/trips'
                        else '/charity/pickups?allocation=' || v_alloc.id end;

    when 'pickup_assigned' then
      title := 'Bạn được giao chuyến lấy hàng';
      body := v_charity || ' vừa giao cho bạn một chuyến lấy hàng.';
      link_path := case when p_audience = 'volunteer' then '/volunteer/trips'
                        else '/charity/pickups?pickup=' || (p ->> 'pickup_id') end;

    when 'pickup_cancelled' then
      title := 'Chuyến lấy hàng đã hủy';
      body := 'Chuyến của ' || v_charity || ' không còn hàng cần chở nên đã tự hủy.';
      link_path := case p_audience when 'volunteer' then '/volunteer/trips'
                                   when 'store' then '/store/handover'
                                   else '/charity/pickups?pickup=' || (p ->> 'pickup_id') end;

    when 'pickup_handover_done' then
      select s.name into v_store from public.sites st join public.organizations s on s.id = st.org_id
       where st.id = private.try_uuid(p ->> 'store_site_id');
      title := 'Đã lấy hàng tại cửa hàng';
      body := 'Chuyến đã nhận hàng tại ' || coalesce(v_store, 'cửa hàng') || '.';
      link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');

    when 'delivery_completed' then
      select coalesce(sum(a.kg_delivered), 0) into v_kg from public.allocations a
       where a.pickup_id = private.try_uuid(p ->> 'pickup_id') and a.store_org_id = p_org and a.status = 'delivered';
      title := 'Hàng đã tới tổ chức';
      body := v_charity || ' đã nhận ' || private.fmt_num(v_kg, 1) || ' kg thực phẩm từ cửa hàng bạn. Cảm ơn bạn!';
      link_path := '/store/inventory';

    when 'offer_expired' then
      title := 'Lô đã hết hạn: ' || v_lot;
      body := 'Còn ' || coalesce(private.fmt_qty(v_offer.qty_unclaimed, v_offer.unit), '0') ||
              ' chưa có tổ chức nhận. Lần sau hãy đăng sớm hơn để kịp kết nối.';
      link_path := '/store/inventory?offer=' || v_offer.id;

    when 'need_closed' then
      if p ->> 'status' = 'closed_partial' then
        title := 'Nhu cầu đã đóng (nhận một phần)';
        body := 'Nhu cầu đã tới hạn khi mới nhận được một phần.';
      else
        title := 'Nhu cầu đã hết hạn';
        body := 'Nhu cầu đã tới hạn mà chưa nhận được hàng. Bạn có thể đăng lại.';
      end if;
      link_path := '/charity/needs?need=' || (p ->> 'need_id');

    when 'bundle_confirmed' then
      title := 'Phương án ghép đã đủ xác nhận';
      body := 'Mọi cửa hàng trong phương án đã đồng ý. Hãy lên chuyến lấy hàng.';
      link_path := '/charity/needs?need=' || (p ->> 'need_id');

    when 'bundle_shortfall' then
      title := 'Phương án ghép bị thiếu hàng';
      body := 'Một cửa hàng không thể tặng phần đã hẹn. Hãy chọn phương án bổ sung.';
      link_path := '/charity/needs?need=' || (p ->> 'need_id');

    else
      -- organization events
      select * into v_org from public.organizations g where g.id = coalesce(p_org, private.try_uuid(p ->> 'org_id'));
      v_portal := case when v_org.kind = 'store' then '/store' else '/charity' end;
      case p_o.event
        when 'org_submitted' then
          title := 'Hồ sơ mới chờ duyệt';
          body := coalesce(v_org.name, 'Một tổ chức') || ' (' ||
                  case when v_org.kind = 'store' then 'cửa hàng' else 'tổ chức từ thiện' end || ') vừa gửi hồ sơ.';
          link_path := '/admin/reviews/' || v_org.id;
        when 'org_change_submitted' then
          title := 'Yêu cầu sửa thông tin pháp lý';
          body := coalesce(v_org.name, 'Một tổ chức') || ' gửi yêu cầu sửa thông tin pháp lý.';
          link_path := '/admin/reviews';
        when 'org_reviewed' then
          if p ->> 'decision' = 'approve' then
            title := 'Hồ sơ đã được duyệt';
            body := v_org.name || ' đã được duyệt. Bạn có thể bắt đầu dùng FoodSave.';
            link_path := v_portal;
          elsif p ->> 'decision' = 'request_changes' then
            title := 'Hồ sơ cần bổ sung';
            body := 'FoodSave cần bạn bổ sung hồ sơ ' || v_org.name || '. Xem chi tiết trong trang trạng thái.';
            link_path := '/onboarding/status?org=' || v_org.id;
          else
            title := 'Hồ sơ chưa được duyệt';
            body := 'Hồ sơ ' || v_org.name || ' chưa được duyệt. Xem lý do trong trang trạng thái.';
            link_path := '/onboarding/status?org=' || v_org.id;
          end if;
        when 'org_change_reviewed' then
          title := case when p ->> 'decision' = 'approve' then 'Yêu cầu sửa thông tin đã được duyệt'
                        else 'Yêu cầu sửa thông tin chưa được duyệt' end;
          body := 'FoodSave đã xem yêu cầu sửa thông tin pháp lý của ' || v_org.name || '.';
          link_path := v_portal || '/settings';
        when 'org_suspended' then
          title := 'Tổ chức đang bị tạm khóa';
          body := v_org.name || ' đang bị tạm khóa. Liên hệ FoodSave để biết lý do và cách mở khóa.';
          link_path := '/onboarding/status?org=' || v_org.id;
        when 'org_reinstated' then
          title := 'Tổ chức đã được mở khóa';
          body := v_org.name || ' đã hoạt động trở lại trên FoodSave.';
          link_path := v_portal;
        else
          title := 'Thông báo từ FoodSave';
          body := '';
          link_path := null;
      end case;
  end case;

  title := left(coalesce(title, 'Thông báo từ FoodSave'), 140);
  body := left(coalesce(body, ''), 500);
end;
$$;

comment on function private.render_notification(public.notification_outbox, text, uuid, float8) is
  'Vietnamese title/body/link of an outbox event for one audience. Org names, lot titles, quantities, VN times and crow-fly distance only (no address/coordinates).';

-- Default e-mail choice when the user has no preference row (PRD §10 matrix, "email for important
-- events"). Admin rows are in-app only.
create or replace function private.email_by_default(p_event public.notification_event, p_urgency text,
                                                    p_payload jsonb, p_audience text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_audience <> 'admin' and case
    when p_event = 'offer_published' then p_urgency = 'urgent'
    when p_event in ('offer_turned_red', 'allocation_requested', 'allocation_confirmed', 'allocation_rejected',
                     'allocation_expired', 'pickup_assigned', 'need_closed', 'org_suspended', 'org_reinstated') then true
    when p_event = 'allocation_cancelled' then
      p_audience in ('charity', 'volunteer') and coalesce(p_payload ->> 'cancel_actor', '') in ('store', 'admin')
    else false
  end;
$$;

comment on function private.email_by_default(public.notification_event, text, jsonb, text) is
  'Default e-mail channel: urgent/red lots, request received (store), request confirmed/rejected/expired (charity), store/admin cancellation, trip assigned, need closed, org suspended/reinstated. org_reviewed and member_invited are e-mailed by the server action, never here.';

-- ===========================================================================
-- 7. Outbox processing (§8.7, §12.1)
-- ===========================================================================

-- Claims ready rows (pending and due, or processing with an expired lease): processing, attempts+1,
-- 2-minute lease. Urgent first. Rows whose lease expired after the last attempt are dead-lettered.
create or replace function private.claim_outbox(p_limit integer, p_only public.notification_event[],
                                                p_except public.notification_event[])
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.now();
begin
  update public.notification_outbox o
     set status = 'dead', locked_until = null, processed_at = v_now,
         last_error = coalesce(o.last_error, 'lease_expired')
   where o.status = 'processing' and o.locked_until < v_now and o.attempts >= 6
     and (p_only is null or o.event = any (p_only))
     and (p_except is null or o.event <> all (p_except));

  return query
    update public.notification_outbox o
       set status = 'processing', attempts = o.attempts + 1, locked_until = v_now + interval '2 minutes'
     where o.id in (
       select x.id from public.notification_outbox x
       where ((x.status = 'pending' and x.next_attempt_at <= v_now)
              or (x.status = 'processing' and x.locked_until < v_now))
         and x.attempts < 6
         and (p_only is null or x.event = any (p_only))
         and (p_except is null or x.event <> all (p_except))
       order by (x.urgency = 'urgent') desc, x.next_attempt_at, x.created_at
       limit greatest(coalesce(p_limit, 0), 0)
       for update skip locked)
    returning o.*;
end;
$$;

comment on function private.claim_outbox(integer, public.notification_event[], public.notification_event[]) is
  'Lease up to p_limit ready outbox rows (for update skip locked): processing, attempts + 1, locked_until = now + 2 min.';

-- Ends one attempt: done, or pending with backoff 1m/5m/15m/1h/6h, or dead at the 6th failure.
create or replace function private.finish_outbox(p_id uuid, p_ok boolean, p_error text, p_dead_now boolean)
returns public.outbox_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now    timestamptz := private.now();
  v_status public.outbox_status;
begin
  update public.notification_outbox o
     set status = case when p_ok then 'done'::public.outbox_status
                       when p_dead_now or o.attempts >= 6 then 'dead'::public.outbox_status
                       else 'pending'::public.outbox_status end,
         next_attempt_at = case when p_ok or p_dead_now or o.attempts >= 6 then o.next_attempt_at
                                else v_now + case o.attempts when 1 then interval '1 minute'
                                                             when 2 then interval '5 minutes'
                                                             when 3 then interval '15 minutes'
                                                             when 4 then interval '1 hour'
                                                             else interval '6 hours' end end,
         locked_until = null,
         processed_at = case when p_ok or p_dead_now or o.attempts >= 6 then v_now end,
         last_error = case when p_ok then null else left(coalesce(p_error, 'unknown_error'), 2000) end
   where o.id = p_id
  returning o.status into v_status;
  return v_status;
end;
$$;

comment on function private.finish_outbox(uuid, boolean, text, boolean) is 'Complete an outbox attempt (done / backoff / dead). Internal.';

-- For the app dispatcher (kyc_purge via the Storage API).
create or replace function public.claim_outbox_batch(p_limit integer, p_events public.notification_event[])
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_limit":"1-200"}';
  end if;
  if p_events is null or cardinality(p_events) = 0 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_events":"required"}';
  end if;
  return query select * from private.claim_outbox(p_limit, p_events, null);
end;
$$;

comment on function public.claim_outbox_batch(integer, public.notification_event[]) is
  'service_role: lease up to p_limit ready outbox rows of the given events (for update skip locked, 2-minute lease). Finish each with complete_outbox.';

create or replace function public.complete_outbox(p_id uuid, p_ok boolean, p_error text default null)
returns public.outbox_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.outbox_status;
begin
  if not exists (select 1 from public.notification_outbox o where o.id = p_id and o.status = 'processing') then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;
  v_status := private.finish_outbox(p_id, coalesce(p_ok, false), p_error, false);
  return v_status;
end;
$$;

comment on function public.complete_outbox(uuid, boolean, text) is
  'service_role: finish a leased outbox row — done, or retry with backoff 1m/5m/15m/1h/6h, dead after the 6th failure. PT409 when the row is not processing.';

-- Fan-out of one outbox row: one notification per recipient (idempotent on outbox_id + user_id).
create or replace function private.fanout(p_o public.notification_outbox)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wave_min numeric := greatest(0, private.setting_num('fairness_wave_minutes', 5));
  v_n        integer;
begin
  insert into public.notifications (user_id, org_id, outbox_id, event, title, body, link_path, urgency,
                                    deliver_after, channels)
  select r.user_id, r.org_id, p_o.id, p_o.event, t.title, t.body, t.link_path, p_o.urgency,
         p_o.created_at + r.wave * v_wave_min * interval '1 minute', ch.channels
  from (select distinct on (x.user_id) x.*
        from public.resolve_recipients(p_o.id) x
        order by x.user_id, x.wave, (x.audience = 'admin'), x.distance_m nulls last) r
  join public.profiles pr on pr.id = r.user_id
  left join public.organizations og on og.id = r.org_id
  cross join lateral (
    select array_remove(array[
      case when private.notify_mandatory(p_o.event)
                or coalesce((select np.enabled from public.notification_preferences np
                             where np.user_id = r.user_id and np.event = p_o.event and np.channel = 'in_app'), true)
           then 'in_app'::public.notify_channel end,
      case when r.audience <> 'admin' and pr.email is not null and not pr.is_demo
                and not coalesce(og.is_demo, false)
                and coalesce((select np.enabled from public.notification_preferences np
                              where np.user_id = r.user_id and np.event = p_o.event and np.channel = 'email'),
                             private.email_by_default(p_o.event, p_o.urgency, p_o.payload, r.audience))
           then 'email'::public.notify_channel end
    ], null) as channels
  ) ch
  cross join lateral private.render_notification(p_o, r.audience, r.org_id, r.distance_m) t
  where cardinality(ch.channels) > 0
  on conflict (outbox_id, user_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function private.fanout(public.notification_outbox) is
  'Insert one notification per recipient (preferences + defaults decide channels; demo profiles/orgs never get e-mail); on conflict (outbox_id, user_id) do nothing.';

-- The SQL half of the dispatcher: lease up to p_limit rows (except kyc_purge, which needs the
-- Storage API), fan each one out in its own subtransaction, then done / retry / dead.
create or replace function public.dispatch_outbox(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o          public.notification_outbox%rowtype;
  v_claimed  integer := 0;
  v_done     integer := 0;
  v_retry    integer := 0;
  v_dead     integer := 0;
  v_notified integer := 0;
  v_n        integer;
  v_err      text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_limit":"1-200"}';
  end if;

  for o in select * from private.claim_outbox(p_limit, null, array['kyc_purge']::public.notification_event[]) loop
    v_claimed := v_claimed + 1;
    if not private.notify_supported(o.event) then
      perform private.finish_outbox(o.id, false, 'unsupported_event', true);
      v_dead := v_dead + 1;
      continue;
    end if;
    begin
      v_n := private.fanout(o);
      perform private.finish_outbox(o.id, true, null, false);
      v_done := v_done + 1;
      v_notified := v_notified + v_n;
    exception when others then
      get stacked diagnostics v_err = message_text;
      if private.finish_outbox(o.id, false, v_err, false) = 'dead' then
        v_dead := v_dead + 1;
      else
        v_retry := v_retry + 1;
      end if;
    end;
  end loop;

  return jsonb_build_object('claimed', v_claimed, 'done', v_done, 'retried', v_retry, 'dead', v_dead,
                            'notifications', v_notified);
end;
$$;

comment on function public.dispatch_outbox(integer) is
  'service_role: claim ≤ p_limit ready outbox rows (urgent first, skip locked, kyc_purge excluded), fan out idempotently, mark done / retry with backoff / dead after 6 attempts. Returns {claimed, done, retried, dead, notifications}.';

-- ===========================================================================
-- 8. E-mail deliveries
-- ===========================================================================

-- Leases up to p_limit e-mails due now: new ones (email chosen, deliver_after passed, < 24 h old,
-- recipient has an address) and retries (failed < 3 attempts after 5 min × attempts, or expired lease).
create or replace function public.claim_email_deliveries(p_limit integer default 20)
returns table (notification_id uuid, event public.notification_event, urgency text, title text, body text,
               link_path text, email text, full_name text, org_name text, attempts smallint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz := private.now();
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_limit":"1-100"}';
  end if;

  return query
    with fresh as (
      insert into public.notification_deliveries as d (notification_id, channel, target, status, attempts,
                                                       locked_until, attempted_at)
      select n.id, 'email', 'email', null, 1, v_now + interval '2 minutes', v_now
      from public.notifications n
      join public.profiles p on p.id = n.user_id
      where 'email' = any (n.channels) and n.deliver_after <= v_now and n.created_at > v_now - interval '24 hours'
        and p.email is not null and p.deleted_at is null
        and not exists (select 1 from public.notification_deliveries x
                        where x.notification_id = n.id and x.channel = 'email' and x.target = 'email')
      order by (n.urgency = 'urgent') desc, n.deliver_after
      limit p_limit
      on conflict do nothing
      returning d.notification_id, d.attempts
    ), retry as (
      update public.notification_deliveries d
         set status = null, attempts = d.attempts + 1, locked_until = v_now + interval '2 minutes',
             attempted_at = v_now
       where (d.notification_id, d.channel, d.target) in (
         select x.notification_id, x.channel, x.target from public.notification_deliveries x
         where x.channel = 'email' and x.attempts < 3
           and ((x.status = 'failed' and x.attempted_at <= v_now - x.attempts * interval '5 minutes')
                or (x.status is null and x.locked_until < v_now))
         limit p_limit
         for update skip locked)
      returning d.notification_id, d.attempts
    ), claimed as (
      select * from fresh union all select * from retry
    )
    select n.id, n.event, n.urgency, n.title, n.body, n.link_path, p.email, p.full_name, g.name, c.attempts
    from claimed c
    join public.notifications n on n.id = c.notification_id
    join public.profiles p on p.id = n.user_id
    left join public.organizations g on g.id = n.org_id;
end;
$$;

comment on function public.claim_email_deliveries(integer) is
  'service_role: lease ≤ p_limit due e-mails (2-minute lease) and return what the template needs, including the recipient address (never log it). Finish each with complete_email_delivery.';

create or replace function public.complete_email_delivery(p_notification_id uuid, p_ok boolean,
                                                          p_provider_message_id text default null,
                                                          p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_deliveries d
     set status = case when p_ok then 'sent'::public.delivery_status else 'failed'::public.delivery_status end,
         locked_until = null,
         provider_message_id = left(p_provider_message_id, 300),
         error = case when p_ok then null else left(coalesce(p_error, 'unknown_error'), 500) end,
         attempted_at = private.now()
   where d.notification_id = p_notification_id and d.channel = 'email' and d.target = 'email'
     and d.status is null;
  return found;
end;
$$;

comment on function public.complete_email_delivery(uuid, boolean, text, text) is
  'service_role: record the result of a leased e-mail (sent / failed); false when the lease is not held.';

-- ===========================================================================
-- 9. Notification center (authenticated, RLS)
-- ===========================================================================
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'not_authenticated';
  end if;
  if p_ids is not null and cardinality(p_ids) > 200 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_ids":"max 200"}';
  end if;

  update public.notifications n
     set read_at = now()
   where n.read_at is null and n.user_id = auth.uid()
     and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.mark_notifications_read(uuid[]) is
  'Mark the caller''s visible unread notifications as read (all when p_ids is null). Security invoker: RLS + the read_at column grant apply. Returns the number updated.';

-- ===========================================================================
-- 10. Retention (§16): notifications + deliveries 90 days
-- ===========================================================================
create or replace function public.purge_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.notifications n where n.created_at < private.now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.purge_notifications() is 'service_role / cron fs_purge_notifications: delete notifications (and their deliveries) older than 90 days.';

-- ===========================================================================
-- 11. Waking the dispatcher (ARCHITECTURE §8.3): pg_net POST signed with HMAC-SHA256 over
--     "<unix ts>.<raw body>". URL and secret come from Vault (jobs_dispatch_url, jobs_hmac_secret);
--     nothing is hard-coded. pg_net queues the request in a table, so a rollback sends nothing.
-- ===========================================================================

-- Is there work for the dispatcher? (pending/expired outbox rows, due or retryable e-mails)
create or replace function private.dispatch_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.notification_outbox o
                 where (o.status = 'pending' and o.next_attempt_at <= now())
                    or (o.status = 'processing' and o.locked_until < now()))
      or exists (select 1 from public.notifications n
                 join public.profiles p on p.id = n.user_id and p.email is not null and p.deleted_at is null
                 where 'email' = any (n.channels) and n.deliver_after <= now()
                   and n.created_at > now() - interval '24 hours'
                   and not exists (select 1 from public.notification_deliveries d
                                   where d.notification_id = n.id and d.channel = 'email'))
      or exists (select 1 from public.notification_deliveries d
                 where d.channel = 'email' and d.attempts < 3
                   and ((d.status = 'failed' and d.attempted_at <= now() - d.attempts * interval '5 minutes')
                        or (d.status is null and d.locked_until < now())));
$$;

comment on function private.dispatch_due() is 'true when the dispatcher has work (fs_dispatch_tick only calls it then).';

-- Queues one signed POST to the dispatcher. Returns false (quietly) when Vault/pg_net or the
-- secrets are missing (local dev, CI) — never raises into the caller's transaction.
create or replace function private.kick_dispatch(p_source text default 'manual')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_ts     text;
  v_body   text;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return false;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'jobs_dispatch_url' limit 1;
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'jobs_hmac_secret' limit 1;
  if v_url is null or v_url !~ '^https?://' or v_secret is null or char_length(v_secret) < 16 then
    return false;
  end if;

  v_ts := floor(extract(epoch from clock_timestamp()))::bigint::text;
  -- jsonb text form is canonical: pg_net sends exactly convert_to(body::text) = v_body
  v_body := jsonb_build_object('job', 'dispatch', 'source', left(coalesce(p_source, 'manual'), 20))::text;

  perform net.http_post(
    url                  := v_url,
    body                 := v_body::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-fs-timestamp', v_ts,
                              'x-fs-signature', encode(extensions.hmac(v_ts || '.' || v_body, v_secret, 'sha256'), 'hex')),
    timeout_milliseconds := 10000);
  return true;
exception when others then
  raise warning 'kick_dispatch skipped (%)', sqlstate;
  return false;
end;
$$;

comment on function private.kick_dispatch(text) is
  'Queue a pg_net POST to Vault jobs_dispatch_url with x-fs-timestamp / x-fs-signature = hex(HMAC-SHA256(jobs_hmac_secret, ts || ''.'' || body)). No-op without Vault secrets.';

create or replace function private.kick_dispatch_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from new_rows) then
    perform private.kick_dispatch('outbox');
  end if;
  return null;
end;
$$;

comment on function private.kick_dispatch_trg() is 'AFTER INSERT statement trigger on notification_outbox: wake the dispatcher once per statement that inserted rows.';

create trigger notification_outbox_kick
  after insert on public.notification_outbox
  referencing new table as new_rows
  for each statement execute function private.kick_dispatch_trg();

-- ===========================================================================
-- 12. Function privileges (§8.7, §8.8)
-- ===========================================================================
revoke all on function private.notify_mandatory(public.notification_event) from public, anon, authenticated;
revoke all on function private.notification_preferences_guard() from public, anon, authenticated;
revoke all on function private.fmt_num(numeric, integer) from public, anon, authenticated;
revoke all on function private.fmt_qty(numeric, public.unit_code) from public, anon, authenticated;
revoke all on function private.fmt_vn_time(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.fmt_distance(float8) from public, anon, authenticated;
revoke all on function private.admin_ids() from public, anon, authenticated;
revoke all on function private.site_staff(uuid) from public, anon, authenticated;
revoke all on function private.org_staff(uuid, public.org_role[]) from public, anon, authenticated;
revoke all on function private.pickup_assignee(uuid) from public, anon, authenticated;
revoke all on function private.notify_supported(public.notification_event) from public, anon, authenticated;
revoke all on function private.offer_recipients(public.notification_outbox) from public, anon, authenticated;
revoke all on function private.render_notification(public.notification_outbox, text, uuid, float8) from public, anon, authenticated;
revoke all on function private.email_by_default(public.notification_event, text, jsonb, text) from public, anon, authenticated;
revoke all on function private.claim_outbox(integer, public.notification_event[], public.notification_event[]) from public, anon, authenticated;
revoke all on function private.finish_outbox(uuid, boolean, text, boolean) from public, anon, authenticated;
revoke all on function private.fanout(public.notification_outbox) from public, anon, authenticated;
revoke all on function private.dispatch_due() from public, anon, authenticated;
revoke all on function private.kick_dispatch(text) from public, anon, authenticated;
revoke all on function private.kick_dispatch_trg() from public, anon, authenticated;

revoke all on function public.resolve_recipients(uuid) from public, anon, authenticated;
revoke all on function public.claim_outbox_batch(integer, public.notification_event[]) from public, anon, authenticated;
revoke all on function public.complete_outbox(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.dispatch_outbox(integer) from public, anon, authenticated;
revoke all on function public.claim_email_deliveries(integer) from public, anon, authenticated;
revoke all on function public.complete_email_delivery(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.purge_notifications() from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;

grant execute on function public.resolve_recipients(uuid) to service_role;
grant execute on function public.claim_outbox_batch(integer, public.notification_event[]) to service_role;
grant execute on function public.complete_outbox(uuid, boolean, text) to service_role;
grant execute on function public.dispatch_outbox(integer) to service_role;
grant execute on function public.claim_email_deliveries(integer) to service_role;
grant execute on function public.complete_email_delivery(uuid, boolean, text, text) to service_role;
grant execute on function public.purge_notifications() to service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ===========================================================================
-- 13. pg_cron (ARCHITECTURE §8.2, UTC). Skipped when pg_cron is not installed. The P2 lot jobs
--     (fs_expire_requests, fs_close_offers, fs_turned_red) already run every minute since
--     offers_allocations; they are only created here when missing.
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fs_dispatch_tick', '* * * * *',
      'select private.kick_dispatch(''cron'') where private.dispatch_due()');
    perform cron.schedule('fs_purge_notifications', '40 19 * * *', 'select public.purge_notifications()');
    if not exists (select 1 from cron.job where jobname = 'fs_expire_requests') then
      perform cron.schedule('fs_expire_requests', '*/5 * * * *', 'select public.expire_stale_requests()');
    end if;
    if not exists (select 1 from cron.job where jobname = 'fs_close_offers') then
      perform cron.schedule('fs_close_offers', '*/5 * * * *', 'select public.close_expired_offers()');
    end if;
    if not exists (select 1 from cron.job where jobname = 'fs_turned_red') then
      perform cron.schedule('fs_turned_red', '*/5 * * * *', 'select public.notify_turned_red()');
    end if;
  end if;
end;
$$;

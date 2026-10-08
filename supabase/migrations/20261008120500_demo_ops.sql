-- Migration — demo_ops (DATA-MODEL §8.7 demo_reset, §13, §17; SECURITY-PRIVACY C20; ROADMAP P2-16, P2-17)
-- Service-role-only helpers for scripts/seed-demo.mjs and scripts/demo-reset.mjs:
--   public.demo_approve_organization(p_org_id, p_reviewer_id)  submitted demo org -> approved
--   public.demo_seed_history(p_items)                          backdated, consistent history rows
--   public.demo_reset()                                        purge every is_demo organization
--
-- Why helpers instead of the normal RPCs:
--   * review_organization needs an admin JWT with aal2 (TOTP); the seed has no admin and must not
--     get one (judges never get admin either, SECURITY-PRIVACY C20).
--   * A PostgREST session can never move the business clock: private.now() honours fs.clock only
--     for session_user postgres, and PostgREST logs in as `authenticator`. History older than "now"
--     therefore cannot be replayed through the RPCs over the API (DATA-MODEL §17).
-- Production checks are unchanged: every helper is EXECUTE-granted to service_role only, gated
-- again by private.require_service(), refuses any organization that is not is_demo, and writes
-- audit_logs (actor_kind service). Ledger credits are still produced by private.credit_impact
-- (§13); demo_reset deletes demo ledger rows only through the documented fs.demo_reset exception of
-- private.ledger_immutable (DELETE of is_demo rows).

-- ===========================================================================
-- 1. Gate
-- ===========================================================================

-- service_role (PostgREST with the service key) or a direct postgres/supabase_admin session
-- without SET ROLE (psql, migrations). Everyone else: PT403 not_authorized (service_role_only).
create or replace function private.require_service()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  if v_role = 'service_role' or (v_role = 'none' and session_user in ('postgres', 'supabase_admin')) then
    return;
  end if;
  raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'service_role_only';
end;
$$;

comment on function private.require_service() is
  'Gate of the demo helpers: service_role, or a direct postgres/supabase_admin session without SET ROLE. PT403 not_authorized otherwise.';

-- ===========================================================================
-- 2. demo_approve_organization — stands in for review_organization (admin aal2) for demo orgs
-- ===========================================================================
-- Only an is_demo organization created by a demo profile, in status submitted (it went through the
-- real create_organization / upsert_site / grant_consent / submit_organization path). The reviewer
-- is a demo profile (platform_role user, never an admin) that is not a member/creator of the org,
-- so no admin decision is ever forged. Same side effects as an approval (reviewed_by/at,
-- org_documents.purge_after) and an audit row org.review with actor_kind service. No outbox event:
-- demo owners are fictional. Already approved => no-op.
create or replace function public.demo_approve_organization(p_org_id uuid, p_reviewer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  v_now timestamptz := private.now();
begin
  perform private.require_service();

  select * into v_org from public.organizations o where o.id = p_org_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if not v_org.is_demo
     or not exists (select 1 from public.profiles p where p.id = v_org.created_by and p.is_demo) then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'not_a_demo_organization';
  end if;

  if v_org.status = 'approved' then
    return jsonb_build_object('org_id', v_org.id, 'status', 'approved', 'changed', false);
  end if;
  if v_org.status <> 'submitted' then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = v_org.status::text;
  end if;

  if p_reviewer_id is null
     or not exists (select 1 from public.profiles p
                    where p.id = p_reviewer_id and p.is_demo and p.platform_role = 'user' and p.deleted_at is null)
     or p_reviewer_id = v_org.created_by
     or exists (select 1 from public.org_members m where m.org_id = p_org_id and m.user_id = p_reviewer_id) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_reviewer_id":"demo profile (platform_role user), not the creator nor a member of the org"}';
  end if;

  update public.organizations
     set status = 'approved', reviewed_by = p_reviewer_id, reviewed_at = v_now, rejection_reason = null
   where id = p_org_id;

  -- same KYC retention as an onboarding approval (§16)
  update public.org_documents
     set purge_after = v_now + interval '30 days'
   where org_id = p_org_id and change_request_id is null and purge_after is null and file_deleted_at is null;

  perform private.audit(
    p_action      => 'org.review',
    p_entity_type => 'organization',
    p_entity_id   => p_org_id,
    p_org_id      => p_org_id,
    p_before      => jsonb_build_object('status', v_org.status),
    p_after       => jsonb_build_object('status', 'approved', 'decision', 'approve', 'via', 'demo_approve_organization'),
    p_reason      => 'Dữ liệu demo: duyệt tự động bằng script seed (service role), không qua Admin',
    p_actor_kind  => 'service');

  return jsonb_build_object('org_id', p_org_id, 'status', 'approved', 'changed', true);
end;
$$;

comment on function public.demo_approve_organization(uuid, uuid) is
  'Seed only (service_role): submitted is_demo org created by a demo profile -> approved, reviewer = demo profile (never admin, not a member). Audit org.review actor_kind service. No-op when already approved.';

-- ===========================================================================
-- 3. demo_seed_history — backdated history for ESG charts (DATA-MODEL §17)
-- ===========================================================================
-- p_items: array (1–500) of
--   {"kind": "delivered", "store_site_id", "charity_site_id", "store_user_id", "charity_user_id",
--    "category_code", "title", "quantity", "extra_quantity"?, "at"}
--   {"kind": "expired",   "store_site_id", "store_user_id", "category_code", "title", "quantity", "at"}
-- "at" (ISO-8601 with offset) = dropoff time (delivered) or effective deadline (expired); it must lie
-- in [now − 120 days, now − 1 hour]. Sites must belong to approved is_demo orgs of the right kind and
-- users must be active owner/manager/staff of those orgs.
-- Each delivered item writes exactly the rows the real loop leaves behind for a self pickup
-- (offers completed, allocations delivered, pickups completed + 2 stops done, handovers pickup qr +
-- dropoff auto, handover_lines) with timestamps relative to "at", then calls private.credit_impact
-- on the dropoff line: the ledger credit (occurred_at = dropoff time, is_demo) and
-- impact_public_daily come from the real ledger code. Expired items leave an expired lot with
-- nothing claimed. History writes no trust_events (the trust score stays consistent with
-- Σ trust_events), no outbox rows and one audit row (demo.seed_history) per call.
create or replace function public.demo_seed_history(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now       timestamptz := private.now();
  v_due       interval := private.setting_num('proof_due_hours', 48) * interval '1 hour';
  e           jsonb;
  v_i         integer := 0;
  v_kind      text;
  v_bad       text[];
  v_ss        public.sites%rowtype;
  v_cs        public.sites%rowtype;
  v_store     public.organizations%rowtype;
  v_charity   public.organizations%rowtype;
  v_cat       public.food_categories%rowtype;
  v_su        uuid;
  v_cu        uuid;
  v_t         timestamptz;
  v_title     text;
  v_qty       numeric;
  v_extra     numeric;
  v_shelf     interval;
  v_offer     public.offers%rowtype;
  v_pickup    uuid;
  v_ps        uuid;
  v_ds        uuid;
  v_alloc     uuid;
  v_hp        uuid;
  v_hd        uuid;
  v_line      uuid;
  v_ledger    bigint;
  v_delivered integer := 0;
  v_expired   integer := 0;
  v_kg        numeric := 0;
  v_from      timestamptz;
  v_to        timestamptz;
begin
  perform private.require_service();

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_items":"array of 1-500 items"}';
  end if;

  for e in select x from jsonb_array_elements(p_items) x loop
    v_i := v_i + 1;

    -- ---- validate ----
    if jsonb_typeof(e) <> 'object' then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'error', 'object_required')::text;
    end if;
    select array_agg(k order by k) into v_bad from jsonb_object_keys(e) k
    where k not in ('kind', 'store_site_id', 'charity_site_id', 'store_user_id', 'charity_user_id',
                    'category_code', 'title', 'quantity', 'extra_quantity', 'at');
    if v_bad is not null then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'unknown_keys', v_bad)::text;
    end if;

    v_kind := e ->> 'kind';
    if v_kind is null or v_kind not in ('delivered', 'expired') then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'kind', 'delivered|expired')::text;
    end if;

    select * into v_ss from public.sites s where s.id = private.try_uuid(e ->> 'store_site_id');
    select * into v_store from public.organizations o where o.id = v_ss.org_id;
    if v_ss.id is null or v_store.kind is distinct from 'store' or v_store.status is distinct from 'approved'
       or not coalesce(v_store.is_demo, false) then
      raise exception using errcode = 'PT403', message = 'not_authorized',
        detail = jsonb_build_object('index', v_i - 1, 'store_site_id', 'site of an approved demo store required')::text;
    end if;
    v_su := private.try_uuid(e ->> 'store_user_id');
    if not exists (select 1 from public.org_members m
                   where m.org_id = v_store.id and m.user_id = v_su and m.status = 'active'
                     and m.role in ('owner', 'manager', 'staff')) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'store_user_id', 'active owner/manager/staff of the store')::text;
    end if;

    if v_kind = 'delivered' then
      select * into v_cs from public.sites s where s.id = private.try_uuid(e ->> 'charity_site_id');
      select * into v_charity from public.organizations o where o.id = v_cs.org_id;
      if v_cs.id is null or v_charity.kind is distinct from 'charity' or v_charity.status is distinct from 'approved'
         or not coalesce(v_charity.is_demo, false) then
        raise exception using errcode = 'PT403', message = 'not_authorized',
          detail = jsonb_build_object('index', v_i - 1, 'charity_site_id', 'site of an approved demo charity required')::text;
      end if;
      v_cu := private.try_uuid(e ->> 'charity_user_id');
      if v_cu is null or v_cu = v_su
         or not exists (select 1 from public.org_members m
                        where m.org_id = v_charity.id and m.user_id = v_cu and m.status = 'active'
                          and m.role in ('owner', 'manager', 'staff')) then
        raise exception using errcode = 'PT422', message = 'validation_failed',
          detail = jsonb_build_object('index', v_i - 1, 'charity_user_id', 'active owner/manager/staff of the charity')::text;
      end if;
    end if;

    select * into v_cat from public.food_categories c where c.code = e ->> 'category_code' and c.is_active;
    if v_cat.code is null then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'category_code', 'unknown_or_inactive')::text;
    end if;

    v_title := btrim(e ->> 'title');
    if v_title is null or char_length(v_title) not between 2 and 120 then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'title', '2-120 chars')::text;
    end if;

    if jsonb_typeof(e -> 'quantity') is distinct from 'number'
       or jsonb_typeof(coalesce(e -> 'extra_quantity', '0'::jsonb)) <> 'number' then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'quantity', 'number')::text;
    end if;
    v_qty := (e ->> 'quantity')::numeric;
    v_extra := coalesce((e ->> 'extra_quantity')::numeric, 0);
    if v_qty <= 0 or v_qty > 10000 or v_extra < 0 or v_extra > 10000
       or (v_cat.default_unit not in ('kg', 'liter') and (v_qty <> trunc(v_qty) or v_extra <> trunc(v_extra))) then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'quantity', '0 < qty ≤ 10000, integer unless kg/liter')::text;
    end if;

    v_t := private.try_timestamptz(e ->> 'at');
    if v_t is null or v_t < v_now - interval '120 days' or v_t > v_now - interval '1 hour' then
      raise exception using errcode = 'PT422', message = 'validation_failed',
        detail = jsonb_build_object('index', v_i - 1, 'at', 'ISO-8601 with offset in [now - 120 days, now - 1 hour]')::text;
    end if;

    v_shelf := case v_cat.perishability
                 when 'cooked' then interval '3 hours'
                 when 'fresh' then interval '2 days'
                 else interval '30 days' end;
    v_from := least(coalesce(v_from, v_t), v_t);
    v_to := greatest(coalesce(v_to, v_t), v_t);

    -- ---- expired lot: nothing claimed ----
    if v_kind = 'expired' then
      insert into public.offers (org_id, site_id, category_code, title, description, quantity, unit,
                                 expires_at, pickup_window, effective_deadline, safety_attested_at,
                                 safety_attested_by, status, qty_committed, qty_unclaimed, published_at,
                                 closed_at, created_by, created_at, updated_at)
      values (v_store.id, v_ss.id, v_cat.code, v_title, 'Dữ liệu demo (lịch sử)', v_qty, v_cat.default_unit,
              v_t + v_shelf, tstzrange(v_t - interval '5 hours', v_t, '[)'), v_t, v_t - interval '6 hours',
              v_su, 'expired', 0, v_qty, v_t - interval '6 hours', v_t, v_su, v_t - interval '6 hours', v_t);
      v_expired := v_expired + 1;
      continue;
    end if;

    -- ---- delivered: one self pickup, the rows the real loop leaves behind ----
    insert into public.offers (org_id, site_id, category_code, title, description, quantity, unit,
                               expires_at, pickup_window, effective_deadline, safety_attested_at,
                               safety_attested_by, status, qty_committed, qty_unclaimed, published_at,
                               closed_at, created_by, created_at, updated_at)
    values (v_store.id, v_ss.id, v_cat.code, v_title, 'Dữ liệu demo (lịch sử)', v_qty + v_extra,
            v_cat.default_unit, v_t + interval '1 hour' + v_shelf,
            tstzrange(v_t - interval '4 hours', v_t + interval '1 hour', '[)'), v_t + interval '1 hour',
            v_t - interval '5 hours', v_su, 'completed', v_qty, v_extra, v_t - interval '5 hours',
            case when v_extra > 0 then v_t + interval '1 hour' else v_t - interval '30 minutes' end,
            v_su, v_t - interval '5 hours', v_t)
    returning * into v_offer;

    insert into public.pickups (charity_org_id, charity_site_id, mode, status, started_at, completed_at,
                                created_by, created_at, updated_at)
    values (v_charity.id, v_cs.id, 'self', 'completed', v_t - interval '35 minutes', v_t, v_cu,
            v_t - interval '1 hour', v_t)
    returning id into v_pickup;

    insert into public.pickup_stops (pickup_id, seq, kind, site_id, status, arrived_at, completed_at,
                                     created_at, updated_at)
    values (v_pickup, 1, 'pickup', v_ss.id, 'done', v_t - interval '35 minutes', v_t - interval '30 minutes',
            v_t - interval '1 hour', v_t - interval '30 minutes')
    returning id into v_ps;
    insert into public.pickup_stops (pickup_id, seq, kind, site_id, status, arrived_at, completed_at,
                                     created_at, updated_at)
    values (v_pickup, 2, 'dropoff', v_cs.id, 'done', v_t, v_t, v_t - interval '1 hour', v_t)
    returning id into v_ds;

    insert into public.allocations (offer_id, store_org_id, store_site_id, charity_org_id, charity_site_id,
                                    unit, unit_weight_kg_snapshot, qty_reserved, qty_picked, qty_delivered,
                                    status, pickup_id, stop_id, requested_by, requested_at, confirmed_at,
                                    confirmed_by, assigned_at, picked_at, delivered_at, proof_due_at,
                                    closed_at, created_at, updated_at)
    values (v_offer.id, v_store.id, v_ss.id, v_charity.id, v_cs.id, v_offer.unit, v_offer.unit_weight_kg,
            v_qty, v_qty, v_qty, 'delivered', v_pickup, v_ps, v_cu, v_t - interval '3 hours',
            v_t - interval '2 hours 45 minutes', v_su, v_t - interval '1 hour', v_t - interval '30 minutes',
            v_t, v_t + v_due, v_t, v_t - interval '3 hours', v_t)
    returning id into v_alloc;

    insert into public.handovers (pickup_id, stop_id, kind, token_hash, code_hash, token_expires_at,
                                  issued_by, issued_at, consumed_at, scanned_by, method, client_op_id,
                                  created_at, updated_at)
    values (v_pickup, v_ps, 'pickup', sha256(extensions.gen_random_bytes(32)),
            sha256(extensions.gen_random_bytes(32)), v_t - interval '25 minutes', v_cu,
            v_t - interval '40 minutes', v_t - interval '30 minutes', v_su, 'qr', gen_random_uuid(),
            v_t - interval '40 minutes', v_t - interval '30 minutes')
    returning id into v_hp;
    insert into public.handover_lines (handover_id, allocation_id, expected_qty, qty, created_at)
    values (v_hp, v_alloc, v_qty, v_qty, v_t - interval '30 minutes');

    insert into public.handovers (pickup_id, stop_id, kind, consumed_at, scanned_by, method, created_at, updated_at)
    values (v_pickup, v_ds, 'dropoff', v_t, v_cu, 'auto', v_t, v_t)
    returning id into v_hd;
    insert into public.handover_lines (handover_id, allocation_id, expected_qty, qty, created_at)
    values (v_hd, v_alloc, v_qty, v_qty, v_t)
    returning id into v_line;

    -- the real ledger writer (occurred_at = dropoff consumed_at, is_demo from the store org)
    v_ledger := private.credit_impact(v_line);
    v_kg := v_kg + coalesce((select il.kg from public.impact_ledger il where il.id = v_ledger), 0);
    v_delivered := v_delivered + 1;
  end loop;

  perform private.audit(
    p_action      => 'demo.seed_history',
    p_entity_type => 'demo',
    p_entity_id   => null,
    p_after       => jsonb_build_object('delivered', v_delivered, 'expired', v_expired, 'kg', v_kg,
                                        'from', v_from, 'to', v_to),
    p_reason      => 'Dữ liệu demo: lịch sử sinh bằng script seed (service role)',
    p_actor_kind  => 'service');

  return jsonb_build_object('delivered', v_delivered, 'expired', v_expired, 'kg', v_kg);
end;
$$;

comment on function public.demo_seed_history(jsonb) is
  'Seed only (service_role): writes consistent backdated history rows for approved is_demo orgs (delivered self pickups / expired lots, at ∈ [now − 120 d, now − 1 h]); ledger credits via private.credit_impact. One audit row demo.seed_history.';

-- ===========================================================================
-- 4. demo_reset — purge every is_demo organization and everything hanging off it
-- ===========================================================================
-- Gate: service role + app_settings.demo_reset_enabled = true. Serialised by an advisory lock.
-- Refuses (PT409 cross_demo_reference, nothing deleted) when any row links a demo org with a real
-- one (allocations, ledger, trips, incidents) — request_offer already forbids that, this is the
-- second line of defence. Deletes in FK order inside one transaction; any FK from a table this
-- function does not know aborts the whole reset (PT409 demo_reset_blocked) instead of guessing.
-- Ledger rows go through the fs.demo_reset exception of private.ledger_immutable (is_demo rows
-- only: a non-demo row would still raise append_only and roll everything back); trust_events
-- through fs.allow_purge. impact_public_daily demo rows are rebuilt from the demo ledger rows that
-- remain (none in practice). audit_logs are kept (append-only, no FK) + one demo.reset row.
-- Profiles/auth users are kept (the seed reuses the demo accounts). Storage objects cannot be
-- deleted with SQL (storage.protect_delete): the result lists org_ids and kyc_paths so the script
-- removes the files through the Storage API afterwards.
create or replace function public.demo_reset()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orgs      uuid[];
  v_sites     uuid[];
  v_offers    uuid[];
  v_needs     uuid[];
  v_bundles   uuid[];
  v_allocs    uuid[];
  v_pickups   uuid[];
  v_handovers uuid[];
  v_incidents uuid[];
  v_docs      uuid[];
  v_changes   uuid[];
  v_invites   uuid[];
  v_all       uuid[];
  v_kyc       text[];
  v_cross     text;
  v_n         bigint;
  v_counts    jsonb := '{}'::jsonb;
begin
  perform private.require_service();
  if private.setting('demo_reset_enabled') is distinct from 'true'::jsonb then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'demo_reset_disabled';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('foodsave.demo_reset'));

  select coalesce(array_agg(o.id order by o.id), '{}') into v_orgs
  from public.organizations o where o.is_demo;
  perform 1 from public.organizations o where o.id = any (v_orgs) order by o.id for update;

  -- ---- id sets ----
  select coalesce(array_agg(s.id), '{}') into v_sites from public.sites s where s.org_id = any (v_orgs);
  select coalesce(array_agg(o.id), '{}') into v_offers from public.offers o where o.org_id = any (v_orgs);
  select coalesce(array_agg(n.id), '{}') into v_needs from public.needs n where n.org_id = any (v_orgs);
  select coalesce(array_agg(b.id), '{}') into v_bundles from public.need_bundles b where b.need_id = any (v_needs);
  select coalesce(array_agg(a.id), '{}') into v_allocs from public.allocations a
  where a.store_org_id = any (v_orgs) or a.charity_org_id = any (v_orgs)
     or a.offer_id = any (v_offers) or a.need_id = any (v_needs);
  select coalesce(array_agg(p.id), '{}') into v_pickups from public.pickups p
  where p.charity_org_id = any (v_orgs)
     or p.id in (select a.pickup_id from public.allocations a where a.id = any (v_allocs) and a.pickup_id is not null)
     or p.id in (select st.pickup_id from public.pickup_stops st where st.site_id = any (v_sites));
  select coalesce(array_agg(h.id), '{}') into v_handovers from public.handovers h where h.pickup_id = any (v_pickups);
  select coalesce(array_agg(i.id), '{}') into v_incidents from public.incidents i
  where i.reporter_org_id = any (v_orgs) or i.subject_org_id = any (v_orgs) or i.offer_id = any (v_offers)
     or i.allocation_id = any (v_allocs) or i.pickup_id = any (v_pickups) or i.handover_id = any (v_handovers);
  select coalesce(array_agg(d.id), '{}') into v_docs from public.org_documents d where d.org_id = any (v_orgs);
  select coalesce(array_agg(c.id), '{}') into v_changes from public.org_change_requests c where c.org_id = any (v_orgs);
  select coalesce(array_agg(i.id), '{}') into v_invites from public.org_invitations i where i.org_id = any (v_orgs);

  -- ---- second line of defence: no row may link demo data with a real organization ----
  select 'allocation ' || a.id into v_cross from public.allocations a
  where a.id = any (v_allocs)
    and not (a.store_org_id = any (v_orgs) and a.charity_org_id = any (v_orgs))
  limit 1;
  if v_cross is null then
    select 'pickup ' || p.id into v_cross from public.pickups p
    where p.id = any (v_pickups)
      and (not p.charity_org_id = any (v_orgs)
           or exists (select 1 from public.pickup_stops st join public.sites s on s.id = st.site_id
                      where st.pickup_id = p.id and not s.org_id = any (v_orgs)))
    limit 1;
  end if;
  if v_cross is null then
    select 'impact_ledger ' || l.id into v_cross from public.impact_ledger l
    where (l.store_org_id = any (v_orgs) or l.charity_org_id = any (v_orgs) or l.allocation_id = any (v_allocs))
      and not (l.store_org_id = any (v_orgs) and l.charity_org_id = any (v_orgs))
    limit 1;
  end if;
  if v_cross is null then
    select 'incident ' || i.id into v_cross from public.incidents i
    where i.id = any (v_incidents)
      and ((i.reporter_org_id is not null and not i.reporter_org_id = any (v_orgs))
           or (i.subject_org_id is not null and not i.subject_org_id = any (v_orgs)))
    limit 1;
  end if;
  if v_cross is not null then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'cross_demo_reference: ' || v_cross;
  end if;

  v_all := v_orgs || v_sites || v_offers || v_needs || v_bundles || v_allocs || v_pickups || v_handovers
           || v_incidents || v_docs || v_changes || v_invites;

  perform set_config('fs.demo_reset', 'on', true);
  perform set_config('fs.allow_purge', 'on', true);

  begin
    -- notifications (migration notifications, P2-14): only when the table/columns exist
    if to_regclass('public.notifications') is not null then
      if exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'notifications' and column_name = 'org_id') then
        execute 'delete from public.notifications where org_id = any ($1)' using v_orgs;
        get diagnostics v_n = row_count;
        v_counts := v_counts || jsonb_build_object('notifications', v_n);
      end if;
      if exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'notifications' and column_name = 'outbox_id') then
        execute 'delete from public.notifications where outbox_id in
                   (select o.id from public.notification_outbox o where o.aggregate_id = any ($1))' using v_all;
        get diagnostics v_n = row_count;
        v_counts := jsonb_set(v_counts, '{notifications}',
                              to_jsonb(coalesce((v_counts ->> 'notifications')::bigint, 0) + v_n));
      end if;
    end if;

    delete from public.notification_outbox o where o.aggregate_id = any (v_all);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('notification_outbox', v_n);

    delete from public.impact_ledger l
    where l.store_org_id = any (v_orgs) or l.charity_org_id = any (v_orgs) or l.allocation_id = any (v_allocs);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('impact_ledger', v_n);

    -- rebuild the demo part of the public aggregate from the demo ledger rows that remain
    delete from public.impact_public_daily d where d.is_demo;
    insert into public.impact_public_daily (day, cell_key, ward, kg, co2e_kg, meals, deliveries, is_demo, updated_at)
    select (l.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date,
           case when s.visibility = 'public' and s.public_location is not null
                then extensions.st_geohash(extensions.st_snaptogrid(s.public_location::extensions.geometry, 0.005), 7)
                else 'ward:' || coalesce(s.ward, s.city) end,
           max(s.ward), sum(l.kg), sum(l.co2e_kg), sum(l.meals),
           count(*) filter (where l.entry_type = 'credit'), true, pg_catalog.now()
    from public.impact_ledger l join public.sites s on s.id = l.store_site_id
    where l.is_demo
    group by 1, 2;

    delete from public.incidents i where i.id = any (v_incidents);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('incidents', v_n);

    delete from public.handover_lines hl where hl.handover_id = any (v_handovers) or hl.allocation_id = any (v_allocs);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('handover_lines', v_n);

    delete from public.allocations a where a.id = any (v_allocs);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('allocations', v_n);

    delete from public.handovers h where h.id = any (v_handovers);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('handovers', v_n);

    delete from public.pickups p where p.id = any (v_pickups);         -- pickup_stops: on delete cascade
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('pickups', v_n);

    delete from public.need_bundles b where b.id = any (v_bundles);
    delete from public.needs n where n.id = any (v_needs);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('needs', v_n);

    delete from public.offers o where o.id = any (v_offers);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('offers', v_n);

    delete from public.trust_events t where t.org_id = any (v_orgs);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('trust_events', v_n);

    with gone as (
      delete from public.org_documents d where d.id = any (v_docs) returning d.storage_path
    )
    select coalesce(array_agg(g.storage_path order by g.storage_path), '{}') into v_kyc from gone g;
    v_counts := v_counts || jsonb_build_object('org_documents', cardinality(v_kyc));

    delete from public.org_change_requests c where c.id = any (v_changes);
    delete from public.org_invitations i where i.id = any (v_invites);

    delete from public.org_members m where m.org_id = any (v_orgs);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('org_members', v_n);

    delete from public.sites s where s.id = any (v_sites);              -- site_hours, site_closures: cascade
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('sites', v_n);

    -- org_sensitive: cascade; profiles.active_org_id: set null
    delete from public.organizations o where o.id = any (v_orgs);
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('organizations', v_n);
  exception when foreign_key_violation then
    raise exception using errcode = 'PT409', message = 'invalid_state',
      detail = 'demo_reset_blocked: ' || sqlerrm || ' (a table references demo data; extend demo_reset)';
  end;

  perform set_config('fs.demo_reset', '', true);
  perform set_config('fs.allow_purge', '', true);

  perform private.audit(
    p_action      => 'demo.reset',
    p_entity_type => 'demo',
    p_entity_id   => null,
    p_after       => v_counts,
    p_reason      => 'Xóa toàn bộ dữ liệu của tổ chức is_demo (demo_reset)',
    p_actor_kind  => 'service');

  return v_counts || jsonb_build_object('org_ids', to_jsonb(v_orgs), 'kyc_paths', to_jsonb(v_kyc));
end;
$$;

comment on function public.demo_reset() is
  'Service role + app_settings.demo_reset_enabled: deletes every is_demo organization and everything hanging off it (offers, allocations, trips, handovers, demo ledger rows via fs.demo_reset, trust events, documents, members, sites, outbox/notifications). Refuses cross demo/real links. Keeps profiles and audit_logs (+ demo.reset row). Returns counts, org_ids and kyc_paths (files are removed by the script through the Storage API).';

-- ===========================================================================
-- 5. Privileges: service_role only
-- ===========================================================================
revoke all on function private.require_service() from public, anon, authenticated;
revoke all on function public.demo_approve_organization(uuid, uuid) from public, anon, authenticated;
revoke all on function public.demo_seed_history(jsonb) from public, anon, authenticated;
revoke all on function public.demo_reset() from public, anon, authenticated;

grant execute on function public.demo_approve_organization(uuid, uuid) to service_role;
grant execute on function public.demo_seed_history(jsonb) to service_role;
grant execute on function public.demo_reset() to service_role;

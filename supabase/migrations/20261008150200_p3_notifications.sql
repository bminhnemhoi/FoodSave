-- Migration 11c — p3_notifications (DATA-MODEL §12.2; PRD §10 N-06, N-10, N-12, N-14…N-16, N-19…N-21,
-- N-31; ROADMAP P3-06 recipients)
-- Re-creates (create or replace) the dispatcher pieces of migration notifications for the P3 events:
--   private.notify_supported     + need_published, bundle_options_ready, need_responded, pickup_started,
--                                  volunteer_accepted, volunteer_declined, volunteer_checked_in,
--                                  incident_opened
--   public.resolve_recipients    + their recipients; pickup_cancelled scopes 'stop' / 'unassigned'
--   private.render_notification  + Vietnamese titles/bodies/links for them
-- Unchanged rules: payloads carry ids/enums only; titles/bodies carry org names, lot titles,
-- quantities, VN times and crow-fly distances (coarsened for non-public sites) — never an address, a
-- coordinate or the volunteer's position.

-- ===========================================================================
-- 1. Supported events
-- ===========================================================================
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
    'org_suspended', 'org_reinstated', 'member_invited',
    -- P3
    'need_published', 'bundle_options_ready', 'need_responded', 'pickup_started',
    'volunteer_accepted', 'volunteer_declined', 'volunteer_checked_in', 'incident_opened');
$$;

comment on function private.notify_supported(public.notification_event) is
  'Events dispatch_outbox knows how to fan out (member_invited: e-mail sent by the server action, no in-app row). P4/P5 events (proof_*, thank_you_received, monthly_report_ready) are still dead-lettered as unsupported_event.';

-- ===========================================================================
-- 2. need_published recipients (§12.2, PRD US-CHA-09 AC2)
-- ===========================================================================
-- Owner/manager/staff (site access) of approved, unpaused stores of the same is_demo with an active
-- site inside the need site''s radius whose usual categories (accepted_categories, null = all)
-- overlap the need''s; plus every admin. distance_m: exact for a public need site, whole km for an
-- approximate one, null for a hidden one (the rendered text never helps locate a shelter).
create or replace function private.need_recipients(p_o public.notification_outbox)
returns table (user_id uuid, org_id uuid, wave smallint, audience text, distance_m float8)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  n       public.needs%rowtype;
  v_cs    public.sites%rowtype;
  v_org   public.organizations%rowtype;
  v_now   timestamptz := private.now();
begin
  select * into n from public.needs x where x.id = private.try_uuid(p_o.payload ->> 'need_id');
  if not found then
    return;
  end if;

  return query select a.id, null::uuid, 0::smallint, 'admin'::text, null::float8 from private.admin_ids() a(id);

  select * into v_cs from public.sites s where s.id = n.site_id;
  select * into v_org from public.organizations o where o.id = n.org_id;
  if n.status not in ('open', 'partially_matched', 'matched') or n.needed_by <= v_now
     or v_org.status <> 'approved' or not v_cs.is_active then
    return;
  end if;

  return query
    select m.user_id, ss.org_id, 0::smallint, 'store'::text,
           min(case v_cs.visibility
                 when 'public' then extensions.st_distance(ss.location, v_cs.location)
                 when 'approximate' then greatest(round(extensions.st_distance(ss.location, v_cs.location) / 1000.0), 1) * 1000.0
                 else null end)
    from public.sites ss
    join public.organizations st on st.id = ss.org_id
    join public.org_members m on m.org_id = ss.org_id and m.status = 'active'
                             and m.role in ('owner', 'manager', 'staff')
                             and (m.site_ids is null or ss.id = any (m.site_ids))
    join public.profiles pr on pr.id = m.user_id and pr.deleted_at is null
    where extensions.st_dwithin(ss.location, v_cs.location, (v_cs.radius_km * 1000)::float8)
      and ss.is_active
      and st.kind = 'store' and st.status = 'approved' and not st.is_paused and st.is_demo = v_org.is_demo
      and (ss.accepted_categories is null or ss.accepted_categories && n.category_codes)
    group by m.user_id, ss.org_id;
end;
$$;

comment on function private.need_recipients(public.notification_outbox) is
  'need_published: admins + owner/manager/staff of approved unpaused stores (same is_demo) with an active site inside the need site radius whose usual categories overlap the need. distance_m exact for public need sites, whole km for approximate, null for hidden.';

-- ===========================================================================
-- 3. resolve_recipients (§12.2) — P2 branches unchanged, P3 branches added
-- ===========================================================================
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
  v_subj  uuid;
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
      if p ->> 'scope' = 'unassigned' then
        -- the volunteer taken off a re-planned trip (still a member of the charity)
        return query select m.user_id, m.org_id, 0::smallint,
                            case when m.role = 'volunteer' then 'volunteer' else 'charity' end, null::float8
                     from public.org_members m
                     join public.profiles pr on pr.id = m.user_id and pr.deleted_at is null
                     where m.user_id = private.try_uuid(p ->> 'user_id')
                       and m.org_id = private.try_uuid(p ->> 'charity_org_id') and m.status = 'active';
      elsif p ->> 'scope' = 'stop' then
        -- one stop dropped (skip_stop / re-plan): its store, the coordinators, the carrier
        return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                     from private.site_staff(private.try_uuid(p ->> 'site_id')) s;
        return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                     from public.pickups pk
                     cross join lateral private.site_staff(pk.charity_site_id) s
                     where pk.id = v_pick;
        return query select a.user_id, a.org_id, 0::smallint, a.audience, null::float8
                     from private.pickup_assignee(v_pick) a;
      else
        return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                     from public.pickups pk
                     cross join lateral private.site_staff(pk.charity_site_id) s
                     where pk.id = v_pick;
        -- a cancelled trip has its assignee kept (only the location is cleared)
        return query select a.user_id, a.org_id, 0::smallint, a.audience, null::float8
                     from private.pickup_assignee(v_pick) a;
        return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                     from (select distinct st.site_id from public.pickup_stops st
                           where st.pickup_id = v_pick and st.kind = 'pickup') x
                     cross join lateral private.site_staff(x.site_id) s;
      end if;

    when 'pickup_started' then
      -- coordinators + stores of the pickup stops (ETA only); the carrier started it
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.pickups pk
                   cross join lateral private.site_staff(pk.charity_site_id) s
                   where pk.id = v_pick;
      return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                   from (select distinct st.site_id from public.pickup_stops st
                         where st.pickup_id = v_pick and st.kind = 'pickup' and st.status in ('pending', 'arrived')) x
                   cross join lateral private.site_staff(x.site_id) s;

    when 'pickup_handover_done' then
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.pickups pk
                   cross join lateral private.site_staff(pk.charity_site_id) s
                   where pk.id = v_pick;

    when 'volunteer_accepted', 'volunteer_declined' then
      -- N-15: coordinators (owner/manager/staff with access to the receiving site)
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.pickups pk
                   cross join lateral private.site_staff(pk.charity_site_id) s
                   where pk.id = v_pick;

    when 'volunteer_checked_in' then
      -- N-16: the store of the stop (pickup stops only); coordinators follow every check-in
      if p ->> 'kind' = 'pickup' then
        return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                     from private.site_staff(private.try_uuid(p ->> 'site_id')) s;
      end if;
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.pickups pk
                   cross join lateral private.site_staff(pk.charity_site_id) s
                   where pk.id = v_pick;

    when 'delivery_completed' then
      return query select s.user_id, s.org_id, 0::smallint, 'store'::text, null::float8
                   from (select distinct a.store_site_id from public.allocations a
                         where a.pickup_id = v_pick and a.status = 'delivered') x
                   cross join lateral private.site_staff(x.store_site_id) s;

    when 'need_published' then
      return query select * from private.need_recipients(o);

    when 'need_closed', 'bundle_confirmed', 'bundle_shortfall', 'bundle_options_ready', 'need_responded' then
      v_need := private.try_uuid(p ->> 'need_id');
      return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                   from public.needs n
                   cross join lateral private.site_staff(n.site_id) s
                   where n.id = v_need;

    when 'incident_opened' then
      -- N-21/N-31: admins; the subject org (owner/manager/staff); coordinators of the trip concerned
      return query select a.id, null::uuid, 0::smallint, 'admin'::text, null::float8 from private.admin_ids() a(id);
      v_subj := private.try_uuid(p ->> 'subject_org_id');
      if v_subj is not null then
        return query select s.user_id, s.org_id, 0::smallint,
                            (select og.kind::text from public.organizations og where og.id = s.org_id), null::float8
                     from private.org_staff(v_subj, '{owner,manager,staff}') s
                     where exists (select 1 from public.organizations og where og.id = v_subj and og.status = 'approved');
      end if;
      if v_pick is not null then
        return query select s.user_id, s.org_id, 0::smallint, 'charity'::text, null::float8
                     from public.pickups pk
                     cross join lateral private.site_staff(pk.charity_site_id) s
                     where pk.id = v_pick;
      end if;

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
  'service_role: recipients of an outbox row per DATA-MODEL §12.2 (user_id, org_id context, fairness wave, audience charity|store|volunteer|admin|org, distance_m for offer/need events). P3: need_published, bundle_options_ready, need_responded, pickup_started, volunteer_*, incident_opened, pickup_cancelled scopes stop/unassigned.';

-- ===========================================================================
-- 4. Rendering — P2 texts unchanged, P3 texts added
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
  v_need     public.needs%rowtype;
  v_store    text;
  v_charity  text;
  v_lot      text;
  v_qty      text;
  v_dist     text := private.fmt_distance(p_distance_m);
  v_kg       numeric;
  v_actor    text;
  v_portal   text;
  v_cats     text;
  v_name     text;
  v_eta      timestamptz;
  v_site     text;
  v_kind     text;
  v_short    numeric;
begin
  if p ? 'allocation_id' then
    select * into v_alloc from public.allocations a where a.id = private.try_uuid(p ->> 'allocation_id');
  end if;
  if p ? 'offer_id' then
    select * into v_offer from public.offers x where x.id = private.try_uuid(p ->> 'offer_id');
  end if;
  if p ? 'need_id' then
    select * into v_need from public.needs x where x.id = private.try_uuid(p ->> 'need_id');
  end if;
  select s.name into v_store from public.organizations s
   where s.id = coalesce(v_offer.org_id, v_alloc.store_org_id, private.try_uuid(p ->> 'store_org_id'));
  select c.name into v_charity from public.organizations c
   where c.id = coalesce(v_alloc.charity_org_id, private.try_uuid(p ->> 'charity_org_id'), v_need.org_id);
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
      if coalesce((p ->> 'replanned')::boolean, false) then
        title := v_prefix || 'Chuyến của bạn đã được cập nhật';
        body := v_charity || ' vừa thay đổi điểm dừng hoặc giờ của chuyến lấy hàng. Hãy xem lại tuyến.';
      else
        title := v_prefix || 'Bạn được giao chuyến lấy hàng';
        body := v_charity || ' vừa giao cho bạn một chuyến lấy hàng.' ||
                case when v_urgent then ' Chuyến có lô Đỏ, cần đi sớm.' else '' end;
      end if;
      link_path := case when p_audience = 'volunteer' then '/volunteer/trips'
                        else '/charity/pickups?pickup=' || (p ->> 'pickup_id') end;

    when 'pickup_cancelled' then
      if p ->> 'scope' = 'unassigned' then
        title := 'Bạn không còn được giao chuyến này';
        body := v_charity || ' đã phân công lại chuyến lấy hàng. Bạn không cần đi chuyến này nữa.';
        link_path := case when p_audience = 'volunteer' then '/volunteer/trips'
                          else '/charity/pickups?pickup=' || (p ->> 'pickup_id') end;
      elsif p ->> 'scope' = 'stop' then
        select o.name into v_site from public.sites si join public.organizations o on o.id = si.org_id
         where si.id = private.try_uuid(p ->> 'site_id');
        if p_audience = 'store' then
          title := 'Chuyến sẽ không ghé cửa hàng bạn';
          body := 'Chuyến của ' || v_charity || ' không ghé điểm của bạn nữa. Phân bổ vẫn được giữ; tổ chức sẽ sắp xếp lại việc lấy hàng.';
          link_path := '/store/handover';
        elsif p_audience = 'volunteer' then
          title := 'Một điểm dừng đã được bỏ qua';
          body := 'Chuyến của bạn không còn ghé ' || coalesce(v_site, 'một cửa hàng') || '.';
          link_path := '/volunteer/trips';
        else
          title := 'Một điểm dừng đã được bỏ qua';
          body := 'Chuyến không còn ghé ' || coalesce(v_site, 'một cửa hàng') ||
                  '. Phân bổ ở điểm đó đã trở lại "Đã xác nhận" để phân công lại.';
          link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');
        end if;
      elsif p ->> 'reason' = 'cancelled' then
        title := v_prefix || 'Chuyến lấy hàng đã hủy';
        body := case p_audience
                  when 'store' then v_charity || ' đã hủy chuyến tới cửa hàng bạn. Hàng vẫn được giữ cho tổ chức; họ sẽ phân công lại.'
                  when 'volunteer' then v_charity || ' đã hủy chuyến này. Bạn không cần đi nữa.'
                  else 'Các phân bổ của chuyến đã trở lại "Đã xác nhận". Hãy phân công người khác hoặc tự đến lấy.'
                end;
        link_path := case p_audience when 'volunteer' then '/volunteer/trips'
                                     when 'store' then '/store/handover'
                                     else '/charity/pickups?pickup=' || (p ->> 'pickup_id') end;
      else
        title := 'Chuyến lấy hàng đã hủy';
        body := 'Chuyến của ' || v_charity || ' không còn hàng cần chở nên đã tự hủy.';
        link_path := case p_audience when 'volunteer' then '/volunteer/trips'
                                     when 'store' then '/store/handover'
                                     else '/charity/pickups?pickup=' || (p ->> 'pickup_id') end;
      end if;

    when 'pickup_started' then
      if p_audience = 'store' then
        select min(st.eta) into v_eta
        from public.pickup_stops st join public.sites si on si.id = st.site_id
        where st.pickup_id = private.try_uuid(p ->> 'pickup_id') and st.kind = 'pickup' and si.org_id = p_org;
        title := 'Tình nguyện viên đang trên đường tới';
        body := 'Chuyến của ' || v_charity || ' đã bắt đầu' ||
                coalesce(', dự kiến tới lúc ' || private.fmt_vn_time(v_eta, v_now), '') || '.';
        link_path := '/store/handover';
      else
        title := 'Chuyến lấy hàng đã bắt đầu';
        body := 'Người nhận chuyến đã xuất phát. Theo dõi tiến độ trên bản đồ điều phối.';
        link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');
      end if;

    when 'pickup_handover_done' then
      select s.name into v_store from public.sites st join public.organizations s on s.id = st.org_id
       where st.id = private.try_uuid(p ->> 'store_site_id');
      title := 'Đã lấy hàng tại cửa hàng';
      body := 'Chuyến đã nhận hàng tại ' || coalesce(v_store, 'cửa hàng') || '.';
      link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');

    when 'volunteer_accepted', 'volunteer_declined' then
      select coalesce(nullif(pr.full_name, ''), 'Tình nguyện viên') into v_name
      from public.profiles pr where pr.id = private.try_uuid(p ->> 'assignee_user_id');
      v_name := coalesce(v_name, 'Tình nguyện viên');
      if p_o.event = 'volunteer_accepted' then
        title := 'Tình nguyện viên đã nhận chuyến';
        body := v_name || ' đã nhận chuyến lấy hàng.';
      else
        title := 'Tình nguyện viên từ chối chuyến';
        body := v_name || ' không thể nhận chuyến. Hãy phân công người khác hoặc tự đến lấy.';
      end if;
      link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');

    when 'volunteer_checked_in' then
      select o.name into v_site from public.sites si join public.organizations o on o.id = si.org_id
       where si.id = private.try_uuid(p ->> 'site_id');
      if p_audience = 'store' then
        title := 'Tình nguyện viên đã tới cửa hàng';
        body := 'Người nhận hàng của ' || v_charity || ' đã tới. Hãy chuẩn bị bàn giao bằng QR hoặc mã 6 số.';
        link_path := '/store/handover';
      elsif p ->> 'kind' = 'dropoff' then
        title := 'Chuyến đã về tới tổ chức';
        body := 'Người nhận chuyến đã về điểm nhận. Hãy quét mã để xác nhận nhận hàng.';
        link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');
      else
        title := 'Tình nguyện viên đã tới điểm dừng';
        body := 'Đã tới ' || coalesce(v_site, 'cửa hàng') ||
                case when coalesce((p ->> 'verified')::boolean, false) then '.' else ' (chưa xác minh vị trí).' end;
        link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');
      end if;

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

    when 'need_published' then
      select string_agg(fc.name_vi, ' / ' order by x.i) into v_cats
      from unnest(v_need.category_codes) with ordinality x(code, i)
      join public.food_categories fc on fc.code = x.code;
      v_qty := private.fmt_qty(v_need.quantity, v_need.unit);
      if p_audience = 'admin' then
        title := v_prefix || 'Nhu cầu mới: ' || v_charity;
        body := coalesce(v_cats, 'Thực phẩm') || ' · ' || coalesce(v_qty, '') || ' · cần trước ' ||
                coalesce(private.fmt_vn_time(v_need.needed_by, v_now), '—') || '.';
        link_path := '/admin/allocations?need=' || v_need.id;
      else
        title := v_prefix || 'Nhu cầu mới gần bạn: ' || coalesce(v_cats, 'thực phẩm');
        body := v_charity || ' cần ' || coalesce(v_qty, '') || coalesce(' (' || v_cats || ')', '') ||
                coalesce(', cách ' || v_dist, '') || ', cần trước ' ||
                coalesce(private.fmt_vn_time(v_need.needed_by, v_now), '—') || '.';
        link_path := '/store/connect?need=' || v_need.id;
      end if;

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
      v_short := v_need.quantity - v_need.qty_in_flight - v_need.qty_delivered;
      title := 'Phương án ghép bị thiếu hàng';
      body := 'Một cửa hàng không thể tặng phần đã hẹn' ||
              case when v_short > 0 then ', nhu cầu còn thiếu ' || private.fmt_qty(v_short, v_need.unit) else '' end ||
              '. Hãy chọn phương án bổ sung.';
      link_path := '/charity/needs?need=' || (p ->> 'need_id');

    when 'bundle_options_ready' then
      title := 'Có lô mới phù hợp nhu cầu';
      body := v_store || ' vừa đăng ' || v_lot || '. Xem phương án ghép bổ sung cho phần còn thiếu.';
      link_path := '/charity/needs?need=' || (p ->> 'need_id');

    when 'need_responded' then
      title := 'Cửa hàng đáp ứng nhu cầu';
      body := v_store || ' có thể đáp ứng ' ||
              coalesce(private.fmt_qty((p ->> 'qty')::numeric, v_need.unit), 'một phần nhu cầu') || '.';
      link_path := '/charity/needs?need=' || (p ->> 'need_id');

    when 'incident_opened' then
      v_kind := case p ->> 'kind'
                  when 'quantity_dispute' then 'sai số lượng' when 'quality' then 'chất lượng'
                  when 'food_safety' then 'an toàn thực phẩm' when 'no_show' then 'không đến lấy'
                  when 'conduct' then 'thái độ' when 'privacy' then 'quyền riêng tư' else 'khác' end;
      select o.name into v_name from public.organizations o where o.id = private.try_uuid(p ->> 'reporter_org_id');
      if p_audience = 'admin' then
        title := v_prefix || 'Phản ánh mới: ' || v_kind;
        body := coalesce(v_name, 'Một người dùng') || ' vừa gửi phản ánh (' || v_kind || ').';
        link_path := '/admin/incidents?incident=' || (p ->> 'incident_id');
      elsif p_org is not null and p_org = private.try_uuid(p ->> 'subject_org_id') then
        title := v_prefix || 'Có phản ánh liên quan tới bạn';
        body := coalesce(v_name, 'Một đối tác') || ' gửi phản ánh (' || v_kind ||
                '). FoodSave sẽ xem xét và liên hệ nếu cần.';
        link_path := case when p_audience = 'store' then '/store' else '/charity' end;
      else
        title := v_prefix || 'Sự cố trong chuyến: ' || v_kind;
        body := 'Có phản ánh mới liên quan tới chuyến lấy hàng. Hãy kiểm tra và hỗ trợ người nhận chuyến.';
        link_path := '/charity/pickups?pickup=' || (p ->> 'pickup_id');
      end if;

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
  'Vietnamese title/body/link of an outbox event for one audience. Org names, lot titles, categories, quantities, VN times and crow-fly distance only (coarse for non-public sites; no address, coordinate or volunteer position).';

-- ===========================================================================
-- 5. Privileges (service_role only for resolve_recipients; helpers internal)
-- ===========================================================================
revoke all on function private.notify_supported(public.notification_event) from public, anon, authenticated;
revoke all on function private.need_recipients(public.notification_outbox) from public, anon, authenticated;
revoke all on function private.render_notification(public.notification_outbox, text, uuid, float8) from public, anon, authenticated;
revoke all on function public.resolve_recipients(uuid) from public, anon, authenticated;
grant execute on function public.resolve_recipients(uuid) to service_role;

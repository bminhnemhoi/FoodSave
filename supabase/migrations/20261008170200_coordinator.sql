-- Migration 11d — coordinator (DATA-MODEL §2.1 org_members, §8.2; PRD US-CHA-14 AC3, US-CHA-15 AC1–AC2,
-- US-CHA-16 AC2; SECURITY-PRIVACY §5 rows 2, 9; ROADMAP P3-08 phía điều phối, P3-09)
-- Columns: org_members.paused_at / paused_reason — a coordinator pauses a volunteer: no new trip can be
--          assigned to them (trigger on pickups), existing trips are untouched.
-- RPCs:    list_org_volunteers (coordinator view: profile, masked phone, location consent flag, trip
--          counts — the consent row itself stays private), set_volunteer_paused, revoke_invitation.
-- Trigger: pickups_assignee_not_paused (BEFORE INSERT / UPDATE OF assignee_user_id): a paused volunteer
--          cannot become the assignee of a volunteer trip — whatever the write path (assign_pickup
--          new trip or re-plan).

-- ===========================================================================
-- 1. org_members: pause a volunteer (written only through set_volunteer_paused)
-- ===========================================================================
alter table public.org_members
  add column paused_at     timestamptz,
  add column paused_reason text check (char_length(paused_reason) <= 300),
  add constraint org_members_paused_reason check (paused_at is not null or paused_reason is null);

comment on column public.org_members.paused_at is 'Volunteer paused by a coordinator (US-CHA-15 AC2): no new trip may be assigned. null = available.';
comment on column public.org_members.paused_reason is 'Optional reason shown to coordinators (≤ 300 chars); null when not paused.';

-- ===========================================================================
-- 2. Trigger: a paused volunteer cannot be assigned a volunteer trip
-- ===========================================================================
create or replace function private.pickups_assignee_not_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'volunteer' and new.assignee_user_id is not null
     and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id)
     and exists (select 1 from public.org_members m
                 where m.org_id = new.charity_org_id and m.user_id = new.assignee_user_id
                   and m.status = 'active' and m.paused_at is not null) then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"assignee_user_id":"volunteer_paused"}';
  end if;
  return new;
end;
$$;

comment on function private.pickups_assignee_not_paused() is
  'BEFORE INSERT / UPDATE OF assignee_user_id on pickups: PT422 {"assignee_user_id":"volunteer_paused"} when the new assignee of a volunteer trip is paused in the charity.';

create trigger pickups_assignee_not_paused
  before insert or update of assignee_user_id on public.pickups
  for each row execute function private.pickups_assignee_not_paused();

-- ===========================================================================
-- 3. set_volunteer_paused (owner/manager of the approved charity)
-- ===========================================================================
create or replace function public.set_volunteer_paused(p_org_id uuid, p_user_id uuid, p_paused boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_org    public.organizations%rowtype;
  v_mem    public.org_members%rowtype;
begin
  perform private.require_uid();
  if p_paused is null or char_length(v_reason) > 300 then
    raise exception using errcode = 'PT422', message = 'validation_failed',
      detail = '{"p_paused":"required","p_reason":"≤ 300 chars"}';
  end if;

  select * into v_org from public.organizations o where o.id = p_org_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  perform private.require_org_role(p_org_id, '{owner,manager}');
  if v_org.status <> 'approved' or v_org.kind <> 'charity' then
    raise exception using errcode = 'PT409', message = 'invalid_state';
  end if;

  select * into v_mem from public.org_members m
  where m.org_id = p_org_id and m.user_id = p_user_id and m.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  if v_mem.role <> 'volunteer' then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_user_id":"not_a_volunteer"}';
  end if;

  if not p_paused then
    v_reason := null;
  end if;
  if (v_mem.paused_at is not null) = p_paused and v_mem.paused_reason is not distinct from v_reason then
    return;
  end if;

  update public.org_members
     set paused_at = case when p_paused then coalesce(paused_at, private.now()) end,
         paused_reason = v_reason
   where org_id = p_org_id and user_id = p_user_id;

  perform private.audit(
    p_action      => case when p_paused then 'member.pause' else 'member.resume' end,
    p_entity_type => 'org_member',
    p_entity_id   => p_user_id,
    p_org_id      => p_org_id,
    p_before      => jsonb_build_object('paused', v_mem.paused_at is not null),
    p_after       => jsonb_build_object('paused', p_paused),
    p_reason      => v_reason);
end;
$$;

comment on function public.set_volunteer_paused(uuid, uuid, boolean, text) is
  'Owner/manager of an approved charity pauses (optional reason ≤ 300) or resumes an active volunteer: a paused volunteer gets no new trip (trigger on pickups). No-op when unchanged. Audited member.pause / member.resume.';

-- ===========================================================================
-- 4. list_org_volunteers (coordinator view)
-- ===========================================================================
-- Active volunteers of a charity for its coordinators (owner/manager/staff of the approved org):
-- name, masked phone, profile (approximate area only — already snapped to 0.01°), whether a
-- location_trip consent is active (flag only; consents stay readable by their owner only), trips.
create or replace function public.list_org_volunteers(p_org_id uuid)
returns table (
  user_id           uuid,
  full_name         text,
  phone_masked      text,
  joined_at         timestamptz,
  paused_at         timestamptz,
  paused_reason     text,
  has_profile       boolean,
  vehicle           public.vehicle_type,
  capacity_kg       numeric,
  base_lat          float8,
  base_lng          float8,
  base_area_label   text,
  availability_note text,
  location_consent  boolean,
  trips_completed   integer,
  trips_this_month  integer,
  last_trip_at      timestamptz,
  open_trips        integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_month timestamptz := (date_trunc('month', private.now() at time zone 'Asia/Ho_Chi_Minh'))
                         at time zone 'Asia/Ho_Chi_Minh';
begin
  perform private.require_uid();
  if not private.is_active_org_member(p_org_id, '{owner,manager,staff}') then
    if private.caller_org_role(p_org_id) is not null then
      raise exception using errcode = 'PT403', message = 'not_authorized';
    end if;
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  return query
    select m.user_id,
           nullif(btrim(pr.full_name), ''),
           private.mask_phone(pr.phone),
           coalesce(m.joined_at, m.created_at),
           m.paused_at,
           m.paused_reason,
           vp.user_id is not null,
           vp.vehicle,
           vp.capacity_kg,
           extensions.st_y(vp.base_area::extensions.geometry),
           extensions.st_x(vp.base_area::extensions.geometry),
           vp.base_area_label,
           vp.availability_note,
           private.has_consent(m.user_id, 'location_trip'),
           coalesce(t.completed, 0),
           coalesce(t.month, 0),
           t.last_at,
           coalesce(t.open, 0)
    from public.org_members m
    join public.organizations o on o.id = m.org_id and o.kind = 'charity'
    join public.profiles pr on pr.id = m.user_id and pr.deleted_at is null
    left join public.volunteer_profiles vp on vp.user_id = m.user_id
    left join lateral (
      select count(*) filter (where pk.status = 'completed')::integer as completed,
             count(*) filter (where pk.status = 'completed' and pk.completed_at >= v_month)::integer as month,
             max(pk.completed_at) as last_at,
             count(*) filter (where pk.status in ('assigned', 'in_progress'))::integer as open
      from public.pickups pk
      where pk.charity_org_id = m.org_id and pk.assignee_user_id = m.user_id and pk.mode = 'volunteer'
    ) t on true
    where m.org_id = p_org_id and m.status = 'active' and m.role = 'volunteer'
    order by m.paused_at is not null, lower(coalesce(nullif(btrim(pr.full_name), ''), '~')), m.user_id;
end;
$$;

comment on function public.list_org_volunteers(uuid) is
  'Coordinators (owner/manager/staff of the approved charity): active volunteers with masked phone, profile (approximate area), location_trip consent flag, paused state, completed trips (total / this VN month), last trip, open trips. Volunteer/other member => PT403; others PT404.';

-- ===========================================================================
-- 5. revoke_invitation (owner/manager; US-CHA-14 — pending invitations can be withdrawn)
-- ===========================================================================
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv  public.org_invitations%rowtype;
  v_role public.org_role;
begin
  perform private.require_uid();
  select * into v_inv from public.org_invitations i where i.id = p_invitation_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;
  v_role := private.require_org_role(v_inv.org_id, '{owner,manager}');
  if v_inv.role = 'owner' and v_role <> 'owner' then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'manager_cannot_invite_owner';
  end if;
  if v_inv.accepted_at is not null then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'already_accepted';
  end if;
  if v_inv.revoked_at is not null then
    return;
  end if;

  update public.org_invitations set revoked_at = private.now() where id = v_inv.id;

  perform private.audit(
    p_action      => 'member.invite_revoke',
    p_entity_type => 'org_invitation',
    p_entity_id   => v_inv.id,
    p_org_id      => v_inv.org_id,
    p_after       => jsonb_build_object('role', v_inv.role));
end;
$$;

comment on function public.revoke_invitation(uuid) is
  'Owner/manager withdraws an open invitation (manager cannot touch an owner invitation). Accepted => PT409 already_accepted; already revoked => no-op. The link stops working (accept_invite checks revoked_at). Audited without the email.';

-- ===========================================================================
-- 6. Privileges
-- ===========================================================================
revoke all on function private.pickups_assignee_not_paused() from public, anon, authenticated;
revoke all on function public.set_volunteer_paused(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.list_org_volunteers(uuid) from public, anon, authenticated;
revoke all on function public.revoke_invitation(uuid) from public, anon, authenticated;

grant execute on function public.set_volunteer_paused(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.list_org_volunteers(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;

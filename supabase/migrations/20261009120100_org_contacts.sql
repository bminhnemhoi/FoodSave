-- Migration — org_contacts (B1: hotline tổ chức + "Gọi trong chuyến"; PRD góp ý Partner 10/2026;
-- DATA-MODEL §2.1 org_contacts, §8.2, §8.5, §9.2; SECURITY-PRIVACY §2.2, §5, §6)
-- Table: org_contacts — optional business hotline (phone and/or work email) of an organization. Kept out
--        of `organizations` (anon reads its public columns) and out of org_sensitive (owner/manager only):
--        it is shared, but only through get_org_contact. RLS: owner/manager of the org S/I/U/D their own
--        row; admin aal2 reads; nobody else selects it directly.
-- RPCs:  get_org_contact(org)        — hotline of an APPROVED org, for: owner/manager/staff of any approved
--                                      org, members of that org, the assignee of a live trip (in_progress,
--                                      or assigned and accepted) with a stop at one of its sites, admin aal2.
--                                      Others PT404. 60 calls/hour per user (PT429).
--        reveal_trip_contact(pickup) — the volunteer's profiles.phone for the parties of the trip (charity
--                                      owner/manager/staff of the receiving site, store owner/manager/staff of
--                                      a pickup stop site) while the trip is live, only with the volunteer's
--                                      active `trip_contact` consent. Audited (contact.reveal, never the
--                                      number); 10 reveals/hour per caller.
-- Every boolean condition is wrapped in coalesce(…, false): an unknown/NULL never grants access (lesson of
-- the issue_handover_token NULL-logic bug). No business table is locked here (read-only + audit).

-- ===========================================================================
-- 1. org_contacts
-- ===========================================================================
create table public.org_contacts (
  org_id        uuid primary key references public.organizations (id) on delete cascade,
  hotline_phone text check (hotline_phone ~ '^(0[0-9]{9}|02[0-9]{9}|1[89]00[0-9]{4,6})$'),
  hotline_email text check (hotline_email = lower(hotline_email) and char_length(hotline_email) <= 254
                            and hotline_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint org_contacts_not_empty check (num_nonnulls(hotline_phone, hotline_email) > 0)
);

comment on table public.org_contacts is 'Optional business hotline of an organization (B1). Shown to approved orgs and to volunteers on a live trip through get_org_contact only; never public. A row always holds at least one value (clearing both deletes the row).';
comment on column public.org_contacts.hotline_phone is 'Normalised Vietnamese number: mobile 0xxxxxxxxx (10 digits), landline 02xxxxxxxxx (11 digits) or 1800/1900 + 4-6 digits.';
comment on column public.org_contacts.hotline_email is 'Work email, lower-cased.';
comment on column public.org_contacts.updated_by is 'Last writer (auth.uid() via trigger); null for seed/service writes.';

create index org_contacts_updated_by_idx on public.org_contacts (updated_by) where updated_by is not null;

-- Trim / lower-case, empty => null, stamp updated_at + updated_by (whatever the write path).
create or replace function private.org_contacts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.hotline_phone := nullif(btrim(new.hotline_phone), '');
  new.hotline_email := nullif(lower(btrim(new.hotline_email)), '');
  new.updated_at := pg_catalog.now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

comment on function private.org_contacts_before_write() is 'BEFORE INSERT/UPDATE on org_contacts: trims, lower-cases the email, empty => null, sets updated_at/updated_by.';

create trigger org_contacts_before_write
  before insert or update on public.org_contacts
  for each row execute function private.org_contacts_before_write();

alter table public.org_contacts enable row level security;

create policy org_contacts_select on public.org_contacts
  for select to authenticated
  using (private.is_org_member(org_id, '{owner,manager}') or (select private.is_admin()));

create policy org_contacts_insert_owner_manager on public.org_contacts
  for insert to authenticated
  with check (
    private.is_org_member(org_id, '{owner,manager}')
    and private.org_has_status(org_id, '{draft,submitted,needs_changes,approved,suspended}')
  );

create policy org_contacts_update_owner_manager on public.org_contacts
  for update to authenticated
  using (
    private.is_org_member(org_id, '{owner,manager}')
    and private.org_has_status(org_id, '{draft,submitted,needs_changes,approved,suspended}')
  )
  with check (
    private.is_org_member(org_id, '{owner,manager}')
    and private.org_has_status(org_id, '{draft,submitted,needs_changes,approved,suspended}')
  );

create policy org_contacts_delete_owner_manager on public.org_contacts
  for delete to authenticated
  using (
    private.is_org_member(org_id, '{owner,manager}')
    and private.org_has_status(org_id, '{draft,submitted,needs_changes,approved,suspended}')
  );

revoke all on table public.org_contacts from anon, authenticated;
grant select on public.org_contacts to authenticated;
grant insert (org_id, hotline_phone, hotline_email) on public.org_contacts to authenticated;
grant update (hotline_phone, hotline_email) on public.org_contacts to authenticated;
grant delete on public.org_contacts to authenticated;

-- ===========================================================================
-- 2. Helpers
-- ===========================================================================

-- A trip is "live" for contact purposes while it runs, or once the volunteer accepted it (they may need
-- to call the store before leaving). planned / not-yet-accepted / completed / cancelled => false.
create or replace function private.trip_is_live(p_status public.pickup_status, p_accepted_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_status = 'in_progress' or (p_status = 'assigned' and p_accepted_at is not null), false);
$$;

comment on function private.trip_is_live(public.pickup_status, timestamptz) is
  'Contact window of a trip: in_progress, or assigned and accepted by the volunteer. NULL-safe (false).';

-- ===========================================================================
-- 3. get_org_contact
-- ===========================================================================
create or replace function public.get_org_contact(p_org_id uuid)
returns table (org_id uuid, org_name text, hotline_phone text, hotline_email text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid     uuid := private.require_uid();
  v_name    text;
  v_allowed boolean := false;
begin
  if p_org_id is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_org_id":"required"}';
  end if;

  perform private.check_rate_limit('get_org_contact:user:' || v_uid::text, 60, interval '1 hour');

  -- only approved organizations have a shareable hotline
  select o.name into v_name from public.organizations o where o.id = p_org_id and o.status = 'approved';

  if v_name is not null then
    v_allowed :=
         coalesce(private.is_admin(), false)
      -- any member of the org itself (incl. its volunteers)
      or coalesce(private.is_org_member(p_org_id), false)
      -- owner/manager/staff of some approved org (stores and charities call each other)
      or coalesce(exists (select 1
                          from public.org_members m
                          join public.organizations mo on mo.id = m.org_id and mo.status = 'approved'
                          where m.user_id = v_uid and m.status = 'active'
                            and m.role in ('owner', 'manager', 'staff')), false)
      -- the volunteer of a live trip with a stop at one of the org's sites
      or coalesce(exists (select 1
                          from public.pickups p
                          join public.pickup_stops st on st.pickup_id = p.id
                          join public.sites s on s.id = st.site_id
                          where p.assignee_user_id = v_uid
                            and s.org_id = p_org_id
                            and private.trip_is_live(p.status, p.accepted_at)
                            and coalesce(private.is_active_org_member(p.charity_org_id), false)), false);
  end if;

  if not coalesce(v_allowed, false) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  return query
    select p_org_id, v_name, c.hotline_phone, c.hotline_email
    from (select 1) as one
    left join public.org_contacts c on c.org_id = p_org_id;
end;
$$;

comment on function public.get_org_contact(uuid) is
  'Hotline of an approved org (one row; phone/email null when none declared). Callers: owner/manager/staff of any approved org, members of the org, the assignee of a live trip with a stop at the org, admin aal2; others / unapproved target => PT404. Rate limit 60/hour per user (PT429).';

-- ===========================================================================
-- 4. reveal_trip_contact
-- ===========================================================================
create or replace function public.reveal_trip_contact(p_pickup_id uuid)
returns table (volunteer_name text, phone text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid       uuid := private.require_uid();
  p           public.pickups%rowtype;
  v_charity   boolean := false;
  v_store_org uuid;
  v_name      text;
  v_phone     text;
begin
  if p_pickup_id is null then
    raise exception using errcode = 'PT422', message = 'validation_failed', detail = '{"p_pickup_id":"required"}';
  end if;

  select * into p from public.pickups pk where pk.id = p_pickup_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  -- (a) a party of the trip: coordinator side (receiving site) or the store of a pickup stop
  v_charity := coalesce(private.can_access_site(p.charity_site_id, '{owner,manager,staff}'), false);
  if not v_charity then
    select si.org_id into v_store_org
    from public.pickup_stops st
    join public.sites si on si.id = st.site_id
    where st.pickup_id = p.id and st.kind = 'pickup'
      and coalesce(private.can_access_site(st.site_id, '{owner,manager,staff}'), false)
    order by st.seq
    limit 1;
  end if;
  if not (v_charity or v_store_org is not null) then
    raise exception using errcode = 'PT404', message = 'not_found';
  end if;

  -- (b) only while the trip is live
  if not private.trip_is_live(p.status, p.accepted_at) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'trip_not_active';
  end if;
  if not coalesce(p.mode = 'volunteer' and p.assignee_user_id is not null, false) then
    raise exception using errcode = 'PT409', message = 'invalid_state', detail = 'no_volunteer';
  end if;

  -- (c) the volunteer opted in (consent trip_contact, never pre-checked)
  if not coalesce(private.has_consent(p.assignee_user_id, 'trip_contact'), false) then
    raise exception using errcode = 'PT403', message = 'not_authorized', detail = 'no_consent';
  end if;

  perform private.check_rate_limit('reveal_trip_contact:user:' || v_uid::text, 10, interval '1 hour');

  select pr.full_name, pr.phone into v_name, v_phone
  from public.profiles pr
  where pr.id = p.assignee_user_id and pr.deleted_at is null;

  -- the number itself never enters the audit trail
  perform private.audit(
    p_action      => 'contact.reveal',
    p_entity_type => 'pickup',
    p_entity_id   => p.id,
    p_org_id      => case when v_charity then p.charity_org_id else v_store_org end,
    p_after       => jsonb_build_object(
                       'subject_user_id', p.assignee_user_id,
                       'side', case when v_charity then 'charity' else 'store' end,
                       'phone_present', v_phone is not null));

  return query select v_name, v_phone;
end;
$$;

comment on function public.reveal_trip_contact(uuid) is
  'Full phone of the trip volunteer for the charity side (owner/manager/staff of the receiving site) or the store of a pickup stop, only while the trip is live (in_progress or accepted), mode volunteer, with the volunteer''s active trip_contact consent (else PT403 not_authorized detail no_consent). PT409 detail trip_not_active / no_volunteer; outsiders PT404. Audit contact.reveal (no number); 10/hour per caller.';

-- ===========================================================================
-- 5. Function privileges (§8.8)
-- ===========================================================================
revoke all on function private.org_contacts_before_write() from public, anon, authenticated;
revoke all on function private.trip_is_live(public.pickup_status, timestamptz) from public, anon, authenticated;
revoke all on function public.get_org_contact(uuid) from public, anon, authenticated;
revoke all on function public.reveal_trip_contact(uuid) from public, anon, authenticated;

grant execute on function public.get_org_contact(uuid) to authenticated;
grant execute on function public.reveal_trip_contact(uuid) to authenticated;

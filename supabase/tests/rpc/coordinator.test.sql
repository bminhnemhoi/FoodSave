-- Coordinator RPCs (migration 20261008170200_coordinator; DATA-MODEL §2.1 org_members, §8.2;
-- PRD US-CHA-14 AC3, US-CHA-15 AC1–AC2): list_org_volunteers, set_volunteer_paused (+ trigger that keeps a
-- paused volunteer off new trips), revoke_invitation.
begin;
\ir ../_helpers.psql

select plan(36);

select tests.create_user('charity_staff');
select tests.add_member('charity_b', 'charity_staff', 'staff');
select tests.create_user('vol2');
select tests.add_member('charity_b', 'vol2', 'volunteer');
update public.profiles set full_name = 'Trần Thị Vy', phone = '0987654321' where id = tests.id('vol2');
update public.profiles set full_name = 'Lê Minh Khoa', phone = '0912345678' where id = tests.id('charity_volunteer');
select tests.grant_location('vol2');
select tests.authenticate_as('vol2');
select public.upsert_volunteer_profile('{"vehicle":"bicycle","capacity_kg":12.5,"lat":10.7769,"lng":106.7009,"base_area_label":"Phường Bến Thành"}');
select tests.clear_auth();

-- ======================= list_org_volunteers =======================
select tests.as_anon();
select throws_ok(format('select * from public.list_org_volunteers(%L)', tests.id('charity_b')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select * from public.list_org_volunteers(%L)', tests.id('charity_b')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('store_owner');
select throws_ok(format('select * from public.list_org_volunteers(%L)', tests.id('charity_b')), 'PT404', 'not_found', 'another org: not_found');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select * from public.list_org_volunteers(%L)', tests.id('charity_b')), 'PT403', 'not_authorized',
  'a volunteer does not see the volunteer roster');

select tests.authenticate_as('charity_staff');
select results_eq(
  format('select full_name, phone_masked, has_profile, location_consent, paused_at is null from public.list_org_volunteers(%L)', tests.id('charity_b')),
  $$values ('Lê Minh Khoa'::text, '091****678'::text, false, false, true), ('Trần Thị Vy', '098****321', true, true, true)$$,
  'staff: active volunteers only, phones masked, consent flag, sorted by name');
select results_eq(
  format($$select vehicle::text, capacity_kg, base_lat, base_lng, base_area_label from public.list_org_volunteers(%L) where full_name = 'Trần Thị Vy'$$, tests.id('charity_b')),
  $$values ('bicycle'::text, 12.5::numeric, 10.78::float8, 106.7::float8, 'Phường Bến Thành'::text)$$,
  'profile with the approximate area only (snapped to 0.01°)');
select ok(not exists (select 1 from public.list_org_volunteers(tests.id('charity_b')) v where v.phone_masked ~ '[0-9]{4}'),
  'never a full phone number');
select tests.clear_auth();

-- trips: one completed this month + one open
select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.set_var('p2', tests.volunteer_trip('o2')::text);
update public.pickups set status = 'completed', completed_at = now(), started_at = now() where id = tests.var('p1')::uuid;
select tests.authenticate_as('charity_owner');
select results_eq(
  format($$select trips_completed, trips_this_month, last_trip_at is not null, open_trips from public.list_org_volunteers(%L) where full_name = 'Lê Minh Khoa'$$, tests.id('charity_b')),
  $$values (1, 1, true, 1)$$, 'trip counts: completed (total, this month), last trip, open trips');
select tests.clear_auth();

-- removed members disappear
select tests.create_user('vol_gone');
select tests.add_member('charity_b', 'vol_gone', 'volunteer', 'removed');
select tests.authenticate_as('charity_owner');
select is((select count(*)::int from public.list_org_volunteers(tests.id('charity_b'))), 2, 'removed volunteers are not listed');
select tests.clear_auth();

-- ======================= set_volunteer_paused =======================
select tests.as_anon();
select throws_ok(format('select public.set_volunteer_paused(%L, %L, true, null)', tests.id('charity_b'), tests.id('vol2')), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format('select public.set_volunteer_paused(%L, %L, true, null)', tests.id('charity_b'), tests.id('vol2')), 'PT404', 'not_found', 'outsider: not_found');
select tests.authenticate_as('charity_staff');
select throws_ok(format('select public.set_volunteer_paused(%L, %L, true, null)', tests.id('charity_b'), tests.id('vol2')), 'PT403', 'not_authorized', 'staff: owner/manager only');
select tests.authenticate_as('charity_volunteer');
select throws_ok(format('select public.set_volunteer_paused(%L, %L, true, null)', tests.id('charity_b'), tests.id('vol2')), 'PT403', 'not_authorized', 'a volunteer cannot pause another');
select tests.authenticate_as('charity_owner');
select throws_ok(format('select public.set_volunteer_paused(%L, %L, true, null)', tests.id('charity_b'), tests.id('charity_owner')), 'PT422', 'validation_failed', 'only volunteers can be paused');
select throws_ok(format('select public.set_volunteer_paused(%L, %L, true, null)', tests.id('charity_b'), tests.id('vol_gone')), 'PT404', 'not_found', 'removed member: not_found');
select throws_ok(format('select public.set_volunteer_paused(%L, %L, null, null)', tests.id('charity_b'), tests.id('vol2')), 'PT422', 'validation_failed', 'p_paused required');
select throws_ok(format('select public.set_volunteer_paused(%L, %L, true, %L)', tests.id('charity_b'), tests.id('vol2'), repeat('x', 301)), 'PT422', 'validation_failed', 'reason ≤ 300 chars');
select lives_ok(format($$select public.set_volunteer_paused(%L, %L, true, '  Đang thi học kỳ ')$$, tests.id('charity_b'), tests.id('vol2')), 'owner pauses vol2');
select lives_ok(format($$select public.set_volunteer_paused(%L, %L, true, 'Đang thi học kỳ')$$, tests.id('charity_b'), tests.id('vol2')), 'same value again: no-op');
select results_eq(
  format($$select paused_at is not null, paused_reason from public.list_org_volunteers(%L) where full_name = 'Trần Thị Vy'$$, tests.id('charity_b')),
  $$values (true, 'Đang thi học kỳ'::text)$$, 'roster shows the pause (reason trimmed)');
select is((select full_name from public.list_org_volunteers(tests.id('charity_b')) limit 1), 'Lê Minh Khoa', 'paused volunteers are listed last');
select tests.clear_auth();
select is((select count(*)::int from public.audit_logs where action = 'member.pause' and entity_id = tests.id('vol2')), 1,
  'audited once (the replay was a no-op)');

-- a paused volunteer gets no new trip (new trip and re-plan), existing trips are untouched
select tests.make_offer('o3', 'site_a', 'bread', 10);
select tests.set_var('a3', tests.request('charity_owner', tests.id('o3'), 2)::text);
select tests.confirm('store_staff', tests.var('a3')::uuid);
select tests.set_var('a4', tests.request('charity_owner', tests.id('o3'), 2)::text);
select tests.confirm('store_staff', tests.var('a4')::uuid);
select tests.authenticate_as('charity_owner');
select is(tests.error_of(format($$select public.assign_pickup(jsonb_build_object('allocation_ids', jsonb_build_array(%L),
            'mode', 'volunteer', 'charity_site_id', %L, 'assignee_user_id', %L), gen_random_uuid())$$,
            tests.var('a3'), tests.id('site_b'), tests.id('vol2'))) ->> 'detail',
  '{"assignee_user_id":"volunteer_paused"}', 'new trip for a paused volunteer: PT422 volunteer_paused');
select is(tests.error_of(format($$select public.assign_pickup(jsonb_build_object('pickup_id', %L, 'allocation_ids', jsonb_build_array(%L),
            'mode', 'volunteer', 'charity_site_id', %L, 'assignee_user_id', %L), gen_random_uuid())$$,
            tests.var('p2'), tests.var('o2_alloc'), tests.id('site_b'), tests.id('vol2'))) ->> 'detail',
  '{"assignee_user_id":"volunteer_paused"}', 're-plan to a paused volunteer: PT422 volunteer_paused');
select lives_ok(format($$select public.assign_pickup(jsonb_build_object('allocation_ids', jsonb_build_array(%L),
            'mode', 'volunteer', 'charity_site_id', %L, 'assignee_user_id', %L), gen_random_uuid())$$,
            tests.var('a3'), tests.id('site_b'), tests.id('charity_volunteer')),
  'another (active) volunteer can still be assigned');
select lives_ok(format($$select public.assign_pickup(jsonb_build_object('allocation_ids', jsonb_build_array(%L),
            'mode', 'volunteer', 'charity_site_id', %L), gen_random_uuid())$$,
            tests.var('a4'), tests.id('site_b')),
  'a trip without assignee is not affected');
select tests.clear_auth();

-- pausing after the assignment keeps the existing trip (re-plan with the same assignee allowed)
select tests.authenticate_as('charity_owner');
select public.set_volunteer_paused(tests.id('charity_b'), tests.id('charity_volunteer'), true, null);
select lives_ok(format($$select public.assign_pickup(jsonb_build_object('pickup_id', %L, 'allocation_ids', jsonb_build_array(%L),
            'mode', 'volunteer', 'charity_site_id', %L, 'assignee_user_id', %L), gen_random_uuid())$$,
            tests.var('p2'), tests.var('o2_alloc'), tests.id('site_b'), tests.id('charity_volunteer')),
  'existing assignee paused later: re-planning the same trip still works');
select lives_ok(format('select public.set_volunteer_paused(%L, %L, false, %L)', tests.id('charity_b'), tests.id('vol2'), 'ignored'),
  'owner resumes vol2');
select results_eq(
  format($$select paused_at, paused_reason from public.list_org_volunteers(%L) where full_name = 'Trần Thị Vy'$$, tests.id('charity_b')),
  $$values (null::timestamptz, null::text)$$, 'resume clears the pause and its reason');
select tests.clear_auth();
select ok(exists (select 1 from public.audit_logs where action = 'member.resume' and entity_id = tests.id('vol2')), 'resume audited');

-- ======================= revoke_invitation =======================
select tests.authenticate_as('charity_owner');
select tests.set_var('inv', public.invite_member(tests.id('charity_b'), 'newvol@test.local', 'volunteer', null,
                                                 sha256(convert_to('tok-newvol-0001-abcdefghijklmnop', 'UTF8')))::text);
select tests.authenticate_as('charity_staff');
select throws_ok(format('select public.revoke_invitation(%L)', tests.var('inv')), 'PT403', 'not_authorized', 'staff cannot revoke');
select tests.authenticate_as('store_owner');
select throws_ok(format('select public.revoke_invitation(%L)', tests.var('inv')), 'PT404', 'not_found', 'another org: not_found');
select tests.authenticate_as('charity_owner');
select lives_ok(format('select public.revoke_invitation(%L)', tests.var('inv')), 'owner revokes the invitation');
select lives_ok(format('select public.revoke_invitation(%L)', tests.var('inv')), 'revoking again: no-op');
select tests.clear_auth();
select ok((select revoked_at is not null from public.org_invitations where id = tests.var('inv')::uuid), 'invitation revoked');
select tests.create_user('newvol');
select tests.confirm_email('newvol');
select tests.authenticate_as('newvol');
select throws_ok($$select public.accept_invite('tok-newvol-0001-abcdefghijklmnop')$$, 'PT422', 'token_invalid', 'the revoked link no longer works');
select tests.clear_auth();

select * from finish();
rollback;

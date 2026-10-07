-- invite_member / accept_invite / update_member / remove_member (DATA-MODEL §2.1, §8.2, C2):
-- token stored as sha256(utf8(token)), single use, 7-day expiry, email must match; manager cannot
-- invite owner; 30 invites/day/org; owner-only member management; ≥ 1 active owner kept.
begin;
\ir ../_helpers.psql

select plan(46);

select tests.create_user('newbie');
select tests.confirm_email('newbie');
select tests.confirm_email('outsider');

-- ======================= invite_member =======================
select tests.as_anon();
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'staff', null, sha256('t'::bytea))$$, tests.id('store_a')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'staff', null, sha256('t'::bytea))$$, tests.id('store_a')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'staff', null, sha256('t'::bytea))$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'staff cannot invite');
select tests.authenticate_as('draft_owner');
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'staff', null, sha256('t'::bytea))$$, tests.id('draft_c')),
  'PT403', 'org_not_active', 'draft org cannot invite');
select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'owner', null, sha256('t'::bytea))$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'manager cannot invite an owner');
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'volunteer', null, sha256('t'::bytea))$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'volunteer role only for charities');
select throws_ok(format($$select public.invite_member(%L, 'not-an-email', 'staff', null, sha256('t'::bytea))$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'invalid email');
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'staff', null, '\x0102'::bytea)$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'token_hash must be 32 bytes');
select throws_ok(format($$select public.invite_member(%L, 'a@b.vn', 'staff', array[%L]::uuid[], sha256('t'::bytea))$$,
                        tests.id('store_a'), tests.id('site_x')),
  'PT422', 'validation_failed', 'site_ids must belong to the org');
select throws_ok(format($$select public.invite_member(%L, 'store_staff@test.local', 'manager', null, sha256('t'::bytea))$$, tests.id('store_a')),
  'PT409', 'invalid_state', 'already an active member');

select lives_ok(format($$select public.invite_member(%L, ' Newbie@Test.Local ', 'staff', array[%L]::uuid[],
                                                     sha256(convert_to('tok-newbie-0001-abcdefghijklmnop', 'UTF8')))$$,
                       tests.id('store_a'), tests.id('site_a')),
  'manager invites a staff member scoped to site_a');
select is(public.invite_member(tests.id('store_a'), 'newbie@test.local', 'staff', array[tests.id('site_a')],
                               sha256(convert_to('tok-newbie-0001-abcdefghijklmnop', 'UTF8'))),
  (select id from public.org_invitations where email = 'newbie@test.local'),
  'replay with the same token_hash returns the same invitation');
select throws_ok(format($$select public.invite_member(%L, 'other@test.local', 'staff', null,
                                                      sha256(convert_to('tok-newbie-0001-abcdefghijklmnop', 'UTF8')))$$,
                        tests.id('store_a')),
  'PT409', 'idempotency_conflict', 'same token for another email => idempotency_conflict');
select tests.clear_auth();

select results_eq(
  $$select email, role, site_ids, invited_by, expires_at > now() + interval '6 days 23 hours'
    from public.org_invitations where org_id = tests.id('store_a')$$,
  $$values ('newbie@test.local'::text, 'staff'::public.org_role, array[tests.id('site_a')], tests.id('store_manager'), true)$$,
  'invitation stored (email lower-cased, 7-day expiry)');
select is((select count(*)::int from public.notification_outbox where event = 'member_invited'), 1, 'outbox member_invited');
select results_eq(
  $$select after from public.audit_logs where action = 'member.invite'$$,
  $$values (jsonb_build_object('role', 'staff', 'site_ids', array[tests.id('site_a')]))$$,
  'audited without the invitee email');

-- re-invite revokes the previous open invitation
select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.invite_member(%L, 'newbie@test.local', 'staff', array[%L]::uuid[],
                                                     sha256(convert_to('tok-newbie-0002-abcdefghijklmnop', 'UTF8')))$$,
                       tests.id('store_a'), tests.id('site_a')),
  're-invite with a new token');
select tests.clear_auth();
select results_eq(
  $$select count(*) filter (where revoked_at is null)::int, count(*) filter (where revoked_at is not null)::int
    from public.org_invitations where email = 'newbie@test.local'$$,
  $$values (1, 1)$$, 'old invitation revoked, one open');

-- ======================= accept_invite =======================
select tests.as_anon();
select throws_ok($$select public.accept_invite('tok-newbie-0002-abcdefghijklmnop')$$, '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('newbie');
select throws_ok($$select public.accept_invite('tok-wrong-0000-abcdefghijklmnop')$$, 'PT422', 'token_invalid', 'unknown token');
select throws_ok($$select public.accept_invite('tok-newbie-0001-abcdefghijklmnop')$$, 'PT422', 'token_invalid', 'revoked token');
select tests.authenticate_as('outsider');
select throws_ok($$select public.accept_invite('tok-newbie-0002-abcdefghijklmnop')$$, 'PT403', 'not_authorized',
  'another account (email mismatch) cannot accept');
select tests.clear_auth();
update auth.users set email_confirmed_at = null where id = tests.id('newbie');
select tests.authenticate_as('newbie');
select throws_ok($$select public.accept_invite('tok-newbie-0002-abcdefghijklmnop')$$, 'PT403', 'not_authorized',
  'unconfirmed email cannot accept');
select tests.clear_auth();
select tests.confirm_email('newbie');
select tests.authenticate_as('newbie');
select is(public.accept_invite('tok-newbie-0002-abcdefghijklmnop'), tests.id('store_a'), 'newbie accepts => org_id');
select is(public.accept_invite('tok-newbie-0002-abcdefghijklmnop'), tests.id('store_a'), 'accepting again is idempotent');
select tests.authenticate_as('outsider');
select throws_ok($$select public.accept_invite('tok-newbie-0002-abcdefghijklmnop')$$, 'PT409', 'token_consumed',
  'a consumed token cannot be reused by someone else');
select tests.clear_auth();
select results_eq(
  $$select role, site_ids, status, invited_by from public.org_members
    where org_id = tests.id('store_a') and user_id = tests.id('newbie')$$,
  $$values ('staff'::public.org_role, array[tests.id('site_a')], 'active'::public.member_status, tests.id('store_owner'))$$,
  'membership created from the invitation');
select is((select accepted_by from public.org_invitations where accepted_at is not null), tests.id('newbie'), 'accepted_by set');
select is((select count(*)::int from public.audit_logs where action = 'member.accept'), 1, 'accept audited once');

insert into public.org_invitations (org_id, email, role, token_hash, expires_at, invited_by)
values (tests.id('store_a'), 'outsider@test.local', 'staff', sha256(convert_to('tok-expired-000-abcdefghijklmnop', 'UTF8')),
        now() - interval '1 minute', tests.id('store_owner'));
select tests.authenticate_as('outsider');
select throws_ok($$select public.accept_invite('tok-expired-000-abcdefghijklmnop')$$, 'PT422', 'token_expired', 'expired token');
select tests.clear_auth();

-- rate limit: 30 invitations per day per org
insert into public.rate_limits (key, window_start, count)
values ('invite_member:org:' || tests.id('store_a'),
        date_bin(interval '1 day', now(), timestamptz '2000-01-01 00:00:00+07'), 30)
on conflict (key, window_start) do update set count = 30;
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.invite_member(%L, 'thu31@test.local', 'staff', null, sha256('t31'::bytea))$$, tests.id('store_a')),
  'PT429', 'rate_limited', '31st invitation of the day => rate_limited');

-- ======================= update_member =======================
select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.update_member(%L, %L, 'manager', null)$$, tests.id('store_a'), tests.id('newbie')),
  'PT403', 'not_authorized', 'manager cannot update members');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.update_member(%L, %L, 'manager', null)$$, tests.id('store_a'), tests.id('newbie')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.update_member(%L, %L, 'volunteer', null)$$, tests.id('store_a'), tests.id('newbie')),
  'PT422', 'validation_failed', 'volunteer only in charities');
select throws_ok(format($$select public.update_member(%L, %L, 'staff', null)$$, tests.id('store_a'), tests.id('outsider')),
  'PT404', 'not_found', 'target must be an active member');
select lives_ok(format($$select public.update_member(%L, %L, 'manager', null)$$, tests.id('store_a'), tests.id('newbie')),
  'owner promotes newbie to manager of all sites');
select lives_ok(format($$select public.update_member(%L, %L, 'manager', null)$$, tests.id('store_a'), tests.id('newbie')),
  'same values again is a no-op');
select throws_ok(format($$select public.update_member(%L, %L, 'manager', null)$$, tests.id('store_a'), tests.id('store_owner')),
  'PT409', 'invalid_state', 'the last owner cannot be demoted');
select tests.clear_auth();
select results_eq(
  $$select role, site_ids from public.org_members where org_id = tests.id('store_a') and user_id = tests.id('newbie')$$,
  $$values ('manager'::public.org_role, null::uuid[])$$, 'role and scope updated');
select is((select count(*)::int from public.audit_logs where action = 'member.update'), 1, 'one update audited');

-- ======================= remove_member =======================
update public.profiles set active_org_id = tests.id('store_a') where id = tests.id('newbie');
select tests.authenticate_as('store_manager');
select throws_ok(format($$select public.remove_member(%L, %L)$$, tests.id('store_a'), tests.id('newbie')),
  'PT403', 'not_authorized', 'manager cannot remove members');
select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.remove_member(%L, %L)$$, tests.id('store_a'), tests.id('newbie')), 'owner removes newbie');
select lives_ok(format($$select public.remove_member(%L, %L)$$, tests.id('store_a'), tests.id('newbie')), 'removing again is a no-op');
select throws_ok(format($$select public.remove_member(%L, %L)$$, tests.id('store_a'), tests.id('store_owner')),
  'PT409', 'invalid_state', 'the last owner cannot be removed');
select tests.clear_auth();
select results_eq(
  $$select m.status, p.active_org_id from public.org_members m join public.profiles p on p.id = m.user_id
    where m.org_id = tests.id('store_a') and m.user_id = tests.id('newbie')$$,
  $$values ('removed'::public.member_status, null::uuid)$$,
  'member removed and their active_org_id cleared');
select is((select count(*)::int from public.audit_logs where action = 'member.remove'), 1, 'one removal audited');

select * from finish();
rollback;

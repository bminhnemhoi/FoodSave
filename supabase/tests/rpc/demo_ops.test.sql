-- Demo helpers (DATA-MODEL §8.7 demo_reset, §13, §17; SECURITY-PRIVACY C20; ROADMAP P2-16, P2-17):
-- service-role only; demo_approve_organization / demo_seed_history refuse anything that is not
-- demo; demo_reset purges every is_demo org with everything hanging off it and leaves the real
-- organizations and their data byte-for-byte unchanged (proved on a full real + demo world).
-- Assertions are relative to the rows already in the database (E2E data, a seeded demo) and the
-- transaction reads one snapshot (repeatable read), so concurrent writers cannot make it flaky.
begin;
set transaction isolation level repeatable read;
\ir ../_helpers.psql

select plan(43);

-- ---------------------------------------------------------------------------
-- World
--   real:  fixture store_a -> charity_b: one delivered self pickup (ledger credit), one pending
--          request, plus a submitted real org (real_sub)
--   demo:  demo_store -> demo_charity: same loop + document + site hours; demo_new (submitted)
-- ---------------------------------------------------------------------------
select tests.make_offer('real_o1', 'site_a', 'bread', 10);
select tests.set_var('real_a1', tests.request('charity_owner', tests.id('real_o1'), 4)::text);
select tests.confirm('store_staff', tests.var('real_a1')::uuid);
select tests.set_var('real_p1', tests.pickup('charity_owner', array[tests.var('real_a1')::uuid])::text);
select tests.set_var('real_s1', tests.stop_of(tests.var('real_a1')::uuid)::text);
select tests.issue('charity_owner', tests.var('real_s1')::uuid, 'rh');
select tests.authenticate_as('store_staff');
select public.consume_handover_token(tests.var('rh_token'), tests.full_lines(tests.var('real_s1')::uuid), gen_random_uuid());
select tests.clear_auth();
select tests.set_var('real_a2', tests.request('charity_owner', tests.id('real_o1'), 2)::text);
select tests.create_org('real_sub', 'store', 'outsider', 'submitted');

select tests.create_user(n)
from unnest(array['demo_store_owner', 'demo_charity_owner', 'demo_reviewer', 'demo_new_owner']) as n;
update public.profiles set is_demo = true
where id in (tests.id('demo_store_owner'), tests.id('demo_charity_owner'), tests.id('demo_reviewer'),
             tests.id('demo_new_owner'));
select tests.create_org('demo_store', 'store', 'demo_store_owner');
select tests.create_org('demo_charity', 'charity', 'demo_charity_owner');
select tests.create_org('demo_new', 'store', 'demo_new_owner', 'submitted');
select tests.create_org('demo_draft', 'store', 'demo_new_owner', 'draft');
update public.organizations set is_demo = true
where id in (tests.id('demo_store'), tests.id('demo_charity'), tests.id('demo_new'), tests.id('demo_draft'));
select tests.create_site('demo_site_s', 'demo_store', 'public', 10.7725, 106.698);
select tests.create_site('demo_site_c', 'demo_charity', 'approximate', 10.779, 106.69);
insert into public.org_documents (org_id, doc_type, storage_path, mime_type, size_bytes, sha256, uploaded_by)
values (tests.id('demo_new'), 'business_license',
        tests.id('demo_new') || '/business_license/0b0e9c51-5d0a-4a43-9a39-3d1f4b8f0001.pdf',
        'application/pdf', 1024, repeat('a', 64), tests.id('demo_new_owner'));

select tests.make_offer('demo_o1', 'demo_site_s', 'cooked_meal', 12);
select tests.set_var('demo_a1', tests.request('demo_charity_owner', tests.id('demo_o1'), 5, 'demo_site_c')::text);
select tests.confirm('demo_store_owner', tests.var('demo_a1')::uuid);
select tests.set_var('demo_p1', tests.pickup('demo_charity_owner', array[tests.var('demo_a1')::uuid], 'demo_site_c')::text);
select tests.set_var('demo_s1', tests.stop_of(tests.var('demo_a1')::uuid)::text);
select tests.issue('demo_charity_owner', tests.var('demo_s1')::uuid, 'dh');
select tests.authenticate_as('demo_store_owner');
select public.consume_handover_token(tests.var('dh_token'), tests.full_lines(tests.var('demo_s1')::uuid), gen_random_uuid());
select tests.clear_auth();
select tests.set_var('demo_a2', tests.request('demo_charity_owner', tests.id('demo_o1'), 3, 'demo_site_c')::text);
insert into public.site_hours (site_id, dow, opens, closes) values (tests.id('demo_site_s'), 1, '06:00', '21:00');

select ok(exists (select 1 from public.impact_ledger where allocation_id = tests.var('demo_a1')::uuid and is_demo),
  'world: demo ledger credit from the real loop (is_demo)');
select ok(exists (select 1 from public.impact_ledger where allocation_id = tests.var('real_a1')::uuid and not is_demo),
  'world: real ledger credit (not demo)');

-- ---------------------------------------------------------------------------
-- Privileges: service role only
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok('select public.demo_reset()', '42501', null, 'anon cannot execute demo_reset');
select throws_ok($$select public.demo_seed_history('[]')$$, '42501', null, 'anon cannot execute demo_seed_history');
select tests.authenticate_as('demo_store_owner');
select throws_ok('select public.demo_reset()', '42501', null, 'a demo user cannot execute demo_reset');
select throws_ok(format('select public.demo_approve_organization(%L, %L)', tests.id('demo_new'), tests.id('demo_reviewer')),
  '42501', null, 'a demo user cannot approve organizations');
select tests.authenticate_as('admin', 'aal2');
select throws_ok('select public.demo_reset()', '42501', null, 'not even admin aal2 (script / service role only)');
select throws_ok($$select public.demo_seed_history('[]')$$, '42501', null, 'admin aal2 cannot write demo history');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- demo_approve_organization
-- ---------------------------------------------------------------------------
select tests.as_service();
select is(tests.error_of(format('select public.demo_approve_organization(%L, %L)', tests.id('real_sub'), tests.id('demo_reviewer'))) ->> 'detail',
  'not_a_demo_organization', 'a real (non-demo) organization can never be approved this way');
select is(tests.error_of(format('select public.demo_approve_organization(%L, %L)', tests.id('demo_new'), tests.id('admin'))) ->> 'sqlstate',
  'PT422', 'the reviewer cannot be an admin (no forged admin decision)');
select is(tests.error_of(format('select public.demo_approve_organization(%L, %L)', tests.id('demo_new'), tests.id('demo_new_owner'))) ->> 'sqlstate',
  'PT422', 'the reviewer cannot be the creator');
select throws_ok(format('select public.demo_approve_organization(%L, %L)', tests.id('demo_draft'), tests.id('demo_reviewer')),
  'PT409', 'invalid_state', 'a draft (not submitted) demo org is refused');
select is(public.demo_approve_organization(tests.id('demo_new'), tests.id('demo_reviewer')) ->> 'changed', 'true',
  'submitted demo org approved');
select tests.clear_auth();
select results_eq(
  format($$select status::text, reviewed_by, reviewed_at is not null from public.organizations where id = %L$$, tests.id('demo_new')),
  format($$values ('approved', %L::uuid, true)$$, tests.id('demo_reviewer')),
  'approved, reviewed_by = the demo reviewer');
select ok((select purge_after is not null from public.org_documents where org_id = tests.id('demo_new')),
  'KYC retention starts like an onboarding approval (purge_after)');
select ok(exists (select 1 from public.audit_logs a
                  where a.action = 'org.review' and a.entity_id = tests.id('demo_new') and a.actor_kind = 'service'
                    and a.after ->> 'via' = 'demo_approve_organization'),
  'audit org.review, actor_kind service, via demo_approve_organization');
select tests.as_service();
select is(public.demo_approve_organization(tests.id('demo_new'), tests.id('demo_reviewer')) ->> 'changed', 'false',
  'second call is a no-op');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- demo_seed_history
-- ---------------------------------------------------------------------------
select tests.as_service();
select is(tests.error_of(format($$select public.demo_seed_history(jsonb_build_array(jsonb_build_object(
    'kind', 'delivered', 'store_site_id', %L, 'charity_site_id', %L, 'store_user_id', %L, 'charity_user_id', %L,
    'category_code', 'bread', 'title', 'Bánh mì', 'quantity', 5, 'at', now() - interval '2 days')))$$,
    tests.id('site_a'), tests.id('demo_site_c'), tests.id('store_owner'), tests.id('demo_charity_owner'))) ->> 'sqlstate',
  'PT403', 'history refuses a real (non-demo) store site');
select is(tests.error_of(format($$select public.demo_seed_history(jsonb_build_array(jsonb_build_object(
    'kind', 'delivered', 'store_site_id', %L, 'charity_site_id', %L, 'store_user_id', %L, 'charity_user_id', %L,
    'category_code', 'bread', 'title', 'Bánh mì', 'quantity', 5, 'at', now() + interval '1 hour')))$$,
    tests.id('demo_site_s'), tests.id('demo_site_c'), tests.id('demo_store_owner'), tests.id('demo_charity_owner'))) ->> 'detail',
  '{"at": "ISO-8601 with offset in [now - 120 days, now - 1 hour]", "index": 0}', 'history only in the past (≤ now − 1 h)');
select tests.set_var('history', public.demo_seed_history(jsonb_build_array(
  jsonb_build_object('kind', 'delivered', 'store_site_id', tests.id('demo_site_s'), 'charity_site_id', tests.id('demo_site_c'),
                     'store_user_id', tests.id('demo_store_owner'), 'charity_user_id', tests.id('demo_charity_owner'),
                     'category_code', 'cooked_meal', 'title', 'Cơm hộp (lịch sử)', 'quantity', 6, 'extra_quantity', 2,
                     'at', now() - interval '3 days'),
  jsonb_build_object('kind', 'expired', 'store_site_id', tests.id('demo_site_s'), 'store_user_id', tests.id('demo_store_owner'),
                     'category_code', 'vegetables', 'title', 'Rau (lịch sử)', 'quantity', 2.5,
                     'at', now() - interval '5 days')))::text);
select tests.clear_auth();
select results_eq($$select (r ->> 'delivered')::int, (r ->> 'expired')::int, (r ->> 'kg')::numeric from (select tests.var('history')::jsonb as r) x$$,
  $$values (1, 1, 2.700)$$, 'one delivered (6 × 0.45 kg), one expired lot');
select results_eq(
  $$select l.entry_type::text, l.is_demo, l.occurred_at = now() - interval '3 days', l.kg, h.kind::text, h.method::text
    from public.impact_ledger l
    join public.handover_lines hl on hl.id = l.handover_line_id
    join public.handovers h on h.id = hl.handover_id
    join public.offers o on o.id = l.offer_id
    where o.title = 'Cơm hộp (lịch sử)'$$,
  $$values ('credit', true, true, 2.700::numeric, 'dropoff', 'auto')$$,
  'ledger credit written by credit_impact on the dropoff line, backdated to the dropoff time');
select results_eq(
  $$select o.status::text, o.qty_unclaimed, a.status::text, a.qty_delivered, a.delivered_at = now() - interval '3 days',
           p.status::text, (select count(*)::int from public.handovers h where h.pickup_id = p.id and h.consumed_at is not null)
    from public.offers o join public.allocations a on a.offer_id = o.id join public.pickups p on p.id = a.pickup_id
    where o.title = 'Cơm hộp (lịch sử)'$$,
  $$values ('completed', 2::numeric, 'delivered', 6::numeric, true, 'completed', 2)$$,
  'consistent rows: lot completed (2 unclaimed), allocation delivered, trip completed, 2 handovers consumed');
select ok(exists (select 1 from public.impact_public_daily d
                  where d.is_demo and d.day = ((now() - interval '3 days') at time zone 'Asia/Ho_Chi_Minh')::date and d.deliveries >= 1),
  'impact_public_daily demo row for that day (trigger of the real ledger)');
select results_eq(
  $$select o.status::text, o.qty_unclaimed, o.qty_committed, (select count(*)::int from public.allocations a where a.offer_id = o.id)
    from public.offers o where o.title = 'Rau (lịch sử)'$$,
  $$values ('expired', 2.5::numeric, 0::numeric, 0)$$, 'expired lot: nothing claimed');
select ok(exists (select 1 from public.audit_logs where action = 'demo.seed_history' and actor_kind = 'service'),
  'audit demo.seed_history');

-- ---------------------------------------------------------------------------
-- demo_reset: gates
-- ---------------------------------------------------------------------------
update public.app_settings set value = 'false' where key = 'demo_reset_enabled';
select tests.as_service();
select is(tests.error_of('select public.demo_reset()') ->> 'detail', 'demo_reset_disabled',
  'app_settings.demo_reset_enabled = false => refused');
select tests.clear_auth();
update public.app_settings set value = 'true' where key = 'demo_reset_enabled';

select tests.set_var('demo_orgs', (select count(*)::text from public.organizations where is_demo));
select tests.set_var('real_orgs', (select count(*)::text from public.organizations where not is_demo));
select tests.set_var('demo_profiles', (select count(*)::text from public.profiles where is_demo));
insert into public.incidents (kind, reporter_org_id, subject_org_id, description, reported_by)
values ('other', tests.id('store_a'), tests.id('demo_store'), 'Phản ánh chéo giữa thật và demo', tests.id('store_owner'));
select tests.as_service();
select is(left(tests.error_of('select public.demo_reset()') ->> 'detail', 20), 'cross_demo_reference',
  'a row linking a real org with a demo org => refused');
select tests.clear_auth();
select is((select count(*)::int from public.organizations where is_demo), tests.var('demo_orgs')::int, 'refused reset deleted nothing');
delete from public.incidents where reporter_org_id = tests.id('store_a');

-- ---------------------------------------------------------------------------
-- demo_reset: real data untouched, demo data gone
-- ---------------------------------------------------------------------------
-- Hash of every row that belongs to the real world, per table (same predicate before and after).
create function tests.real_rows() returns table (t text, h text)
language sql stable as $$
  with real_orgs as (select id from public.organizations where not is_demo),
       real_allocs as (select id from public.allocations where store_org_id in (select id from real_orgs)),
       real_pickups as (select id from public.pickups where charity_org_id in (select id from real_orgs))
  select 'organizations', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.organizations x where x.id in (select id from real_orgs)
  union all select 'org_sensitive', md5(coalesce(string_agg(x::text, '|' order by x.org_id), '')) from public.org_sensitive x where x.org_id in (select id from real_orgs)
  union all select 'org_members', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.org_members x where x.org_id in (select id from real_orgs)
  union all select 'sites', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.sites x where x.org_id in (select id from real_orgs)
  union all select 'offers', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.offers x where x.org_id in (select id from real_orgs)
  union all select 'allocations', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.allocations x where x.id in (select id from real_allocs)
  union all select 'pickups', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.pickups x where x.id in (select id from real_pickups)
  union all select 'pickup_stops', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.pickup_stops x where x.pickup_id in (select id from real_pickups)
  union all select 'handovers', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.handovers x where x.pickup_id in (select id from real_pickups)
  union all select 'handover_lines', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.handover_lines x where x.allocation_id in (select id from real_allocs)
  union all select 'impact_ledger', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.impact_ledger x where not x.is_demo
  union all select 'impact_public_daily', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.impact_public_daily x where not x.is_demo
  union all select 'trust_events', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.trust_events x where x.org_id in (select id from real_orgs)
  union all select 'notification_outbox', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.notification_outbox x
    where x.aggregate_id in (select id from real_orgs union all select id from real_allocs union all select id from real_pickups
                             union all select id from public.offers where org_id in (select id from real_orgs))
  union all select 'profiles', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.profiles x
  union all select 'audit_logs', md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from public.audit_logs x
    where x.id <= coalesce((select (v)::bigint from tests.vars where k = 'audit_max'), 0);
$$;
select tests.set_var('audit_max', (select max(id)::text from public.audit_logs));
create table tests.before as select * from tests.real_rows();
create table tests.demo_ids as
select id from public.organizations where is_demo
union all select id from public.sites where org_id in (select id from public.organizations where is_demo)
union all select id from public.offers where org_id in (select id from public.organizations where is_demo)
union all select id from public.allocations where store_org_id in (select id from public.organizations where is_demo)
union all select id from public.pickups where charity_org_id in (select id from public.organizations where is_demo)
union all select h.id from public.handovers h join public.pickups p on p.id = h.pickup_id
  where p.charity_org_id in (select id from public.organizations where is_demo);
select ok((select count(*) from tests.demo_ids) >= 12, 'demo world captured');

select tests.as_service();
select tests.set_var('reset', public.demo_reset()::text);
select tests.clear_auth();

select set_eq('select * from tests.real_rows()', 'select * from tests.before',
  'every real row (orgs, sites, offers, allocations, trips, handovers, ledger, public stats, trust, outbox, profiles, audit) is unchanged');
select is((select (r ->> 'organizations')::int from (select tests.var('reset')::jsonb as r) x), tests.var('demo_orgs')::int,
  'every demo organization is deleted (the 4 of this test + any seeded ones)');
select is((select count(*)::int from public.organizations where is_demo), 0, 'no demo organization left');
select is((select count(*)::int from public.organizations where not is_demo), tests.var('real_orgs')::int,
  'every real organization remains');
select is((select count(*)::int from public.impact_ledger where is_demo), 0, 'demo ledger rows deleted (fs.demo_reset exception)');
select is((select count(*)::int from public.impact_public_daily where is_demo), 0, 'demo public aggregate rebuilt (empty)');
select is_empty($$select 1 from public.sites where id in (select id from tests.demo_ids)
                  union all select 1 from public.offers where id in (select id from tests.demo_ids)
                  union all select 1 from public.allocations where id in (select id from tests.demo_ids)
                  union all select 1 from public.pickups where id in (select id from tests.demo_ids)
                  union all select 1 from public.handovers where id in (select id from tests.demo_ids)
                  union all select 1 from public.notification_outbox where aggregate_id in (select id from tests.demo_ids)
                  union all select 1 from public.trust_events where org_id in (select id from tests.demo_ids)$$,
  'sites, lots, allocations, trips, handovers, outbox rows and trust events of demo orgs are gone');
select ok((select (r -> 'kyc_paths') ? (tests.id('demo_new') || '/business_license/0b0e9c51-5d0a-4a43-9a39-3d1f4b8f0001.pdf')
            from (select tests.var('reset')::jsonb as r) x),
  'kyc_paths returned for the Storage API cleanup');
select is((select count(*)::int from public.profiles where is_demo), tests.var('demo_profiles')::int,
  'demo accounts (profiles) are kept for the next seed');
select ok(exists (select 1 from public.audit_logs where action = 'demo.reset' and actor_kind = 'service'
                  and (after ->> 'organizations')::int = tests.var('demo_orgs')::int), 'audit demo.reset with the counts');
select ok(current_setting('fs.demo_reset', true) is distinct from 'on' and current_setting('fs.allow_purge', true) is distinct from 'on',
  'bypass flags are cleared after the reset');
select throws_ok('delete from public.impact_ledger', '42501', 'append_only', 'the real ledger is still append-only afterwards');
select lives_ok('set constraints all immediate', 'deferred checks pass at commit (owner guard: the demo orgs are gone)');

select tests.as_service();
select is((public.demo_reset() ->> 'organizations')::int, 0, 'a second reset is a no-op');
select tests.clear_auth();

select * from finish();
rollback;

-- P3 privacy regressions (SECURITY-PRIVACY §2.3, C8, C9; PRD US-STO-22 AC2, US-CHA-03 AC3): stores never
-- read the volunteer position or a hidden/approximate charity pin; other volunteers never read a trip;
-- every new RPC is closed to anon and the dispatcher pieces to authenticated.
begin;
\ir ../_helpers.psql

select plan(17);

select tests.create_user('v2');
select tests.add_member('charity_b', 'v2', 'volunteer');
select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.grant_location('charity_volunteer');
select tests.authenticate_as('charity_volunteer');
select public.start_pickup(tests.var('p1')::uuid, gen_random_uuid());
select public.update_pickup_progress(tests.var('p1')::uuid, 10.7700, 106.6900, 12);
select tests.clear_auth();
select tests.make_need('n1', 'site_b', '{bread}', 'loaf', 5);
select tests.make_offer('ob', 'site_a', 'bread', 10);
select tests.reserve('charity_owner', tests.id('n1'), '[["ob", 5]]',
  '{"route_geojson":{"type":"LineString","coordinates":[[106.660172,10.762622],[106.700806,10.776889]]},"route_provider":"fake"}');

-- ---- the store of a stop ----
select tests.authenticate_as('store_staff');
select is_empty(format('select 1 from public.pickups where id = %L', tests.var('p1')), 'store: pickups (and last_location) invisible');
select isnt_empty(format('select eta from public.pickup_stops where pickup_id = %L', tests.var('p1')), 'store: only its stop with the ETA');
select is_empty(format('select 1 from public.pickup_stops where pickup_id = %L and kind = %L', tests.var('p1'), 'dropoff'),
  'store: never the dropoff stop (charity site)');
select is_empty('select 1 from public.need_bundles', 'store: no need_bundles (route starts at the charity pin)');
select throws_ok(format('select * from public.get_site_location(%L)', tests.id('site_b')), 'PT404', 'not_found',
  'store with a live allocation to an approximate charity site: no exact pin (US-CHA-03 AC3)');
select is_empty('select 1 from public.volunteer_profiles', 'store: no volunteer profile');
select tests.clear_auth();
select is_empty($$select column_name from information_schema.columns where table_schema = 'public' and table_name = 'pickup_stops'
                  and udt_name in ('geography', 'geometry')$$, 'pickup_stops has no location column at all');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickups'),
  'pickups (last_location) is never streamed by postgres_changes (Broadcast only, C9)');

-- ---- another volunteer of the same charity ----
select tests.authenticate_as('v2');
select is_empty(format('select 1 from public.pickups where id = %L', tests.var('p1')), 'other volunteer: someone else''s trip is invisible');
select tests.clear_auth();

-- ---- the assignee reads the exact pins of the running trip (US-VOL-05 AC3) ----
select tests.authenticate_as('charity_volunteer');
select isnt_empty(format('select * from public.get_site_location(%L)', tests.id('site_b')), 'assignee: exact dropoff pin of the own charity');
select tests.clear_auth();

-- ---- no position / pin in audit or outbox ----
select is_empty($$select id from public.audit_logs where at >= now() and after::text ~ '10\.77|106\.69|106\.66|10\.76'$$,
  'audit_logs of this flow carry no coordinate');
select is_empty($$select id from public.notification_outbox where created_at >= now() and payload::text ~ '10\.77|106\.69|106\.66|10\.76'$$,
  'outbox rows of this flow carry no coordinate');

-- ---- EXECUTE surface ----
select is_empty($$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in ('publish_need', 'cancel_need', 'match_candidates', 'reserve_bundle',
                    'upsert_volunteer_profile', 'respond_pickup', 'start_pickup', 'update_pickup_progress', 'check_in_stop', 'skip_stop',
                    'cancel_pickup', 'get_pickup_contacts', 'report_incident', 'resolve_incident', 'assign_pickup')
                    and has_function_privilege('anon', p.oid, 'EXECUTE')$$, 'no P3 RPC is executable by anon');
select ok(not has_function_privilege('authenticated', 'public.resolve_recipients(uuid)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.resolve_recipients(uuid)', 'EXECUTE'),
  'resolve_recipients stays service_role only after its P3 re-definition');
select is_empty($$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname in ('charity_cancel_allocation', 'bundle_meta', 'offer_opened_notify_needs',
                    'is_trip_carrier', 'raise_trip_access', 'recompute_etas', 'mask_phone', 'need_recipients', 'volunteer_profiles_before_write')
                    and has_function_privilege('authenticated', p.oid, 'EXECUTE')$$,
  'P3 internal helpers are not executable by authenticated');
select ok((select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""'))
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('publish_need', 'cancel_need', 'match_candidates', 'reserve_bundle',
                 'upsert_volunteer_profile', 'respond_pickup', 'start_pickup', 'update_pickup_progress', 'check_in_stop', 'skip_stop',
                 'cancel_pickup', 'get_pickup_contacts', 'report_incident', 'resolve_incident', 'assign_pickup')),
  'every P3 RPC is security definer with search_path = ''''');
select ok(has_function_privilege('authenticated', 'private.can_see_volunteer(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'private.can_see_volunteer(uuid)', 'EXECUTE'),
  'RLS helper can_see_volunteer: authenticated only');

select * from finish();
rollback;

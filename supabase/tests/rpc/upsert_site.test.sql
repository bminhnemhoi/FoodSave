-- upsert_site (DATA-MODEL §8.2, P1-03, P1-05): owner / scoped manager; strict jsonb keys; service-area
-- bbox (app_settings.service_area_bbox = new TP.HCM incl. former Bình Dương / Bà Rịa–Vũng Tàu);
-- charity default visibility approximate; first site is primary; idempotent; audit without exact
-- location/address.
begin;
\ir ../_helpers.psql

select plan(36);

-- ---- privileges ----
select tests.as_anon();
select throws_ok(format($$select public.upsert_site(%L, '{}', gen_random_uuid())$$, tests.id('store_a')),
  '42501', null, 'anon has no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"X","address_line":"Y","lat":10.77,"lng":106.70}', gen_random_uuid())$$, tests.id('store_a')),
  'PT404', 'not_found', 'unrelated user => not_found');
select tests.authenticate_as('store_staff');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"X","address_line":"Y","lat":10.77,"lng":106.70}', gen_random_uuid())$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'staff cannot manage sites');

-- ---- create (store owner) ----
select tests.authenticate_as('store_owner');
select lives_ok(format($$select public.upsert_site(%L,
  '{"name":" Chi nhánh Bến Thành ","address_line":"12 Lê Lợi","ward":"Phường Bến Thành","lat":10.7725431,"lng":106.6980123,
    "location_source":"geocode","radius_km":3,"accepted_categories":["bread","bread","pastry"]}',
  'f0000000-0000-4000-8000-000000000001')$$, tests.id('store_a')),
  'owner creates a site');
select tests.clear_auth();
select results_eq(
  $$select name, ward, city, visibility, location_source, radius_km, accepted_categories, is_primary, auto_accept_mode
    from public.sites where name = 'Chi nhánh Bến Thành'$$,
  $$values ('Chi nhánh Bến Thành'::text, 'Phường Bến Thành'::text, 'Thành phố Hồ Chí Minh'::text,
            'public'::public.site_visibility, 'geocode'::public.location_source, 3.0::numeric,
            array['bread', 'pastry'], false, 'off'::public.auto_accept_mode)$$,
  'store site stored with defaults (public, city, off) and de-duplicated categories');
select results_eq(
  $$select round(extensions.st_y(location::extensions.geometry)::numeric, 6), round(extensions.st_x(location::extensions.geometry)::numeric, 6)
    from public.sites where name = 'Chi nhánh Bến Thành'$$,
  $$values (10.772543::numeric, 106.698012::numeric)$$,
  'pin stored as geography(Point) rounded to 6 decimals');
select results_eq(
  $$select action, after ? 'address_line', after ? 'lat', after ->> 'location_changed', client_op_id
    from public.audit_logs where action = 'site.create'$$,
  $$values ('site.create'::text, false, false, 'true'::text, 'f0000000-0000-4000-8000-000000000001'::uuid)$$,
  'audited without exact address or coordinates');

-- ---- idempotency ----
select tests.authenticate_as('store_owner');
select is(public.upsert_site(tests.id('store_a'),
  '{"name":" Chi nhánh Bến Thành ","address_line":"12 Lê Lợi","ward":"Phường Bến Thành","lat":10.7725431,"lng":106.6980123,
    "location_source":"geocode","radius_km":3,"accepted_categories":["bread","bread","pastry"]}',
  'f0000000-0000-4000-8000-000000000001'),
  (select id from public.sites where name = 'Chi nhánh Bến Thành'), 'replay returns the same site id');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"Khác","address_line":"Y","lat":10.77,"lng":106.70}',
                                                    'f0000000-0000-4000-8000-000000000001')$$, tests.id('store_a')),
  'PT409', 'idempotency_conflict', 'same op, different payload => idempotency_conflict');
select tests.clear_auth();
select is((select count(*)::int from public.sites where name = 'Chi nhánh Bến Thành'), 1, 'one site after replay');

-- ---- service area ----
select tests.authenticate_as('store_owner');
select is(tests.error_of(format($$select public.upsert_site(%L, '{"name":"Hà Nội","address_line":"Hoàn Kiếm","lat":21.03,"lng":105.85}', gen_random_uuid())$$,
                                tests.id('store_a'))),
  '{"sqlstate":"PT422","message":"validation_failed","detail":"{\"location\": \"out_of_service_area\"}","hint":null}'::jsonb,
  'a Hà Nội point is outside the service area');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"Đảo ngược","address_line":"X","lat":106.70,"lng":10.77}', gen_random_uuid())$$,
                        tests.id('store_a')),
  'PT422', 'validation_failed', 'swapped lat/lng is rejected');
select lives_ok(format($$select public.upsert_site(%L, '{"name":"Vũng Tàu","address_line":"Bãi Trước","lat":10.346,"lng":107.084}', gen_random_uuid())$$,
                       tests.id('store_a')),
  'former Vũng Tàu centre is inside (TP.HCM since 2025)');
select lives_ok(format($$select public.upsert_site(%L, '{"name":"Thủ Dầu Một","address_line":"X","lat":10.980,"lng":106.652}', gen_random_uuid())$$,
                       tests.id('store_a')),
  'former Bình Dương (Thủ Dầu Một) is inside');
select lives_ok(format($$select public.upsert_site(%L, '{"name":"Xuyên Mộc","address_line":"X","lat":10.53,"lng":107.40}', gen_random_uuid())$$,
                       tests.id('store_a')),
  'former Bà Rịa – Vũng Tàu (Xuyên Mộc) is inside');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"Cần Thơ","address_line":"Ninh Kiều","lat":10.03,"lng":105.78}', gen_random_uuid())$$,
                        tests.id('store_a')),
  'PT422', 'validation_failed', 'a Cần Thơ point is outside the service area');
select is((select value from public.app_settings where key = 'service_area_bbox'), '[106.33, 10.30, 107.60, 11.55]'::jsonb,
  'seeded bbox = [minLng, minLat, maxLng, maxLat] of mainland TP.HCM (Côn Đảo excluded)');

-- ---- validation ----
select throws_ok(format($$select public.upsert_site(%L, '{"name":"Thiếu tọa độ","address_line":"X"}', gen_random_uuid())$$, tests.id('store_a')),
  'PT422', 'validation_failed', 'lat/lng required on insert');
select is(tests.error_of(format($$select public.upsert_site(%L, '{"name":"X","address_line":"Y","lat":10.77,"lng":106.70,"district":"Q1"}', gen_random_uuid())$$,
                                tests.id('store_a'))) ->> 'detail',
  '{"unknown_keys": ["district"]}', 'unknown keys are rejected (there is no district any more)');
select is(tests.error_of(format($$select public.upsert_site(%L, '{"name":"X","address_line":"Y","lat":10.77,"lng":106.70,
                                    "visibility":"secret","radius_km":50,"accepted_categories":[],"capacity_kg":-1}', gen_random_uuid())$$,
                                tests.id('store_a'))) ->> 'detail',
  '{"radius_km": "0.5-30", "visibility": "public|approximate|hidden", "capacity_kg": "> 0 and ≤ 1000000, or null", "accepted_categories": "null (all) or 1-50 category codes"}',
  'all field errors are reported together');

-- ---- update keeps unspecified fields ----
select lives_ok(format($$select public.upsert_site(%L, jsonb_build_object('id', %L, 'radius_km', 7.25, 'auto_accept_mode', 'trusted'), gen_random_uuid())$$,
                       tests.id('store_a'), tests.id('site_a')),
  'owner updates radius and auto-accept of site_a');
select tests.clear_auth();
select results_eq(
  $$select name, radius_km, auto_accept_mode, visibility from public.sites where id = tests.id('site_a')$$,
  $$values ('Site site_a'::text, 7.3::numeric, 'trusted'::public.auto_accept_mode, 'public'::public.site_visibility)$$,
  'only the given fields changed (radius rounded to 0.1)');
select is((select after ->> 'location_changed' from public.audit_logs where action = 'site.update'), 'false',
  'update audit says the location did not change');

-- ---- scoped manager ----
update public.org_members set site_ids = array[tests.id('site_a')]
 where org_id = tests.id('store_a') and user_id = tests.id('store_manager');
select tests.authenticate_as('store_manager');
select lives_ok(format($$select public.upsert_site(%L, jsonb_build_object('id', %L, 'name', 'Site A mới'), gen_random_uuid())$$,
                       tests.id('store_a'), tests.id('site_a')),
  'manager scoped to site_a updates it');
select throws_ok(format($$select public.upsert_site(%L, jsonb_build_object('id', %L, 'name', 'X'), gen_random_uuid())$$,
                        tests.id('store_a'), tests.id('site_a_off')),
  'PT403', 'not_authorized', 'scoped manager cannot update another site');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"Mới","address_line":"Y","lat":10.77,"lng":106.70}', gen_random_uuid())$$,
                        tests.id('store_a')),
  'PT403', 'not_authorized', 'scoped manager cannot create sites');
select tests.authenticate_as('store_owner');
select throws_ok(format($$select public.upsert_site(%L, jsonb_build_object('id', %L, 'name', 'X'), gen_random_uuid())$$,
                        tests.id('store_a'), tests.id('site_x')),
  'PT404', 'not_found', 'a site of another org cannot be updated through own org');
select tests.clear_auth();

-- ---- charity defaults, first site primary (draft org from create_organization) ----
select tests.confirm_email('outsider');
select tests.authenticate_as('outsider');
select lives_ok($$select public.create_organization('charity', 'Mái ấm Bình Minh', 'shelter', 'f0000000-0000-4000-8000-0000000000aa')$$,
  'outsider creates a draft charity');
select lives_ok($$select public.upsert_site((select id from public.organizations where name = 'Mái ấm Bình Minh'),
                                            '{"name":"Điểm nhận","address_line":"Hẻm 5","lat":10.80,"lng":106.66}', gen_random_uuid())$$,
  'draft charity owner adds its first site');
select tests.clear_auth();
select results_eq(
  $$select s.visibility, s.is_primary, s.public_location is not null
    from public.sites s join public.organizations o on o.id = s.org_id where o.name = 'Mái ấm Bình Minh'$$,
  $$values ('approximate'::public.site_visibility, true, true)$$,
  'charity default visibility = approximate, first site is primary');
select tests.authenticate_as('outsider');
select lives_ok($$select public.upsert_site((select id from public.organizations where name = 'Mái ấm Bình Minh'),
                                            '{"name":"Điểm 2","address_line":"Hẻm 6","lat":10.81,"lng":106.66,"visibility":"hidden"}', gen_random_uuid())$$,
  'second site');
select tests.clear_auth();
select results_eq(
  $$select s.is_primary, s.public_location is null from public.sites s where s.name = 'Điểm 2'$$,
  $$values (false, true)$$, 'second site not primary; hidden => no public_location');

-- ---- closed / rejected orgs ----
select tests.create_org('rej', 'store', 'outsider', 'rejected');
select tests.authenticate_as('outsider');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"X","address_line":"Y","lat":10.77,"lng":106.70}', gen_random_uuid())$$, tests.id('rej')),
  'PT409', 'invalid_state', 'rejected org cannot add sites');
select tests.authenticate_as('admin', 'aal2');
select throws_ok(format($$select public.upsert_site(%L, '{"name":"X","address_line":"Y","lat":10.77,"lng":106.70}', gen_random_uuid())$$, tests.id('store_a')),
  'PT403', 'not_authorized', 'admin does not edit sites for an org');
select tests.authenticate_as('store_owner');
select throws_ok(format($$update public.sites set radius_km = 9 where id = %L$$, tests.id('site_a')),
  '42501', null, 'sites are not directly writable');
select throws_ok($$select private.service_area_bbox()$$, '42501', null, 'private helper not executable by authenticated');
select tests.clear_auth();

select * from finish();
rollback;

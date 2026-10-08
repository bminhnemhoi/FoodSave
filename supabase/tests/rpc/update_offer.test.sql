-- update_offer + update_offer_quantity (DATA-MODEL §6.1 "Sửa lô", §8.3; PRD US-STO-12).
begin;
\ir ../_helpers.psql

select plan(24);

select tests.make_offer('o_draft', 'site_a', 'bread', 10, p_status => 'draft');
select tests.make_offer('o_open', 'site_a', 'bread', 30, now() - interval '10 minutes', now() + interval '4 hours');
select tests.make_offer('o_held', 'site_a', 'bread', 30, now() - interval '10 minutes', now() + interval '4 hours');
select tests.request('charity_owner', tests.id('o_held'), 20);

-- ---- update_offer: permissions ----
select tests.as_anon();
select throws_ok(format($$select public.update_offer(%L, '{"title":"x"}', gen_random_uuid())$$, tests.id('o_draft')),
  '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.update_offer(%L, '{"title":"Bánh"}', gen_random_uuid())$$, tests.id('o_open')),
  'PT404', 'not_found', 'charity cannot edit a lot');
select tests.authenticate_as('other_owner');
select throws_ok(format($$select public.update_offer(%L, '{"title":"Bánh"}', gen_random_uuid())$$, tests.id('o_open')),
  'PT404', 'not_found', 'another store cannot edit a lot');

-- ---- drafts: any key ----
select tests.authenticate_as('store_staff');
select lives_ok(format($$select public.update_offer(%L, '{"category_code":"cooked_meal","unit":"portion","title":"Cơm hộp gà"}', gen_random_uuid())$$,
                       tests.id('o_draft')), 'draft: category + unit + title');
select results_eq(format($$select category_code, unit::text, unit_weight_kg, weight_source::text from public.offers where id = %L$$, tests.id('o_draft')),
  $$values ('cooked_meal', 'portion', 0.450::numeric, 'category_default')$$,
  'a category-default weight is re-derived for the new category/unit');
select throws_ok(format($$select public.update_offer(%L, '{"unit":"box"}', gen_random_uuid())$$, tests.id('o_draft')),
  'PT422', 'validation_failed', 'non-default unit needs a declared weight');
select lives_ok(format($$select public.update_offer(%L, '{"unit":"box","unit_weight_kg":0.5}', gen_random_uuid())$$, tests.id('o_draft')),
  'box with a declared weight');
select results_eq(format($$select unit::text, unit_weight_kg, weight_source::text from public.offers where id = %L$$, tests.id('o_draft')),
  $$values ('box', 0.500::numeric, 'declared')$$, 'declared weight kept');
select lives_ok(format($$select public.update_offer(%L, '{"quantity": 12}', gen_random_uuid())$$, tests.id('o_draft')),
  'draft quantity editable through update_offer');

-- ---- open without allocations: schedule editable, effective_deadline recomputed (AC1) ----
select lives_ok(format($$select public.update_offer(%L, jsonb_build_object('pickup_end', %L), gen_random_uuid())$$,
                       tests.id('o_open'), to_char(now() + interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF')),
  'open lot without allocation: pickup window editable');
select ok((select abs(extract(epoch from effective_deadline - (now() + interval '2 hours'))) < 1 from public.offers where id = tests.id('o_open')),
  'effective_deadline recomputed to the new window end');
select is(tests.error_of(format($$select public.update_offer(%L, jsonb_build_object('pickup_end', %L), gen_random_uuid())$$,
                                tests.id('o_open'), to_char(now() + interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'))) ->> 'message',
  'validation_failed', 'window after expiry refused (AC5)');
select throws_ok(format($$select public.update_offer(%L, '{"quantity": 5}', gen_random_uuid())$$, tests.id('o_open')),
  'PT422', 'validation_failed', 'open lot: quantity goes through update_offer_quantity');

-- ---- open with allocations: only title/description/photos ----
select lives_ok(format($$select public.update_offer(%L, '{"description":"Bảo quản mát"}', gen_random_uuid())$$, tests.id('o_held')),
  'description editable while held');
select is(tests.error_of(format($$select public.update_offer(%L, '{"expiry":{"date":"2030-01-01"}}', gen_random_uuid())$$, tests.id('o_held'))),
  '{"sqlstate":"PT409","message":"invalid_state","detail":"offer_has_allocations","hint":null}'::jsonb,
  'expiry frozen once the lot has allocations');
select tests.clear_auth();
select results_eq(format($$select action, after -> 'keys' from public.audit_logs where entity_id = %L and action = 'offer.update'$$, tests.id('o_held')),
  $$values ('offer.update'::text, '["description"]'::jsonb)$$, 'audited with the changed keys');

-- ---- update_offer_quantity (AC2) ----
select tests.authenticate_as('store_staff');
select is(tests.error_of(format($$select public.update_offer_quantity(%L, 15, 'hỏng', gen_random_uuid())$$, tests.id('o_held'))),
  '{"sqlstate":"PT422","message":"validation_failed","detail":"{\"qty_committed\": 20.000, \"p_new_quantity\": \"below_committed\"}","hint":null}'::jsonb,
  'AC2: cannot go below the 20 already held');
select throws_ok(format($$select public.update_offer_quantity(%L, 20.5, null, gen_random_uuid())$$, tests.id('o_held')),
  'PT422', 'validation_failed', 'counted unit: integer quantity');
select lives_ok(format($$select public.update_offer_quantity(%L, 20, 'bán bớt', gen_random_uuid())$$, tests.id('o_held')),
  'down to exactly the committed quantity');
select is((select status::text from public.offers where id = tests.id('o_held')), 'fully_allocated', 'nothing left => fully_allocated');
select lives_ok(format($$select public.update_offer_quantity(%L, 25, null, 'e0000000-0000-4000-8000-000000000001')$$, tests.id('o_held')),
  'store adds 5 more');
select lives_ok(format($$select public.update_offer_quantity(%L, 25, null, 'e0000000-0000-4000-8000-000000000001')$$, tests.id('o_held')),
  'replay is a no-op');
select results_eq(format($$select status::text, quantity, qty_available from public.offers where id = %L$$, tests.id('o_held')),
  $$values ('open', 25.000::numeric, 5.000::numeric)$$, 'back to open with 5 available');
select tests.clear_auth();
select is((select count(*)::int from public.audit_logs where entity_id = tests.id('o_held') and action = 'offer.update_quantity'), 2,
  'two quantity changes audited (replay not)');

select * from finish();
rollback;

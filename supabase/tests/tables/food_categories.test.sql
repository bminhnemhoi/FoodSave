-- food_categories + label_rules (DATA-MODEL §2.2, §9.2): everyone reads; admin aal2 maintains
-- food_categories; label_rules is immutable (ADR-005). Reference rows come from seed 00_reference.sql.
begin;
\ir ../_helpers.psql

select plan(22);

select ok((select relrowsecurity from pg_class where oid = 'public.food_categories'::regclass), 'food_categories: RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.label_rules'::regclass), 'label_rules: RLS enabled');
select policies_are('public', 'food_categories',
  array['food_categories_select', 'food_categories_insert_admin', 'food_categories_update_admin']);
select policies_are('public', 'label_rules', array['label_rules_select']);
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'food_categories' and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  array['name_vi', 'default_unit', 'default_unit_weight_kg', 'icon', 'sort_order', 'is_active'],
  'authenticated UPDATE allow-list (code and perishability are not editable)');

-- ---- seed (DATA-MODEL §2.2) ----
select results_eq(
  $$select code, name_vi, perishability::text, default_unit::text, default_unit_weight_kg
    from public.food_categories order by sort_order$$,
  $$values ('bread', 'Bánh mì & bakery', 'cooked', 'loaf', 0.120::numeric),
           ('cooked_meal', 'Cơm hộp & món chế biến', 'cooked', 'portion', 0.450),
           ('pastry', 'Bánh ngọt & dessert', 'cooked', 'piece', 0.100),
           ('vegetables', 'Rau củ tươi', 'fresh', 'kg', 1.000),
           ('fruit', 'Trái cây', 'fresh', 'kg', 1.000),
           ('dairy', 'Sữa & sản phẩm sữa', 'fresh', 'bottle', 0.250),
           ('meat_seafood', 'Thịt & hải sản', 'fresh', 'kg', 1.000),
           ('beverage', 'Đồ uống', 'packaged', 'bottle', 0.500),
           ('dry_goods', 'Đồ khô', 'packaged', 'bag', 0.500)$$,
  'nine Vietnamese categories with perishability, default unit and weight');
select is((select count(*)::int from public.label_rules where version = 1), 3, 'label_rules v1: one row per perishability');

-- ---- reads ----
select tests.as_anon();
select is((select count(*)::int from public.food_categories), 9, 'anon reads the catalogue');
select is((select count(*)::int from public.label_rules), 3, 'anon reads label_rules');
select tests.authenticate_as('outsider');
select is((select count(*)::int from public.food_categories), 9, 'any user reads the catalogue');

-- ---- writes ----
select tests.as_anon();
select throws_ok($$update public.food_categories set name_vi = 'x' where code = 'bread'$$, '42501', null,
  'anon cannot update');
select tests.authenticate_as('store_owner');
select is(tests.affected($$update public.food_categories set name_vi = 'Bánh' where code = 'bread'$$), 0::bigint,
  'store owner: update filtered by RLS (0 rows)');
select throws_ok($$insert into public.food_categories (code, name_vi, perishability, default_unit, default_unit_weight_kg, icon)
                   values ('soup', 'Canh', 'cooked', 'portion', 0.4, 'soup')$$,
  '42501', null, 'store owner cannot insert categories');
select throws_ok($$update public.food_categories set perishability = 'packaged' where code = 'bread'$$, '42501', null,
  'perishability is not in the UPDATE allow-list');
select tests.authenticate_as('admin', 'aal1');
select is(tests.affected($$update public.food_categories set name_vi = 'Bánh' where code = 'bread'$$), 0::bigint,
  'admin aal1 (no MFA): 0 rows');
select tests.authenticate_as('admin', 'aal2');
select is(tests.affected($$update public.food_categories set icon = 'sandwich' where code = 'bread'$$), 1::bigint,
  'admin aal2 updates a category');
select lives_ok($$insert into public.food_categories (code, name_vi, perishability, default_unit, default_unit_weight_kg, icon)
                  values ('soup', 'Canh', 'cooked', 'portion', 0.4, 'soup')$$, 'admin aal2 inserts a category');
select throws_ok($$insert into public.label_rules (version, perishability, green_above, red_below, effective_from)
                   values (2, 'cooked', '10 hours', '3 hours', now())$$,
  '42501', null, 'nobody writes label_rules through the API (migration only)');
select tests.clear_auth();

-- ---- constraints ----
select throws_ok($$insert into public.food_categories (code, name_vi, perishability, default_unit, default_unit_weight_kg, icon)
                   values ('rice_kg', 'Gạo', 'packaged', 'kg', 2, 'wheat')$$,
  '23514', null, 'default unit kg must weigh 1 kg');
select throws_ok($$insert into public.food_categories (code, name_vi, perishability, default_unit, default_unit_weight_kg, icon)
                   values ('Bad-Code', 'X', 'packaged', 'bag', 1, 'wheat')$$,
  '23514', null, 'code format ^[a-z_]{2,32}$');
select throws_ok($$update public.label_rules set red_below = '1 hour' where version = 1 and perishability = 'cooked'$$,
  '42501', 'append_only', 'label_rules is immutable even for postgres');
select throws_ok($$delete from public.label_rules$$, '42501', 'append_only', 'label_rules rows cannot be deleted');

select * from finish();
rollback;

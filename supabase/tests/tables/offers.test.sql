-- offers (DATA-MODEL §2.3, §9.2, §9.4): RLS per role (SM own lots in site scope, CM open lots of
-- approved stores + own allocations, V via trips, admin aal2), draft-only direct writes through the
-- column allow-list, status columns RPC-only (B2-style), triggers and CHECK invariants.
begin;
\ir ../_helpers.psql

select plan(38);

select ok((select relrowsecurity from pg_class where oid = 'public.offers'::regclass), 'RLS enabled');
select policies_are('public', 'offers',
  array['offers_select', 'offers_insert_store', 'offers_update_draft', 'offers_delete_draft', 'offers_select_trip']);
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'offers' and grantee = 'authenticated' and privilege_type = 'INSERT'$$,
  array['org_id', 'site_id', 'category_code', 'title', 'description', 'quantity', 'unit', 'unit_weight_kg',
        'weight_source', 'expires_at', 'expiry_is_date_only', 'pickup_window', 'photo_paths', 'ai_assisted'],
  'INSERT allow-list (no status / qty_committed / effective_deadline)');
select set_eq(
  $$select column_name::text from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'offers' and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  array['title', 'description', 'photo_paths', 'category_code', 'quantity', 'unit', 'unit_weight_kg',
        'weight_source', 'expires_at', 'expiry_is_date_only', 'pickup_window', 'site_id'],
  'UPDATE allow-list');
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'offers' and grantee = 'anon'$$,
  'anon has no privilege on offers');
select has_trigger('public', 'offers', 'guard_privileged_columns', 'layer-two guard trigger on offers');

-- fixtures: an open and a draft lot at site_a (store_a), an open lot at site_x (store_x)
select tests.make_offer('o_open', 'site_a');
select tests.make_offer('o_draft', 'site_a', p_status => 'draft');
select tests.make_offer('o_x', 'site_x');
-- an unapproved charity (B8) and a second store site for store_a restricted to a staff member
select tests.create_user('pending_owner');
select tests.create_org('charity_p', 'charity', 'pending_owner', 'submitted');
select tests.create_site('site_p', 'charity_p', 'approximate');
select tests.create_site('site_a2', 'store_a', 'public', 10.78, 106.69);
select tests.create_user('branch_staff');
insert into public.org_members (org_id, user_id, role, status, site_ids, joined_at)
values (tests.id('store_a'), tests.id('branch_staff'), 'staff', 'active', array[tests.id('site_a2')], now());

-- fixture names of the lots visible to the current role (security_invoker => RLS applies)
create view tests.mine with (security_invoker = true) as
  select i.name from tests.ids i join public.offers o on o.id = i.id;
grant select on tests.mine to anon, authenticated;

-- ---- SELECT matrix ----
select tests.as_anon();
select throws_ok('select id from public.offers', '42501', null, 'anon: no access');
select tests.authenticate_as('outsider');
select is_empty('select * from tests.mine', 'unrelated user: 0 lots');
select tests.authenticate_as('store_staff');
select set_eq('select * from tests.mine', array['o_open', 'o_draft'], 'store staff: own lots (open + draft), not other stores');
select tests.authenticate_as('branch_staff');
select is_empty('select * from tests.mine', 'staff scoped to another branch: sees no lot of site_a');
select tests.authenticate_as('other_owner');
select set_eq('select * from tests.mine', array['o_x'], 'owner of store_x: only its own lot');
select tests.authenticate_as('charity_owner');
select set_eq('select * from tests.mine', array['o_open', 'o_x'], 'approved charity: open lots of approved stores, never drafts');
select tests.authenticate_as('charity_volunteer');
select is_empty('select * from tests.mine', 'volunteer without a trip: 0 lots');
select tests.authenticate_as('pending_owner');
select is_empty('select * from tests.mine', 'B8: member of a submitted charity sees no open lot');
select tests.authenticate_as('admin', 'aal1');
select is_empty('select * from tests.mine', 'admin aal1: 0 lots');
select tests.authenticate_as('admin', 'aal2');
select set_eq('select * from tests.mine', array['o_open', 'o_draft', 'o_x'], 'admin aal2: every lot');

-- charity keeps seeing a lot it holds an allocation on after the lot closed
select tests.clear_auth();
select tests.request('charity_owner', tests.id('o_x'), 2);
update public.offers set status = 'cancelled', closed_at = now() where id = tests.id('o_x');
select tests.authenticate_as('charity_owner');
select set_eq('select * from tests.mine', array['o_open', 'o_x'], 'charity still sees a closed lot it has an allocation on');
select tests.clear_auth();

-- ---- direct writes (drafts only, allow-listed columns) ----
select tests.authenticate_as('store_staff');
select lives_ok(format($$insert into public.offers (org_id, site_id, category_code, title, quantity, unit, expires_at, pickup_window)
                         values (%L, %L, 'bread', 'Bánh mì nháp', 12, 'loaf', now() + interval '1 day',
                                 tstzrange(now(), now() + interval '3 hours'))$$, tests.id('store_a'), tests.id('site_a')),
  'store staff inserts a draft directly (RLS)');
select results_eq(
  $$select status::text, unit_weight_kg, weight_source::text, created_by from public.offers where title = 'Bánh mì nháp'$$,
  format($$values ('draft', 0.120::numeric, 'category_default', %L::uuid)$$, tests.id('store_staff')),
  'defaults: draft, category weight (category_default), created_by = caller');
select throws_ok(format($$insert into public.offers (org_id, site_id, category_code, title, quantity, unit, expires_at, pickup_window, status)
                         values (%L, %L, 'bread', 'x', 1, 'loaf', now() + interval '1 day', tstzrange(now(), now() + interval '1 hour'), 'open')$$,
                        tests.id('store_a'), tests.id('site_a')),
  '42501', null, 'status cannot be inserted');
select throws_ok(format($$insert into public.offers (org_id, site_id, category_code, title, quantity, unit, expires_at, pickup_window)
                         values (%L, %L, 'bread', 'x', 1, 'loaf', now() + interval '1 day', tstzrange(now(), now() + interval '1 hour'))$$,
                        tests.id('store_x'), tests.id('site_x')),
  '42501', null, 'cannot insert a lot for another store (RLS WITH CHECK)');
select is(tests.affected(format($$update public.offers set title = 'Đổi tên' where id = %L$$, tests.id('o_draft'))), 1::bigint,
  'draft title editable');
select is(tests.affected(format($$update public.offers set title = 'Đổi tên' where id = %L$$, tests.id('o_open'))), 0::bigint,
  'open lot: direct UPDATE filtered (RPC only)');
select throws_ok(format($$update public.offers set status = 'open' where id = %L$$, tests.id('o_draft')),
  '42501', null, 'status not updatable directly (B2)');
select throws_ok(format($$update public.offers set qty_committed = 0 where id = %L$$, tests.id('o_draft')),
  '42501', null, 'qty_committed not updatable directly');
select is(tests.affected(format($$delete from public.offers where id = %L$$, tests.id('o_open'))), 0::bigint,
  'open lot cannot be deleted');
select is(tests.affected(format($$delete from public.offers where id = %L$$, tests.id('o_draft'))), 1::bigint,
  'draft can be deleted');
select tests.authenticate_as('other_owner');
select is(tests.affected($$update public.offers set title = 'Hack' where title = 'Bánh mì nháp'$$), 0::bigint,
  'other store cannot edit our draft');
select tests.clear_auth();

-- ---- trigger offers_before_write ----
select throws_ok(format($$insert into public.offers (org_id, site_id, category_code, title, quantity, unit, expires_at, pickup_window, created_by)
                         values (%L, %L, 'bread', 'x', 1, 'loaf', now() + interval '1 day', tstzrange(now(), now() + interval '1 hour'), %L)$$,
                        tests.id('store_a'), tests.id('site_x'), tests.id('store_owner')),
  'PT422', 'validation_failed', 'site must belong to the store org');
select throws_ok(format($$insert into public.offers (org_id, site_id, category_code, title, quantity, unit, expires_at, pickup_window, created_by)
                         values (%L, %L, 'bread', 'x', 1, 'box', now() + interval '1 day', tstzrange(now(), now() + interval '1 hour'), %L)$$,
                        tests.id('store_a'), tests.id('site_a'), tests.id('store_owner')),
  'PT422', 'validation_failed', 'non-default unit needs a declared unit weight');
select throws_ok(format($$insert into public.offers (org_id, site_id, category_code, title, quantity, unit, expires_at, pickup_window, created_by, photo_paths)
                         values (%L, %L, 'bread', 'x', 1, 'loaf', now() + interval '1 day', tstzrange(now(), now() + interval '1 hour'), %L,
                                 array['org/%s/offer/a.webp'])$$,
                        tests.id('store_a'), tests.id('site_a'), tests.id('store_owner'), tests.id('store_x')),
  'PT422', 'validation_failed', 'photo path must be inside org/{own org}/offer/');
select lives_ok(format($$insert into public.offers (org_id, site_id, category_code, title, quantity, unit, unit_weight_kg, expires_at, pickup_window, created_by)
                         values (%L, %L, 'vegetables', 'Rau muống', 2.5, 'kg', 7, now() + interval '1 day', tstzrange(now(), now() + interval '1 hour'), %L)$$,
                        tests.id('store_a'), tests.id('site_a'), tests.id('store_owner')),
  'kg lot with decimals accepted');
select results_eq($$select unit_weight_kg, weight_source::text from public.offers where title = 'Rau muống'$$,
  $$values (1.000::numeric, 'declared')$$, 'unit kg => unit_weight_kg forced to 1 (declared)');

-- ---- CHECK invariants ----
select throws_ok(format($$update public.offers set quantity = 2.5 where id = %L$$, tests.id('o_open')),
  '23514', null, 'counted unit (loaf) must be an integer');
select throws_ok(format($$update public.offers set qty_committed = 11 where id = %L$$, tests.id('o_open')),
  '23514', null, 'qty_committed ≤ quantity');
select throws_ok(format($$update public.offers set effective_deadline = null where id = %L$$, tests.id('o_open')),
  '23514', null, 'published lot needs effective_deadline / attestation / published_at');
select throws_ok(format($$update public.offers set status = 'expired' where id = %L$$, tests.id('o_open')),
  '23514', null, 'closed lot needs closed_at');
select is((select qty_available from public.offers where id = tests.id('o_open')), 10.000::numeric,
  'qty_available = quantity − qty_committed (generated)');

select * from finish();
rollback;

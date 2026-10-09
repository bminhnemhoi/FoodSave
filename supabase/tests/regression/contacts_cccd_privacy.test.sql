-- Contacts + CCCD privacy regressions (B1/B2; SECURITY-PRIVACY §2.2, §10 B3; NĐ 356/2025 Điều 4):
-- FoodSave never stores CCCD images (photos of identity cards are SENSITIVE data); the full CCCD number is
-- never readable outside the admin reveal RPC; hotlines / volunteer phones are never public; every new RPC is
-- closed to anon; no full number or phone reaches audit_logs / outbox.
begin;
\ir ../_helpers.psql

select plan(12);

-- ---- no CCCD image anywhere ----
select is((select array_agg(e::text order by e::text) from unnest(enum_range(null::public.org_doc_type)) as e),
  array['business_license', 'establishment_decision', 'food_safety_cert', 'operating_license', 'other'],
  'KYC document types: no identity-card type (CCCD images are never collected)');
select is_empty($$select column_name from information_schema.columns
                  where table_schema in ('public', 'private')
                    and (column_name ~ '(cccd|id_card|identity).*(image|photo|path|url)' or column_name ~ '(image|photo).*(cccd|id_card)')$$,
  'no column holds a CCCD image / path');
select is_empty($$select column_name from information_schema.columns
                  where table_schema = 'public' and table_name = 'org_sensitive' and column_name ~ 'id_number'$$,
  'org_sensitive never holds the full number (private table only)');

-- ---- private table / org_contacts are not reachable directly ----
select ok(not has_table_privilege('anon', 'private.org_representative_ids', 'SELECT')
          and not has_table_privilege('authenticated', 'private.org_representative_ids', 'SELECT')
          and not has_table_privilege('authenticated', 'private.org_representative_ids', 'INSERT'),
  'private.org_representative_ids: no privilege for anon/authenticated');
select ok(not has_table_privilege('anon', 'public.org_contacts', 'SELECT'), 'org_contacts: anon has no SELECT');
select is_empty($$select column_name from information_schema.columns
                  where table_schema = 'public' and table_name = 'organizations' and column_name ~ 'hotline|phone|email'$$,
  'organizations (anon-readable) has no contact column');
-- ---- EXECUTE surface ----
select is_empty($$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public'
                    and p.proname in ('get_org_contact', 'reveal_trip_contact', 'set_representative_id',
                                      'get_representative_id_summary', 'reveal_representative_id')
                    and has_function_privilege('anon', p.oid, 'EXECUTE')$$,
  'no contact/CCCD RPC is executable by anon');
select is_empty($$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private'
                    and p.proname in ('cccd_province_valid', 'is_valid_cccd', 'mask_cccd', 'trip_is_live',
                                      'org_contacts_before_write', 'org_sensitive_sync_representative_id')
                    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))$$,
  'new private helpers are internal only');

-- ---- no number / phone in audit or outbox ----
update public.profiles set phone = '0987654321' where id = tests.id('charity_volunteer');
select tests.set_var('p1', tests.volunteer_trip('o1')::text);
select tests.authenticate_as('charity_volunteer');
select public.respond_pickup(tests.var('p1')::uuid, true, '', gen_random_uuid());
select public.grant_consent('trip_contact', '2026-10-v2', repeat('e', 64), 'web');
select tests.authenticate_as('store_owner');
select * from public.reveal_trip_contact(tests.var('p1')::uuid);
select tests.authenticate_as('draft_owner');
select public.set_representative_id(tests.id('draft_c'), '079188001234', 'cccd_qr', 'Trần Thị B');
select tests.clear_auth();
select tests.as_service();
select public.purge_retention();
select tests.clear_auth();
select is_empty($$select id from public.audit_logs
                  where (coalesce(after::text, '') || coalesce(before::text, '') || coalesce(reason, '')) ~ '0987654321|079188001234|188001|Trần Thị B'$$,
  'audit_logs never carry the volunteer phone, the CCCD number or the name on the card');
select is_empty($$select id from public.notification_outbox where payload::text ~ '0987654321|079188001234|188001'$$,
  'outbox never carries them either');
select is((select count(*)::int from public.audit_logs where action = 'contact.reveal'), 1, 'the reveal itself is audited');
select ok(private.is_valid_cccd('096000000001') and not private.is_valid_cccd('097000000001')
          and not private.is_valid_cccd(null) and private.mask_cccd(null) is null,
  'province list ends at 096; NULL-safe helpers');

select * from finish();
rollback;

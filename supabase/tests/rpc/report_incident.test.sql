-- report_incident (DATA-MODEL §2.3 incidents, §7 C10, §8.5; PRD US-VOL-13, US-CHA-38): parties of every
-- referenced row only; reporter/subject derived from the caller's side; outbox incident_opened.
begin;
\ir ../_helpers.psql

select plan(31);

select tests.set_var('p1', tests.volunteer_trip('o1')::text);         -- o1 at site_a (store_a), allocation o1_alloc
select tests.create_user('both');
select tests.add_member('store_a', 'both', 'staff');
select tests.add_member('charity_b', 'both', 'staff');
select tests.create_user('loner');

create function tests.ri(p_kind text, p_desc text, p_refs jsonb) returns text language sql stable as $$
  select format('select public.report_incident(%L, %L, %L, gen_random_uuid())', p_kind, p_desc, p_refs);
$$;
grant execute on function tests.ri(text, text, jsonb) to anon, authenticated;

-- ==== who may call / validation ====
select tests.as_anon();
select throws_ok(tests.ri('quality', 'Bánh bị mốc một phần', jsonb_build_object('allocation_id', tests.var('o1_alloc'))), '42501', null, 'anon: no EXECUTE');
select tests.authenticate_as('outsider');
select throws_ok(tests.ri('quality', 'Bánh bị mốc một phần', jsonb_build_object('allocation_id', tests.var('o1_alloc'))), 'PT404', 'not_found',
  'not a party of the allocation: not_found');
select tests.authenticate_as('other_owner');
select throws_ok(tests.ri('quality', 'Bánh bị mốc một phần', jsonb_build_object('allocation_id', tests.var('o1_alloc'))), 'PT404', 'not_found',
  'another store: not_found');
select throws_ok(tests.ri('no_show', 'Không ai tới lấy hàng', jsonb_build_object('pickup_id', tests.var('p1'))), 'PT404', 'not_found',
  'store without a stop on the trip: not_found');
select tests.authenticate_as('both');
select throws_ok(tests.ri('quality', 'Bánh bị mốc một phần', jsonb_build_object('allocation_id', tests.var('o1_alloc'))), 'PT403', 'ambiguous_actor',
  'member of both sides: ambiguous_actor');
select tests.authenticate_as('charity_owner');
select throws_ok(format($$select public.report_incident(null, 'Bánh bị mốc một phần', '{}', gen_random_uuid())$$), 'PT422', 'validation_failed', 'NULL kind refused');
select is((tests.error_of(tests.ri('quality', 'ngắn', jsonb_build_object('allocation_id', tests.var('o1_alloc')))) ->> 'detail')::jsonb,
  '{"p_description":"10-2000 chars"}'::jsonb, 'description 10–2000 chars');
select is((tests.error_of(format($$select public.report_incident('quality', null, '{}', gen_random_uuid())$$)) ->> 'detail')::jsonb,
  '{"p_description":"10-2000 chars"}'::jsonb, 'NULL description refused');
select is((tests.error_of(tests.ri('quality', 'Bánh bị mốc một phần', '{}')) ->> 'detail')::jsonb,
  '{"p_refs":"required unless kind = other"}'::jsonb, 'references required unless kind other');
select is((tests.error_of(tests.ri('quality', 'Bánh bị mốc một phần', '{"proof_id":"00000000-0000-4000-8000-000000000000"}')) ->> 'detail')::jsonb,
  '{"p_refs":{"proof_id":"not_supported_yet"}}'::jsonb, 'proof references arrive with P4');
select is((tests.error_of(tests.ri('quality', 'Bánh bị mốc một phần', '{"allocation_id":"nope","order_id":"x"}')) ->> 'detail')::jsonb,
  '{"p_refs":"unknown_or_invalid","keys":["allocation_id","order_id"]}'::jsonb, 'unknown keys / bad uuids refused');
select throws_ok(tests.ri('quality', 'Bánh bị mốc một phần', jsonb_build_object('allocation_id', gen_random_uuid())), 'PT404', 'not_found',
  'unknown allocation: not_found');

-- ==== store reports quality on its allocation: reporter = store, subject = charity ====
select tests.authenticate_as('store_staff');
select lives_ok(format($$select tests.set_var('i1', public.report_incident('conduct', 'Người nhận nói năng thiếu lịch sự', %L, 'c6500000-0000-4000-8000-000000000001')::text)$$,
                       jsonb_build_object('allocation_id', tests.var('o1_alloc'))), 'store reports on its allocation');
select is(public.report_incident('conduct', 'Người nhận nói năng thiếu lịch sự', jsonb_build_object('allocation_id', tests.var('o1_alloc')),
                                 'c6500000-0000-4000-8000-000000000001')::text, tests.var('i1'), 'replay returns the same incident');
select tests.clear_auth();
select results_eq(format($$select kind::text, status::text, reporter_org_id, subject_org_id, allocation_id, reported_by from public.incidents where id = %L$$, tests.var('i1')),
  format($$values ('conduct', 'open', %L::uuid, %L::uuid, %L::uuid, %L::uuid)$$, tests.id('store_a'), tests.id('charity_b'),
         tests.var('o1_alloc'), tests.id('store_staff')),
  'reporter = store_a, subject = charity_b');
select results_eq(format($$select event::text, urgency, payload ->> 'kind', (payload ->> 'subject_org_id')::uuid from public.notification_outbox where aggregate_id = %L$$, tests.var('i1')),
  format($$values ('incident_opened', 'urgent', 'conduct', %L::uuid)$$, tests.id('charity_b')),
  'outbox incident_opened (urgent: the trip is assigned); no description in the payload');
select ok(not exists (select 1 from public.notification_outbox where aggregate_id = tests.var('i1')::uuid and payload::text like '%lịch sự%'),
  'free text never in the outbox');
select results_eq(format($$select action, org_id from public.audit_logs where entity_id = %L$$, tests.var('i1')),
  format($$values ('incident.report', %L::uuid)$$, tests.id('store_a')), 'audited');

-- ==== charity reports on the same allocation: reporter = charity, subject = store ====
select tests.authenticate_as('charity_owner');
select lives_ok(format($$select tests.set_var('i2', public.report_incident('quantity_dispute', 'Thiếu một ổ bánh khi nhận', %L, gen_random_uuid())::text)$$,
                       jsonb_build_object('allocation_id', tests.var('o1_alloc'), 'offer_id', tests.id('o1'))), 'charity reports on allocation + offer');
select tests.clear_auth();
select results_eq(format($$select reporter_org_id, subject_org_id, offer_id from public.incidents where id = %L$$, tests.var('i2')),
  format($$values (%L::uuid, %L::uuid, %L::uuid)$$, tests.id('charity_b'), tests.id('store_a'), tests.id('o1')),
  'reporter = charity_b, subject = store_a');

-- ==== volunteer reports trouble on the trip (US-VOL-13) ====
select tests.authenticate_as('charity_volunteer');
select lives_ok(format($$select tests.set_var('i3', public.report_incident('other', 'Đường ngập, sẽ tới trễ 20 phút', %L, gen_random_uuid())::text)$$,
                       jsonb_build_object('pickup_id', tests.var('p1'))), 'assignee reports on the trip');
select tests.clear_auth();
select results_eq(format($$select reporter_org_id, subject_org_id, pickup_id from public.incidents where id = %L$$, tests.var('i3')),
  format($$values (%L::uuid, null::uuid, %L::uuid)$$, tests.id('charity_b'), tests.var('p1')),
  'reporter = the charity, no subject (own trip)');
select is((select payload ->> 'pickup_id' from public.notification_outbox where aggregate_id = tests.var('i3')::uuid), tests.var('p1'),
  'payload carries the trip so coordinators are told (GẤP)');

-- ==== store reports a no-show on the trip stopping at its site ====
select tests.authenticate_as('store_owner');
select lives_ok(format($$select tests.set_var('i4', public.report_incident('no_show', 'Đã quá giờ hẹn mà chưa ai tới', %L, gen_random_uuid())::text)$$,
                       jsonb_build_object('pickup_id', tests.var('p1'))), 'store reports a no-show');
select tests.clear_auth();
select results_eq(format($$select reporter_org_id, subject_org_id from public.incidents where id = %L$$, tests.var('i4')),
  format($$values (%L::uuid, %L::uuid)$$, tests.id('store_a'), tests.id('charity_b')), 'no-show: subject = the charity');

-- ==== kind other without references ====
select tests.authenticate_as('loner');
select throws_ok(tests.ri('other', 'Ứng dụng báo lỗi khi mở', '{}'), 'PT403', 'not_authorized', 'without any approved org: not_authorized');
select tests.authenticate_as('charity_owner');
select lives_ok($$select tests.set_var('i5', public.report_incident('other', 'Ứng dụng báo lỗi khi mở', null, gen_random_uuid())::text)$$,
  'kind other without references (NULL refs)');
select tests.clear_auth();
select results_eq(format($$select reporter_org_id, subject_org_id from public.incidents where id = %L$$, tests.var('i5')),
  format($$values (%L::uuid, null::uuid)$$, tests.id('charity_b')), 'reporter = the caller''s approved org');

-- ==== RLS: the subject store reads incidents about it, another store does not ====
select tests.authenticate_as('store_staff');
select ok((select count(*) from public.incidents where id in (tests.var('i2')::uuid, tests.var('i1')::uuid)) = 2,
  'subject/reporter store reads both');
select tests.authenticate_as('other_owner');
select is_empty(format('select 1 from public.incidents where id = %L', tests.var('i2')), 'unrelated store reads nothing');
select tests.clear_auth();

-- rate limit 20 / day / user
insert into public.rate_limits (key, window_start, count)
values ('report_incident:user:' || tests.id('charity_owner'), date_bin('1 day', now(), '2000-01-01 00:00+07'), 20)
on conflict (key, window_start) do update set count = 20;
select tests.authenticate_as('charity_owner');
select is(tests.error_of(tests.ri('other', 'Lần thứ hai mươi mốt', '{}')) ->> 'message', 'rate_limited', '21st report of the day: rate_limited');
select tests.clear_auth();

select * from finish();
rollback;

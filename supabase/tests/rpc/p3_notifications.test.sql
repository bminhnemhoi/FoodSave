-- P3 notifications (DATA-MODEL §12.2; PRD §10 N-06, N-10, N-14…N-16, N-19…N-21, N-31; ROADMAP P3-06):
-- need_published (stores inside the need site radius with a matching category + admins),
-- bundle_options_ready (lot opening for a live need), trip events, incident_opened. Rendered titles
-- and bodies never carry an address, a coordinate, a hidden site distance or the volunteer position.
begin;
\ir ../_helpers.psql

select plan(29);

-- The local DB is shared: park outbox rows left by other runs so only this file's rows are claimed.
update public.notification_outbox set status = 'done', processed_at = now(), locked_until = null
 where status in ('pending', 'processing');

-- ---- isolated cluster (far from other data of the shared local DB) ----
select tests.create_user(n) from unnest(array['n_owner', 'n_staff', 'n_vol', 'n_vol2', 'h_owner', 'a_owner', 'sn_owner', 'sn_scoped',
                                              'sc_owner', 'sf_owner', 'sp_owner', 'sd_owner']) as n;
select tests.create_org('ch_n', 'charity', 'n_owner');
select tests.add_member('ch_n', 'n_staff', 'staff');
select tests.add_member('ch_n', 'n_vol', 'volunteer');
select tests.add_member('ch_n', 'n_vol2', 'volunteer');
update public.profiles set full_name = 'Lê Minh Khoa' where id = tests.id('n_vol');
select tests.create_site('site_n', 'ch_n', 'public', 11.100000, 107.100000);
select tests.create_org('ch_h', 'charity', 'h_owner');
select tests.create_site('site_h', 'ch_h', 'hidden', 11.100500, 107.100500);
select tests.create_org('ch_ap', 'charity', 'a_owner');
select tests.create_site('site_ap', 'ch_ap', 'approximate', 11.101000, 107.099000);
select tests.create_org('st_near', 'store', 'sn_owner');
select tests.create_site('site_sn', 'st_near', 'public', 11.103000, 107.100000);              -- ~330 m from site_n
select tests.create_site('site_sn_far', 'st_near', 'public', 11.400000, 107.400000);
insert into public.org_members (org_id, user_id, role, status, site_ids, joined_at)
values (tests.id('st_near'), tests.id('sn_scoped'), 'staff', 'active', array[tests.id('site_sn_far')], now());
select tests.create_org('st_cat', 'store', 'sc_owner');
select tests.create_site('site_sc', 'st_cat', 'public', 11.102000, 107.101000);
update public.sites set accepted_categories = '{vegetables}' where id = tests.id('site_sc');
select tests.create_org('st_far', 'store', 'sf_owner');
select tests.create_site('site_sf', 'st_far', 'public', 11.200000, 107.100000);               -- ~11 km
select tests.create_org('st_paused', 'store', 'sp_owner');
select tests.create_site('site_sp', 'st_paused', 'public', 11.101000, 107.101000);
update public.organizations set is_paused = true where id = tests.id('st_paused');
select tests.create_org('st_demo', 'store', 'sd_owner');
select tests.create_site('site_sd', 'st_demo', 'public', 11.101500, 107.100500);
update public.organizations set is_demo = true where id = tests.id('st_demo');

create function tests.recips(p_event text, p_agg uuid) returns setof text language sql stable as $$
  select i.name from public.notifications n
  join public.notification_outbox o on o.id = n.outbox_id
  join tests.ids i on i.id = n.user_id
  where o.event = p_event::public.notification_event and o.aggregate_id = p_agg;
$$;
create function tests.note(p_event text, p_agg uuid, p_user text) returns table (title text, body text, link_path text, urgency text) language sql stable as $$
  select n.title, n.body, n.link_path, n.urgency from public.notifications n
  join public.notification_outbox o on o.id = n.outbox_id
  where o.event = p_event::public.notification_event and o.aggregate_id = p_agg and n.user_id = tests.id(p_user);
$$;

-- ==== need_published (N-06) ====
select tests.authenticate_as('n_owner');
select tests.set_var('need1', public.publish_need(tests.id('site_n'), '{bread}', 'loaf', 30, now() + interval '1 day', 40, null, gen_random_uuid())::text);
select tests.set_var('need2', public.publish_need(tests.id('site_n'), '{bread,vegetables}', 'kg', 5, now() + interval '3 hours', null, null, gen_random_uuid())::text);
select tests.authenticate_as('h_owner');
select tests.set_var('needh', public.publish_need(tests.id('site_h'), '{bread}', 'loaf', 10, now() + interval '1 day', null, null, gen_random_uuid())::text);
select tests.authenticate_as('a_owner');
select tests.set_var('needa', public.publish_need(tests.id('site_ap'), '{bread}', 'loaf', 10, now() + interval '1 day', null, null, gen_random_uuid())::text);
select tests.clear_auth();
select public.dispatch_outbox(50);

select set_eq(format($$select * from tests.recips('need_published', %L)$$, tests.var('need1')), array['admin', 'sn_owner'],
  'need_published: admins + stores with a site in the need radius and a matching category (not other-category, far, paused, demo or other-site staff)');
select set_eq(format($$select * from tests.recips('need_published', %L)$$, tests.var('need2')), array['admin', 'sn_owner', 'sc_owner'],
  'categories overlap (vegetables) => that store is told too');
select results_eq(format($$select * from tests.note('need_published', %L, 'sn_owner')$$, tests.var('need1')),
  format($$values ('Nhu cầu mới gần bạn: Bánh mì & bakery', 'Org ch_n cần 30 ổ (Bánh mì & bakery), cách 330 m, cần trước %s.', '/store/connect?need=%s', 'normal')$$,
         private.fmt_vn_time(now() + interval '1 day', now()), tests.var('need1')),
  'store text: charity, quantity, category, crow-fly distance (public site), deadline; link to "Kết nối"');
select results_eq(format($$select title, urgency from tests.note('need_published', %L, 'sn_owner')$$, tests.var('need2')),
  $$values ('GẤP · Nhu cầu mới gần bạn: Bánh mì & bakery / Rau củ tươi', 'urgent')$$, 'needed within 4 h: GẤP');
select results_eq(format($$select title, link_path from tests.note('need_published', %L, 'admin')$$, tests.var('need1')),
  format($$values ('Nhu cầu mới: Org ch_n', '/admin/allocations?need=%s')$$, tests.var('need1')), 'admin text');
select ok((select body from tests.note('need_published', tests.var('needh')::uuid, 'sn_owner')) !~ 'cách',
  'hidden need site: no distance at all in the text');
select ok((select body from tests.note('need_published', tests.var('needa')::uuid, 'sn_owner')) ~ 'cách 1 km,',
  'approximate need site: whole kilometres only');

-- ==== bundle_options_ready (N-10): a matching lot opens for a live need ====
select tests.make_offer('o_new', 'site_sn', 'bread', 15, p_status => 'draft');
select tests.make_offer('o_veg', 'site_sf', 'vegetables', 15, p_status => 'draft', p_unit => 'kg');
select tests.authenticate_as('sn_owner');
select public.publish_offer(tests.id('o_new'), true, gen_random_uuid());
select tests.authenticate_as('sf_owner');
select public.publish_offer(tests.id('o_veg'), true, gen_random_uuid());
select tests.clear_auth();
select set_eq($$select payload ->> 'need_id' from public.notification_outbox where event = 'bundle_options_ready' and status = 'pending'$$,
  array[tests.var('need1'), tests.var('need2'), tests.var('needh'), tests.var('needa')],
  'publish_offer: one bundle_options_ready per live need in radius with the category (not for the far lot)');
select public.dispatch_outbox(50);
select set_eq(format($$select * from tests.recips('bundle_options_ready', %L)$$, tests.var('need1')), array['n_owner', 'n_staff'],
  'recipients: owner/manager/staff of the need''s receiving site');
select results_eq(format($$select title, body, link_path from tests.note('bundle_options_ready', %L, 'n_staff')$$, tests.var('need1')),
  format($$values ('Có lô mới phù hợp nhu cầu', 'Org st_near vừa đăng Lô o_new. Xem phương án ghép bổ sung cho phần còn thiếu.', '/charity/needs?need=%s')$$, tests.var('need1')),
  'bundle_options_ready text');

-- ==== volunteer trip events ====
select tests.make_offer('o_t', 'site_sn', 'bread', 10);
select tests.set_var('a_t', tests.request('n_owner', tests.id('o_t'), 4, 'site_n')::text);
select tests.confirm('sn_owner', tests.var('a_t')::uuid);
select tests.set_var('trip', tests.pickup('n_owner', array[tests.var('a_t')::uuid], 'site_n', 'volunteer', 'n_vol')::text);
select tests.set_var('stop', (select id::text from public.pickup_stops where pickup_id = tests.var('trip')::uuid and kind = 'pickup'));
select tests.authenticate_as('n_vol');
select public.respond_pickup(tests.var('trip')::uuid, true, null, gen_random_uuid());
select public.start_pickup(tests.var('trip')::uuid, gen_random_uuid());
select public.check_in_stop(tests.var('stop')::uuid, 11.1031, 107.1001, gen_random_uuid());
select tests.clear_auth();
select public.dispatch_outbox(50);

select set_eq(format($$select * from tests.recips('volunteer_accepted', %L)$$, tests.var('trip')), array['n_owner', 'n_staff'],
  'volunteer_accepted (N-15): coordinators only');
select results_eq(format($$select title, body from tests.note('volunteer_accepted', %L, 'n_staff')$$, tests.var('trip')),
  $$values ('Tình nguyện viên đã nhận chuyến', 'Lê Minh Khoa đã nhận chuyến lấy hàng.')$$, 'volunteer_accepted text');
select set_eq(format($$select * from tests.recips('pickup_started', %L)$$, tests.var('trip')), array['n_owner', 'n_staff', 'sn_owner'],
  'pickup_started: coordinators + the store of the stop (not the volunteer, not other-site staff)');
select ok((select body from tests.note('pickup_started', tests.var('trip')::uuid, 'sn_owner')) ~ '^Chuyến của Org ch_n đã bắt đầu',
  'store gets the start, with an ETA at most');
select set_eq(format($$select * from tests.recips('volunteer_checked_in', %L)$$, tests.var('trip')), array['n_owner', 'n_staff', 'sn_owner'],
  'volunteer_checked_in (N-16): the store of the stop + coordinators');
select results_eq(format($$select title, link_path from tests.note('volunteer_checked_in', %L, 'sn_owner')$$, tests.var('trip')),
  $$values ('Tình nguyện viên đã tới cửa hàng', '/store/handover')$$, 'store text for the check-in');
select results_eq(format($$select body from tests.note('volunteer_checked_in', %L, 'n_owner')$$, tests.var('trip')),
  $$values ('Đã tới Org st_near.')$$, 'coordinator text (geofence verified)');

-- incident during the trip (N-21 / N-31)
select tests.authenticate_as('n_vol');
select tests.set_var('inc', public.report_incident('other', 'Xe bị thủng lốp, đang sửa', jsonb_build_object('pickup_id', tests.var('trip')), gen_random_uuid())::text);
select tests.authenticate_as('sn_owner');
select tests.set_var('inc2', public.report_incident('quality', 'Tổ chức phản ánh không đúng sự thật', jsonb_build_object('allocation_id', tests.var('a_t')), gen_random_uuid())::text);
select tests.clear_auth();
select public.dispatch_outbox(50);
select set_eq(format($$select * from tests.recips('incident_opened', %L)$$, tests.var('inc')), array['admin', 'n_owner', 'n_staff'],
  'trip incident: admins + coordinators of the trip');
select results_eq(format($$select title, urgency from tests.note('incident_opened', %L, 'n_staff')$$, tests.var('inc')),
  $$values ('GẤP · Sự cố trong chuyến: khác', 'urgent')$$, 'coordinators get it GẤP');
select set_eq(format($$select * from tests.recips('incident_opened', %L)$$, tests.var('inc2')), array['admin', 'n_owner', 'n_staff'],
  'store reports on an allocation: admins + the subject charity (its staff), never the reporter''s name');
select ok((select body from tests.note('incident_opened', tests.var('inc2')::uuid, 'n_owner')) !~ 'đúng sự thật',
  'the free-text description is never in a notification');

-- skip the stop: store + coordinators + volunteer; then re-plan to another volunteer: the first is unassigned
select tests.authenticate_as('n_owner');
select public.skip_stop(tests.var('stop')::uuid, 'Cửa hàng đóng cửa', gen_random_uuid());
select tests.clear_auth();
select public.dispatch_outbox(50);
select set_eq(format($$select i.name from public.notifications n join public.notification_outbox o on o.id = n.outbox_id join tests.ids i on i.id = n.user_id
                       where o.event = 'pickup_cancelled' and o.payload ->> 'scope' = 'stop' and o.aggregate_id = %L$$, tests.var('trip')),
  array['n_owner', 'n_staff', 'n_vol', 'sn_owner'], 'skipped stop: its store, the coordinators and the volunteer');
select results_eq(format($$select n.title from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                           where o.event = 'pickup_cancelled' and o.payload ->> 'scope' = 'stop' and o.aggregate_id = %L and n.user_id = %L$$,
                         tests.var('trip'), tests.id('sn_owner')),
  $$values ('Chuyến sẽ không ghé cửa hàng bạn')$$, 'store text for a skipped stop');

select tests.make_offer('o_t2', 'site_sn', 'bread', 10);
select tests.set_var('a_t2', tests.request('n_owner', tests.id('o_t2'), 2, 'site_n')::text);
select tests.confirm('sn_owner', tests.var('a_t2')::uuid);
select tests.set_var('trip2', tests.pickup('n_owner', array[tests.var('a_t2')::uuid], 'site_n', 'volunteer', 'n_vol')::text);
select tests.authenticate_as('n_vol');
select public.respond_pickup(tests.var('trip2')::uuid, false, 'Bận việc gia đình', gen_random_uuid());
select tests.authenticate_as('n_owner');
select public.assign_pickup(jsonb_build_object('pickup_id', tests.var('trip2'), 'allocation_ids', jsonb_build_array(tests.var('a_t2')),
                            'mode', 'volunteer', 'charity_site_id', tests.id('site_n'), 'assignee_user_id', tests.id('n_vol2')), gen_random_uuid());
select tests.clear_auth();
select public.dispatch_outbox(50);
select results_eq(format($$select title, body from tests.note('volunteer_declined', %L, 'n_owner')$$, tests.var('trip2')),
  $$values ('Tình nguyện viên từ chối chuyến', 'Lê Minh Khoa không thể nhận chuyến. Hãy phân công người khác hoặc tự đến lấy.')$$,
  'volunteer_declined text (the reason stays in audit_logs)');
select set_eq(format($$select * from tests.recips('pickup_assigned', %L)$$, tests.var('trip2')), array['n_vol2'],
  'pickup_assigned after a re-plan: only the current assignee (a stale assignment to n_vol is not delivered)');

-- ==== privacy of every rendered P3 text ====
select is_empty($$select n.title || ' ' || n.body from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                  where o.event in ('need_published', 'bundle_options_ready', 'pickup_started', 'volunteer_accepted', 'volunteer_declined',
                                    'volunteer_checked_in', 'incident_opened', 'pickup_cancelled', 'pickup_assigned')
                    and (n.title || ' ' || n.body) ~ '(1[01]\.[0-9]{3}|10[67]\.[0-9]{2}|Hẻm|Lê Lợi|POINT)'$$,
  'no coordinate and no address in any P3 notification');
select is_empty($$select o.payload from public.notification_outbox o
                  where o.event in ('need_published', 'bundle_options_ready', 'pickup_started', 'volunteer_accepted', 'volunteer_declined',
                                    'volunteer_checked_in', 'incident_opened', 'pickup_cancelled')
                    and (o.payload::text ~ '(1[01]\.[0-9]{3}|10[67]\.[0-9]{2})' or o.payload ? 'reason_text' or o.payload ? 'description')$$,
  'outbox payloads: ids/enums only (no coordinate, no free text)');
select is_empty($$select o.event from public.notification_outbox o where o.status = 'dead' and o.last_error = 'unsupported_event'
                  and o.event in ('need_published', 'bundle_options_ready', 'pickup_started', 'volunteer_accepted', 'volunteer_declined',
                                  'volunteer_checked_in', 'incident_opened')$$,
  'P3 events are no longer dead-lettered as unsupported');
select ok(not private.notify_supported('monthly_report_ready') and not private.notify_supported('proof_submitted'),
  'P4 events are still unsupported (dead-lettered visibly)');

select * from finish();
rollback;

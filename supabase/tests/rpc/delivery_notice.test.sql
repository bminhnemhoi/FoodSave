-- delivery_completed notice to the store (UAT 09/10 m3, P2-29; PRD US-CHA-21 AC2/AC3, N-18; migration
-- 20261009100100_delivery_notice): kg received + lines the charity rejected at dropoff (count, quantity —
-- same unit ⇒ "1 ổ", mixed units ⇒ "≈ 0,7 kg" — and the reason category). Each store only hears about its
-- own lines; the free-text note of a rejected line never reaches the notification; one lot ⇒ link to it.
begin;
\ir ../_helpers.psql

select plan(7);

-- The local DB is shared: park outbox rows left by other runs so only this file's rows are dispatched.
update public.notification_outbox set status = 'done', processed_at = now(), locked_until = null
 where status in ('pending', 'processing');

create function tests.note(p_pickup uuid, p_user text) returns table (title text, body text, link_path text)
language sql stable as $$
  select n.title, n.body, n.link_path from public.notifications n
  join public.notification_outbox o on o.id = n.outbox_id
  where o.event = 'delivery_completed' and o.aggregate_id = p_pickup and n.user_id = tests.id(p_user);
$$;
-- pickup stop handed over in full by p_store_user (carrier = charity_volunteer)
create function tests.hand_over(p_stop uuid, p_store_user text, p_key text) returns void
language plpgsql as $$
begin
  perform tests.issue('charity_volunteer', p_stop, p_key);
  perform tests.authenticate_as(p_store_user);
  perform public.consume_handover_token(tests.var(p_key || '_token'), tests.full_lines(p_stop), gen_random_uuid());
  perform tests.clear_auth();
end;
$$;
-- dropoff of p_pickup confirmed by the charity owner with p_lines
create function tests.drop_off(p_pickup uuid, p_lines jsonb, p_key text) returns void
language plpgsql as $$
begin
  perform tests.issue('charity_volunteer', tests.dropoff_stop(p_pickup), p_key);
  perform tests.authenticate_as('charity_owner');
  perform public.record_dropoff(tests.var(p_key || '_id')::uuid, tests.var(p_key || '_token'), p_lines, gen_random_uuid());
  perform tests.clear_auth();
end;
$$;

-- ---- trip 1: store_a (2 lots, both partly rejected, ổ + kg) and store_x (1 lot, all received) ----
select tests.make_offer('o1', 'site_a', 'bread', 10);        -- ổ, 0.12 kg
select tests.make_offer('o2', 'site_a', 'vegetables', 20);   -- kg
select tests.make_offer('o3', 'site_x', 'bread', 10);
select tests.set_var('a1', tests.request('charity_owner', tests.id('o1'), 5)::text);
select tests.set_var('a2', tests.request('charity_owner', tests.id('o2'), 3)::text);
select tests.set_var('a3', tests.request('charity_owner', tests.id('o3'), 4)::text);
select tests.confirm('store_staff', tests.var('a1')::uuid);
select tests.confirm('store_staff', tests.var('a2')::uuid);
select tests.confirm('other_owner', tests.var('a3')::uuid);
select tests.set_var('p1', tests.pickup('charity_owner', array[tests.var('a1')::uuid, tests.var('a2')::uuid, tests.var('a3')::uuid],
                                        'site_b', 'volunteer', 'charity_volunteer')::text);
select tests.hand_over(tests.stop_of(tests.var('a1')::uuid), 'store_staff', 'k1');
select tests.hand_over(tests.stop_of(tests.var('a3')::uuid), 'other_owner', 'k3');
select tests.drop_off(tests.var('p1')::uuid, jsonb_build_array(
  jsonb_build_object('allocation_id', tests.var('a1'), 'qty', 3, 'reason', 'quality_reject', 'note', 'Bánh mốc ở đáy túi, bé Na phát hiện'),
  jsonb_build_object('allocation_id', tests.var('a2'), 'qty', 2.5, 'reason', 'quality_reject', 'note', 'Rau dập nát'),
  jsonb_build_object('allocation_id', tests.var('a3'), 'qty', 4)), 'd1');

-- ---- trip 2: one lot, 1 of 4 loaves rejected ----
select tests.set_var('p2', tests.volunteer_trip('o4', 4)::text);
select tests.hand_over(tests.stop_of(tests.var('o4_alloc')::uuid), 'store_staff', 'k4');
select tests.drop_off(tests.var('p2')::uuid, jsonb_build_array(
  jsonb_build_object('allocation_id', tests.var('o4_alloc'), 'qty', 3, 'reason', 'quality_reject', 'note', 'Một ổ bị ẩm')), 'd2');

-- ---- trip 3: one lot, everything rejected ----
select tests.set_var('p3', tests.volunteer_trip('o5', 2)::text);
select tests.hand_over(tests.stop_of(tests.var('o5_alloc')::uuid), 'store_staff', 'k5');
select tests.drop_off(tests.var('p3')::uuid, jsonb_build_array(
  jsonb_build_object('allocation_id', tests.var('o5_alloc'), 'qty', 0, 'reason', 'quality_reject', 'note', 'Bánh chua')), 'd3');

select public.dispatch_outbox(50);

select set_eq($$select i.name from public.notifications n
                join public.notification_outbox o on o.id = n.outbox_id
                join tests.ids i on i.id = n.user_id
                where o.event = 'delivery_completed' and o.aggregate_id = tests.var('p1')::uuid$$,
  array['store_owner', 'store_manager', 'store_staff', 'other_owner'],
  'recipients unchanged: staff of every store whose lots were delivered on the trip');
select results_eq($$select * from tests.note(tests.var('p1')::uuid, 'store_owner')$$,
  $$values ('Hàng đã tới tổ chức',
            'Org charity_b đã nhận 2,9 kg thực phẩm từ cửa hàng bạn. 2 dòng hàng bị từ chối khi nhận: ≈ 0,7 kg (không đạt chất lượng). Cảm ơn bạn!',
            '/store/inventory')$$,
  'store with rejected lines: kg received (0.36 + 2.5), 2 rejected lines, mixed units => ≈ kg (2 × 0.12 + 0.5), reason category; 2 lots => inventory');
select results_eq($$select * from tests.note(tests.var('p1')::uuid, 'other_owner')$$,
  format($$values ('Hàng đã tới tổ chức', 'Org charity_b đã nhận 0,5 kg thực phẩm từ cửa hàng bạn. Cảm ơn bạn!', '/store/inventory/%s')$$,
         tests.id('o3')),
  'another store on the same trip only hears about its own lines (none rejected) — text as before; one lot => its page');
select results_eq($$select * from tests.note(tests.var('p2')::uuid, 'store_staff')$$,
  format($$values ('Hàng đã tới tổ chức',
                   'Org charity_b đã nhận 0,4 kg thực phẩm từ cửa hàng bạn. 1 dòng hàng bị từ chối khi nhận: 1 ổ (không đạt chất lượng). Cảm ơn bạn!',
                   '/store/inventory/%s')$$, tests.id('o4')),
  'one unit => quantity in that unit ("1 ổ")');
select results_eq($$select * from tests.note(tests.var('p3')::uuid, 'store_owner')$$,
  format($$values ('Hàng đã tới tổ chức',
                   'Org charity_b không nhận phần hàng nào từ cửa hàng bạn. 1 dòng hàng bị từ chối khi nhận: 2 ổ (không đạt chất lượng).',
                   '/store/inventory/%s')$$, tests.id('o5')),
  'everything rejected: no "đã nhận 0 kg", no thanks');
select ok(not exists (select 1 from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                      where o.event = 'delivery_completed'
                        and o.aggregate_id in (tests.var('p1')::uuid, tests.var('p2')::uuid, tests.var('p3')::uuid)
                        and (n.body ~* 'mốc|bé Na|dập nát|bị ẩm|Bánh chua' or n.title ~* 'mốc|bé Na|dập nát|bị ẩm|Bánh chua'
                             or exists (select 1 from public.handover_lines hl
                                        where hl.note is not null and position(hl.note in n.title || n.body) > 0))),
  'the free-text note of a rejected line never reaches the notification');
select ok(not exists (select 1 from public.notifications n join public.notification_outbox o on o.id = n.outbox_id
                      where o.event = 'delivery_completed' and n.user_id = tests.id('charity_owner')),
  'the charity is not a recipient of delivery_completed');

select * from finish();
rollback;

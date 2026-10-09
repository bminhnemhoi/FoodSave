-- Reference data (every environment, idempotent) — DATA-MODEL §17.
-- P0-12: app_settings. P2: food_categories, label_rules v1, impact_factors v1 (ADR-009).
-- `on conflict do update` refreshes description/is_public but keeps a value an admin already
-- changed through set_app_setting (only the policy versions are migration/seed-owned).

insert into public.app_settings (key, value, description, is_public) values
  ('request_ttl_minutes',            '120',          'Hạn giữ chỗ của yêu cầu (phút): reserved_until = least(now()+ttl, effective_deadline)', false),
  ('proof_due_hours',                '48',           'Hạn nộp minh chứng sau khi nhận (giờ)', false),
  ('proof_reminder_before_hours',    '12',           'Nhắc nộp minh chứng trước hạn (giờ)', false),
  ('handover_token_ttl_minutes',     '15',           'Thời hạn QR/mã 6 số bàn giao (phút)', false),
  ('handover_max_failed_attempts',   '5',            'Số lần nhập sai mã 6 số trước khi khóa', false),
  ('handover_window_grace_minutes',  '30',           'Ân hạn quanh khung lấy cho token pickup (phút)', false),
  ('min_publish_lead_minutes',       '30',           'Thời gian tối thiểu từ lúc đăng tới hạn hiệu lực (phút)', false),
  ('matching_speed_kmh',             '18',           'Tốc độ ước tính khi kiểm khả thi (km/h)', true),
  ('matching_detour_factor',         '1.4',          'Hệ số đường vòng khi kiểm khả thi', true),
  ('matching_buffer_minutes',        '10',           'Thời gian đệm khi kiểm khả thi (phút)', true),
  ('matching_candidate_limit',       '15',           'Số ứng viên tối đa của match_candidates', false),
  ('max_pickup_stops',               '5',            'Số điểm dừng tối đa mỗi chuyến', false),
  ('fairness_wave_count',            '3',            'Số đợt thông báo lô theo công bằng', false),
  ('fairness_wave_minutes',          '5',            'Khoảng cách giữa các đợt thông báo (phút)', false),
  ('geofence_m',                     '100',          'Bán kính check-in tại điểm (m)', false),
  ('location_min_interval_seconds',  '30',           'Khoảng tối thiểu giữa hai lần cập nhật vị trí (giây)', false),
  ('terms_policy_version',           '"2026-10-v2"', 'Phiên bản điều khoản sử dụng (chỉ đổi bằng migration/seed)', true),
  ('privacy_policy_version',         '"2026-10-v2"', 'Phiên bản chính sách bảo mật (chỉ đổi bằng migration/seed)', true),
  ('ai_daily_limit_per_org',         '50',           'Số lượt AI tối đa mỗi tổ chức mỗi ngày', false),
  ('impact_factor_version',          '"v1"',         'Phiên bản hệ số tác động đang dùng (chỉ đổi bằng activate_impact_factors)', true),
  ('ai_enabled',                     'true',         'Công tắc tổng cho mọi tính năng AI', false),
  ('ai_offer_autofill_enabled',      'true',         'AI ảnh → tự điền lô (F-81)', false),
  ('ai_doc_extract_enabled',         'false',        'AI trích xuất giấy tờ (F-82)', false),
  ('ai_proof_check_enabled',         'false',        'AI kiểm minh chứng (F-83)', false),
  ('ai_esg_summary_enabled',         'false',        'AI nhận xét ESG (F-84)', false),
  ('push_enabled',                   'true',         'Gửi thông báo đẩy (tắt thì vẫn in-app + email)', false),
  ('public_map_enabled',             'true',         'Bản đồ hoạt động công khai', true),
  ('signups_enabled',                'true',         'Cho phép đăng ký tổ chức mới', true),
  ('auto_accept_enabled',            'true',         'Cho phép tự động chấp nhận yêu cầu theo cài đặt điểm', false),
  ('demo_reset_enabled',             'true',         'Cho phép demo_reset()', false),
  ('service_area_bbox',              '[106.33, 10.30, 107.60, 11.55]',
                                     'Khung vùng phục vụ [kinh độ min, vĩ độ min, kinh độ max, vĩ độ max]: TP.HCM sau sáp nhập 2025 (gồm Bình Dương, Bà Rịa – Vũng Tàu cũ; phần đất liền; đặc khu Côn Đảo ngoài khơi cố ý không phục vụ). upsert_site từ chối tọa độ ngoài khung', true)
on conflict (key) do update
  set description = excluded.description,
      is_public   = excluded.is_public,
      value       = case
                      when public.app_settings.key in ('terms_policy_version', 'privacy_policy_version')
                        then excluded.value
                      else public.app_settings.value
                    end;

-- ---------------------------------------------------------------------------
-- P2 — food_categories (DATA-MODEL §2.2). Default unit weights are estimates
-- (ESG-METHODOLOGY §2.3); admins may edit them, so a reseed never overwrites (do nothing).
-- ---------------------------------------------------------------------------
insert into public.food_categories (code, name_vi, perishability, default_unit, default_unit_weight_kg, icon, sort_order) values
  ('bread',        'Bánh mì & bakery',        'cooked',   'loaf',    0.120, 'croissant',  10),
  ('cooked_meal',  'Cơm hộp & món chế biến',  'cooked',   'portion', 0.450, 'soup',       20),
  ('pastry',       'Bánh ngọt & dessert',     'cooked',   'piece',   0.100, 'cake-slice', 30),
  ('vegetables',   'Rau củ tươi',             'fresh',    'kg',      1.000, 'carrot',     40),
  ('fruit',        'Trái cây',                'fresh',    'kg',      1.000, 'apple',      50),
  ('dairy',        'Sữa & sản phẩm sữa',      'fresh',    'bottle',  0.250, 'milk',       60),
  ('meat_seafood', 'Thịt & hải sản',          'fresh',    'kg',      1.000, 'beef',       70),
  ('beverage',     'Đồ uống',                 'packaged', 'bottle',  0.500, 'cup-soda',   80),
  ('dry_goods',    'Đồ khô',                  'packaged', 'bag',     0.500, 'wheat',      90)
on conflict (code) do nothing;

-- label_rules version 1 (ADR-005) — hard-coded in public.freshness_label; immutable.
insert into public.label_rules (version, perishability, green_above, red_below, effective_from, note) values
  (1, 'cooked',   interval '12 hours', interval '4 hours',  '2026-10-07 00:00+07', 'Nấu chín / bánh tươi: Xanh > 12 giờ, Vàng 4–12 giờ, Đỏ < 4 giờ'),
  (1, 'fresh',    interval '72 hours', interval '24 hours', '2026-10-07 00:00+07', 'Tươi sống / sữa: Xanh > 72 giờ, Vàng 24–72 giờ, Đỏ < 24 giờ'),
  (1, 'packaged', interval '7 days',   interval '3 days',   '2026-10-07 00:00+07', 'Đóng gói: Xanh > 7 ngày, Vàng 3–7 ngày, Đỏ < 3 ngày')
on conflict (version, perishability) do nothing;

-- impact_factors v1 (ADR-009 Accepted 2026-10-08) — immutable; app_settings.impact_factor_version = 'v1' above.
insert into public.impact_factors (version, metric, value, unit, source_title, source_url, source_page, derivation, valid_from, approved_adr) values
  ('v1', 'co2e_kg_per_kg', 2.0, 'kg CO2e/kg',
   'FAO (2013). Food wastage footprint: Impacts on natural resources — Summary report',
   'https://www.fao.org/4/i3347e/i3347e.pdf', 'tr. 6, tr. 11',
   '3.3 Gt CO2e / 1.6 Gt ≈ 2.06 → 2.0', '2026-10-08', 'docs/adr/ADR-009-esg-factors.md'),
  ('v1', 'water_l_per_kg', 150, 'L/kg',
   'FAO (2013). Food wastage footprint: Impacts on natural resources — Summary report (blue water)',
   'https://www.fao.org/4/i3347e/i3347e.pdf', 'tr. 6, tr. 11',
   '250 km3 / 1.6 Gt ≈ 156 → 150', '2026-10-08', 'docs/adr/ADR-009-esg-factors.md'),
  ('v1', 'kg_per_meal', 0.42, 'kg/suất',
   'WRAP (2020). Reporting amounts of food surplus redistributed: weight and meal equivalents',
   'https://wrap.ngo/system/files/2020-09/WRAP-Expressing%20redistributed%20food%20surplus%20as%20meal%20equivalents%20%28WRAP%20guidance%29.pdf',
   null, 'WRAP 420 g/suất (2381 suất/tấn)', '2026-10-08', 'docs/adr/ADR-009-esg-factors.md')
on conflict (version, metric) do nothing;

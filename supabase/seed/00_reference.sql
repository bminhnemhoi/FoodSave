-- Reference data (every environment, idempotent) — DATA-MODEL §17.
-- P0-12: app_settings. food_categories, label_rules, impact_factors are added in P2.
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
  ('matching_speed_kmh',             '18',           'Tốc độ ước tính khi kiểm khả thi (km/h)', false),
  ('matching_detour_factor',         '1.4',          'Hệ số đường vòng khi kiểm khả thi', false),
  ('matching_buffer_minutes',        '10',           'Thời gian đệm khi kiểm khả thi (phút)', false),
  ('matching_candidate_limit',       '15',           'Số ứng viên tối đa của match_candidates', false),
  ('max_pickup_stops',               '5',            'Số điểm dừng tối đa mỗi chuyến', false),
  ('fairness_wave_count',            '3',            'Số đợt thông báo lô theo công bằng', false),
  ('fairness_wave_minutes',          '5',            'Khoảng cách giữa các đợt thông báo (phút)', false),
  ('geofence_m',                     '100',          'Bán kính check-in tại điểm (m)', false),
  ('location_min_interval_seconds',  '30',           'Khoảng tối thiểu giữa hai lần cập nhật vị trí (giây)', false),
  ('terms_policy_version',           '"2026-10-v1"', 'Phiên bản điều khoản sử dụng (chỉ đổi bằng migration/seed)', true),
  ('privacy_policy_version',         '"2026-10-v1"', 'Phiên bản chính sách bảo mật (chỉ đổi bằng migration/seed)', true),
  ('ai_daily_limit_per_org',         '50',           'Số lượt AI tối đa mỗi tổ chức mỗi ngày', false),
  ('impact_factor_version',          '"v1"',         'Phiên bản hệ số tác động đang dùng (chỉ đổi bằng activate_impact_factors)', false),
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

-- Migration — policy_v2 (B3; SECURITY-PRIVACY §6, §11; DATA-MODEL §2.6 app_settings)
-- Terms / privacy policy 2026-10-v2: org hotline sharing, the volunteer's phone during a trip (opt-in
-- `trip_contact`), the representative's CCCD number (never images, admin-only, 30-day purge after closure),
-- OpenAI listed among processors. Policy versions change only by migration/seed (DATA-MODEL §2.6); the seed
-- (supabase/seed/00_reference.sql) carries the same value so a local reset stays consistent.
-- Signed-in users whose latest `terms` consent has another version see a non-blocking banner; accepting it
-- calls grant_consent('terms', '2026-10-v2', …) (src/lib/legal.ts POLICY_VERSION).

insert into public.app_settings (key, value, description, is_public) values
  ('terms_policy_version',   '"2026-10-v2"', 'Phiên bản điều khoản sử dụng (chỉ đổi bằng migration/seed)', true),
  ('privacy_policy_version', '"2026-10-v2"', 'Phiên bản chính sách bảo mật (chỉ đổi bằng migration/seed)', true)
on conflict (key) do update set value = excluded.value;

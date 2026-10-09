-- Migration — trip_contact_purpose (B1 "Gọi trong chuyến"; DATA-MODEL §1, §11; SECURITY-PRIVACY §6)
-- New consent purpose `trip_contact`: the volunteer opts in (never pre-checked) to let the store of a
-- stop and the trip coordinator reveal their phone number while a trip is running
-- (public.reveal_trip_contact, next migration).
-- Alone in its file on purpose: Postgres cannot use an enum value added by ALTER TYPE … ADD VALUE in the
-- same transaction, and every migration file runs in one transaction.

alter type public.consent_purpose add value if not exists 'trip_contact';

-- Migration 2/13 — enums (DATA-MODEL §1)
-- All enums are created up front so later migrations never need `alter type ... add value`.
-- Declaration order matters (it is the sort order); keep it identical to DATA-MODEL §1.

create type public.platform_role as enum ('user', 'admin');
create type public.org_kind as enum ('store', 'charity');
create type public.org_status as enum (
  'draft', 'submitted', 'needs_changes', 'approved', 'rejected', 'suspended', 'closed'
);
create type public.org_change_status as enum ('pending', 'approved', 'rejected');
create type public.org_role as enum ('owner', 'manager', 'staff', 'volunteer');
create type public.member_status as enum ('invited', 'active', 'removed');
create type public.site_visibility as enum ('public', 'approximate', 'hidden');
create type public.location_source as enum ('pin', 'geocode', 'gps');
create type public.auto_accept_mode as enum ('off', 'all', 'trusted');
create type public.vehicle_type as enum ('motorbike', 'bicycle', 'car', 'on_foot');
create type public.consent_purpose as enum ('terms', 'location_trip', 'proof_photo', 'marketing');
create type public.org_doc_type as enum (
  'business_license', 'food_safety_cert', 'establishment_decision', 'operating_license', 'other'
);
create type public.perishability as enum ('cooked', 'fresh', 'packaged');
create type public.unit_code as enum ('piece', 'loaf', 'box', 'portion', 'bottle', 'bag', 'kg', 'liter');
create type public.weight_source as enum ('declared', 'category_default');
create type public.freshness_label as enum ('green', 'yellow', 'red', 'expired');
create type public.offer_status as enum (
  'draft', 'open', 'fully_allocated', 'completed', 'expired', 'cancelled'
);
create type public.need_status as enum (
  'open', 'partially_matched', 'matched', 'fulfilled', 'closed_partial', 'expired', 'cancelled'
);
create type public.bundle_status as enum ('proposed', 'partially_confirmed', 'confirmed', 'cancelled');
create type public.allocation_status as enum (
  'requested', 'confirmed', 'assigned', 'picked_up', 'delivered', 'cancelled', 'rejected', 'expired'
);
create type public.shortfall_reason as enum ('store_short', 'quality_reject', 'capacity', 'no_show');
create type public.pickup_mode as enum ('volunteer', 'self');
create type public.pickup_status as enum ('planned', 'assigned', 'in_progress', 'completed', 'cancelled');
create type public.handover_kind as enum ('pickup', 'dropoff');
create type public.stop_status as enum ('pending', 'arrived', 'done', 'skipped');
create type public.handover_method as enum ('qr', 'code', 'auto');
create type public.proof_status as enum ('draft', 'submitted', 'approved', 'needs_changes', 'rejected');
create type public.incident_kind as enum (
  'quantity_dispute', 'quality', 'food_safety', 'no_show', 'conduct', 'privacy', 'other'
);
create type public.incident_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.ledger_entry_type as enum ('credit', 'reversal');
create type public.factor_status as enum ('draft', 'active', 'retired');
create type public.outbox_status as enum ('pending', 'processing', 'done', 'dead');
create type public.notify_channel as enum ('in_app', 'push', 'email');
create type public.delivery_status as enum ('sent', 'failed', 'skipped');
create type public.notification_event as enum (
  'offer_published', 'offer_turned_red', 'need_published',
  'allocation_requested', 'allocation_confirmed', 'allocation_rejected', 'allocation_cancelled',
  'allocation_expired', 'bundle_options_ready', 'bundle_confirmed', 'bundle_shortfall',
  'need_responded', 'need_closed', 'offer_expired', 'member_invited',
  'pickup_assigned', 'pickup_cancelled', 'pickup_started', 'pickup_handover_done',
  'delivery_completed', 'proof_due_soon', 'proof_overdue', 'proof_submitted', 'proof_reviewed',
  'org_submitted', 'org_reviewed', 'org_suspended', 'org_reinstated',
  'org_change_submitted', 'org_change_reviewed', 'allocation_packed',
  'volunteer_accepted', 'volunteer_declined', 'volunteer_checked_in', 'thank_you_received',
  'incident_opened', 'monthly_report_ready', 'kyc_purge'
);

comment on type public.platform_role is 'Only service role / migration / grant_platform_admin can set admin (SECURITY-PRIVACY C2, C5).';
comment on type public.org_role is '`volunteer` is only valid for org_kind = charity (trigger private.org_members_guard).';
comment on type public.freshness_label is 'Never stored; computed at read time by freshness_label() (ADR-005).';

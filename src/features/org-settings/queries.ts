import "server-only";

import { cache } from "react";

import type { OrgKind, OrgRole } from "@/core/access/portal";
import type { LocationValue } from "@/features/locations/schemas";
import type { HoursRow } from "@/features/onboarding/hours";
import type { SiteVisibility } from "@/features/onboarding/options";
import { todayInVietnam } from "@/features/onboarding/schemas";
import { requirePortal } from "@/server/auth/guards";
import { createClient } from "@/server/db/supabase";

import type { AutoAcceptMode } from "./schemas";

/**
 * Dữ liệu trang Cài đặt (RSC, client Supabase của NGƯỜI DÙNG — RLS §9.2 áp dụng, không service role).
 * Guard cổng (`requirePortal`) bảo đảm tổ chức `approved` và vai trò đọc từ DB.
 */

export type SettingsContext = {
  kind: OrgKind;
  orgId: string;
  orgName: string;
  userId: string;
  role: OrgRole;
  /** Giới hạn điểm của chính người xem (`null` = mọi điểm). */
  siteIds: string[] | null;
  isPaused: boolean;
  pausedReason: string | null;
  /** Hôm nay theo giờ Việt Nam (YYYY-MM-DD) — tính ở server để client không lệch múi giờ. */
  today: string;
};

function fail(what: string, code: string | undefined): never {
  throw new Error(`Không tải được ${what} (${code ?? "unknown"})`);
}

export const loadSettingsContext = cache(async (kind: OrgKind): Promise<SettingsContext> => {
  const { profile, membership } = await requirePortal(kind);
  const supabase = await createClient();
  const [meRes, orgRes] = await Promise.all([
    supabase
      .from("org_members")
      .select("site_ids")
      .eq("org_id", membership.orgId)
      .eq("user_id", profile.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("organizations").select("is_paused, paused_reason").eq("id", membership.orgId).single(),
  ]);
  if (meRes.error) fail("quyền của bạn", meRes.error.code);
  if (orgRes.error) fail("tổ chức", orgRes.error.code);
  return {
    kind,
    orgId: membership.orgId,
    orgName: membership.org.name,
    userId: profile.id,
    role: membership.role,
    siteIds: meRes.data?.site_ids ?? null,
    isPaused: orgRes.data.is_paused,
    pausedReason: orgRes.data.paused_reason,
    today: todayInVietnam(),
  };
});

// ---------------------------------------------------------------------------
// Hồ sơ
// ---------------------------------------------------------------------------

export type ChangeRequestSummary = {
  id: string;
  status: "pending" | "approved" | "rejected";
  changes: Record<string, string>;
  reason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type ProfileData = {
  name: string;
  subtype: string;
  description: string | null;
  foundedOn: string | null;
  beneficiaries: number | null;
  logoPath: string | null;
  trustScore: number;
  contactEmail: string | null;
  contactPhone: string | null;
  legal: {
    legalName: string | null;
    taxCode: string | null;
    registrationNo: string | null;
    representativeName: string | null;
    representativeTitle: string | null;
    idLast4: string | null;
    idVerifiedAt: string | null;
  };
  /** Đề nghị gần nhất (đang chờ hoặc đã có kết quả), mới nhất trước. */
  changeRequests: ChangeRequestSummary[];
};

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
}

export async function loadProfile(orgId: string): Promise<ProfileData> {
  const supabase = await createClient();
  const [orgRes, sensRes, reqRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, subtype, description, founded_on, declared_beneficiaries, logo_path, trust_score")
      .eq("id", orgId)
      .single(),
    supabase
      .from("org_sensitive")
      .select(
        "legal_name, tax_code, registration_no, representative_name, representative_title, representative_id_last4, id_verified_at, contact_email, contact_phone",
      )
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("org_change_requests")
      .select("id, status, changes, reason, submitted_at, reviewed_at, review_note")
      .eq("org_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(3),
  ]);
  if (orgRes.error) fail("hồ sơ", orgRes.error.code);
  if (sensRes.error) fail("thông tin liên hệ và pháp lý", sensRes.error.code);
  if (reqRes.error) fail("đề nghị sửa thông tin", reqRes.error.code);

  const o = orgRes.data;
  const s = sensRes.data;
  return {
    name: o.name,
    subtype: o.subtype,
    description: o.description,
    foundedOn: o.founded_on,
    beneficiaries: o.declared_beneficiaries,
    logoPath: o.logo_path,
    trustScore: Number(o.trust_score),
    contactEmail: s?.contact_email ?? null,
    contactPhone: s?.contact_phone ?? null,
    legal: {
      legalName: s?.legal_name ?? null,
      taxCode: s?.tax_code ?? null,
      registrationNo: s?.registration_no ?? null,
      representativeName: s?.representative_name ?? null,
      representativeTitle: s?.representative_title ?? null,
      idLast4: s?.representative_id_last4 ?? null,
      idVerifiedAt: s?.id_verified_at ?? null,
    },
    changeRequests: (reqRes.data ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      changes: toStringRecord(r.changes),
      reason: r.reason,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      reviewNote: r.review_note,
    })),
  };
}

// ---------------------------------------------------------------------------
// Điểm, giờ, ngày nghỉ
// ---------------------------------------------------------------------------

export type SettingsSite = {
  id: string;
  name: string;
  isPrimary: boolean;
  ward: string | null;
  city: string;
  /** Vị trí chính xác (get_site_location: thành viên `active` của tổ chức); `null` nếu không đọc được. */
  location: LocationValue | null;
  visibility: SiteVisibility;
  radiusKm: number;
  acceptedCategories: string[] | null;
  capacityKg: number | null;
  /** Cách duyệt yêu cầu nhận lô (chỉ có nghĩa với chi nhánh cửa hàng — DATA-MODEL §2.1). */
  autoAccept: { mode: AutoAcceptMode; minTrust: number };
  hours: HoursRow[];
  closures: { date: string; reason: string | null }[];
};

const SOURCE_FROM_DB = { geocode: "autocomplete", pin: "pin", gps: "gps" } as const;

export async function loadSites(orgId: string, today: string): Promise<SettingsSite[]> {
  const supabase = await createClient();
  const sitesRes = await supabase
    .from("sites")
    .select(
      "id, name, is_primary, ward, city, visibility, radius_km, accepted_categories, capacity_kg, location_source, auto_accept_mode, auto_accept_min_trust",
    )
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (sitesRes.error) fail("danh sách điểm", sitesRes.error.code);
  const sites = sitesRes.data ?? [];
  if (sites.length === 0) return [];
  const ids = sites.map((s) => s.id);

  const [hoursRes, closuresRes, ...locs] = await Promise.all([
    supabase.from("site_hours").select("site_id, dow, opens, closes, closes_next_day").in("site_id", ids),
    supabase
      .from("site_closures")
      .select("site_id, closed_on, reason")
      .in("site_id", ids)
      .gte("closed_on", today)
      .order("closed_on", { ascending: true }),
    ...sites.map((s) => supabase.rpc("get_site_location", { p_site_id: s.id }).maybeSingle()),
  ]);
  if (hoursRes.error) fail("giờ hoạt động", hoursRes.error.code);
  if (closuresRes.error) fail("ngày nghỉ", closuresRes.error.code);

  return sites.map((s, i) => {
    const loc = locs[i]?.data ?? null;
    return {
      id: s.id,
      name: s.name,
      isPrimary: s.is_primary,
      ward: s.ward,
      city: s.city,
      location: loc
        ? {
            lat: loc.lat,
            lng: loc.lng,
            addressLine: (loc.address_line ?? "").slice(0, 200),
            ward: s.ward,
            city: s.city,
            source: SOURCE_FROM_DB[s.location_source],
          }
        : null,
      visibility: s.visibility,
      radiusKm: Number(s.radius_km),
      acceptedCategories: s.accepted_categories,
      capacityKg: s.capacity_kg != null ? Number(s.capacity_kg) : null,
      autoAccept: { mode: s.auto_accept_mode, minTrust: Number(s.auto_accept_min_trust) },
      hours: (hoursRes.data ?? [])
        .filter((h) => h.site_id === s.id)
        .map((h) => ({
          dow: h.dow,
          opens: h.opens.slice(0, 5),
          closes: h.closes.slice(0, 5),
          closes_next_day: h.closes_next_day,
        })),
      closures: (closuresRes.data ?? [])
        .filter((c) => c.site_id === s.id)
        .map((c) => ({ date: c.closed_on, reason: c.reason })),
    };
  });
}

/** Danh sách điểm rút gọn (bộ chọn giới hạn điểm khi mời/sửa thành viên). */
export async function loadSiteOptions(orgId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) fail("danh sách điểm", error.code);
  return data ?? [];
}

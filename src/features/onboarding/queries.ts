import "server-only";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { LocationValue } from "@/features/locations/schemas";
import { POLICY_VERSION } from "@/lib/legal";
import { getViewerContext } from "@/server/auth/guards";
import { createClient } from "@/server/db/supabase";

import type { HoursRow } from "./hours";
import type { DocType, OrgKind, SiteVisibility } from "./options";
import { EMPTY_BASICS, EMPTY_LEGAL, type BasicsForm, type LegalForm } from "./schemas";

/**
 * Nạp hồ sơ nháp cho wizard (RSC, client Supabase của NGƯỜI DÙNG — RLS áp dụng).
 * Chỉ owner sửa được; hồ sơ đã gửi/đã duyệt/bị từ chối ⇒ chuyển tới trang trạng thái hoặc cổng.
 */

export type WizardOrg = {
  id: string;
  status: "draft" | "needs_changes";
  rejectionReason: string | null;
  logoPath: string | null;
  basics: BasicsForm;
  legal: LegalForm;
  /** 4 số cuối CCCD do FoodSave ghi khi xác minh (chỉ đọc). */
  idLast4: string | null;
};

export type WizardSite = {
  id: string;
  name: string;
  location: LocationValue;
  visibility: SiteVisibility;
  radiusKm: number;
  acceptedCategories: string[] | null;
  capacityKg: number | null;
};

export type WizardDocument = {
  id: string;
  docType: DocType;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  storagePath: string;
  /** Tên tệp gốc — chỉ có ngay sau khi tải lên trong phiên này (DB không lưu tên gốc, DATA-MODEL §10). */
  fileName?: string | null;
};

export type WizardData = {
  kind: OrgKind;
  /** Mã lần render: client nhận ra trang được khôi phục từ back/forward cache ⇒ tải lại dữ liệu mới. */
  renderId: string;
  org: WizardOrg | null;
  site: WizardSite | null;
  hours: HoursRow[];
  documents: WizardDocument[];
  /** Đã có đồng ý `terms` đúng phiên bản hiện hành. */
  consentGiven: boolean;
};

const SOURCE_FROM_DB = { geocode: "autocomplete", pin: "pin", gps: "gps" } as const;

function fail(what: string, code: string | undefined): never {
  throw new Error(`Không tải được ${what} (${code ?? "unknown"})`);
}

export const loadWizard = cache(async (kind: OrgKind): Promise<WizardData> => {
  const { profile, memberships } = await getViewerContext(`/onboarding/${kind}`);
  const ownedIds = memberships.filter((m) => m.role === "owner" && m.org.kind === kind).map((m) => m.orgId);
  const base: WizardData = {
    kind,
    renderId: randomUUID(),
    org: null,
    site: null,
    hours: [],
    documents: [],
    consentGiven: false,
  };

  const supabase = await createClient();

  const consentRes = await supabase
    .from("consents")
    .select("policy_version")
    .eq("user_id", profile.id)
    .eq("purpose", "terms")
    .is("withdrawn_at", null)
    .maybeSingle();
  if (consentRes.error) fail("đồng ý của bạn", consentRes.error.code);
  base.consentGiven = consentRes.data?.policy_version === POLICY_VERSION;

  if (ownedIds.length === 0) return base;

  const orgsRes = await supabase
    .from("organizations")
    .select(
      "id, status, name, subtype, description, founded_on, declared_beneficiaries, logo_path, rejection_reason, updated_at",
    )
    .in("id", ownedIds)
    .neq("status", "closed")
    .order("updated_at", { ascending: false });
  if (orgsRes.error) fail("hồ sơ", orgsRes.error.code);
  const orgs = orgsRes.data ?? [];

  const editable = orgs.find((o) => o.status === "draft" || o.status === "needs_changes");
  if (!editable) {
    const other = orgs[0];
    if (!other) return base;
    if (other.status === "approved") redirect(kind === "store" ? "/store" : "/charity");
    // Vừa gửi duyệt (vd. bấm "Gửi duyệt" nhiều lần: trang wizard làm mới và chuyển hướng trước khi action
    // trả về) ⇒ vẫn hiện dòng xác nhận "Đã gửi hồ sơ" như đường đi bình thường (UAT P1-16).
    const justSubmitted =
      other.status === "submitted" && Date.now() - Date.parse(other.updated_at) < 2 * 60_000;
    redirect(`/onboarding/status?org=${encodeURIComponent(other.id)}${justSubmitted ? "&submitted=1" : ""}`);
  }

  const [sensRes, siteRes, docsRes] = await Promise.all([
    supabase
      .from("org_sensitive")
      .select(
        "legal_name, tax_code, registration_no, representative_name, representative_title, representative_id_last4, contact_email, contact_phone",
      )
      .eq("org_id", editable.id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select(
        "id, name, ward, city, visibility, radius_km, accepted_categories, capacity_kg, location_source",
      )
      .eq("org_id", editable.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1),
    supabase
      .from("org_documents")
      .select("id, doc_type, mime_type, size_bytes, uploaded_at, storage_path")
      .eq("org_id", editable.id)
      .is("change_request_id", null)
      .is("file_deleted_at", null)
      .order("uploaded_at", { ascending: true }),
  ]);
  if (sensRes.error) fail("thông tin pháp lý", sensRes.error.code);
  if (siteRes.error) fail("địa điểm", siteRes.error.code);
  if (docsRes.error) fail("giấy tờ", docsRes.error.code);

  const s = sensRes.data;
  base.org = {
    id: editable.id,
    status: editable.status as "draft" | "needs_changes",
    rejectionReason: editable.rejection_reason,
    logoPath: editable.logo_path,
    basics: {
      ...EMPTY_BASICS,
      name: editable.name,
      subtype: editable.subtype,
      description: editable.description ?? "",
      contactPhone: s?.contact_phone ?? "",
      contactEmail: s?.contact_email ?? "",
      beneficiaries: editable.declared_beneficiaries != null ? String(editable.declared_beneficiaries) : "",
      foundedOn: editable.founded_on ?? "",
    },
    legal: {
      ...EMPTY_LEGAL,
      legalName: s?.legal_name ?? "",
      taxCode: s?.tax_code ?? "",
      registrationNo: s?.registration_no ?? "",
      representativeName: s?.representative_name ?? "",
      representativeTitle: s?.representative_title ?? "",
    },
    idLast4: s?.representative_id_last4 ?? null,
  };

  base.documents = (docsRes.data ?? []).map((d) => ({
    id: d.id,
    docType: d.doc_type,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    uploadedAt: d.uploaded_at,
    storagePath: d.storage_path,
  }));

  const site = siteRes.data?.[0];
  if (site) {
    const [locRes, hoursRes] = await Promise.all([
      supabase.rpc("get_site_location", { p_site_id: site.id }).maybeSingle(),
      supabase.from("site_hours").select("dow, opens, closes, closes_next_day").eq("site_id", site.id),
    ]);
    if (locRes.error) fail("vị trí", locRes.error.code);
    if (hoursRes.error) fail("giờ hoạt động", hoursRes.error.code);
    const loc = locRes.data;
    if (loc) {
      base.site = {
        id: site.id,
        name: site.name,
        location: {
          lat: loc.lat,
          lng: loc.lng,
          addressLine: (loc.address_line ?? "").slice(0, 200),
          ward: site.ward,
          city: site.city,
          source: SOURCE_FROM_DB[site.location_source],
        },
        visibility: site.visibility,
        radiusKm: Number(site.radius_km),
        acceptedCategories: site.accepted_categories,
        capacityKg: site.capacity_kg != null ? Number(site.capacity_kg) : null,
      };
    }
    base.hours = (hoursRes.data ?? []).map((h) => ({
      dow: h.dow,
      opens: h.opens.slice(0, 5),
      closes: h.closes.slice(0, 5),
      closes_next_day: h.closes_next_day,
    }));
  }

  return base;
});

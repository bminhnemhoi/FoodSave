import "server-only";

import type { OrgKind, OrgStatus } from "@/core/access/portal";
import { createClient } from "@/server/db/supabase";
import type { Database } from "@/types/database.types";

import { escapeLike } from "./schemas";

/**
 * Đọc dữ liệu hàng đợi duyệt bằng client của Admin (RLS: `private.is_admin()` — aal2). Không dùng
 * service role: nếu phiên rớt về aal1, truy vấn trả rỗng thay vì lộ dữ liệu.
 */

type Enums = Database["public"]["Enums"];

export const PAGE_SIZE = 20;

export type OrgListRow = {
  id: string;
  name: string;
  kind: OrgKind;
  subtype: string;
  status: OrgStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  ward: string | null;
  city: string | null;
  documentsCount: number;
  /** Đã từng được Admin xem xét và nay gửi lại (US-ADM-02 AC2). */
  isResubmission: boolean;
};

export type ListResult<T> = { rows: T[]; total: number; outOfRange: boolean };

function primarySite<T extends { is_primary: boolean }>(sites: T[] | null | undefined): T | undefined {
  return sites?.find((s) => s.is_primary) ?? sites?.[0];
}

export async function listOrganizations(params: {
  statuses: OrgStatus[];
  kind: OrgKind | null;
  q: string;
  page: number;
  order: "waiting" | "recent";
}): Promise<ListResult<OrgListRow>> {
  const supabase = await createClient();
  let query = supabase
    .from("organizations")
    .select(
      "id, name, kind, subtype, status, submitted_at, reviewed_at, rejection_reason, sites(ward, city, is_primary), org_documents(count)",
      { count: "exact" },
    )
    .in("status", params.statuses)
    .is("org_documents.change_request_id", null)
    .is("org_documents.file_deleted_at", null);
  if (params.kind) query = query.eq("kind", params.kind);
  if (params.q) query = query.ilike("name", `%${escapeLike(params.q)}%`);
  query =
    params.order === "waiting"
      ? query.order("submitted_at", { ascending: true, nullsFirst: false }).order("id")
      : query
          .order("reviewed_at", { ascending: false, nullsFirst: false })
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .order("id");

  const from = (params.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error?.code === "PGRST103") return { rows: [], total: 0, outOfRange: true };
  if (error) throw new Error(`Không tải được danh sách hồ sơ (${error.code})`);

  const rows = (data ?? []).map((o): OrgListRow => {
    const site = primarySite(o.sites);
    return {
      id: o.id,
      name: o.name,
      kind: o.kind,
      subtype: o.subtype,
      status: o.status,
      submittedAt: o.submitted_at,
      reviewedAt: o.reviewed_at,
      rejectionReason: o.rejection_reason,
      ward: site?.ward ?? null,
      city: site?.city ?? null,
      documentsCount: o.org_documents[0]?.count ?? 0,
      isResubmission: o.status === "submitted" && o.reviewed_at !== null,
    };
  });
  return { rows, total: count ?? rows.length, outOfRange: false };
}

export type ChangeRequestRow = {
  id: string;
  orgId: string;
  orgName: string;
  kind: OrgKind;
  subtype: string;
  ward: string | null;
  submittedAt: string;
  fields: string[];
};

export async function listPendingChangeRequests(params: {
  kind: OrgKind | null;
  q: string;
  page: number;
}): Promise<ListResult<ChangeRequestRow>> {
  const supabase = await createClient();
  let query = supabase
    .from("org_change_requests")
    .select(
      "id, org_id, submitted_at, changes, organizations!inner(name, kind, subtype, sites(ward, is_primary))",
      {
        count: "exact",
      },
    )
    .eq("status", "pending");
  if (params.kind) query = query.eq("organizations.kind", params.kind);
  if (params.q) query = query.ilike("organizations.name", `%${escapeLike(params.q)}%`);
  const from = (params.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("submitted_at", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error?.code === "PGRST103") return { rows: [], total: 0, outOfRange: true };
  if (error) throw new Error(`Không tải được yêu cầu cập nhật (${error.code})`);

  const rows = (data ?? []).map((r): ChangeRequestRow => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.organizations.name,
    kind: r.organizations.kind,
    subtype: r.organizations.subtype,
    ward: primarySite(r.organizations.sites)?.ward ?? null,
    submittedAt: r.submitted_at,
    fields:
      r.changes && typeof r.changes === "object" && !Array.isArray(r.changes) ? Object.keys(r.changes) : [],
  }));
  return { rows, total: count ?? rows.length, outOfRange: false };
}

/** Số mục cần xử lý cho các tab (hồ sơ chờ duyệt, yêu cầu cập nhật đang chờ). */
export async function countPending(): Promise<{ submitted: number; changes: number }> {
  const supabase = await createClient();
  const [orgs, changes] = await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("org_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return { submitted: orgs.count ?? 0, changes: changes.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Chi tiết hồ sơ
// ---------------------------------------------------------------------------

export type ReviewDocument = {
  id: string;
  docType: Enums["org_doc_type"];
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  changeRequestId: string | null;
  purgeAfter: string | null;
  deleted: boolean;
};

export type ReviewSite = {
  id: string;
  name: string;
  isPrimary: boolean;
  isActive: boolean;
  ward: string | null;
  city: string;
  visibility: Enums["site_visibility"];
  radiusKm: number;
  capacityKg: number | null;
  acceptedCategories: string[] | null;
  locationSource: Enums["location_source"];
  /** Tọa độ/địa chỉ chính xác qua `get_site_location` (admin aal2); null nếu không đọc được. */
  exact: { lat: number; lng: number; address: string } | null;
  hours: { dow: number; opens: string; closes: string; closesNextDay: boolean }[];
};

export type ReviewHistoryEntry = {
  id: number;
  at: string;
  action: string;
  actorKind: string;
  actorName: string | null;
  after: unknown;
  reason: string | null;
};

export type ReviewChangeRequest = {
  id: string;
  status: Enums["org_change_status"];
  changes: unknown;
  previous: unknown;
  reason: string | null;
  submittedAt: string;
  submittedByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
};

export type OrgReviewDetail = {
  org: {
    id: string;
    name: string;
    kind: OrgKind;
    subtype: string;
    status: OrgStatus;
    description: string | null;
    website: string | null;
    foundedOn: string | null;
    declaredBeneficiaries: number | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedByName: string | null;
    rejectionReason: string | null;
    trustScore: number;
    isDemo: boolean;
    createdAt: string;
    createdBy: string;
  };
  legal: {
    legalName: string | null;
    taxCode: string | null;
    registrationNo: string | null;
    representativeName: string | null;
    representativeTitle: string | null;
    representativeIdLast4: string | null;
    idVerifiedAt: string | null;
    idVerificationMethod: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  } | null;
  owners: { userId: string; name: string }[];
  memberIds: string[];
  sites: ReviewSite[];
  documents: ReviewDocument[];
  consents: {
    purpose: Enums["consent_purpose"];
    policyVersion: string;
    grantedAt: string;
    withdrawnAt: string | null;
  }[];
  changeRequests: ReviewChangeRequest[];
  history: ReviewHistoryEntry[];
};

/** Toàn bộ dữ liệu một hồ sơ cho Admin; `null` khi không tồn tại (hoặc RLS chặn). */
export async function getOrgReviewDetail(orgId: string): Promise<OrgReviewDetail | null> {
  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select(
      "id, name, kind, subtype, status, description, website, founded_on, declared_beneficiaries, submitted_at, reviewed_at, rejection_reason, trust_score, is_demo, created_at, created_by, reviewer:profiles!organizations_reviewed_by_fkey(full_name)",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (orgError) throw new Error(`Không tải được hồ sơ (${orgError.code})`);
  if (!org) return null;

  const [sensitiveRes, membersRes, sitesRes, docsRes, changesRes, historyRes] = await Promise.all([
    supabase
      .from("org_sensitive")
      .select(
        "legal_name, tax_code, registration_no, representative_name, representative_title, representative_id_last4, id_verified_at, id_verification_method, contact_email, contact_phone",
      )
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select("user_id, role, profiles!org_members_user_id_fkey(full_name)")
      .eq("org_id", orgId)
      .eq("status", "active"),
    supabase
      .from("sites")
      .select(
        "id, name, is_primary, is_active, ward, city, visibility, radius_km, capacity_kg, accepted_categories, location_source, site_hours(dow, opens, closes, closes_next_day)",
      )
      .eq("org_id", orgId)
      .order("is_primary", { ascending: false })
      .order("created_at"),
    supabase
      .from("org_documents")
      .select(
        "id, doc_type, mime_type, size_bytes, uploaded_at, change_request_id, purge_after, file_deleted_at",
      )
      .eq("org_id", orgId)
      .order("uploaded_at"),
    supabase
      .from("org_change_requests")
      .select(
        "id, status, changes, previous, reason, submitted_at, reviewed_at, review_note, submitter:profiles!org_change_requests_submitted_by_fkey(full_name), reviewer:profiles!org_change_requests_reviewed_by_fkey(full_name)",
      )
      .eq("org_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("audit_logs")
      .select("id, at, action, actor_kind, after, reason, actor:profiles!audit_logs_actor_id_fkey(full_name)")
      .eq("org_id", orgId)
      .order("at", { ascending: false })
      .limit(50),
  ]);

  for (const res of [sensitiveRes, membersRes, sitesRes, docsRes, changesRes, historyRes]) {
    if (res.error) throw new Error(`Không tải được chi tiết hồ sơ (${res.error.code})`);
  }

  const members = membersRes.data ?? [];
  const owners = members
    .filter((m) => m.role === "owner")
    .map((m) => ({ userId: m.user_id, name: m.profiles?.full_name?.trim() || "Chủ hồ sơ" }));

  const [consentsRes, ...locations] = await Promise.all([
    owners.length
      ? supabase
          .from("consents")
          .select("purpose, policy_version, granted_at, withdrawn_at")
          .in(
            "user_id",
            owners.map((o) => o.userId),
          )
          .order("granted_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    ...(sitesRes.data ?? []).map((s) => supabase.rpc("get_site_location", { p_site_id: s.id })),
  ]);
  if (consentsRes.error) throw new Error(`Không tải được bản ghi đồng ý (${consentsRes.error.code})`);

  const s = sensitiveRes.data;
  return {
    org: {
      id: org.id,
      name: org.name,
      kind: org.kind,
      subtype: org.subtype,
      status: org.status,
      description: org.description,
      website: org.website,
      foundedOn: org.founded_on,
      declaredBeneficiaries: org.declared_beneficiaries,
      submittedAt: org.submitted_at,
      reviewedAt: org.reviewed_at,
      reviewedByName: org.reviewer?.full_name?.trim() || null,
      rejectionReason: org.rejection_reason,
      trustScore: Number(org.trust_score),
      isDemo: org.is_demo,
      createdAt: org.created_at,
      createdBy: org.created_by,
    },
    legal: s
      ? {
          legalName: s.legal_name,
          taxCode: s.tax_code,
          registrationNo: s.registration_no,
          representativeName: s.representative_name,
          representativeTitle: s.representative_title,
          representativeIdLast4: s.representative_id_last4,
          idVerifiedAt: s.id_verified_at,
          idVerificationMethod: s.id_verification_method,
          contactEmail: s.contact_email,
          contactPhone: s.contact_phone,
        }
      : null,
    owners,
    memberIds: members.map((m) => m.user_id),
    sites: (sitesRes.data ?? []).map((site, i): ReviewSite => {
      const loc = locations[i];
      const exact = loc && !loc.error ? loc.data?.[0] : undefined;
      return {
        id: site.id,
        name: site.name,
        isPrimary: site.is_primary,
        isActive: site.is_active,
        ward: site.ward,
        city: site.city,
        visibility: site.visibility,
        radiusKm: Number(site.radius_km),
        capacityKg: site.capacity_kg === null ? null : Number(site.capacity_kg),
        acceptedCategories: site.accepted_categories,
        locationSource: site.location_source,
        exact: exact ? { lat: exact.lat, lng: exact.lng, address: exact.address_line } : null,
        hours: (site.site_hours ?? [])
          .map((h) => ({ dow: h.dow, opens: h.opens, closes: h.closes, closesNextDay: h.closes_next_day }))
          .sort((a, b) => a.dow - b.dow || a.opens.localeCompare(b.opens)),
      };
    }),
    documents: (docsRes.data ?? []).map((d) => ({
      id: d.id,
      docType: d.doc_type,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes,
      uploadedAt: d.uploaded_at,
      changeRequestId: d.change_request_id,
      purgeAfter: d.purge_after,
      deleted: d.file_deleted_at !== null,
    })),
    consents: (consentsRes.data ?? []).map((c) => ({
      purpose: c.purpose,
      policyVersion: c.policy_version,
      grantedAt: c.granted_at,
      withdrawnAt: c.withdrawn_at,
    })),
    changeRequests: (changesRes.data ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      changes: r.changes,
      previous: r.previous,
      reason: r.reason,
      submittedAt: r.submitted_at,
      submittedByName: r.submitter?.full_name?.trim() || null,
      reviewedAt: r.reviewed_at,
      reviewedByName: r.reviewer?.full_name?.trim() || null,
      reviewNote: r.review_note,
    })),
    history: (historyRes.data ?? []).map((h) => ({
      id: h.id,
      at: h.at,
      action: h.action,
      actorKind: h.actor_kind,
      actorName: h.actor?.full_name?.trim() || null,
      after: h.after,
      reason: h.reason,
    })),
  };
}

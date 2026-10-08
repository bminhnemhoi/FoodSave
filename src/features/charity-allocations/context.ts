import "server-only";

import { cache } from "react";

import type { OrgRole } from "@/core/access/portal";
import type { LatLng } from "@/core/geo/types";
import { parseEwkbPoint } from "@/features/pickups/geo";
import { requirePortal } from "@/server/auth/guards";
import { createClient } from "@/server/db/supabase";

/**
 * Ngữ cảnh cổng Tổ chức dùng chung cho Tổng quan, Kho tặng, Chuyến (RSC, client của NGƯỜI DÙNG — RLS §9.2).
 * Vai trò và phạm vi điểm (`org_members.site_ids`) đọc từ DB; chỉ liệt kê điểm nhận người xem được thao tác.
 */

export type ReceivingSite = {
  id: string;
  name: string;
  radiusKm: number;
  visibility: "public" | "approximate" | "hidden";
  acceptedCategories: string[] | null;
  ward: string | null;
  isPrimary: boolean;
  /** Toạ độ công khai (chính xác khi `public`, lưới gần đúng khi `approximate`, null khi `hidden`). */
  publicLocation: LatLng | null;
};

export type CharityContext = {
  orgId: string;
  orgName: string;
  userId: string;
  role: OrgRole;
  /** owner/manager mới hủy được yêu cầu (`cancel_allocation`, DATA-MODEL §7 C1–C2). */
  canCancel: boolean;
  isPaused: boolean;
  pausedReason: string | null;
  /** Điểm nhận đang hoạt động mà người xem có quyền (điểm chính trước). */
  sites: ReceivingSite[];
};

function fail(what: string, code: string | undefined): never {
  throw new Error(`Không tải được ${what} (${code ?? "unknown"})`);
}

export const loadCharityContext = cache(async (): Promise<CharityContext> => {
  const { profile, membership } = await requirePortal("charity");
  const supabase = await createClient();
  const [meRes, orgRes, sitesRes] = await Promise.all([
    supabase
      .from("org_members")
      .select("site_ids")
      .eq("org_id", membership.orgId)
      .eq("user_id", profile.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("is_paused, paused_reason")
      .eq("id", membership.orgId)
      .maybeSingle(),
    supabase
      .from("sites")
      .select(
        "id, name, radius_km, visibility, accepted_categories, ward, is_primary, public_location, created_at",
      )
      .eq("org_id", membership.orgId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);
  if (meRes.error) fail("quyền của bạn", meRes.error.code);
  if (orgRes.error) fail("tổ chức", orgRes.error.code);
  if (sitesRes.error) fail("điểm nhận", sitesRes.error.code);

  const scope = meRes.data?.site_ids ?? null;
  const sites: ReceivingSite[] = (sitesRes.data ?? [])
    .filter((s) => scope === null || scope.includes(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      radiusKm: Number(s.radius_km),
      visibility: s.visibility,
      acceptedCategories: s.accepted_categories,
      ward: s.ward,
      isPrimary: s.is_primary,
      publicLocation: parseEwkbPoint(s.public_location as unknown as string | null),
    }));

  return {
    orgId: membership.orgId,
    orgName: membership.org.name,
    userId: profile.id,
    role: membership.role,
    canCancel: membership.role === "owner" || membership.role === "manager",
    isPaused: orgRes.data?.is_paused ?? false,
    pausedReason: orgRes.data?.paused_reason ?? null,
    sites,
  };
});

/**
 * Mốc "bây giờ" của request (ms) — một giá trị cho cả trang (đếm ngược, nhãn tươi render ở server rồi
 * client tiếp tục từ đó, tránh lệch hydrate).
 */
export const requestNow = cache((): number => Date.now());

/** Toạ độ chính xác của điểm nhận của chính tổ chức (`get_site_location`, thành viên được phép). */
export async function loadExactLocation(siteId: string): Promise<LatLng | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_site_location", { p_site_id: siteId });
  if (error || !data?.[0]) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lng) };
}

"use server";

import { z } from "zod";

import { mapRpcError, RPC_MESSAGES, type ActionError, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { TRIP_CONTACT_MESSAGES } from "./messages";

/**
 * Liên hệ giữa các bên (B1). Hai RPC `security definer` quyết định ai thấy gì (DATA-MODEL §8.2, §8.5):
 * - `get_org_contact`: hotline của tổ chức ĐÃ DUYỆT — gọi theo yêu cầu (khi người dùng mở ô "Liên hệ"), không
 *   tải hàng loạt trên trang danh sách (giới hạn 60 lần/giờ mỗi người);
 * - `reveal_trip_contact`: SĐT tình nguyện viên cho đúng các bên của chuyến đang chạy, chỉ khi TNV đã bật
 *   `trip_contact`; mỗi lần xem ghi nhật ký (10 lần/giờ).
 * Không ghi log số điện thoại; log lỗi chỉ gồm mã Postgres.
 */

export type OrgContact = { orgId: string; orgName: string; phone: string | null; email: string | null };
export type TripVolunteerContact = { volunteerName: string; phone: string | null };

const orgInput = z.object({ orgId: z.uuid() });
const tripInput = z.object({ pickupId: z.uuid() });

function fail(error: ActionError): { ok: false; error: ActionError } {
  return { ok: false, error };
}

const invalid = () => fail({ code: "validation_failed", message: RPC_MESSAGES.invalid });
const unauthenticated = () => fail({ code: "unauthenticated", message: RPC_MESSAGES.unauthenticated });

export async function getOrgContact(input: z.input<typeof orgInput>): Promise<ActionResult<OrgContact>> {
  const parsed = orgInput.safeParse(input);
  if (!parsed.success) return invalid();
  if (!(await getUser())) return unauthenticated();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_org_contact", { p_org_id: parsed.data.orgId });
  if (error) {
    const mapped = mapRpcError(error, {
      not_found:
        "Chưa xem được liên hệ của tổ chức này: chỉ hiện cho cửa hàng, tổ chức đã được duyệt và tình nguyện viên đang chạy chuyến qua đây.",
    });
    if (mapped.code === "server_error") console.error("[contacts] get_org_contact", { code: error.code });
    return fail(mapped);
  }
  const row = data?.[0];
  if (!row) return fail({ code: "not_found", message: RPC_MESSAGES.notFound });
  return {
    ok: true,
    data: {
      orgId: row.org_id,
      orgName: row.org_name,
      phone: row.hotline_phone ?? null,
      email: row.hotline_email ?? null,
    },
  };
}

export async function revealTripContact(
  input: z.input<typeof tripInput>,
): Promise<ActionResult<TripVolunteerContact>> {
  const parsed = tripInput.safeParse(input);
  if (!parsed.success) return invalid();
  if (!(await getUser())) return unauthenticated();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_trip_contact", { p_pickup_id: parsed.data.pickupId });
  if (error) {
    if (error.code === "PT403" && error.details === "no_consent")
      return fail({ code: "no_consent", message: TRIP_CONTACT_MESSAGES.noConsent });
    if (error.code === "PT409" && error.details === "trip_not_active")
      return fail({ code: "trip_not_active", message: TRIP_CONTACT_MESSAGES.notActive });
    if (error.code === "PT409" && error.details === "no_volunteer")
      return fail({ code: "no_volunteer", message: TRIP_CONTACT_MESSAGES.noVolunteer });
    const mapped = mapRpcError(error, { not_found: TRIP_CONTACT_MESSAGES.notFound });
    if (mapped.code === "server_error") console.error("[contacts] reveal_trip_contact", { code: error.code });
    return fail(mapped);
  }
  const row = data?.[0];
  if (!row) return fail({ code: "not_found", message: TRIP_CONTACT_MESSAGES.notFound });
  return {
    ok: true,
    data: { volunteerName: row.volunteer_name ?? "Tình nguyện viên", phone: row.phone ?? null },
  };
}

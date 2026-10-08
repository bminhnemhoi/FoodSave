"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { sha256Hex } from "@/lib/hash";
import { RPC_MESSAGES, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { LOCATION_POLICY_VERSION, locationConsentText } from "./consent";
import { mapTripError, type TripOp } from "./errors";
import type { CheckResult } from "./geolocation";
import { INCIDENT_KIND_LABEL } from "./labels";
import {
  checkInSchema,
  consentSchema,
  incidentSchema,
  profileFormSchema,
  respondSchema,
  skipSchema,
  startSchema,
  toProfilePayload,
  type ProfileFormInput,
} from "./schemas";

/**
 * Server Action của tình nguyện viên (PRD US-VOL-01…13; DATA-MODEL §6.5, §8.5). zod → client Supabase của
 * NGƯỜI DÙNG → RPC `security definer` (quyền + máy trạng thái kiểm ở DB) → lỗi tiếng Việt. `clientOpId` sinh ở
 * client một lần cho mỗi ý định (gửi lại cùng id ⇒ DB không ghi hai lần).
 *
 * Không ghi log toạ độ hay lý do; log lỗi chỉ gồm mã Postgres.
 */

type Fail = { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string> } };

const invalid = (fieldErrors?: Record<string, string>): Fail => ({
  ok: false,
  error: { code: "validation_failed", message: RPC_MESSAGES.invalid, fieldErrors },
});
const unauthenticated = (): Fail => ({
  ok: false,
  error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated },
});

function dbFail(
  err: { code?: string; message?: string; details?: string | null; hint?: string | null },
  op: TripOp,
  rpc: string,
): Fail {
  const mapped = mapTripError(err, op);
  if (mapped.code === "server_error") console.error("[volunteer] db error", { rpc, code: err.code });
  return { ok: false, error: mapped };
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

/** Mọi màn TNV (Hôm nay, Chuyến, chi tiết chuyến, Tài khoản) dùng chung layout `/volunteer`. */
function refreshVolunteer() {
  revalidatePath("/volunteer", "layout");
}

// ---------------------------------------------------------------------------
// Nhận / từ chối / bắt đầu chuyến (US-VOL-04, §6.5)
// ---------------------------------------------------------------------------

export async function respondToTrip(
  input: z.input<typeof respondSchema>,
): Promise<ActionResult<{ accepted: boolean }>> {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
  if (!(await getUser())) return unauthenticated();

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_pickup", {
    p_pickup_id: v.pickupId,
    p_accept: v.accept,
    p_reason: v.accept ? "" : v.reason,
    p_client_op_id: v.clientOpId,
  });
  if (error) return dbFail(error, "respond", "respond_pickup");
  refreshVolunteer();
  return { ok: true, data: { accepted: v.accept } };
}

export async function startTrip(input: z.input<typeof startSchema>): Promise<ActionResult<null>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!(await getUser())) return unauthenticated();

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_pickup", {
    p_pickup_id: parsed.data.pickupId,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) return dbFail(error, "start", "start_pickup");
  refreshVolunteer();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Check-in, bỏ qua điểm (US-VOL-06, C6)
// ---------------------------------------------------------------------------

type CheckInJson = {
  arrived?: boolean;
  distance_m?: number | null;
  check?: string | null;
  reason_required?: boolean;
};

export async function checkInStop(input: z.input<typeof checkInSchema>): Promise<ActionResult<CheckResult>> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
  if (!(await getUser())) return unauthenticated();

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_stop", {
    p_stop_id: v.stopId,
    // RPC nhận null cho cả hai toạ độ (check-in không vị trí) dù kiểu sinh ra là number
    p_lat: (v.position?.lat ?? null) as number,
    p_lng: (v.position?.lng ?? null) as number,
    p_client_op_id: v.clientOpId,
    ...(v.reason ? { p_reason: v.reason } : {}),
  });
  if (error) return dbFail(error, "check_in", "check_in_stop");

  const r = (data ?? {}) as CheckInJson;
  const check = r.check === "geofence" || r.check === "manual" || r.check === "no_location" ? r.check : null;
  if (r.arrived) refreshVolunteer();
  return {
    ok: true,
    data: {
      arrived: r.arrived === true,
      distanceM: typeof r.distance_m === "number" ? r.distance_m : null,
      check,
      reasonRequired: r.reason_required === true,
    },
  };
}

export async function skipStop(input: z.input<typeof skipSchema>): Promise<ActionResult<null>> {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
  if (!(await getUser())) return unauthenticated();

  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_stop", {
    p_stop_id: parsed.data.stopId,
    p_reason: parsed.data.reason,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) return dbFail(error, "skip", "skip_stop");
  refreshVolunteer();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Báo sự cố (US-VOL-13)
// ---------------------------------------------------------------------------

export async function reportTripIncident(
  input: z.input<typeof incidentSchema>,
): Promise<ActionResult<{ incidentId: string; skipped: boolean }>> {
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
  if (!(await getUser())) return unauthenticated();

  const v = parsed.data;
  const supabase = await createClient();
  const refs: Record<string, string> = { pickup_id: v.pickupId };
  if (v.allocationId) refs.allocation_id = v.allocationId;
  const { data, error } = await supabase.rpc("report_incident", {
    p_kind: v.kind,
    p_description: v.description,
    p_refs: refs,
    p_client_op_id: v.clientOpId,
  });
  if (error) return dbFail(error, "incident", "report_incident");

  let skipped = false;
  if (v.skipStopId && v.skipOpId) {
    const skip = await supabase.rpc("skip_stop", {
      p_stop_id: v.skipStopId,
      p_reason: `Sự cố: ${INCIDENT_KIND_LABEL[v.kind].label}`,
      p_client_op_id: v.skipOpId,
    });
    // Phản ánh đã ghi; bỏ qua điểm thất bại (ví dụ cửa hàng vừa bàn giao) thì báo riêng ở giao diện
    skipped = !skip.error;
  }
  refreshVolunteer();
  return { ok: true, data: { incidentId: String(data), skipped } };
}

// ---------------------------------------------------------------------------
// Hồ sơ tình nguyện viên (US-VOL-01 AC2, §8.2 upsert_volunteer_profile)
// ---------------------------------------------------------------------------

export async function saveVolunteerProfile(input: ProfileFormInput): Promise<ActionResult<null>> {
  const parsed = profileFormSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
  const user = await getUser();
  if (!user) return unauthenticated();

  const v = parsed.data;
  const supabase = await createClient();
  const profile = await supabase
    .from("profiles")
    .update({ full_name: v.fullName, phone: v.phone === "" ? null : v.phone })
    .eq("id", user.id)
    .select("id");
  if (profile.error) {
    if (profile.error.code === "23505")
      return {
        ok: false,
        error: {
          code: "duplicate",
          message: "Số điện thoại này đã được dùng cho một tài khoản khác.",
          fieldErrors: { phone: "Số điện thoại này đã được dùng cho một tài khoản khác." },
        },
      };
    return dbFail(profile.error, "profile", "profiles.update");
  }

  const { error } = await supabase.rpc("upsert_volunteer_profile", { p_payload: toProfilePayload(v) });
  if (error) {
    const fail = dbFail(error, "profile", "upsert_volunteer_profile");
    const fe = fail.error.fieldErrors;
    if (fe) {
      // Khóa RPC ⇒ tên trường của form
      const rename: Record<string, string> = {
        capacity_kg: "capacityKg",
        location: "area",
        base_area_label: "areaLabel",
        availability_note: "availabilityNote",
      };
      fail.error.fieldErrors = Object.fromEntries(Object.entries(fe).map(([k, m]) => [rename[k] ?? k, m]));
    }
    return fail;
  }
  refreshVolunteer();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Đồng ý chia sẻ vị trí (US-VOL-02; SECURITY-PRIVACY §6)
// ---------------------------------------------------------------------------

export async function grantLocationConsent(
  input: z.input<typeof consentSchema>,
): Promise<ActionResult<null>> {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!(await getUser())) return unauthenticated();

  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_consent", {
    p_purpose: "location_trip",
    p_policy_version: LOCATION_POLICY_VERSION,
    p_text_hash: await sha256Hex(locationConsentText()),
    p_source: parsed.data.source,
  });
  if (error) return dbFail(error, "consent", "grant_consent");
  refreshVolunteer();
  return { ok: true, data: null };
}

/** Rút đồng ý: ngừng gửi ngay; DB xóa điểm đã lưu của các chuyến đang chạy. */
export async function withdrawLocationConsent(): Promise<ActionResult<null>> {
  if (!(await getUser())) return unauthenticated();
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_consent", { p_purpose: "location_trip" });
  if (error) return dbFail(error, "consent", "withdraw_consent");
  refreshVolunteer();
  return { ok: true, data: null };
}

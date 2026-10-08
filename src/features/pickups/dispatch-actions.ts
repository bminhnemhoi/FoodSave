"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { LatLng } from "@/core/geo/types";
import { parseTstzRange } from "@/features/charity-allocations/present";
import { mapRpcError, RPC_MESSAGES, type ActionError, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { INCIDENT_KINDS } from "./dispatch";
import { parseEwkbPoint } from "./geo";
import { loadPlannerGeo } from "./queries";
import { motorbikeRoute } from "./route-plan";
import { assignStops, planVolunteerTrips, type PlanAllocation } from "./volunteer-plan";

/**
 * Server Action điều phối chuyến tình nguyện viên (PRD US-CHA-16/17/18/22/23; DATA-MODEL §6.5, §7 C5/C6, §8.5;
 * ROADMAP P3-09, P3-11). zod → client Supabase của NGƯỜI DÙNG → RPC `security definer` → lỗi tiếng Việt.
 * Thứ tự điểm dừng do server tính lại bằng `src/core/routing` trên dữ liệu đọc qua RLS (client chỉ gửi cách
 * chia phân bổ cho từng TNV); tuyến xe máy thật chỉ gọi một lần cho mỗi chuyến được giao, và chỉ khi mọi
 * cửa hàng công khai vị trí. `clientOpId` sinh ở client một lần cho mỗi ý định.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Fail = { ok: false; error: ActionError };

const fail = (code: string, message: string): Fail => ({ ok: false, error: { code, message } });
const invalid = (): Fail => fail("validation_failed", RPC_MESSAGES.invalid);
const unauthenticated = (): Fail => fail("unauthenticated", RPC_MESSAGES.unauthenticated);

const TRIP_MESSAGES = {
  volunteerPaused: "Tình nguyện viên này đang tạm ngưng nên không giao chuyến mới được. Hãy chọn người khác.",
  notVolunteer: "Người được chọn không còn là tình nguyện viên của tổ chức. Hãy tải lại trang rồi chọn lại.",
  changed:
    "Một số phân bổ vừa đổi trạng thái (đã lên chuyến khác, bị hủy hoặc hết hạn). Hãy tải lại trang rồi chọn lại.",
  tripStarted: "Tình nguyện viên đã bắt đầu chuyến nên không đổi người được nữa.",
  goodsPickedUp:
    "Đã lấy hàng ở ít nhất một điểm nên không hủy được chuyến. Hãy báo sự cố nếu hàng có vấn đề — phần đã lấy vẫn được giao về.",
  cancelForbidden: "Chỉ chủ sở hữu hoặc quản lý tổ chức hủy được chuyến.",
  dropoffStop: "Không bỏ qua được điểm giao về tổ chức.",
  stopIncident: "Điểm dừng này đang có phản ánh sự cố nên không bỏ ra khỏi chuyến được.",
} as const;

function tripError(err: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  const mapped = mapRpcError(err, {
    invalid_state: TRIP_MESSAGES.changed,
    "invalid_state:trip_started": TRIP_MESSAGES.tripStarted,
    "invalid_state:goods_picked_up": TRIP_MESSAGES.goodsPickedUp,
    "invalid_state:dropoff_stop": TRIP_MESSAGES.dropoffStop,
    "invalid_state:stop_has_incident": TRIP_MESSAGES.stopIncident,
    deadline_passed: "Có lô đã quá hạn hiệu lực nên không lên chuyến được. Bỏ lô đó rồi thử lại.",
    not_found: "Không tìm thấy chuyến hoặc phân bổ — có thể đã thay đổi. Hãy tải lại trang.",
  });
  if (mapped.fieldErrors?.assignee_user_id === "volunteer_paused")
    return { ...mapped, code: "volunteer_paused", message: TRIP_MESSAGES.volunteerPaused };
  if (mapped.fieldErrors?.assignee_user_id)
    return { ...mapped, code: "not_volunteer", message: TRIP_MESSAGES.notVolunteer };
  if (mapped.fieldErrors?.allocation_ids === "too_many_stops")
    return {
      ...mapped,
      message: "Một chuyến đi tối đa 5 cửa hàng. Hãy bỏ bớt hoặc chia cho 2 tình nguyện viên.",
    };
  if (mapped.fieldErrors?.allocation_ids === "other_receiving_site")
    return { ...mapped, message: "Các phân bổ trong một chuyến phải cùng một điểm nhận." };
  return mapped;
}

function logIfServer(mapped: ActionError, op: string, code: string | undefined) {
  if (mapped.code === "server_error") console.error("[pickups] dispatch", { op, code });
}

function revalidateTrips(pickupId?: string) {
  revalidatePath("/charity");
  revalidatePath("/charity/pickups", "layout");
  revalidatePath("/charity/receive");
  if (pickupId) revalidatePath(`/charity/pickups/${pickupId}`);
}

// ---------------------------------------------------------------------------
// Giao chuyến cho 1 hoặc 2 tình nguyện viên (US-CHA-16, US-CHA-17)
// ---------------------------------------------------------------------------

const assignSchema = z.object({
  siteId: z.uuid(),
  trips: z
    .array(
      z.object({
        assigneeUserId: z.uuid(),
        allocationIds: z.array(z.uuid()).min(1).max(100),
        clientOpId: z.uuid(),
      }),
    )
    .min(1)
    .max(2),
});

type AllocationRow = {
  id: string;
  status: string;
  pickup_id: string | null;
  charity_site_id: string;
  store_site_id: string;
  qty_reserved: number;
  qty_released: number;
  unit_weight_kg_snapshot: number;
  offer: { effective_deadline: string | null; pickup_window: string | null } | null;
};

async function loadPlanAllocations(supabase: Supabase, ids: string[]) {
  const { data, error } = await supabase
    .from("allocations")
    .select(
      `id, status, pickup_id, charity_site_id, store_site_id, qty_reserved, qty_released, unit_weight_kg_snapshot,
       offer:offers!allocations_offer_id_fkey(effective_deadline, pickup_window)`,
    )
    .in("id", ids);
  if (error) return { error };
  return { rows: (data ?? []) as unknown as AllocationRow[] };
}

/** Chuyến đang chở đúng tập phân bổ này (gửi lại sau khi đã tạo — mạng chập chờn, bấm hai lần). */
async function existingTrip(supabase: Supabase, allocationIds: string[]): Promise<string | null> {
  const { data } = await supabase.from("allocations").select("pickup_id, status").in("id", allocationIds);
  if (!data || data.length !== allocationIds.length) return null;
  const ids = new Set(data.map((a) => (a.status === "assigned" ? a.pickup_id : null)));
  const [only] = [...ids];
  return ids.size === 1 && only ? only : null;
}

export async function assignVolunteerTrips(
  input: z.input<typeof assignSchema>,
): Promise<ActionResult<{ pickupIds: string[] }>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!(await getUser())) return unauthenticated();
  const { siteId, trips } = parsed.data;
  const allIds = trips.flatMap((t) => t.allocationIds);
  if (new Set(allIds).size !== allIds.length) return invalid();
  if (new Set(trips.map((t) => t.assigneeUserId)).size !== trips.length)
    return fail("validation_failed", "Hai chuyến phải giao cho hai tình nguyện viên khác nhau.");

  const supabase = await createClient();
  const loaded = await loadPlanAllocations(supabase, allIds);
  if ("error" in loaded) return fail("server_error", RPC_MESSAGES.server);
  const rows = loaded.rows;
  if (rows.length !== allIds.length) return fail("not_found", TRIP_MESSAGES.changed);
  if (rows.some((r) => r.charity_site_id !== siteId))
    return fail("validation_failed", "Các phân bổ trong một chuyến phải cùng một điểm nhận.");
  // Đã tạo ở lần gửi trước (idempotent theo client_op_id) ⇒ vẫn đi tiếp để trả đúng mã chuyến
  const fresh = rows.filter((r) => r.status === "confirmed" && r.pickup_id === null);

  const storeSiteIds = [...new Set(rows.map((r) => r.store_site_id))];
  const assignees = trips.map((t) => t.assigneeUserId);
  const [geo, profilesRes] = await Promise.all([
    loadPlannerGeo(storeSiteIds, [siteId]),
    supabase.from("volunteer_profiles").select("user_id, capacity_kg, base_area").in("user_id", assignees),
  ]);
  const dropoff = geo.dropoffs[siteId];
  if (!dropoff) return fail("not_found", "Không đọc được vị trí điểm nhận. Hãy tải lại trang.");
  const profiles = new Map(
    (profilesRes.data ?? []).map((p) => [
      p.user_id,
      { capacityKg: Number(p.capacity_kg), base: parseEwkbPoint(p.base_area as unknown as string | null) },
    ]),
  );
  const toPlan = (r: AllocationRow): PlanAllocation => {
    const window = parseTstzRange(r.offer?.pickup_window ?? null);
    return {
      id: r.id,
      storeSiteId: r.store_site_id,
      kg: (Number(r.qty_reserved) - Number(r.qty_released)) * Number(r.unit_weight_kg_snapshot),
      pickupStart: window?.start.toISOString() ?? null,
      effectiveDeadline: r.offer?.effective_deadline ?? null,
    };
  };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const now = Date.now();

  const pickupIds: string[] = [];
  for (const [i, t] of trips.entries()) {
    const groupRows = t.allocationIds.map((id) => byId.get(id)!);
    const profile = profiles.get(t.assigneeUserId);
    const plan = planVolunteerTrips({
      dropoff: { siteId, location: dropoff },
      stores: geo.stores,
      allocations: groupRows.map(toPlan),
      volunteers: [
        {
          userId: t.assigneeUserId,
          name: "",
          base: profile?.base ?? null,
          capacityKg: profile?.capacityKg ?? 20,
        },
      ],
      departAt: now,
    });
    if (!plan.ok) {
      return fail(
        plan.reason,
        plan.reason === "too_many_stops"
          ? "Một chuyến đi tối đa 5 cửa hàng. Hãy bỏ bớt hoặc chia cho 2 tình nguyện viên."
          : RPC_MESSAGES.invalid,
      );
    }
    const trip = plan.plan.trips[0]!;
    // Tuyến xe máy thật: chỉ khi mọi cửa hàng của chuyến công khai vị trí (không dựng tuyến từ toạ độ gần đúng)
    const publicStops = trip.stops.map((s) => geo.stores.find((g) => g.siteId === s.siteId));
    const route =
      fresh.length > 0 && publicStops.every((g) => g?.isPublic && g.location)
        ? await motorbikeRoute([...publicStops.map((g) => g!.location as LatLng), dropoff])
        : null;

    const allocationIds = [...t.allocationIds].sort();
    const { data, error } = await supabase.rpc("assign_pickup", {
      p_plan: {
        allocation_ids: allocationIds,
        mode: "volunteer",
        assignee_user_id: t.assigneeUserId,
        charity_site_id: siteId,
        planned_start_at: new Date(now).toISOString(),
        stops: assignStops(trip, siteId),
        ...(route ? { route } : {}),
      },
      p_client_op_id: t.clientOpId,
    });
    if (error) {
      if (error.message === "idempotency_conflict" || error.message === "invalid_state") {
        const existing = await existingTrip(supabase, allocationIds);
        if (existing) {
          pickupIds.push(existing);
          continue;
        }
      }
      const mapped = tripError(error);
      logIfServer(mapped, "assign_pickup", error.code);
      if (pickupIds.length > 0) revalidateTrips();
      return {
        ok: false,
        error: {
          ...mapped,
          message:
            i > 0 && pickupIds.length > 0
              ? `Đã giao chuyến thứ nhất. Chuyến thứ hai chưa tạo được: ${mapped.message}`
              : mapped.message,
        },
      };
    }
    pickupIds.push(String(data));
  }

  revalidateTrips();
  return { ok: true, data: { pickupIds } };
}

// ---------------------------------------------------------------------------
// Đổi người / chuyển tự đến lấy khi TNV từ chối (US-CHA-16 AC4, US-CHA-23 AC1) — `assign_pickup` lên lại
// kế hoạch (p_plan.pickup_id): giữ nguyên phân bổ và thứ tự điểm dừng nên tuyến đã lưu được giữ.
// ---------------------------------------------------------------------------

const replanSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("volunteer"),
    pickupId: z.uuid(),
    assigneeUserId: z.uuid(),
    clientOpId: z.uuid(),
  }),
  z.object({ mode: z.literal("self"), pickupId: z.uuid(), clientOpId: z.uuid() }),
]);

export async function replanTrip(
  input: z.input<typeof replanSchema>,
): Promise<ActionResult<{ pickupId: string }>> {
  const parsed = replanSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!(await getUser())) return unauthenticated();
  const v = parsed.data;
  const supabase = await createClient();

  const [tripRes, allocRes, stopsRes] = await Promise.all([
    supabase.from("pickups").select("id, status, charity_site_id").eq("id", v.pickupId).maybeSingle(),
    supabase.from("allocations").select("id").eq("pickup_id", v.pickupId).eq("status", "assigned"),
    supabase.from("pickup_stops").select("site_id, seq, kind, eta, status").eq("pickup_id", v.pickupId),
  ]);
  if (tripRes.error || allocRes.error || stopsRes.error) return fail("server_error", RPC_MESSAGES.server);
  const trip = tripRes.data;
  if (!trip) return fail("not_found", RPC_MESSAGES.notFound);
  const allocationIds = (allocRes.data ?? []).map((a) => a.id).sort();
  if (allocationIds.length === 0) return fail("invalid_state", TRIP_MESSAGES.changed);
  const storeSites = new Set(
    (await supabase.from("allocations").select("store_site_id").in("id", allocationIds)).data?.map(
      (a) => a.store_site_id,
    ) ?? [],
  );
  const pickups = (stopsRes.data ?? [])
    .filter((s) => s.kind === "pickup" && storeSites.has(s.site_id))
    .sort((a, b) => a.seq - b.seq);
  const stops = [
    ...pickups.map((s, i) => ({
      site_id: s.site_id,
      seq: i + 1,
      kind: "pickup" as const,
      ...(s.eta ? { eta: s.eta } : {}),
    })),
    { site_id: trip.charity_site_id, seq: pickups.length + 1, kind: "dropoff" as const },
  ];

  const { error } = await supabase.rpc("assign_pickup", {
    p_plan: {
      pickup_id: v.pickupId,
      allocation_ids: allocationIds,
      mode: v.mode,
      charity_site_id: trip.charity_site_id,
      stops,
      ...(v.mode === "volunteer" ? { assignee_user_id: v.assigneeUserId } : {}),
    },
    p_client_op_id: v.clientOpId,
  });
  if (error) {
    const mapped = tripError(error);
    logIfServer(mapped, "assign_pickup(replan)", error.code);
    return { ok: false, error: mapped };
  }
  revalidateTrips(v.pickupId);
  return { ok: true, data: { pickupId: v.pickupId } };
}

// ---------------------------------------------------------------------------
// Hủy chuyến (C5), bỏ qua điểm dừng (C6), báo sự cố (C10)
// ---------------------------------------------------------------------------

const reasonSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: "Vui lòng nêu lý do." })
    .max(max, { error: `Lý do tối đa ${max} ký tự.` });

const cancelSchema = z.object({ pickupId: z.uuid(), reason: reasonSchema(500), clientOpId: z.uuid() });

export async function cancelTrip(input: z.input<typeof cancelSchema>): Promise<ActionResult<null>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error.issues.find((i) => i.path[0] === "reason")?.message;
    return reason
      ? { ok: false, error: { code: "validation_failed", message: reason, fieldErrors: { reason } } }
      : invalid();
  }
  if (!(await getUser())) return unauthenticated();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_pickup", {
    p_pickup_id: parsed.data.pickupId,
    p_reason: parsed.data.reason,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) {
    const mapped =
      error.code === "PT403" && error.message === "not_authorized"
        ? { code: "forbidden", message: TRIP_MESSAGES.cancelForbidden }
        : tripError(error);
    logIfServer(mapped, "cancel_pickup", error.code);
    return { ok: false, error: mapped };
  }
  revalidateTrips(parsed.data.pickupId);
  return { ok: true, data: null };
}

const skipSchema = z.object({
  pickupId: z.uuid(),
  stopId: z.uuid(),
  reason: reasonSchema(300),
  clientOpId: z.uuid(),
});

export async function skipTripStop(input: z.input<typeof skipSchema>): Promise<ActionResult<null>> {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error.issues.find((i) => i.path[0] === "reason")?.message;
    return reason
      ? { ok: false, error: { code: "validation_failed", message: reason, fieldErrors: { reason } } }
      : invalid();
  }
  if (!(await getUser())) return unauthenticated();
  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_stop", {
    p_stop_id: parsed.data.stopId,
    p_reason: parsed.data.reason,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) {
    const mapped = tripError(error);
    logIfServer(mapped, "skip_stop", error.code);
    return { ok: false, error: mapped };
  }
  revalidateTrips(parsed.data.pickupId);
  return { ok: true, data: null };
}

const incidentSchema = z.object({
  pickupId: z.uuid(),
  kind: z.enum(INCIDENT_KINDS),
  description: z
    .string()
    .trim()
    .min(10, { error: "Mô tả ít nhất 10 ký tự để FoodSave xử lý được." })
    .max(2000, { error: "Mô tả tối đa 2000 ký tự." }),
  clientOpId: z.uuid(),
});

export async function reportTripIncident(
  input: z.input<typeof incidentSchema>,
): Promise<ActionResult<{ incidentId: string }>> {
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) {
    const description = parsed.error.issues.find((i) => i.path[0] === "description")?.message;
    return description
      ? {
          ok: false,
          error: { code: "validation_failed", message: description, fieldErrors: { description } },
        }
      : invalid();
  }
  if (!(await getUser())) return unauthenticated();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_incident", {
    p_kind: parsed.data.kind,
    p_description: parsed.data.description,
    p_refs: { pickup_id: parsed.data.pickupId },
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) {
    const mapped = tripError(error);
    logIfServer(mapped, "report_incident", error.code);
    return { ok: false, error: mapped };
  }
  revalidateTrips(parsed.data.pickupId);
  return { ok: true, data: { incidentId: String(data) } };
}

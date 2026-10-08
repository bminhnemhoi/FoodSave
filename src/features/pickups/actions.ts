"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mapRpcError, RPC_MESSAGES, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { MAX_PICKUP_STOPS } from "./plan";
import { planSelfRoute } from "./route-plan";

/**
 * "Tạo chuyến tự đến lấy" (US-CHA-20 AC1, P2 = tự lấy): RPC `assign_pickup` mode `self` — DB kiểm quyền,
 * trạng thái `confirmed`, cùng điểm nhận, ≤ 5 điểm lấy. Thứ tự điểm dừng: hạn hiệu lực sớm nhất trước, điểm
 * giao về điểm nhận ở cuối (RPC tự sinh; khi tính được tuyến xe máy thì gửi kèm `stops` cùng thứ tự + `route`).
 * `clientOpId` sinh ở client một lần cho mỗi lựa chọn.
 */

const createSelfPickupSchema = z.object({
  siteId: z.uuid(),
  allocationIds: z.array(z.uuid()).min(1).max(100),
  clientOpId: z.uuid(),
});

const OVERRIDES: Record<string, string> = {
  invalid_state:
    "Một số phân bổ vừa đổi trạng thái (đã lên chuyến khác, bị hủy hoặc hết hạn). Hãy tải lại trang rồi chọn lại.",
  deadline_passed: "Có lô đã quá hạn hiệu lực nên không lên chuyến được. Bỏ chọn lô đó rồi thử lại.",
  not_found: "Không tìm thấy một số phân bổ đã chọn. Hãy tải lại trang rồi chọn lại.",
};

async function existingTrip(
  supabase: Awaited<ReturnType<typeof createClient>>,
  allocationIds: string[],
): Promise<string | null> {
  const { data } = await supabase.from("allocations").select("pickup_id, status").in("id", allocationIds);
  if (!data || data.length !== allocationIds.length) return null;
  const ids = new Set(data.map((a) => (a.status === "assigned" ? a.pickup_id : null)));
  const [only] = [...ids];
  return ids.size === 1 && only ? only : null;
}

export async function createSelfPickup(
  input: z.input<typeof createSelfPickupSchema>,
): Promise<ActionResult<{ pickupId: string }>> {
  const parsed = createSelfPickupSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "validation_failed", message: RPC_MESSAGES.invalid } };
  if (!(await getUser()))
    return { ok: false, error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated } };

  const { siteId, clientOpId } = parsed.data;
  const allocationIds = [...new Set(parsed.data.allocationIds)].sort();
  const supabase = await createClient();
  // Tuyến xe máy thật nếu tính được (không chặn việc tạo chuyến khi provider lỗi)
  const routed = await planSelfRoute(supabase, siteId, allocationIds);
  const { data, error } = await supabase.rpc("assign_pickup", {
    p_plan: {
      allocation_ids: allocationIds,
      mode: "self",
      charity_site_id: siteId,
      ...(routed ? { stops: routed.stops, route: routed.route } : {}),
    },
    p_client_op_id: clientOpId,
  });
  if (error) {
    // Gửi lại sau khi chuyến đã được tạo (mạng chập chờn, bấm hai lần ở hai tab) ⇒ trả về chuyến đang chở các lô này
    if (error.message === "idempotency_conflict" || error.message === "invalid_state") {
      const existing = await existingTrip(supabase, allocationIds);
      if (existing) return { ok: true, data: { pickupId: existing } };
    }
    const mapped = mapRpcError(error, OVERRIDES);
    if (mapped.fieldErrors?.allocation_ids === "too_many_stops")
      return {
        ok: false,
        error: {
          code: "too_many_stops",
          message: `Một chuyến đi tối đa ${MAX_PICKUP_STOPS} cửa hàng. Hãy bỏ bớt rồi tạo thêm chuyến thứ hai.`,
        },
      };
    if (mapped.fieldErrors?.allocation_ids === "other_receiving_site")
      return {
        ok: false,
        error: {
          code: "other_receiving_site",
          message: "Các phân bổ trong một chuyến phải cùng một điểm nhận.",
        },
      };
    if (mapped.code === "server_error")
      console.error("[pickups] assign_pickup", { code: error.code, message: error.message });
    return { ok: false, error: mapped };
  }

  revalidatePath("/charity");
  revalidatePath("/charity/pickups", "layout");
  return { ok: true, data: { pickupId: String(data) } };
}

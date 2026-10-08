"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { mapRpcError, RPC_MESSAGES, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { cancelAllocationSchema, cancelReasonText } from "./schemas";

/**
 * Tổ chức hủy yêu cầu/phân bổ của mình (US-CHA-08 AC4, US-CHA-22; DATA-MODEL §7 C1–C2): RPC
 * `cancel_allocation` tự xác định bên hủy (tổ chức), trả số lượng về lô, trừ 2 điểm uy tín nếu cửa hàng
 * đã đóng gói, gỡ khỏi chuyến nếu đã lên chuyến. Chỉ owner/manager (DB kiểm).
 */

const CANCEL_OVERRIDES: Record<string, string> = {
  invalid_state:
    "Phân bổ này vừa đổi trạng thái (cửa hàng đã trả lời, đã hết hạn hoặc hàng đã được lấy) nên không hủy được nữa. Hãy tải lại trang.",
  not_authorized: "Chỉ chủ sở hữu hoặc quản lý của tổ chức mới hủy được yêu cầu. Hãy nhờ họ thực hiện.",
  ambiguous_actor:
    "Bạn là thành viên của cả cửa hàng và tổ chức trong phân bổ này nên FoodSave không xác định được bên hủy. Liên hệ FoodSave để được hỗ trợ.",
};

export async function cancelAllocation(
  input: z.input<typeof cancelAllocationSchema>,
): Promise<ActionResult<null>> {
  const parsed = cancelAllocationSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: { code: "validation_failed", message: RPC_MESSAGES.invalid, fieldErrors } };
  }
  if (!(await getUser()))
    return { ok: false, error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated } };

  const { allocationId, reason, note, clientOpId } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_allocation", {
    p_allocation_id: allocationId,
    // Kiểu sinh tự động chưa biểu diễn tham số text null; RPC chấp nhận null (lý do tùy chọn với tổ chức)
    p_reason: cancelReasonText(reason, note) as string,
    p_client_op_id: clientOpId,
  });
  if (error) {
    const mapped = mapRpcError(error, CANCEL_OVERRIDES);
    if (mapped.code === "server_error")
      console.error("[charity-allocations] cancel_allocation", { code: error.code, message: error.message });
    return { ok: false, error: mapped };
  }
  revalidatePath("/charity");
  revalidatePath("/charity/pickups", "layout");
  revalidatePath("/charity/donations");
  return { ok: true, data: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mapRpcError, RPC_MESSAGES, type ActionResult, type PgLikeError } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { REQUEST_REASON_MAX } from "./schemas";

/**
 * Server Action yêu cầu nhận lô phía cửa hàng (P2-10; US-STO-13, US-STO-16): xác nhận, từ chối (lý do
 * bắt buộc), đánh dấu/hoàn tác "Đã đóng gói". Client Supabase của NGƯỜI DÙNG → RPC security definer
 * (`confirm_allocation`, `reject_allocation`, `mark_allocation_packed` — quyền điểm kiểm ở DB).
 */

const OVERRIDES: Record<string, string> = {
  not_found: "Không tìm thấy yêu cầu, hoặc bạn không có quyền với điểm của lô này. Hãy tải lại trang.",
  not_authorized:
    "Bạn không có quyền thao tác ở điểm này của cửa hàng. Liên hệ chủ cửa hàng nếu cần thêm quyền.",
  "deadline_passed:reserved_until":
    "Yêu cầu đã quá hạn phản hồi nên tự hết hạn; số lượng đã được trả lại lô.",
  "deadline_passed:effective_deadline": "Lô đã quá hạn hiệu lực nên không xác nhận được nữa.",
  "invalid_state:already_packed": "Phân bổ này đã được đánh dấu đóng gói.",
  "invalid_state:undo_window_passed": "Chỉ hoàn tác được trong 2 phút sau khi đánh dấu đã đóng gói.",
  invalid_state:
    "Yêu cầu này vừa được xử lý (hoặc tổ chức đã hủy). Hãy tải lại trang để xem trạng thái mới nhất.",
};

function rpcFail(err: PgLikeError, op: string): { ok: false; error: ReturnType<typeof mapRpcError> } {
  const mapped = mapRpcError(err, OVERRIDES);
  if (mapped.code === "server_error") console.error("[store-requests] rpc error", { op, code: err.code });
  return { ok: false, error: mapped };
}

function revalidateStore() {
  revalidatePath("/store", "layout");
}

const confirmInput = z.object({ allocationId: z.uuid(), clientOpId: z.uuid() });

export async function confirmRequest(input: z.input<typeof confirmInput>): Promise<ActionResult<null>> {
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "validation_failed", message: RPC_MESSAGES.invalid } };
  if (!(await getUser())) {
    return { ok: false, error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_allocation", {
    p_allocation_id: parsed.data.allocationId,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) return rpcFail(error, "confirm_allocation");
  revalidateStore();
  return { ok: true, data: null };
}

const rejectInput = z.object({
  allocationId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Vui lòng chọn hoặc nhập lý do từ chối.")
    .max(REQUEST_REASON_MAX, "Lý do tối đa 500 ký tự."),
  clientOpId: z.uuid(),
});

export async function rejectRequest(input: z.input<typeof rejectInput>): Promise<ActionResult<null>> {
  const parsed = rejectInput.safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error.issues.find((i) => i.path[0] === "reason");
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: reason?.message ?? RPC_MESSAGES.invalid,
        fieldErrors: reason ? { reason: reason.message } : undefined,
      },
    };
  }
  if (!(await getUser())) {
    return { ok: false, error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_allocation", {
    p_allocation_id: parsed.data.allocationId,
    p_reason: parsed.data.reason,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) return rpcFail(error, "reject_allocation");
  revalidateStore();
  return { ok: true, data: null };
}

const packedInput = z.object({ allocationId: z.uuid(), packed: z.boolean(), clientOpId: z.uuid() });

export async function setPacked(
  input: z.input<typeof packedInput>,
): Promise<ActionResult<{ packedAt: string | null }>> {
  const parsed = packedInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "validation_failed", message: RPC_MESSAGES.invalid } };
  if (!(await getUser())) {
    return { ok: false, error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_allocation_packed", {
    p_allocation_id: parsed.data.allocationId,
    p_client_op_id: parsed.data.clientOpId,
    p_packed: parsed.data.packed,
  });
  if (error) return rpcFail(error, "mark_allocation_packed");
  const { data } = await supabase
    .from("allocations")
    .select("packed_at")
    .eq("id", parsed.data.allocationId)
    .maybeSingle();
  revalidateStore();
  return { ok: true, data: { packedAt: data?.packed_at ?? null } };
}

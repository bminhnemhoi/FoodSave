"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { RPC_MESSAGES } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { mapRequestError, type RequestError } from "./errors";
import { requestOfferSchema } from "./schemas";

/**
 * "Xin nhận" (P2-10 phía tổ chức, US-CHA-08): zod → client Supabase của NGƯỜI DÙNG → RPC `request_offer`
 * (giữ chỗ nguyên tử, quyền + khả thi kiểm ở DB) → lỗi tiếng Việt. `clientOpId` sinh ở client một lần cho
 * mỗi ý định (lô + số lượng + điểm nhận) nên gửi lại không tạo yêu cầu trùng.
 */

export type RequestOfferResult =
  | { ok: true; data: { allocationId: string; status: "requested" | "confirmed" } }
  | { ok: false; error: RequestError };

export async function requestOffer(input: z.input<typeof requestOfferSchema>): Promise<RequestOfferResult> {
  const parsed = requestOfferSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "validation_failed", message: RPC_MESSAGES.invalid } };
  if (!(await getUser()))
    return { ok: false, error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated } };

  const { offerId, siteId, qty, clientOpId } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_offer", {
    p_offer_id: offerId,
    p_qty: qty,
    p_charity_site_id: siteId,
    p_client_op_id: clientOpId,
  });
  if (error) {
    const mapped = mapRequestError(error);
    if (mapped.code === "server_error")
      console.error("[marketplace] request_offer", { code: error.code, message: error.message });
    return { ok: false, error: mapped };
  }

  const res = (data ?? {}) as { allocation_id?: string; status?: string };
  revalidatePath("/charity");
  revalidatePath("/charity/donations");
  revalidatePath("/charity/pickups");
  return {
    ok: true,
    data: {
      allocationId: res.allocation_id ?? "",
      status: res.status === "confirmed" ? "confirmed" : "requested",
    },
  };
}

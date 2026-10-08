import "server-only";

import { createServiceClient } from "@/server/db/supabase";
import { getAiProvider } from "@/server/providers/ai";

/**
 * Phần server của "Chụp ảnh để điền nhanh" (P2-05, US-STO-08):
 * - nút chỉ hiện khi có provider (FEATURE_AI bật + có key, ADR-010) và Admin không tắt công tắc
 *   `app_settings.ai_enabled` / `ai_offer_autofill_enabled`;
 * - hạn mức theo cửa hàng qua RPC `consume_rate_limit` (chỉ service role, giống email xác thực).
 */

export const AI_OFFER_RATE_LIMIT = { limit: 20, window: "1 hour" } as const;

export function aiOfferRateKey(orgId: string): string {
  return `ai_offer_draft:org:${orgId}`;
}

/** Công tắc Admin. Không đọc được ⇒ coi như bật (provider vẫn là điều kiện bắt buộc). */
async function adminSwitchesOn(): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient()
      .from("app_settings")
      .select("key, value")
      .in("key", ["ai_enabled", "ai_offer_autofill_enabled"]);
    if (error || !data) return true;
    return data.every((s) => s.value !== false);
  } catch {
    return true;
  }
}

/** Hiện nút AI hay không — tính ở server component rồi truyền xuống form. */
export async function isOfferAutofillAvailable(): Promise<boolean> {
  if (!getAiProvider()) return false;
  return adminSwitchesOn();
}

/**
 * Tính một lượt AI cho cửa hàng. `true` = được phép. Lỗi hạ tầng ⇒ từ chối (fail-closed: AI tốn phí,
 * người dùng vẫn nhập tay được).
 */
export async function consumeAiOfferQuota(orgId: string): Promise<"ok" | "limited" | "unavailable"> {
  const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
    p_key: aiOfferRateKey(orgId),
    p_limit: AI_OFFER_RATE_LIMIT.limit,
    p_window: AI_OFFER_RATE_LIMIT.window,
  });
  if (error) {
    console.error("[offers-ai] rate limit unavailable", { code: error.code });
    return "unavailable";
  }
  return data === false ? "limited" : "ok";
}

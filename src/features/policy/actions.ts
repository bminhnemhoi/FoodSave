"use server";

import { z } from "zod";

import { sha256Hex } from "@/lib/hash";
import { POLICY_VERSION } from "@/lib/legal";
import { mapRpcError, RPC_MESSAGES, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { policyUpdateText } from "./consent";

const input = z.object({ source: z.enum(["web", "pwa"]) });

/** "Đồng ý" trên banner chính sách mới: ghi `terms` phiên bản hiện hành (bản cũ tự đóng trong grant_consent). */
export async function acceptPolicyUpdate(
  raw: z.input<typeof input>,
): Promise<ActionResult<{ version: string }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: { code: "validation_failed", message: RPC_MESSAGES.invalid } };
  if (!(await getUser())) {
    return { ok: false, error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_consent", {
    p_purpose: "terms",
    p_policy_version: POLICY_VERSION,
    p_text_hash: await sha256Hex(policyUpdateText()),
    p_source: parsed.data.source,
  });
  if (error) {
    const mapped = mapRpcError(error);
    if (mapped.code === "server_error") console.error("[policy] grant_consent", { code: error.code });
    return { ok: false, error: mapped };
  }
  return { ok: true, data: { version: POLICY_VERSION } };
}

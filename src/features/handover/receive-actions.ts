"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { PUBLIC_IMPACT_TAG } from "@/features/impact/queries";
import { RPC_MESSAGES, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { mapHandoverError } from "./errors";
import { toRpcLines } from "./lines";
import { HANDOVER_CODE_RE, HANDOVER_TOKEN_RE } from "./payload";
import { RECEIVE_MESSAGES } from "./receive-errors";
import { getProposedLines, type HandoverPreview } from "./queries";
import { lineInputSchema } from "./schemas";

/**
 * Nhận hàng tại tổ chức — dropoff của chuyến tình nguyện viên (PRD US-CHA-21; DATA-MODEL §6.6 `record_dropoff`,
 * §8.5; SECURITY-PRIVACY C10). Owner/manager/staff của điểm nhận quét QR trên điện thoại TNV (hoặc nhập mã 6
 * số), đối soát từng dòng đã lấy (chỉ được từ chối vì chất lượng, kèm ghi chú) rồi xác nhận ⇒ phân bổ
 * `delivered`, sổ tác động ghi credit, chuyến hoàn tất. Token/mã không bao giờ ghi log hay đưa vào thông điệp.
 */

type Fail = { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string> } };

const unauthenticated = (): Fail => ({
  ok: false,
  error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated },
});

function dbFail(
  err: { code?: string; message?: string; details?: string | null; hint?: string | null },
  op: string,
): Fail {
  if (err.code === "PT422" && err.message === "token_invalid" && err.details === "not_a_dropoff_handover")
    return { ok: false, error: { code: "token_invalid", message: RECEIVE_MESSAGES.notDropoff } };
  if (err.code === "PT403" && err.details === "wrong_org")
    return { ok: false, error: { code: "forbidden", message: RECEIVE_MESSAGES.wrongOrg } };
  if (err.code === "PT403" && err.message === "self_dealing")
    return { ok: false, error: { code: "self_dealing", message: RECEIVE_MESSAGES.selfDealing } };
  if (err.code === "PT404")
    return { ok: false, error: { code: "not_found", message: RECEIVE_MESSAGES.notFound } };
  if (err.code === "PT409" && err.message === "invalid_state")
    return { ok: false, error: { code: "invalid_state", message: RECEIVE_MESSAGES.notReady } };
  const mapped = mapHandoverError(err, "consume");
  if (mapped.code === "server_error") console.error("[receive] db error", { op, code: err.code });
  return { ok: false, error: mapped };
}

// ---------------------------------------------------------------------------
// Xem trước sau khi quét QR (peek_handover_token — cho phép thành viên điểm nhận xem mã dropoff)
// ---------------------------------------------------------------------------

const peekSchema = z.object({ token: z.string().regex(HANDOVER_TOKEN_RE) });

type PeekResult = {
  handover_id: string;
  kind: "pickup" | "dropoff";
  stop_id: string;
  pickup_id: string;
  charity_name: string | null;
  carrier_name: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  expired: boolean;
  locked: boolean;
  lines: {
    allocation_id: string;
    title: string;
    category_code: string;
    unit: HandoverPreview["lines"][number]["unit"];
    unit_weight_kg: number | string;
    expected_qty: number | string;
    proposed_qty: number | string | null;
  }[];
};

export async function peekDropoff(
  input: z.input<typeof peekSchema>,
): Promise<ActionResult<HandoverPreview & { pickupId: string }>> {
  const parsed = peekSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "token_invalid", message: RECEIVE_MESSAGES.scanNotHandover } };
  if (!(await getUser())) return unauthenticated();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("peek_handover_token", { p_token: parsed.data.token });
  if (error) {
    if (error.code === "PT403" && error.details === "wrong_store")
      return { ok: false, error: { code: "token_invalid", message: RECEIVE_MESSAGES.notDropoff } };
    return dbFail(error, "peek_handover_token");
  }
  const p = data as unknown as PeekResult;
  if (p.kind !== "dropoff")
    return { ok: false, error: { code: "token_invalid", message: RECEIVE_MESSAGES.notDropoff } };

  const proposals = await getProposedLines(p.handover_id);
  return {
    ok: true,
    data: {
      pickupId: p.pickup_id,
      handoverId: p.handover_id,
      stopId: p.stop_id,
      charityName: p.charity_name ?? "Tổ chức",
      carrierName: p.carrier_name?.trim() || null,
      expiresAt: p.expires_at,
      consumedAt: p.consumed_at,
      expired: p.expired,
      locked: p.locked,
      inWindow: true,
      lines: (p.lines ?? []).map((l) => {
        const proposal = proposals.get(l.allocation_id);
        const proposedQty = l.proposed_qty === null ? null : Number(l.proposed_qty);
        return {
          allocationId: l.allocation_id,
          title: l.title,
          categoryCode: l.category_code,
          unit: l.unit,
          expectedQty: Number(l.expected_qty),
          unitWeightKg: Number(l.unit_weight_kg),
          proposal:
            proposedQty === null && !proposal
              ? null
              : {
                  qty: proposedQty ?? proposal?.qty ?? null,
                  reason: proposal?.reason ?? null,
                  note: proposal?.note ?? null,
                },
        };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Xác nhận nhận hàng (record_dropoff: QR token hoặc mã 6 số)
// ---------------------------------------------------------------------------

const lines = z.array(lineInputSchema).min(1).max(50);

const recordSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("qr"),
    handoverId: z.uuid(),
    token: z.string().regex(HANDOVER_TOKEN_RE),
    lines,
    clientOpId: z.uuid(),
  }),
  z.object({
    method: z.literal("code"),
    handoverId: z.uuid(),
    code: z.string().regex(HANDOVER_CODE_RE, "Mã gồm đúng 6 chữ số."),
    lines,
    clientOpId: z.uuid(),
  }),
]);

export type DropoffOutcome =
  | {
      status: "done";
      pickupId: string;
      receivedAt: string;
      kg: number;
      co2eKg: number;
      meals: number;
      ledgerEntries: number;
    }
  | { status: "code_invalid"; attemptsLeft: number };

type RecordResult = {
  ok: boolean;
  error?: string;
  attempts_left?: number;
  pickup_id?: string;
  ledger_ids?: unknown[];
  kg?: number | string;
  co2e_kg?: number | string;
  meals?: number | string;
};

export async function recordDropoff(
  input: z.input<typeof recordSchema>,
): Promise<ActionResult<DropoffOutcome>> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    const codeIssue = parsed.error.issues.some((i) => i.path[0] === "code");
    return codeIssue
      ? {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Mã gồm đúng 6 chữ số.",
            fieldErrors: { code: "Mã gồm đúng 6 chữ số." },
          },
        }
      : { ok: false, error: { code: "validation_failed", message: RPC_MESSAGES.invalid } };
  }
  if (!(await getUser())) return unauthenticated();

  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_dropoff", {
    p_handover_id: v.handoverId,
    p_secret: v.method === "qr" ? v.token : v.code,
    p_lines: toRpcLines(v.lines),
    p_client_op_id: v.clientOpId,
  });
  if (error) return dbFail(error, "record_dropoff");

  const r = (data ?? { ok: false }) as unknown as RecordResult;
  if (!r.ok) {
    if (r.error === "code_invalid")
      return { ok: true, data: { status: "code_invalid", attemptsLeft: Number(r.attempts_left ?? 0) } };
    return { ok: false, error: { code: "server_error", message: RPC_MESSAGES.server } };
  }

  revalidatePath("/charity");
  revalidatePath("/charity/receive");
  revalidatePath("/charity/pickups", "layout");
  // Sổ tác động vừa ghi: bộ đếm công khai phải thấy ngay ở lần tải kế tiếp
  updateTag(PUBLIC_IMPACT_TAG);

  return {
    ok: true,
    data: {
      status: "done",
      pickupId: r.pickup_id ?? "",
      receivedAt: new Date().toISOString(),
      kg: Number(r.kg ?? 0),
      co2eKg: Number(r.co2e_kg ?? 0),
      meals: Number(r.meals ?? 0),
      ledgerEntries: Array.isArray(r.ledger_ids) ? r.ledger_ids.length : 0,
    },
  };
}

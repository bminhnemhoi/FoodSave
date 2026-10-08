"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { z } from "zod";

import { PUBLIC_IMPACT_TAG } from "@/features/impact/queries";
import { RPC_MESSAGES, type ActionResult } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { HANDOVER_MESSAGES, mapHandoverError } from "./errors";
import { toRpcLines } from "./lines";
import { getProposedLines, type HandoverPreview } from "./queries";
import { confirmSchema, issueTokenSchema, peekSchema } from "./schemas";

/**
 * Server Action bàn giao QR (P2-12; DATA-MODEL §6.6, §8.5; SECURITY-PRIVACY C10; PRD US-STO-17/18,
 * US-CHA-20). zod → client Supabase của NGƯỜI DÙNG → RPC `security definer` (quyền, hiệu lực token, đối soát
 * kiểm ở DB) → lỗi tiếng Việt.
 *
 * Token/mã 6 số chỉ đi qua đây đúng một lần (kết quả của `issue_handover_token`, hoặc tham số khi tiêu thụ):
 * KHÔNG ghi log, không đưa vào thông điệp lỗi, không lưu ở đâu khác. Log lỗi chỉ gồm mã lỗi Postgres.
 */

type Fail = { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string> } };

const invalid = (): Fail => ({
  ok: false,
  error: { code: "validation_failed", message: RPC_MESSAGES.invalid },
});
const unauthenticated = (): Fail => ({
  ok: false,
  error: { code: "unauthenticated", message: RPC_MESSAGES.unauthenticated },
});

function dbFail(
  err: { code?: string; message?: string; details?: string | null; hint?: string | null },
  op: string,
  context: "issue" | "consume" | "peek",
): Fail {
  const mapped = mapHandoverError(err, context);
  if (mapped.code === "server_error") console.error("[handover] db error", { op, code: err.code });
  return { ok: false, error: mapped };
}

// ---------------------------------------------------------------------------
// Người mang hàng: hiện mã
// ---------------------------------------------------------------------------

export type IssuedToken = { handoverId: string; token: string; code: string; expiresAt: string };

export async function issueHandoverToken(
  input: z.input<typeof issueTokenSchema>,
): Promise<ActionResult<IssuedToken>> {
  const parsed = issueTokenSchema.safeParse(input);
  if (!parsed.success) return invalid();
  if (!(await getUser())) return unauthenticated();

  const { stopId, lines, clientOpId } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_handover_token", {
    p_stop_id: stopId,
    p_lines: toRpcLines(lines),
    p_client_op_id: clientOpId,
  });
  if (error) return dbFail(error, "issue_handover_token", "issue");

  const row = data?.[0];
  if (!row?.token || !row.code) {
    // Gửi lại cùng client_op_id: DB không trả lại bí mật lần hai (chỉ lưu hash) ⇒ phát mã mới
    return {
      ok: false,
      error: {
        code: "replayed",
        message:
          "Mã của lần bấm trước không hiển thị lại được vì lý do bảo mật. Bấm “Tạo mã mới” để lấy mã khác.",
      },
    };
  }
  return {
    ok: true,
    data: { handoverId: row.handover_id, token: row.token, code: row.code, expiresAt: row.expires_at },
  };
}

// ---------------------------------------------------------------------------
// Cửa hàng: xem trước sau khi quét QR
// ---------------------------------------------------------------------------

type PeekLine = {
  allocation_id: string;
  title: string;
  category_code: string;
  unit: HandoverPreview["lines"][number]["unit"];
  unit_weight_kg: number | string;
  expected_qty: number | string;
  proposed_qty: number | string | null;
};

type PeekResult = {
  handover_id: string;
  kind: "pickup" | "dropoff";
  stop_id: string;
  charity_name: string | null;
  carrier_name: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  expired: boolean;
  locked: boolean;
  in_window: boolean;
  lines: PeekLine[];
};

export async function peekHandover(
  input: z.input<typeof peekSchema>,
): Promise<ActionResult<HandoverPreview>> {
  const parsed = peekSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "token_invalid", message: HANDOVER_MESSAGES.scanNotHandover } };
  if (!(await getUser())) return unauthenticated();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("peek_handover_token", { p_token: parsed.data.token });
  if (error) return dbFail(error, "peek_handover_token", "peek");

  const p = data as unknown as PeekResult;
  if (p.kind !== "pickup")
    return { ok: false, error: { code: "token_invalid", message: HANDOVER_MESSAGES.notPickupToken } };

  // Lý do/ghi chú người mang hàng đề xuất (peek chỉ trả số lượng) — cột proposed_lines đọc được qua RLS
  const proposals = await getProposedLines(p.handover_id);
  return {
    ok: true,
    data: {
      handoverId: p.handover_id,
      stopId: p.stop_id,
      charityName: p.charity_name ?? "Tổ chức nhận",
      carrierName: p.carrier_name?.trim() || null,
      expiresAt: p.expires_at,
      consumedAt: p.consumed_at,
      expired: p.expired,
      locked: p.locked,
      inWindow: p.in_window,
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
// Cửa hàng: xác nhận bàn giao (quét QR hoặc nhập mã 6 số)
// ---------------------------------------------------------------------------

export type ConfirmOutcome =
  | {
      status: "done";
      handoverId: string;
      consumedAt: string;
      picked: { allocationId: string; qty: number; status: "picked_up" | "cancelled" }[];
      /** Tự đến lấy: bàn giao này đồng thời là dropoff ⇒ sổ tác động đã ghi (DATA-MODEL §6.6). */
      dropoff: { kg: number; co2eKg: number; waterL: number | null; meals: number } | null;
    }
  | { status: "code_invalid"; attemptsLeft: number };

type ConsumeResult = {
  ok: boolean;
  error?: string;
  attempts_left?: number;
  handover_id?: string;
  allocations?: { allocation_id: string; status: "picked_up" | "cancelled"; qty_picked: number | string }[];
  dropoff?: {
    kg: number | string;
    co2e_kg: number | string;
    water_l: number | string | null;
    meals: number | string;
  } | null;
};

export async function confirmHandover(
  input: z.input<typeof confirmSchema>,
): Promise<ActionResult<ConfirmOutcome>> {
  const parsed = confirmSchema.safeParse(input);
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
      : invalid();
  }
  if (!(await getUser())) return unauthenticated();

  const v = parsed.data;
  const supabase = await createClient();
  const p_lines = toRpcLines(v.lines);
  const { data, error } =
    v.method === "qr"
      ? await supabase.rpc("consume_handover_token", {
          p_token: v.token,
          p_lines,
          p_client_op_id: v.clientOpId,
        })
      : await supabase.rpc("consume_handover_code", {
          p_handover_id: v.handoverId,
          p_code: v.code,
          p_lines,
          p_client_op_id: v.clientOpId,
        });
  if (error)
    return dbFail(error, v.method === "qr" ? "consume_handover_token" : "consume_handover_code", "consume");

  const r = (data ?? { ok: false }) as unknown as ConsumeResult;
  if (!r.ok) {
    if (r.error === "code_invalid")
      return { ok: true, data: { status: "code_invalid", attemptsLeft: Number(r.attempts_left ?? 0) } };
    return { ok: false, error: { code: "server_error", message: RPC_MESSAGES.server } };
  }

  revalidatePath("/store/handover");
  // Tự đến lấy ⇒ sổ tác động vừa ghi: bộ đếm công khai phải thấy ngay ở lần tải kế tiếp (không phục vụ bản cũ)
  if (r.dropoff) updateTag(PUBLIC_IMPACT_TAG);

  return {
    ok: true,
    data: {
      status: "done",
      handoverId: r.handover_id ?? "",
      consumedAt: new Date().toISOString(),
      picked: (r.allocations ?? []).map((a) => ({
        allocationId: a.allocation_id,
        qty: Number(a.qty_picked),
        status: a.status,
      })),
      dropoff: r.dropoff
        ? {
            kg: Number(r.dropoff.kg),
            co2eKg: Number(r.dropoff.co2e_kg),
            waterL: r.dropoff.water_l === null ? null : Number(r.dropoff.water_l),
            meals: Number(r.dropoff.meals),
          }
        : null,
    },
  };
}

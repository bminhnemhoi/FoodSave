import { kgFromQty } from "@/core/impact";
import { CONTINUOUS_UNITS, formatQty, UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";

import type { ShortfallReason } from "./labels";

/**
 * Đối soát từng dòng bàn giao (DATA-MODEL §2.3 handover_lines, §8.5 p_lines; PRD US-STO-18) — thuần,
 * dùng chung client (báo lỗi tại chỗ) và server (kiểm lại trước khi gọi RPC). DB vẫn là chốt cuối
 * (`private.check_handover_lines`): qty ≤ dự kiến, số nguyên với đơn vị đếm, thiếu thì bắt buộc lý do,
 * `quality_reject` bắt buộc ghi chú, phủ đúng mọi phân bổ của điểm dừng.
 */

export type LineSpec = {
  allocationId: string;
  title: string;
  unit: UnitCode;
  /** Pickup: qty_reserved − qty_released. Dropoff: qty_picked. */
  expectedQty: number;
  unitWeightKg: number;
};

/** Giá trị đang nhập trên form (chuỗi thô, chưa chuẩn hóa). */
export type LineDraft = {
  allocationId: string;
  qty: string;
  reason: ShortfallReason | "";
  note: string;
};

/** Dòng gửi RPC (`p_lines`). */
export type LineInput = {
  allocationId: string;
  qty: number;
  reason: ShortfallReason | null;
  note: string | null;
};

export type LineError = { qty?: string; reason?: string; note?: string };

export const NOTE_MAX = 300;

/** "2,5" / "2.5" / " 18 " ⇒ số; rỗng hoặc sai ⇒ null. */
export function parseQtyInput(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || !/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Số hiển thị trong ô nhập: "2,5" (vi-VN, không phân cách nghìn). */
export function qtyToInput(qty: number): string {
  return String(qty).replace(".", ",");
}

export function draftFromSpec(
  spec: LineSpec,
  proposal?: { qty: number | null; reason: ShortfallReason | null; note: string | null },
): LineDraft {
  const qty = proposal?.qty ?? spec.expectedQty;
  const short = qty < spec.expectedQty;
  return {
    allocationId: spec.allocationId,
    qty: qtyToInput(qty),
    reason: short ? (proposal?.reason ?? "") : "",
    note: short ? (proposal?.note ?? "") : "",
  };
}

export function validateLine(
  spec: LineSpec,
  draft: LineDraft,
  allowedReasons: readonly ShortfallReason[],
): { value: LineInput; error?: undefined } | { value?: undefined; error: LineError } {
  const error: LineError = {};
  const unitLabel = UNIT_LABEL[spec.unit];
  const qty = parseQtyInput(draft.qty);

  if (draft.qty.trim() === "") error.qty = "Vui lòng nhập số lượng.";
  else if (qty === null) error.qty = "Số lượng chưa hợp lệ. Ví dụ: 18 hoặc 2,5.";
  else if (qty > spec.expectedQty)
    error.qty = `Chỉ có ${formatQty(spec.expectedQty, spec.unit)} — vui lòng nhập tối đa ${qtyToInput(spec.expectedQty)}.`;
  else if (!CONTINUOUS_UNITS.has(spec.unit) && !Number.isInteger(qty))
    error.qty = `Số lượng phải là số nguyên với đơn vị ${unitLabel}.`;
  else if (/[.,]\d{4,}$/.test(draft.qty.trim())) error.qty = "Số lượng chỉ lấy tối đa 3 chữ số thập phân.";

  const note = draft.note.trim();
  const short = qty !== null && !error.qty && qty < spec.expectedQty;
  let reason: ShortfallReason | null = null;
  if (short) {
    if (draft.reason === "") error.reason = "Vui lòng chọn lý do thiếu.";
    else if (!allowedReasons.includes(draft.reason)) error.reason = "Lý do này không dùng được ở bước này.";
    else reason = draft.reason;
    if (reason === "quality_reject" && note === "")
      error.note = "Vui lòng mô tả ngắn vì sao hàng không đạt chất lượng.";
  }
  if (note.length > NOTE_MAX) error.note = `Ghi chú tối đa ${NOTE_MAX} ký tự.`;

  if (error.qty || error.reason || error.note) return { error };
  return {
    value: { allocationId: spec.allocationId, qty: qty!, reason, note: short && note ? note : null },
  };
}

export type LinesResult = { ok: true; lines: LineInput[] } | { ok: false; errors: Record<string, LineError> };

/** Kiểm mọi dòng; phải có đúng một bản nháp cho mỗi phân bổ. */
export function validateLines(
  specs: readonly LineSpec[],
  drafts: readonly LineDraft[],
  allowedReasons: readonly ShortfallReason[],
): LinesResult {
  const byId = new Map(drafts.map((d) => [d.allocationId, d]));
  const lines: LineInput[] = [];
  const errors: Record<string, LineError> = {};
  for (const spec of specs) {
    const draft = byId.get(spec.allocationId);
    if (!draft) {
      errors[spec.allocationId] = { qty: "Vui lòng nhập số lượng." };
      continue;
    }
    const r = validateLine(spec, draft, allowedReasons);
    if (r.error) errors[spec.allocationId] = r.error;
    else lines.push(r.value);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, lines };
}

/** Có dòng nào khác số dự kiến không (để chỉ gửi đề xuất khi người mang hàng thật sự điều chỉnh). */
export function isAdjusted(specs: readonly LineSpec[], drafts: readonly LineDraft[]): boolean {
  const byId = new Map(drafts.map((d) => [d.allocationId, d]));
  return specs.some((s) => {
    const d = byId.get(s.allocationId);
    return d !== undefined && parseQtyInput(d.qty) !== s.expectedQty;
  });
}

/** Tổng kg của các dòng (mỗi dòng làm tròn 3 chữ số như sổ tác động). */
export function totalKg(
  specs: readonly LineSpec[],
  lines: readonly { allocationId: string; qty: number }[],
): number {
  const byId = new Map(specs.map((s) => [s.allocationId, s]));
  let kg = 0;
  for (const l of lines) {
    const s = byId.get(l.allocationId);
    if (s) kg += kgFromQty(l.qty, s.unitWeightKg);
  }
  return Math.round(kg * 1000) / 1000;
}

/** `p_lines` cho RPC (DATA-MODEL §8.5). */
export function toRpcLines(lines: readonly LineInput[]) {
  return lines.map((l) => ({ allocation_id: l.allocationId, qty: l.qty, reason: l.reason, note: l.note }));
}

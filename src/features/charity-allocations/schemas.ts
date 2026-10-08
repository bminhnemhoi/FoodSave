import { z } from "zod";

/** Lý do hủy yêu cầu (DESIGN-SYSTEM §12.5: chọn sẵn + "Khác"). */
export const CANCEL_REASONS = [
  { value: "no_longer_needed", label: "Không còn nhu cầu" },
  { value: "no_carrier", label: "Không sắp xếp được người đi lấy" },
  { value: "covered_elsewhere", label: "Đã nhận đủ từ nguồn khác" },
  { value: "other", label: "Khác" },
] as const;

export type CancelReasonValue = (typeof CANCEL_REASONS)[number]["value"];

export const cancelAllocationSchema = z
  .object({
    allocationId: z.uuid(),
    /** Bắt buộc khi đã được xác nhận (§12.5 "hủy sau xác nhận"); yêu cầu chưa xác nhận thì tùy chọn. */
    requireReason: z.boolean(),
    reason: z.enum(["no_longer_needed", "no_carrier", "covered_elsewhere", "other"]).nullable(),
    note: z.string().trim().max(400, "Ghi chú tối đa 400 ký tự.").nullable(),
    clientOpId: z.uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.requireReason && !v.reason)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Vui lòng chọn lý do hủy." });
    if (v.reason === "other" && !v.note)
      ctx.addIssue({ code: "custom", path: ["note"], message: "Vui lòng ghi rõ lý do." });
  });

/** Lý do gửi vào RPC (≤ 500 ký tự): nhãn tiếng Việt + ghi chú. */
export function cancelReasonText(reason: CancelReasonValue | null, note: string | null): string | null {
  const label = CANCEL_REASONS.find((r) => r.value === reason)?.label ?? null;
  const parts = [reason === "other" ? null : label, note?.trim() || null].filter(Boolean);
  return parts.length ? parts.join(" — ").slice(0, 500) : null;
}

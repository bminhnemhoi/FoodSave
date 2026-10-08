import { z } from "zod";

import { HANDOVER_CODE_RE, HANDOVER_TOKEN_RE } from "./payload";

/**
 * Schema zod dùng chung client/server cho Server Action bàn giao (DATA-MODEL §8.5). Quy tắc nghiệp vụ của
 * từng dòng (≤ số đặt, số nguyên, lý do, ghi chú) nằm ở `lines.ts` (báo lỗi tại chỗ) và được DB kiểm lại.
 */

const uuid = z.uuid();

export const lineInputSchema = z.object({
  allocationId: uuid,
  qty: z.number().min(0).max(999_999_999),
  reason: z.enum(["store_short", "quality_reject", "capacity", "no_show"]).nullable(),
  note: z.string().trim().max(300).nullable(),
});

export const issueTokenSchema = z.object({
  pickupId: uuid,
  stopId: uuid,
  /** Rỗng = không đề xuất điều chỉnh (mang đủ số đã đặt). */
  lines: z.array(lineInputSchema).max(50),
  clientOpId: uuid,
});

export const peekSchema = z.object({ token: z.string().regex(HANDOVER_TOKEN_RE) });

export const confirmSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("qr"),
    token: z.string().regex(HANDOVER_TOKEN_RE),
    lines: z.array(lineInputSchema).min(1).max(50),
    clientOpId: uuid,
  }),
  z.object({
    method: z.literal("code"),
    handoverId: uuid,
    code: z.string().regex(HANDOVER_CODE_RE, "Mã gồm đúng 6 chữ số."),
    lines: z.array(lineInputSchema).min(1).max(50),
    clientOpId: uuid,
  }),
]);

export const handoverStatusSchema = z.object({ handoverId: uuid });

export type LineInputDto = z.infer<typeof lineInputSchema>;
export type IssueTokenInput = z.infer<typeof issueTokenSchema>;
export type ConfirmInput = z.infer<typeof confirmSchema>;

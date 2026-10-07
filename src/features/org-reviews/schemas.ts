import { z } from "zod";

/**
 * Schema dùng chung client/server cho hàng đợi duyệt (US-ADM-02..04, F-61, F-69).
 * Lý do bắt buộc ≥ 10 ký tự khi không duyệt (US-ADM-04 AC2); trần 1000 ký tự khớp CHECK của DB.
 */

export const REASON_MIN = 10;
export const REASON_MAX = 1000;

export const REVIEW_DECISIONS = ["approve", "request_changes", "reject"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** Lý do: cắt khoảng trắng; `required` ⇒ ≥ 10 ký tự. Trường rỗng khi không bắt buộc ⇒ undefined. */
function reasonField(required: boolean, label = "lý do") {
  return z
    .string()
    .trim()
    .max(REASON_MAX, `Vui lòng viết ${label} ngắn hơn ${REASON_MAX} ký tự.`)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !required || (v !== undefined && v.length >= REASON_MIN), {
      message: `Vui lòng nhập ${label} (ít nhất ${REASON_MIN} ký tự) để bên đăng ký biết cần làm gì.`,
    });
}

const uuid = (label: string) => z.uuid({ message: `${label} không hợp lệ.` });

export const reviewOrgSchema = z
  .object({
    orgId: uuid("Mã hồ sơ"),
    decision: z.enum(REVIEW_DECISIONS, { message: "Vui lòng chọn quyết định." }),
    reason: z.string().optional(),
    clientOpId: uuid("Mã thao tác"),
  })
  .transform((v, ctx) => {
    const parsed = reasonField(v.decision !== "approve").safeParse(v.reason);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: ["reason"] });
      }
      return z.NEVER;
    }
    return { ...v, reason: parsed.data };
  });
export type ReviewOrgInput = z.input<typeof reviewOrgSchema>;

export const CHANGE_DECISIONS = ["approve", "reject"] as const;
export type ChangeDecision = (typeof CHANGE_DECISIONS)[number];

export const reviewChangeSchema = z
  .object({
    requestId: uuid("Mã yêu cầu"),
    decision: z.enum(CHANGE_DECISIONS, { message: "Vui lòng chọn quyết định." }),
    note: z.string().optional(),
    clientOpId: uuid("Mã thao tác"),
  })
  .transform((v, ctx) => {
    const parsed = reasonField(v.decision === "reject").safeParse(v.note);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: ["note"] });
      }
      return z.NEVER;
    }
    return { ...v, note: parsed.data };
  });
export type ReviewChangeInput = z.input<typeof reviewChangeSchema>;

/** Tạm khóa / mở khóa (F-69): luôn có lý do; tạm khóa còn phải gõ đúng tên tổ chức (DESIGN-SYSTEM §12.5). */
export const orgStandingSchema = z
  .object({
    orgId: uuid("Mã tổ chức"),
    action: z.enum(["suspend", "reinstate"]),
    reason: z.string().optional(),
    confirmName: z.string().optional(),
    clientOpId: uuid("Mã thao tác"),
  })
  .transform((v, ctx) => {
    const parsed = reasonField(true).safeParse(v.reason);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: ["reason"] });
      }
      return z.NEVER;
    }
    return { ...v, reason: parsed.data! };
  });
export type OrgStandingInput = z.input<typeof orgStandingSchema>;

export const verifyIdSchema = z.object({
  orgId: uuid("Mã tổ chức"),
  last4: z
    .string()
    .trim()
    .regex(/^[0-9]{4}$/, "Vui lòng nhập đúng 4 số cuối trên CCCD."),
});
export type VerifyIdInput = z.input<typeof verifyIdSchema>;

export const documentIdSchema = uuid("Mã giấy tờ");

// ---------------------------------------------------------------------------
// Bộ lọc hàng đợi (đồng bộ URL — DESIGN-SYSTEM §12.3)
// ---------------------------------------------------------------------------

export const QUEUE_VIEWS = [
  "submitted",
  "changes",
  "needs_changes",
  "approved",
  "rejected",
  "suspended",
] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export const ORG_LIST_VIEWS = ["approved", "suspended"] as const;
export type OrgListView = (typeof ORG_LIST_VIEWS)[number];

export type QueueFilters<V extends string = QueueView> = {
  view: V;
  kind: "store" | "charity" | null;
  q: string;
  page: number;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Đọc `?view=&kind=&q=&page=` một cách an toàn; giá trị lạ ⇒ mặc định (không báo lỗi). */
export function parseQueueFilters<V extends string>(
  params: Record<string, string | string[] | undefined>,
  views: readonly V[],
  fallback: V,
): QueueFilters<V> {
  const rawView = first(params.view);
  const view = views.includes(rawView as V) ? (rawView as V) : fallback;
  const rawKind = first(params.kind);
  const kind = rawKind === "store" || rawKind === "charity" ? rawKind : null;
  const q = (first(params.q) ?? "").trim().slice(0, 80);
  const pageNum = Number.parseInt(first(params.page) ?? "1", 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 && pageNum <= 1000 ? pageNum : 1;
  return { view, kind, q, page };
}

/** Tạo query string cho liên kết lọc/phân trang; bỏ giá trị mặc định cho URL gọn. */
export function queueHref<V extends string>(
  base: string,
  filters: QueueFilters<V>,
  patch: Partial<QueueFilters<V>>,
  defaultView: V,
): string {
  const next = { ...filters, ...patch };
  const sp = new URLSearchParams();
  if (next.view !== defaultView) sp.set("view", next.view);
  if (next.kind) sp.set("kind", next.kind);
  if (next.q) sp.set("q", next.q);
  if (next.page > 1) sp.set("page", String(next.page));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Thoát ký tự đặc biệt của LIKE để tìm theo tên đúng nghĩa đen. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notificationEmail } from "@/server/email/templates";
import type { EmailProvider } from "@/server/providers/notify";
import { ProviderError } from "@/server/providers/types";
import type { Database } from "@/types/database.types";

/**
 * Dispatcher thông báo (ARCHITECTURE §8, DATA-MODEL §12.1) — chạy bằng service role, gọi từ
 * `POST /api/jobs/dispatch` sau khi kiểm HMAC. Ba pha, mỗi pha một lô nhỏ, trong ngân sách thời gian:
 *  1. `dispatch_outbox` (SQL): lease outbox, chọn người nhận, tạo `notifications` idempotent, done/retry/dead.
 *  2. `kyc_purge`: xóa file KYC qua Storage API rồi `mark_kyc_purged` (DATA-MODEL §16).
 *  3. Email: `claim_email_deliveries` → gửi qua NotifyProvider → `complete_email_delivery`.
 * Chạy lại an toàn: UNIQUE (outbox_id, user_id), lease có hạn, mỗi email một dòng delivery.
 * Không log địa chỉ email, nội dung thư hay secret — chỉ số đếm và mã lỗi.
 */

type Db = SupabaseClient<Database>;

export type DispatchSummary = {
  fanout: { claimed: number; done: number; retried: number; dead: number; notifications: number };
  kyc: { claimed: number; purged: number; failed: number };
  email: { claimed: number; sent: number; failed: number };
  /** Pha bỏ qua vì hết ngân sách thời gian hoặc chưa cấu hình. */
  skipped: string[];
  /** Mã lỗi (không chứa dữ liệu cá nhân). */
  errors: string[];
};

export type DispatchDeps = {
  db: Db;
  /** Lấy provider khi cần (provider chưa cấu hình chỉ làm hỏng pha email). */
  getEmailProvider: () => EmailProvider;
  appUrl: string;
  /** Production không được "gửi" bằng provider fake (thư sẽ mất mà vẫn đánh dấu đã gửi). */
  isProduction?: boolean;
  budgetMs?: number;
  now?: () => number;
  limits?: { fanout?: number; kyc?: number; email?: number };
};

const DEFAULT_BUDGET_MS = 8_000;
const EMAIL_CONCURRENCY = 5;

/** Bỏ địa chỉ email khỏi thông báo lỗi của provider trước khi lưu/log. */
export function redactError(err: unknown): string {
  const kind = err instanceof ProviderError ? `${err.provider}:${err.kind}` : "error";
  const message = err instanceof Error ? err.message : String(err);
  return `${kind} ${message}`
    .replace(/[^\s<>()"',;:]+@[^\s<>()"',;:]+/g, "<email>")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

/**
 * Nhãn lỗi Supabase cho summary/log: mã Postgres/PostgREST nếu có; lỗi mạng/fetch (mã rỗng) ⇒ tên + thông điệp
 * rút gọn, đã che mọi chuỗi giống khóa API/JWT (thông điệp header không hợp lệ có thể chứa nguyên giá trị).
 */
export function errorTag(err: { code?: string | null; message?: string | null }): string {
  if (err.code) return err.code;
  const msg = (err.message ?? "unknown")
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, "<key>")
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "<jwt>")
    .replace(/\s+/g, " ")
    .trim();
  return msg.slice(0, 120) || "unknown";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function runDispatch(deps: DispatchDeps): Promise<DispatchSummary> {
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const timeLeft = () => budget - (now() - started);
  const { db } = deps;

  const summary: DispatchSummary = {
    fanout: { claimed: 0, done: 0, retried: 0, dead: 0, notifications: 0 },
    kyc: { claimed: 0, purged: 0, failed: 0 },
    email: { claimed: 0, sent: 0, failed: 0 },
    skipped: [],
    errors: [],
  };

  // 1. Fan-out (SQL)
  const fan = await db.rpc("dispatch_outbox", { p_limit: deps.limits?.fanout ?? 50 });
  if (fan.error) {
    summary.errors.push(`fanout:${errorTag(fan.error)}`);
  } else {
    const r = (fan.data ?? {}) as Record<string, unknown>;
    summary.fanout = {
      claimed: num(r.claimed),
      done: num(r.done),
      retried: num(r.retried),
      dead: num(r.dead),
      notifications: num(r.notifications),
    };
  }

  // 2. kyc_purge (Storage API)
  if (timeLeft() <= 1_000) {
    summary.skipped.push("kyc");
  } else {
    await purgeKyc(deps, summary);
  }

  // 3. Email
  if (timeLeft() <= 1_500) {
    summary.skipped.push("email");
  } else {
    await sendEmails(deps, summary);
  }

  return summary;
}

async function purgeKyc(deps: DispatchDeps, summary: DispatchSummary): Promise<void> {
  const { db } = deps;
  const claim = await db.rpc("claim_outbox_batch", {
    p_limit: deps.limits?.kyc ?? 10,
    p_events: ["kyc_purge"],
  });
  if (claim.error) {
    summary.errors.push(`kyc_claim:${errorTag(claim.error)}`);
    return;
  }
  const rows = claim.data ?? [];
  summary.kyc.claimed = rows.length;

  for (const row of rows) {
    const payload = (row.payload ?? {}) as { document_id?: unknown; bucket?: unknown; path?: unknown };
    let error: string | null = null;
    if (
      payload.bucket !== "kyc" ||
      typeof payload.path !== "string" ||
      typeof payload.document_id !== "string"
    ) {
      error = "invalid_payload";
    } else {
      const removed = await db.storage.from("kyc").remove([payload.path]);
      if (removed.error) {
        error = `storage:${removed.error.name ?? "error"}`;
      } else {
        const marked = await db.rpc("mark_kyc_purged", { p_document_id: payload.document_id });
        if (marked.error) error = `mark:${errorTag(marked.error)}:${marked.error.details ?? ""}`;
      }
    }
    const done = await db.rpc("complete_outbox", {
      p_id: row.id,
      p_ok: error === null,
      p_error: error ?? undefined,
    });
    if (done.error) summary.errors.push(`kyc_complete:${errorTag(done.error)}`);
    if (error) summary.kyc.failed += 1;
    else summary.kyc.purged += 1;
  }
}

async function sendEmails(deps: DispatchDeps, summary: DispatchSummary): Promise<void> {
  const { db } = deps;
  let provider: EmailProvider;
  try {
    provider = deps.getEmailProvider();
  } catch (err) {
    summary.skipped.push("email");
    summary.errors.push(`email_provider:${err instanceof ProviderError ? err.kind : "error"}`);
    return;
  }
  if (provider.id === "fake" && deps.isProduction) {
    summary.skipped.push("email");
    summary.errors.push("email_provider:fake_in_production");
    return;
  }

  const claim = await db.rpc("claim_email_deliveries", { p_limit: deps.limits?.email ?? 20 });
  if (claim.error) {
    summary.errors.push(`email_claim:${errorTag(claim.error)}`);
    return;
  }
  const rows = claim.data ?? [];
  summary.email.claimed = rows.length;

  await eachLimited(rows, EMAIL_CONCURRENCY, async (row) => {
    let ok = false;
    let messageId: string | undefined;
    let error: string | undefined;
    try {
      const message = notificationEmail({
        to: row.email,
        recipientName: row.full_name ?? "",
        orgName: row.org_name ?? null,
        event: row.event,
        urgency: row.urgency === "urgent" ? "urgent" : "normal",
        title: row.title,
        body: row.body ?? "",
        linkPath: row.link_path ?? null,
        appUrl: deps.appUrl,
      });
      const sent = await provider.send(message);
      ok = true;
      messageId = sent.messageId?.slice(0, 300);
    } catch (err) {
      error = redactError(err);
    }
    const done = await db.rpc("complete_email_delivery", {
      p_notification_id: row.notification_id,
      p_ok: ok,
      p_provider_message_id: messageId,
      p_error: error,
    });
    if (done.error) summary.errors.push(`email_complete:${errorTag(done.error)}`);
    if (ok) summary.email.sent += 1;
    else summary.email.failed += 1;
  });
}

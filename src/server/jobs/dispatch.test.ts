import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { EmailMessage, EmailProvider } from "@/server/providers/notify";
import { ProviderError } from "@/server/providers/types";
import type { Database } from "@/types/database.types";

import { redactError, runDispatch } from "./dispatch";

type Result = { data: unknown; error: { code?: string; details?: string; name?: string } | null };
type Handler = (args: Record<string, unknown>) => Result;

function fakeDb(handlers: Record<string, Handler>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const removed: string[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return handlers[fn]?.(args) ?? { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push(...paths.map((p) => `${bucket}/${p}`));
          return { data: [], error: null };
        },
      }),
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, calls, removed };
}

function provider(fail?: (m: EmailMessage) => boolean): EmailProvider & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    id: "smtp",
    sent,
    async send(message) {
      if (fail?.(message)) {
        throw new ProviderError(
          "smtp",
          "unavailable",
          `550 5.1.1 <${message.to}>: Recipient address rejected`,
          true,
        );
      }
      sent.push(message);
      return { messageId: `<${sent.length}@test>` };
    },
  };
}

const emailRow = (id: string, to: string, over: Record<string, unknown> = {}) => ({
  notification_id: id,
  event: "allocation_requested",
  urgency: "normal",
  title: "Yêu cầu nhận lô mới: Bánh mì",
  body: "Bếp ăn Nắng Mai muốn nhận 20 ổ.",
  link_path: "/store/inventory?offer=1",
  email: to,
  full_name: "Lan",
  org_name: "Tiệm bánh Hạt Lúa",
  attempts: 1,
  ...over,
});

const APP = "https://foodsave.test";

describe("runDispatch", () => {
  it("fan-out SQL, rồi gửi email đã đến hạn và ghi kết quả từng thư", async () => {
    const { db, calls } = fakeDb({
      dispatch_outbox: () => ({
        data: { claimed: 2, done: 2, retried: 0, dead: 0, notifications: 5 },
        error: null,
      }),
      claim_outbox_batch: () => ({ data: [], error: null }),
      claim_email_deliveries: () => ({
        data: [
          emailRow("n1", "lan@example.com"),
          emailRow("n2", "bad@example.com", { event: "offer_turned_red", urgency: "urgent" }),
        ],
        error: null,
      }),
      complete_email_delivery: () => ({ data: true, error: null }),
    });
    const email = provider((m) => m.to === "bad@example.com");
    const summary = await runDispatch({ db, getEmailProvider: () => email, appUrl: APP });

    expect(summary.fanout).toEqual({ claimed: 2, done: 2, retried: 0, dead: 0, notifications: 5 });
    expect(summary.email).toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(summary.errors).toEqual([]);
    expect(email.sent.map((m) => [m.to, m.tag])).toEqual([
      ["lan@example.com", "notify.allocation_requested"],
    ]);
    expect(email.sent[0]!.text).toContain(`${APP}/store/inventory?offer=1`);

    const completes = calls.filter((c) => c.fn === "complete_email_delivery").map((c) => c.args);
    expect(completes).toContainEqual({
      p_notification_id: "n1",
      p_ok: true,
      p_provider_message_id: "<1@test>",
      p_error: undefined,
    });
    const failed = completes.find((c) => c.p_notification_id === "n2")!;
    expect(failed.p_ok).toBe(false);
    expect(String(failed.p_error)).toContain("smtp:unavailable");
    expect(String(failed.p_error)).not.toContain("bad@example.com");
    expect(calls[0]).toEqual({ fn: "dispatch_outbox", args: { p_limit: 50 } });
  });

  it("kyc_purge: xóa qua Storage API, mark_kyc_purged rồi complete_outbox; payload lạ ⇒ thất bại có mã", async () => {
    const { db, calls, removed } = fakeDb({
      dispatch_outbox: () => ({ data: { claimed: 0 }, error: null }),
      claim_outbox_batch: () => ({
        data: [
          { id: "o1", payload: { document_id: "d1", bucket: "kyc", path: "org/a/license.pdf" } },
          { id: "o2", payload: { bucket: "media", path: "x" } },
        ],
        error: null,
      }),
      mark_kyc_purged: () => ({ data: null, error: null }),
      complete_outbox: () => ({ data: "done", error: null }),
      claim_email_deliveries: () => ({ data: [], error: null }),
    });
    const summary = await runDispatch({ db, getEmailProvider: () => provider(), appUrl: APP });

    expect(removed).toEqual(["kyc/org/a/license.pdf"]);
    expect(summary.kyc).toEqual({ claimed: 2, purged: 1, failed: 1 });
    expect(calls.find((c) => c.fn === "claim_outbox_batch")!.args).toEqual({
      p_limit: 10,
      p_events: ["kyc_purge"],
    });
    expect(calls.find((c) => c.fn === "mark_kyc_purged")!.args).toEqual({ p_document_id: "d1" });
    const completes = calls.filter((c) => c.fn === "complete_outbox").map((c) => c.args);
    expect(completes).toEqual([
      { p_id: "o1", p_ok: true, p_error: undefined },
      { p_id: "o2", p_ok: false, p_error: "invalid_payload" },
    ]);
  });

  it("hết ngân sách thời gian thì bỏ qua các pha sau (lần tick sau làm tiếp)", async () => {
    let t = 0;
    const { db, calls } = fakeDb({
      dispatch_outbox: () => {
        t += 9_000;
        return { data: { claimed: 50, done: 50 }, error: null };
      },
    });
    const summary = await runDispatch({ db, getEmailProvider: () => provider(), appUrl: APP, now: () => t });
    expect(summary.skipped).toEqual(["kyc", "email"]);
    expect(calls.map((c) => c.fn)).toEqual(["dispatch_outbox"]);
  });

  it("provider email chưa cấu hình hoặc là fake ở production ⇒ không lease email", async () => {
    const handlers = {
      dispatch_outbox: () => ({ data: {}, error: null }),
      claim_outbox_batch: () => ({ data: [], error: null }),
    };
    const a = fakeDb(handlers);
    const s1 = await runDispatch({
      db: a.db,
      getEmailProvider: () => {
        throw new ProviderError("resend", "unavailable", "chưa hiện thực", false);
      },
      appUrl: APP,
    });
    expect(s1.errors).toContain("email_provider:unavailable");
    expect(a.calls.some((c) => c.fn === "claim_email_deliveries")).toBe(false);

    const b = fakeDb(handlers);
    const fake: EmailProvider = { id: "fake", send: async () => ({}) };
    const s2 = await runDispatch({ db: b.db, getEmailProvider: () => fake, appUrl: APP, isProduction: true });
    expect(s2.errors).toContain("email_provider:fake_in_production");
    expect(b.calls.some((c) => c.fn === "claim_email_deliveries")).toBe(false);
  });

  it("lỗi RPC chỉ ghi mã lỗi", async () => {
    const { db } = fakeDb({
      dispatch_outbox: () => ({ data: null, error: { code: "PGRST301" } }),
      claim_outbox_batch: () => ({ data: null, error: { code: "42501" } }),
      claim_email_deliveries: () => ({ data: null, error: { code: "42501" } }),
    });
    const summary = await runDispatch({ db, getEmailProvider: () => provider(), appUrl: APP });
    expect(summary.errors).toEqual(["fanout:PGRST301", "kyc_claim:42501", "email_claim:42501"]);
  });
});

describe("redactError", () => {
  it("bỏ địa chỉ email và giữ loại lỗi provider", () => {
    const msg = redactError(
      new ProviderError("smtp", "unauthorized", "Invalid login for a.b+c@gmail.com", false),
    );
    expect(msg).toBe("smtp:unauthorized Invalid login for <email>");
    expect(redactError("x".repeat(500)).length).toBeLessThanOrEqual(300);
  });
});

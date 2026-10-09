import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, type TestInfo } from "@playwright/test";

import { waitForEmailLink } from "../fixtures/mailpit";

/**
 * Tiện ích chung cho UAT tự động (docs/uat/*): đọc thư Mailpit đầy đủ (người gửi, tiêu đề, thời điểm), ảnh chụp
 * vào thư mục bằng chứng (UAT_SHOTS_DIR), ghi chú vào báo cáo Playwright. Chỉ dùng với Supabase LOCAL.
 */

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Chuỗi lỗi mã hóa tiếng Việt hay gặp (UTF-8 đọc thành Latin-1). */
export const MOJIBAKE = /Ã[\u0080-\u00bf¡-ÿ]|Â[\u0080-\u00bf¡-¿]|â€|Æ°|Ä‘|á»|\uFFFD/;

export type Mail = {
  ID: string;
  Subject: string;
  From: { Name: string; Address: string };
  Text: string;
  HTML: string;
  Created: string;
};

/** Thư mới nhất gửi tới `to` có tiêu đề khớp `subject` (chờ tối đa `timeoutMs`). */
export async function waitForMail(to: string, subject: RegExp, timeoutMs = 60_000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    if (res.ok) {
      const data = (await res.json()) as { messages?: { ID: string; Subject: string; Created: string }[] };
      const hit = data.messages?.find((m) => subject.test(m.Subject));
      if (hit) {
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as Omit<
          Mail,
          "Created"
        >;
        return { ...msg, Created: hit.Created };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Không thấy thư "${subject}" gửi tới ${to} trong ${timeoutMs} ms`);
}

export async function mailCount(to: string, subject?: RegExp): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!res.ok) return 0;
  const data = (await res.json()) as { messages?: { Subject: string }[] };
  return (data.messages ?? []).filter((m) => !subject || subject.test(m.Subject)).length;
}

export { waitForEmailLink };

/** Link đầu tiên trong thư khớp `pattern`. */
export function linkIn(mail: Mail, pattern: RegExp): string {
  const body = `${mail.HTML ?? ""}\n${mail.Text ?? ""}`;
  const m = body.match(pattern);
  if (!m) throw new Error(`Thư "${mail.Subject}" không có link khớp ${pattern}`);
  return m[0].replaceAll("&amp;", "&");
}

export function note(testInfo: TestInfo, type: string, description: string) {
  testInfo.annotations.push({ type, description });
}

/** Ảnh chụp bằng chứng: `<UAT_SHOTS_DIR>/<tên>-<project>.png` (hoặc thư mục kết quả của test). */
export async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  const dir = process.env.UAT_SHOTS_DIR;
  if (dir) mkdirSync(dir, { recursive: true });
  const file = `${name}-${testInfo.project.name}.png`;
  const target = dir ? path.join(dir, file) : testInfo.outputPath(file);
  await page.screenshot({ path: target, fullPage }).catch(() => undefined);
  testInfo.annotations.push({ type: "screenshot", description: target });
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

/** Chuỗi → RegExp khớp nguyên văn. */
export function literal(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** Hậu tố ngắn, khác nhau giữa các lượt và giữa desktop/mobile. */
export function tag(testInfo: TestInfo): string {
  return `${testInfo.project.name === "mobile" ? "m" : "d"}${Date.now().toString(36).slice(-5)}`;
}

/** Đăng nhập qua form /login (không chờ sự kiện `load` của trang đích). */
export async function loginUi(page: Page, email: string, password: string) {
  const form = page.locator("form").filter({ has: page.getByLabel("Mật khẩu") });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill(password);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
}

/** Đăng xuất bằng menu tài khoản (app shell) hoặc nút "Đăng xuất" (trang onboarding/MFA). */
export async function logoutUi(page: Page) {
  const account = page.getByRole("button", { name: /^Tài khoản:/ });
  if (await account.isVisible().catch(() => false)) {
    await account.click();
    await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  } else {
    await page.getByRole("button", { name: "Đăng xuất" }).first().click();
  }
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}

/**
 * Trạng thái hành trình UAT dùng chung giữa các test của một checklist, lưu ra file theo (project, lượt chạy):
 * test chạy theo thứ tự trong một worker (mode "default"); khi một bước lỗi, worker mới đọc lại trạng thái và
 * các bước sau vẫn chạy (bước nào thiếu dữ liệu thì tự skip "bị chặn bởi bước trước").
 * Lượt chạy được nhận diện bằng PID của tiến trình Playwright chính (cha của mọi worker).
 */
export function journeyStore<T extends object>(name: string, testInfo: TestInfo, init: () => T) {
  const file = path.join(testInfo.project.outputDir, `${name}-${testInfo.project.name}.json`);
  const runner = process.ppid;
  let state: T;
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, "utf8")) as { runner: number; state: T };
    state = saved.runner === runner ? saved.state : init();
  } else state = init();
  return {
    state,
    save() {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ runner, state }, null, 2));
    },
  };
}

/**
 * Supabase local không gọi được dispatcher của máy chủ UAT (pg_net trỏ cổng khác) ⇒ thay pg_cron/pg_net bằng
 * một vòng gọi `/api/jobs/dispatch` có chữ ký mỗi `everyMs` (production: pg_net gọi ngay khi có outbox).
 */
export function startDispatchPump(baseURL: string, everyMs = 1_000): () => void {
  let stopped = false;
  const tick = async () => {
    while (!stopped) {
      const { callDispatch } = await import("../fixtures/jobs");
      await callDispatch(baseURL).catch(() => undefined);
      await new Promise((r) => setTimeout(r, everyMs));
    }
  };
  void tick();
  return () => {
    stopped = true;
  };
}

/** Ngày (YYYY-MM-DD) và giờ (HHMM, cho ô giờ 24h) theo giờ Việt Nam. */
export function vnParts(ms: number): { date: string; hhmm: string; hm: string; dow: number } {
  const d = new Date(ms);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, hhmm: hm.replace(":", ""), hm, dow };
}

/** Làm tròn lên bội số `stepMin` phút. */
export function roundUp(ms: number, stepMin = 5): number {
  const step = stepMin * 60_000;
  return Math.ceil(ms / step) * step;
}

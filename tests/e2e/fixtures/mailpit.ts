/** Đọc email từ Mailpit của Supabase local (chỉ dùng trong E2E local/CI). */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailSummary = { ID: string; Subject: string; Created: string };

export async function waitForEmailLink(to: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (res.ok) {
      const data = (await res.json()) as { messages: MailSummary[] };
      const latest = data.messages?.[0];
      if (latest) {
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json()) as {
          HTML: string;
          Text: string;
        };
        const body = `${msg.HTML ?? ""}\n${msg.Text ?? ""}`;
        const match = body.match(/https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/);
        if (match) return match[0].replaceAll("&amp;", "&");
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Không nhận được email gửi tới ${to} trong ${timeoutMs} ms`);
}

export const uniqueEmail = (prefix: string) =>
  `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;

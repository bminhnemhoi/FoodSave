import "server-only";

import type { EmailMessage, EmailProvider } from "./types";

/** Provider giả lập: lưu thư trong bộ nhớ (unit test) và ghi log tóm tắt — không lộ nội dung/link. */
export function createFakeEmailProvider(
  outbox: EmailMessage[] = [],
): EmailProvider & { outbox: EmailMessage[] } {
  return {
    id: "fake",
    outbox,
    async send(message) {
      outbox.push(message);
      console.warn(`[email:fake] tag=${message.tag} subject="${message.subject}" (không gửi thật)`);
      return { messageId: `fake-${outbox.length}` };
    },
  };
}

import "server-only";

import nodemailer from "nodemailer";

import { ProviderError } from "../types";
import type { EmailProvider } from "./types";

export type SmtpConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
};

/** Gửi email qua SMTP (Gmail App Password ở production; Mailpit của Supabase ở local). */
export function createSmtpProvider(config: SmtpConfig): EmailProvider {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
  });

  return {
    id: "smtp",
    async send(message) {
      try {
        const info = await transport.sendMail({
          from: config.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: { "X-FoodSave-Tag": message.tag },
        });
        return { messageId: info.messageId };
      } catch (err) {
        const code = (err as { code?: string }).code;
        const auth = code === "EAUTH";
        throw new ProviderError("smtp", auth ? "unauthorized" : "unavailable", String(err), !auth);
      }
    },
  };
}

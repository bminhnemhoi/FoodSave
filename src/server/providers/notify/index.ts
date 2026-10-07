import "server-only";

import { serverEnv } from "@/server/env";

import { ProviderError } from "../types";
import { createFakeEmailProvider } from "./fake";
import { createSmtpProvider } from "./smtp";
import type { EmailProvider } from "./types";

let instance: EmailProvider | undefined;

/** Provider email theo NOTIFY_PROVIDER (ADR-011, ADR-012). */
export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  switch (serverEnv.NOTIFY_PROVIDER) {
    case "smtp":
      instance = createSmtpProvider({
        host: serverEnv.SMTP_HOST,
        port: serverEnv.SMTP_PORT,
        user: serverEnv.SMTP_USER,
        pass: serverEnv.SMTP_PASS,
        from: serverEnv.EMAIL_FROM,
      });
      break;
    case "fake":
      instance = createFakeEmailProvider();
      break;
    default:
      throw new ProviderError(
        serverEnv.NOTIFY_PROVIDER,
        "unavailable",
        "Provider email chưa được hiện thực",
        false,
      );
  }
  return instance;
}

export type { EmailMessage, EmailProvider } from "./types";

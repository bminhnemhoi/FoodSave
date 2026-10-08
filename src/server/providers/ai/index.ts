import "server-only";

import { serverEnv } from "@/server/env";

import { createFakeAiProvider } from "./fake";
import { createOpenAiProvider } from "./openai";
import type { AiProvider } from "./types";

let instance: AiProvider | null | undefined;

/**
 * Provider AI theo AI_PROVIDER (ADR-010). Trả null khi AI tắt (FEATURE_AI=false) hoặc thiếu key —
 * nơi gọi luôn có đường dự phòng không cần AI (người dùng tự điền).
 */
export function getAiProvider(): AiProvider | null {
  if (instance !== undefined) return instance;
  if (!serverEnv.FEATURE_AI) return (instance = null);
  switch (serverEnv.AI_PROVIDER) {
    case "openai":
      instance = serverEnv.OPENAI_API_KEY
        ? createOpenAiProvider({
            apiKey: serverEnv.OPENAI_API_KEY,
            model: serverEnv.AI_MODEL,
            lightModel: serverEnv.AI_MODEL_LIGHT,
          })
        : null;
      break;
    case "fake":
      instance = createFakeAiProvider();
      break;
    default:
      // anthropic/bedrock: hiện thực khi có tài khoản (đọc skill claude-api trước khi viết).
      instance = null;
  }
  return instance;
}

export type { AiProvider, AiResult, OfferDraftFields } from "./types";

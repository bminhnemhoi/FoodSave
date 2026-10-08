import "server-only";

import { z } from "zod";

import { DEFAULT_TIMEOUT_MS, type ProviderCallOptions } from "../types";
import {
  ESG_SUMMARY_INSTRUCTIONS,
  offerFromPhotoInstructions,
  ORG_DOCUMENT_INSTRUCTIONS,
  PROOF_REVIEW_INSTRUCTIONS,
} from "./prompts";
import {
  esgSummarySchema,
  offerDraftSchema,
  orgDocumentSchema,
  proofReviewSchema,
  type AiProvider,
  type AiResult,
} from "./types";

const ENDPOINT = "https://api.openai.com/v1/responses";
/** Tác vụ có ảnh/PDF cần nhiều thời gian hơn mặc định 4 s của provider. */
const AI_TIMEOUT_MS = Math.max(DEFAULT_TIMEOUT_MS, 30_000);

type InputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" }
  | { type: "input_file"; filename: string; file_data: string };

type ResponsesPayload = {
  status?: string;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string } | null;
};

export type OpenAiConfig = {
  apiKey: string;
  model: string; // ảnh + trích xuất (vd. gpt-5.4-mini)
  lightModel: string; // văn bản nhẹ (vd. gpt-5.4-nano)
  fetchImpl?: typeof fetch;
};

/** Từ khóa JSON Schema mà structured output (strict) của OpenAI không hỗ trợ — zod vẫn kiểm lại đầy đủ sau khi nhận. */
const UNSUPPORTED_KEYWORDS = new Set(["minLength", "maxLength", "$schema", "default"]);

/** Bỏ từ khóa không hỗ trợ (đệ quy). Xuất ra để test. */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .filter(([k]) => !UNSUPPORTED_KEYWORDS.has(k))
          .map(([k, v]) => [k, strip(v)]),
      );
    }
    return node;
  };
  return strip(z.toJSONSchema(schema, { target: "draft-7" })) as Record<string, unknown>;
}

/** OpenAI Responses API + structured output (JSON Schema từ zod), luôn zod.parse lại (ADR-010). */
export function createOpenAiProvider(config: OpenAiConfig): AiProvider {
  async function call<T>(args: {
    model: string;
    name: string;
    schema: z.ZodType<T>;
    instructions: string;
    parts: InputPart[];
    opts?: ProviderCallOptions;
  }): Promise<AiResult<T>> {
    const started = Date.now();
    const jsonSchema = toStrictJsonSchema(args.schema);
    let res: Response;
    try {
      res = await (config.fetchImpl ?? fetch)(ENDPOINT, {
        method: "POST",
        signal: args.opts?.signal ?? AbortSignal.timeout(AI_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: args.model,
          instructions: args.instructions,
          input: [{ role: "user", content: args.parts }],
          reasoning: { effort: "low" },
          text: { format: { type: "json_schema", name: args.name, strict: true, schema: jsonSchema } },
          store: false, // không lưu dữ liệu ở phía OpenAI
        }),
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return {
        ok: false,
        reason: timeout ? "timeout" : "provider_error",
        message: String(err).slice(0, 200),
      };
    }

    const payload = (await res.json().catch(() => ({}))) as ResponsesPayload;
    if (res.status === 429) return { ok: false, reason: "rate_limited", message: payload.error?.message };
    if (!res.ok) {
      return {
        ok: false,
        reason: "provider_error",
        message: `HTTP ${res.status}: ${payload.error?.message ?? ""}`,
      };
    }

    const content = payload.output?.flatMap((o) => o.content ?? []) ?? [];
    if (content.some((c) => c.type === "refusal")) return { ok: false, reason: "refused" };
    const text = content.find((c) => c.type === "output_text")?.text;
    if (!text) return { ok: false, reason: "invalid_output", message: `status=${payload.status}` };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "invalid_output", message: "JSON không hợp lệ" };
    }
    const checked = args.schema.safeParse(parsed);
    if (!checked.success)
      return { ok: false, reason: "invalid_output", message: checked.error.message.slice(0, 300) };

    return {
      ok: true,
      data: checked.data,
      model: args.model,
      usage: {
        inputTokens: payload.usage?.input_tokens ?? 0,
        outputTokens: payload.usage?.output_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  }

  return {
    id: "openai",

    async extractOfferFromPhoto({ image, categories }, opts) {
      const result = await call({
        model: config.model,
        name: "offer_draft",
        schema: offerDraftSchema,
        instructions: offerFromPhotoInstructions(categories),
        parts: [
          { type: "input_text", text: "Đề xuất thông tin lô thực phẩm trong ảnh." },
          {
            type: "input_image",
            image_url: `data:${image.mediaType};base64,${image.base64}`,
            detail: "auto",
          },
        ],
        opts,
      });
      // Danh mục phải thuộc danh sách gửi kèm — mã lạ coi như không chắc chắn.
      if (
        result.ok &&
        result.data.categoryCode &&
        !categories.some((c) => c.code === result.data.categoryCode)
      ) {
        return { ...result, data: { ...result.data, categoryCode: null } };
      }
      return result;
    },

    async extractOrgDocument({ file }, opts) {
      const part: InputPart =
        file.mediaType === "application/pdf"
          ? {
              type: "input_file",
              filename: "giay-to.pdf",
              file_data: `data:application/pdf;base64,${file.base64}`,
            }
          : {
              type: "input_image",
              image_url: `data:${file.mediaType};base64,${file.base64}`,
              detail: "high",
            };
      return call({
        model: config.model,
        name: "org_document",
        schema: orgDocumentSchema,
        instructions: ORG_DOCUMENT_INSTRUCTIONS,
        parts: [{ type: "input_text", text: "Trích xuất thông tin pháp lý từ giấy tờ." }, part],
        opts,
      });
    },

    async reviewProofText(input, opts) {
      return call({
        model: config.lightModel,
        name: "proof_review",
        schema: proofReviewSchema,
        instructions: PROOF_REVIEW_INSTRUCTIONS,
        parts: [{ type: "input_text", text: JSON.stringify(input) }],
        opts,
      });
    },

    async summarizeEsg(input, opts) {
      return call({
        model: config.lightModel,
        name: "esg_summary",
        schema: esgSummarySchema,
        instructions: ESG_SUMMARY_INSTRUCTIONS,
        parts: [{ type: "input_text", text: JSON.stringify(input) }],
        opts,
      });
    },
  };
}

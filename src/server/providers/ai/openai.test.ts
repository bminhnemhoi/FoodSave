import { describe, expect, it, vi } from "vitest";

import { createOpenAiProvider, toStrictJsonSchema } from "./openai";
import { esgSummarySchema, offerDraftSchema, orgDocumentSchema, proofReviewSchema } from "./types";

const CATEGORIES = [
  { code: "bakery", nameVi: "Bánh mì & bakery", defaultUnit: "piece" },
  { code: "dairy", nameVi: "Sữa & sản phẩm sữa", defaultUnit: "bottle" },
];
const IMAGE = { mediaType: "image/jpeg" as const, base64: "AAAA" };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const outputText = (obj: unknown) => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }],
  usage: { input_tokens: 1200, output_tokens: 80 },
});

const DRAFT = {
  title: "Bánh mì thịt",
  categoryCode: "bakery",
  quantity: 24,
  unit: "piece",
  unitWeightKg: 0.15,
  expiryDate: null,
  notes: null,
  confidence: 0.8,
};

function provider(fetchImpl: typeof fetch) {
  return createOpenAiProvider({ apiKey: "k", model: "gpt-5.4-mini", lightModel: "gpt-5.4-nano", fetchImpl });
}

describe("JSON Schema gửi OpenAI (strict)", () => {
  it.each([
    ["offer_draft", offerDraftSchema],
    ["org_document", orgDocumentSchema],
    ["proof_review", proofReviewSchema],
    ["esg_summary", esgSummarySchema],
  ])("%s: không còn từ khóa không hỗ trợ, mọi field required, không cho thuộc tính lạ", (_n, schema) => {
    const js = toStrictJsonSchema(schema);
    const text = JSON.stringify(js);
    for (const k of ["minLength", "maxLength", "$schema"]) expect(text).not.toContain(`"${k}"`);
    expect(js.type).toBe("object");
    expect(js.additionalProperties).toBe(false);
    expect([...(js.required as string[])].sort()).toEqual(Object.keys(js.properties as object).sort());
  });
});

describe("OpenAI provider (ADR-010)", () => {
  it("gửi structured output strict, ảnh dạng data URL, store=false; trả dữ liệu đã kiểm bằng zod", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5.4-mini");
      expect(body.store).toBe(false);
      expect(body.text.format.type).toBe("json_schema");
      expect(body.text.format.strict).toBe(true);
      // Chế độ strict của OpenAI: mọi field đều required + additionalProperties false
      expect(body.text.format.schema.additionalProperties).toBe(false);
      expect(body.text.format.schema.required).toEqual(expect.arrayContaining(Object.keys(DRAFT)));
      expect(body.input[0].content[1].image_url).toBe("data:image/jpeg;base64,AAAA");
      expect(body.instructions).toContain("bakery: Bánh mì & bakery");
      return reply(outputText(DRAFT));
    });
    const r = await provider(fetchImpl as typeof fetch).extractOfferFromPhoto({
      image: IMAGE,
      categories: CATEGORIES,
    });
    expect(r).toMatchObject({ ok: true, data: DRAFT, model: "gpt-5.4-mini", usage: { inputTokens: 1200 } });
  });

  it("mã danh mục ngoài danh sách bị đưa về null (AI không được bịa danh mục)", async () => {
    const r = await provider((async () =>
      reply(outputText({ ...DRAFT, categoryCode: "pizza" }))) as typeof fetch).extractOfferFromPhoto({
      image: IMAGE,
      categories: CATEGORIES,
    });
    expect(r.ok && r.data.categoryCode).toBeNull();
  });

  it("đầu ra sai schema ⇒ invalid_output (không tin đầu ra AI)", async () => {
    const r = await provider((async () =>
      reply(outputText({ ...DRAFT, quantity: -5 }))) as typeof fetch).extractOfferFromPhoto({
      image: IMAGE,
      categories: CATEGORIES,
    });
    expect(r).toMatchObject({ ok: false, reason: "invalid_output" });
  });

  it("từ chối ⇒ refused; 429 ⇒ rate_limited; lỗi HTTP ⇒ provider_error", async () => {
    const refusal = { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] };
    expect(
      await provider((async () => reply(refusal)) as typeof fetch).summarizeEsg({
        orgKind: "store",
        month: "2026-10",
        metrics: {},
      }),
    ).toMatchObject({ ok: false, reason: "refused" });
    expect(
      await provider((async () =>
        reply({ error: { message: "slow down" } }, 429)) as typeof fetch).summarizeEsg({
        orgKind: "store",
        month: "2026-10",
        metrics: {},
      }),
    ).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(
      await provider((async () => reply({ error: { message: "quota" } }, 402)) as typeof fetch).summarizeEsg({
        orgKind: "store",
        month: "2026-10",
        metrics: {},
      }),
    ).toMatchObject({ ok: false, reason: "provider_error" });
  });

  it("hết thời gian chờ ⇒ timeout", async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    }) as typeof fetch;
    expect(
      await provider(fetchImpl).reviewProofText({ descriptionVi: "x", peopleServed: 1, items: [] }),
    ).toMatchObject({
      ok: false,
      reason: "timeout",
    });
  });

  it("văn bản minh chứng dùng model nhẹ; PDF giấy tờ gửi dạng input_file", async () => {
    const models: string[] = [];
    const types: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      models.push(body.model);
      types.push(...body.input[0].content.map((c: { type: string }) => c.type));
      return reply(
        outputText(
          body.text.format.name === "proof_review"
            ? { consistent: true, flags: [], noteVi: "Hợp lý." }
            : {
                legalName: "Hộ kinh doanh A",
                registrationNo: "41A8-1",
                taxCode: "0312345678",
                issuedOn: null,
                confidence: 0.9,
              },
        ),
      );
    });
    const p = provider(fetchImpl as typeof fetch);
    await p.reviewProofText({
      descriptionVi: "Phát 40 suất cơm cho trẻ em mái ấm",
      peopleServed: 40,
      items: [],
    });
    await p.extractOrgDocument({ file: { mediaType: "application/pdf", base64: "JVBERi0=" } });
    expect(models).toEqual(["gpt-5.4-nano", "gpt-5.4-mini"]);
    expect(types).toContain("input_file");
  });
});

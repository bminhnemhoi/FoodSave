import "server-only";

import type { AiProvider, AiResult } from "./types";

const ok = <T>(data: T): AiResult<T> => ({
  ok: true,
  data,
  model: "fake",
  usage: { inputTokens: 0, outputTokens: 0 },
  latencyMs: 1,
});

/** Provider giả lập cho E2E/CI và khi chưa có credit: kết quả xác định, không gọi mạng. */
export function createFakeAiProvider(): AiProvider {
  return {
    id: "fake",
    async extractOfferFromPhoto({ categories }) {
      const bakery =
        categories.find((c) => c.code.includes("bakery") || c.code.includes("bread")) ?? categories[0];
      return ok({
        title: "Bánh mì thịt (gợi ý thử nghiệm)",
        categoryCode: bakery?.code ?? null,
        quantity: 24,
        unit: "piece",
        unitWeightKg: 0.15,
        expiryDate: null,
        notes: "Gợi ý từ chế độ thử nghiệm — vui lòng kiểm tra lại.",
        confidence: 0.5,
      });
    },
    async extractOrgDocument() {
      return ok({ legalName: null, registrationNo: null, taxCode: null, issuedOn: null, confidence: 0 });
    },
    async reviewProofText({ descriptionVi }) {
      const vague = descriptionVi.trim().length < 30;
      return ok({
        consistent: !vague,
        flags: vague ? ["vague"] : [],
        noteVi: vague ? "Mô tả còn ngắn, nên nêu rõ phát cho ai và bao nhiêu suất." : "Mô tả hợp lý.",
      });
    },
    async summarizeEsg({ month }) {
      return ok({ summaryVi: `Nhận xét thử nghiệm cho tháng ${month}.` });
    },
  };
}

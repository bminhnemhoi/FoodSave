import { isDateKey } from "./datetime";
import {
  formatDecimalInput,
  isContinuous,
  OFFER_LIMITS,
  UNIT_CODES,
  type CategoryOption,
  type OfferFormValues,
} from "./schemas";

/**
 * Gợi ý AI (ảnh → lô, P2-05, US-STO-08) ⇒ giá trị form. Thuần, có unit test.
 * AI chỉ ĐỀ XUẤT: không bao giờ tự đăng; trường được điền được đánh dấu "AI gợi ý — kiểm tra lại".
 * - Mã danh mục lạ/ngừng dùng ⇒ không điền danh mục (giữ lựa chọn hiện tại).
 * - Số lượng với đơn vị đếm ⇒ làm tròn về số nguyên ≥ 1.
 * - Hạn dùng trong quá khứ ⇒ bỏ qua (AI chỉ đọc hạn in trên bao bì).
 */

/** Hình dạng `OfferDraftFields` của provider AI (src/server/providers/ai/types.ts), lặp lại để client dùng được. */
export type AiOfferDraft = {
  title: string;
  categoryCode: string | null;
  quantity: number | null;
  unit: string | null;
  unitWeightKg: number | null;
  expiryDate: string | null;
  notes: string | null;
  confidence: number;
};

/** Lý do AI không điền được (server action trả về) — luôn kèm đường nhập tay (US-STO-08 AC2). */
export type AiDraftFailure =
  "disabled" | "refused" | "rate_limited" | "quota" | "timeout" | "invalid_output" | "failed";

export const AI_FAILURE_MESSAGES: Record<AiDraftFailure, string> = {
  disabled: "Tính năng AI đang tắt. Bạn vẫn đăng lô bình thường bằng cách nhập tay.",
  refused: "AI không xử lý được ảnh này. Vui lòng nhập tay.",
  rate_limited: "Dịch vụ AI đang tạm thời không phản hồi. Bạn vẫn đăng lô bình thường bằng cách nhập tay.",
  quota: "Cửa hàng đã dùng hết 20 lượt AI trong giờ này. Vui lòng nhập tay hoặc thử lại sau.",
  timeout: "AI phản hồi quá lâu. Vui lòng nhập tay hoặc thử lại.",
  invalid_output: "Không nhận diện được, vui lòng nhập tay.",
  failed: "Chưa dùng được AI lúc này. Bạn vẫn đăng lô bình thường bằng cách nhập tay.",
};

export type AiFilledField =
  "categoryCode" | "title" | "quantity" | "unit" | "unitWeightKg" | "expiryDate" | "description";

export type AiMappingResult = {
  /** false ⇒ ảnh không nhận diện được thực phẩm: không điền gì, báo người dùng nhập tay. */
  recognized: boolean;
  patch: Partial<OfferFormValues>;
  filled: AiFilledField[];
  /** Độ tin cậy thấp ⇒ nhắc kiểm tra kỹ hơn. */
  lowConfidence: boolean;
};

/** Ngưỡng dưới: coi như không nhận diện được. */
export const AI_MIN_CONFIDENCE = 0.05;
/** Dưới ngưỡng này: vẫn điền nhưng nhắc kỹ hơn. */
export const AI_LOW_CONFIDENCE = 0.4;

const isUnit = (u: string | null): u is (typeof UNIT_CODES)[number] =>
  u !== null && (UNIT_CODES as readonly string[]).includes(u);

export function mapAiDraftToForm(
  draft: AiOfferDraft,
  ctx: { categories: readonly CategoryOption[]; current: OfferFormValues; today: string },
): AiMappingResult {
  const empty: AiMappingResult = { recognized: false, patch: {}, filled: [], lowConfidence: false };
  const category = draft.categoryCode ? ctx.categories.find((c) => c.code === draft.categoryCode) : undefined;
  const hasSignal = Boolean(category) || (draft.quantity !== null && draft.quantity > 0);
  if (!(draft.confidence > AI_MIN_CONFIDENCE) || !hasSignal) return empty;

  const patch: Partial<OfferFormValues> = { aiAssisted: true };
  const filled: AiFilledField[] = [];

  if (category) {
    patch.categoryCode = category.code;
    filled.push("categoryCode");
  }

  const title = draft.title.trim().slice(0, OFFER_LIMITS.titleMax);
  if (title.length >= OFFER_LIMITS.titleMin) {
    patch.title = title;
    filled.push("title");
  }

  const unit = isUnit(draft.unit) ? draft.unit : (category?.defaultUnit ?? (ctx.current.unit || null));
  if (isUnit(draft.unit)) {
    patch.unit = draft.unit;
    filled.push("unit");
  } else if (category) {
    patch.unit = category.defaultUnit;
  }

  if (draft.quantity !== null && draft.quantity > 0 && unit) {
    const q = isContinuous(unit)
      ? Math.round(draft.quantity * 1000) / 1000
      : Math.max(1, Math.round(draft.quantity));
    patch.quantity = formatDecimalInput(Math.min(q, OFFER_LIMITS.quantityMax));
    filled.push("quantity");
  }

  if (unit && unit !== "kg") {
    const w = draft.unitWeightKg;
    if (w !== null && w > 0 && w <= OFFER_LIMITS.weightMax) {
      patch.unitWeightKg = formatDecimalInput(Math.round(w * 1000) / 1000);
      patch.weightSource = "declared";
      filled.push("unitWeightKg");
    } else if (category && category.defaultUnit === unit) {
      patch.unitWeightKg = formatDecimalInput(category.defaultUnitWeightKg);
      patch.weightSource = "category_default";
    } else if (category) {
      // Đơn vị khác đơn vị mặc định của danh mục và AI không ước lượng được ⇒ để người dùng nhập
      patch.unitWeightKg = "";
      patch.weightSource = "declared";
    }
  }

  if (draft.expiryDate && isDateKey(draft.expiryDate) && draft.expiryDate >= ctx.today) {
    patch.expiryDate = draft.expiryDate;
    patch.expiryTime = "";
    filled.push("expiryDate");
  }

  const notes = draft.notes?.trim();
  if (notes && !ctx.current.description.trim()) {
    patch.description = notes.slice(0, OFFER_LIMITS.descriptionMax);
    filled.push("description");
  }

  return { recognized: true, patch, filled, lowConfidence: draft.confidence < AI_LOW_CONFIDENCE };
}

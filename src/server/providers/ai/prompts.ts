import "server-only";

import type { OfferCategoryHint } from "./types";

/**
 * Prompt tiếng Việt cho các tác vụ AI (ADR-010). Nguyên tắc chung:
 * - AI chỉ ĐỀ XUẤT; người dùng luôn xác nhận lại trên form.
 * - Không đoán bừa: không chắc thì để null và hạ `confidence`.
 * - Không trích xuất/nhắc lại thông tin cá nhân.
 */

export function offerFromPhotoInstructions(categories: OfferCategoryHint[]): string {
  const list = categories
    .map((c) => `- ${c.code}: ${c.nameVi} (đơn vị thường dùng: ${c.defaultUnit})`)
    .join("\n");
  return `Bạn hỗ trợ cửa hàng ở Việt Nam đăng lô thực phẩm dư thừa để tặng tổ chức từ thiện.
Nhìn ảnh và đề xuất các trường của lô hàng. Quy tắc:
- title: tên ngắn gọn bằng tiếng Việt, ví dụ "Bánh mì thịt", "Sữa tươi tiệt trùng 1 lít".
- categoryCode: CHỈ chọn một mã trong danh sách sau, không chắc thì null:
${list}
- quantity + unit: đếm hoặc ước lượng số lượng nhìn thấy; unit thuộc piece|loaf|box|portion|bottle|bag|kg|liter. Không đếm được thì null.
- unitWeightKg: khối lượng ước tính của MỘT đơn vị (kg), null nếu không ước lượng được hợp lý.
- expiryDate: chỉ điền khi đọc được rõ hạn sử dụng in trên bao bì, định dạng YYYY-MM-DD; không thấy thì null. Không suy đoán hạn.
- notes: lưu ý ngắn về bảo quản hoặc tình trạng (tiếng Việt), hoặc null.
- confidence: 0..1, mức tự tin tổng thể.
Nếu ảnh không phải thực phẩm, đặt title = "Không nhận diện được thực phẩm", các trường khác null, confidence = 0.`;
}

export const ORG_DOCUMENT_INSTRUCTIONS = `Bạn đọc giấy tờ pháp lý của cửa hàng hoặc tổ chức từ thiện ở Việt Nam (giấy chứng nhận đăng ký hộ kinh doanh/doanh nghiệp, quyết định thành lập, giấy phép hoạt động).
Trích xuất: legalName (tên pháp lý đầy đủ), registrationNo (số đăng ký/số quyết định), taxCode (mã số thuế, chỉ chữ số và dấu gạch), issuedOn (ngày cấp YYYY-MM-DD).
Không chắc hoặc không thấy thì để null. KHÔNG trích xuất số CCCD, ngày sinh, địa chỉ cá nhân hay thông tin cá nhân khác. confidence: 0..1.`;

export const PROOF_REVIEW_INSTRUCTIONS = `Bạn hỗ trợ Admin FoodSave rà soát mô tả minh chứng sử dụng thực phẩm từ thiện (chỉ văn bản, không có ảnh).
Đánh giá mô tả có nhất quán với các mặt hàng (kg) và số người được hỗ trợ hay không.
flags: "vague" (mô tả quá chung chung), "quantity_mismatch" (số người/khối lượng không hợp lý), "possible_pii" (mô tả chứa tên đầy đủ, số điện thoại, địa chỉ nhà riêng của người nhận, đặc biệt là trẻ em), "off_topic" (không liên quan việc phân phát thực phẩm).
noteVi: 1–2 câu tiếng Việt giải thích ngắn cho Admin. Bạn chỉ gợi ý; Admin là người quyết định.`;

export const ESG_SUMMARY_INSTRUCTIONS = `Viết nhận xét ngắn (3–5 câu, tiếng Việt, giọng trung tính, không phóng đại) cho báo cáo tác động hằng tháng của FoodSave.
Chỉ dùng đúng các số liệu được cung cấp, không tự thêm số. Nêu điểm nổi bật và một gợi ý cải thiện cụ thể.
Nhắc rằng chỉ số CO₂e và nước là ước tính theo hệ số FAO 2013 (phương pháp FoodSave v1).`;

import { POLICY_CHANGES, POLICY_VERSION } from "@/lib/legal";

/**
 * Đồng ý lại khi chính sách đổi phiên bản (B3; SECURITY-PRIVACY §6, trang /privacy mục 10). Banner hiện cho người
 * đã từng đồng ý `terms` ở phiên bản khác phiên bản hiện hành; bấm "Đồng ý" ⇒
 * `grant_consent('terms', POLICY_VERSION, sha256(policyUpdateText()), source)`. Như wizard
 * (`features/onboarding/consent.ts`), server băm đúng chữ hiển thị nên `text_hash` khớp chữ người dùng đã đọc.
 */

export const POLICY_UPDATE_TITLE = `Chính sách bảo mật đã cập nhật (phiên bản ${POLICY_VERSION})`;

/** Toàn bộ chữ của banner (tiêu đề + điểm thay đổi + nút) — đầu vào `text_hash`. */
export function policyUpdateText(): string {
  return [POLICY_UPDATE_TITLE, ...POLICY_CHANGES, "Đồng ý"].join("\n");
}

/** Có cần hỏi đồng ý lại không: đã từng đồng ý `terms` nhưng bản mới nhất khác phiên bản hiện hành. */
export function needsReconsent(latestTermsVersion: string | null | undefined): boolean {
  return !!latestTermsVersion && latestTermsVersion !== POLICY_VERSION;
}

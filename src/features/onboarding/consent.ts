import { POLICY_VERSION } from "@/lib/legal";

import type { OrgKind } from "./options";

/**
 * Văn bản cam kết ở bước "Cam kết & gửi duyệt" (F-07, P1-07). Đồng ý được ghi bằng
 * `grant_consent('terms', POLICY_VERSION, sha256(consentText(kind)), 'web')` — server tự băm đúng văn bản
 * này nên `text_hash` luôn khớp chữ người dùng đã thấy (SECURITY-PRIVACY §6).
 *
 * `{terms}` / `{privacy}` được hiển thị thành liên kết tới trang pháp lý.
 */

export type ConsentKey = "terms" | "truthful" | "commitment";

export type ConsentItem = { key: ConsentKey; template: string };

const LINK_WORDS = { "{terms}": "Điều khoản sử dụng", "{privacy}": "Chính sách bảo mật" } as const;

export const CONSENT_ITEMS: Record<OrgKind, ConsentItem[]> = {
  store: [
    {
      key: "terms",
      template: `Tôi đã đọc và đồng ý với {terms} và {privacy} của FoodSave (phiên bản ${POLICY_VERSION}).`,
    },
    {
      key: "truthful",
      template:
        "Tôi xác nhận thông tin và giấy tờ trong hồ sơ là đúng sự thật, và tôi được phép đại diện cho cửa hàng này.",
    },
    {
      key: "commitment",
      template:
        "Tôi cam kết chỉ tặng thực phẩm còn hạn sử dụng, được bảo quản đúng điều kiện, chưa qua sử dụng và phù hợp để ăn tại thời điểm bàn giao. Tôi hiểu bên nhận có quyền từ chối từng phần vì chất lượng.",
    },
  ],
  charity: [
    {
      key: "terms",
      template: `Tôi đã đọc và đồng ý với {terms} và {privacy} của FoodSave (phiên bản ${POLICY_VERSION}).`,
    },
    {
      key: "truthful",
      template:
        "Tôi xác nhận thông tin và giấy tờ trong hồ sơ là đúng sự thật, và tôi được phép đại diện cho tổ chức này.",
    },
    {
      key: "commitment",
      template:
        "Tôi cam kết kiểm tra thực phẩm khi nhận, bảo quản và sử dụng đúng hạn, không bán lại thực phẩm được tặng, và chịu trách nhiệm việc chế biến, phân phát sau khi nhận.",
    },
  ],
};

export type ConsentPart = { kind: "text"; text: string } | { kind: "link"; href: string; text: string };

/** Tách template thành đoạn chữ và liên kết để hiển thị. */
export function consentParts(template: string): ConsentPart[] {
  return template
    .split(/(\{terms\}|\{privacy\})/)
    .filter(Boolean)
    .map((p) =>
      p === "{terms}"
        ? { kind: "link", href: "/terms", text: LINK_WORDS["{terms}"] }
        : p === "{privacy}"
          ? { kind: "link", href: "/privacy", text: LINK_WORDS["{privacy}"] }
          : { kind: "text", text: p },
    );
}

/** Chữ thuần đúng như người dùng đọc được. */
export function consentPlainText(template: string): string {
  return consentParts(template)
    .map((p) => p.text)
    .join("");
}

/** Toàn bộ văn bản đồng ý của một loại tổ chức (đầu vào của `text_hash`). */
export function consentText(kind: OrgKind): string {
  return CONSENT_ITEMS[kind].map((i) => consentPlainText(i.template)).join("\n");
}

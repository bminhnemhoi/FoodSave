import type { OrgKind } from "@/core/access/portal";
import type { Database } from "@/types/database.types";

/**
 * Nhãn tiếng Việt cho mã enum/CHECK của tổ chức (DATA-MODEL §2.1, PRD F-03/F-04).
 * Dùng chung cho Admin, onboarding và trang cài đặt — không lặp lại bảng nhãn ở nơi khác.
 */

type Enums = Database["public"]["Enums"];

export const STORE_SUBTYPE_LABEL = {
  bakery: "Tiệm bánh",
  restaurant: "Nhà hàng/Bếp ăn",
  convenience: "Cửa hàng tiện lợi",
  supermarket: "Siêu thị",
  other: "Khác",
} as const;

export const CHARITY_SUBTYPE_LABEL = {
  children_home: "Mái ấm trẻ em",
  soup_kitchen: "Bếp ăn từ thiện",
  shelter: "Nhà mở/Tạm lánh",
  elderly_home: "Viện dưỡng lão",
  disability_center: "Trung tâm khuyết tật",
  religious_community: "Cộng đồng tôn giáo",
  other: "Khác",
} as const;

/** Loại hình theo `kind`; mã lạ ⇒ trả lại mã (không làm vỡ trang). */
export function orgSubtypeLabel(kind: OrgKind, subtype: string): string {
  const table: Record<string, string> = kind === "store" ? STORE_SUBTYPE_LABEL : CHARITY_SUBTYPE_LABEL;
  return table[subtype] ?? subtype;
}

export const DOC_TYPE_LABEL: Record<Enums["org_doc_type"], string> = {
  business_license: "Giấy phép kinh doanh",
  food_safety_cert: "Giấy chứng nhận an toàn thực phẩm",
  establishment_decision: "Quyết định thành lập",
  operating_license: "Giấy phép hoạt động",
  other: "Giấy tờ khác",
};

export const CONSENT_PURPOSE_LABEL: Record<Enums["consent_purpose"], string> = {
  terms: "Điều khoản sử dụng và cam kết an toàn thực phẩm",
  location_trip: "Chia sẻ vị trí trong chuyến",
  proof_photo: "Ảnh minh chứng",
  marketing: "Nhận tin từ FoodSave",
  trip_contact: "Cho phép gọi trong chuyến",
};

/** Vai trò thành viên (`org_role`). */
export const ORG_ROLE_LABEL: Record<Enums["org_role"], string> = {
  owner: "Chủ sở hữu",
  manager: "Quản lý",
  staff: "Nhân viên",
  volunteer: "Tình nguyện viên",
};

/** Quyền của từng vai trò, một câu (trang Thành viên, email mời). Khớp DATA-MODEL §8.2, §9.2. */
export const ORG_ROLE_DESCRIPTION: Record<Enums["org_role"], string> = {
  owner: "Toàn quyền: hồ sơ, điểm, giờ, thành viên và đề nghị sửa thông tin pháp lý.",
  manager: "Sửa hồ sơ, điểm, giờ, ngày nghỉ và mời thành viên; không đổi quyền hay gỡ thành viên.",
  staff: "Thao tác hằng ngày ở điểm được giao; không mở được Cài đặt.",
  volunteer: "Nhận chuyến lấy hàng trên ứng dụng Tình nguyện viên.",
};

export const SITE_VISIBILITY_LABEL: Record<Enums["site_visibility"], string> = {
  public: "Công khai vị trí chính xác",
  approximate: "Chỉ hiện vùng gần đúng (~500 m)",
  hidden: "Ẩn vị trí, chỉ hiện phường/xã",
};

/** Các cột pháp lý của `org_sensitive` có thể đổi qua `org_change_requests` (DATA-MODEL §6.8). */
export const LEGAL_FIELD_LABEL = {
  legal_name: "Tên pháp lý",
  tax_code: "Mã số thuế",
  registration_no: "Số giấy phép / quyết định",
  representative_name: "Người đại diện",
  representative_title: "Chức danh người đại diện",
  representative_id_last4: "4 số cuối CCCD người đại diện",
} as const;

export type LegalField = keyof typeof LEGAL_FIELD_LABEL;

export const LEGAL_FIELDS = Object.keys(LEGAL_FIELD_LABEL) as LegalField[];

/**
 * CCCD chỉ có 4 số cuối (SECURITY-PRIVACY C6) — hiển thị kèm phần che để không bị hiểu nhầm là số đầy đủ.
 * Giá trị không đúng định dạng ⇒ "—".
 */
export function maskIdLast4(last4: string | null | undefined): string {
  const v = last4?.trim();
  return v && /^[0-9]{4}$/.test(v) ? `•••• •••• ${v}` : "—";
}

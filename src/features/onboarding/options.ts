import {
  CHARITY_SUBTYPE_LABEL,
  DOC_TYPE_LABEL,
  orgSubtypeLabel,
  SITE_VISIBILITY_LABEL,
  STORE_SUBTYPE_LABEL,
} from "@/features/organizations/labels";
import type { Database } from "@/types/database.types";

/**
 * Danh mục lựa chọn của wizard onboarding (F-03, F-04). Giá trị code khớp CHECK/enum trong DB
 * (DATA-MODEL §1, §2.1); nhãn lấy từ bảng dùng chung `features/organizations/labels.ts`.
 */

export type OrgKind = "store" | "charity";

export const ORG_KINDS: readonly OrgKind[] = ["store", "charity"];

export function isOrgKind(v: unknown): v is OrgKind {
  return v === "store" || v === "charity";
}

function toOptions<T extends Record<string, string>>(table: T) {
  return (Object.keys(table) as (keyof T & string)[]).map((value) => ({ value, label: table[value]! }));
}

/** organizations.subtype — CHECK `organizations_subtype_by_kind`. */
export const SUBTYPES = {
  store: toOptions(STORE_SUBTYPE_LABEL),
  charity: toOptions(CHARITY_SUBTYPE_LABEL),
} as const;

export function subtypeLabel(kind: OrgKind, value: string | null | undefined): string | null {
  return value ? orgSubtypeLabel(kind, value) : null;
}

/**
 * Mã danh mục thực phẩm (DATA-MODEL §2.2 `food_categories`, seed P2). Bảng chưa có ở P1 nên
 * `sites.accepted_categories` lưu đúng các mã này (null = nhận tất cả).
 */
export const FOOD_CATEGORIES = [
  { code: "bread", label: "Bánh mì & bakery" },
  { code: "cooked_meal", label: "Cơm hộp & món chế biến" },
  { code: "pastry", label: "Bánh ngọt & dessert" },
  { code: "vegetables", label: "Rau củ tươi" },
  { code: "fruit", label: "Trái cây" },
  { code: "dairy", label: "Sữa & sản phẩm sữa" },
  { code: "meat_seafood", label: "Thịt & hải sản" },
  { code: "beverage", label: "Đồ uống" },
  { code: "dry_goods", label: "Đồ khô" },
] as const;

export type FoodCategoryCode = (typeof FOOD_CATEGORIES)[number]["code"];
export const FOOD_CATEGORY_CODES = FOOD_CATEGORIES.map((c) => c.code) as FoodCategoryCode[];

/** sites.visibility — tổ chức chọn; cửa hàng luôn `public`. Nhãn dùng chung + giải thích cho wizard. */
export const VISIBILITY_OPTIONS = [
  {
    value: "approximate",
    label: SITE_VISIBILITY_LABEL.approximate,
    recommended: true,
    description:
      "Người ngoài chỉ thấy một vùng khoảng 500 m quanh điểm nhận. Địa chỉ chính xác chỉ dành cho thành viên của bạn và người đang giao hàng tới.",
  },
  {
    value: "hidden",
    label: SITE_VISIBILITY_LABEL.hidden,
    recommended: false,
    description:
      "Người ngoài chỉ thấy tên phường/xã, không thấy vị trí trên bản đồ. Phù hợp cho mái ấm, nơi tạm lánh cần bảo vệ người ở.",
  },
  {
    value: "public",
    label: SITE_VISIBILITY_LABEL.public,
    recommended: false,
    description: "Hiển thị đúng vị trí và địa chỉ cho mọi người, như một bếp ăn mở cửa đón khách.",
  },
] as const;

export type SiteVisibility = (typeof VISIBILITY_OPTIONS)[number]["value"];

/** Loại giấy tờ (enum `org_doc_type`) và yêu cầu theo loại tổ chức (submit_organization). */
export type DocType = Database["public"]["Enums"]["org_doc_type"];

export type DocSlot = {
  type: DocType;
  title: string;
  description: string;
  /** `required` = bắt buộc riêng; `one_of` = cần ít nhất một trong nhóm; `optional`. */
  requirement: "required" | "one_of" | "optional";
};

export const DOC_SLOTS: Record<OrgKind, DocSlot[]> = {
  store: [
    {
      type: "business_license",
      title: DOC_TYPE_LABEL.business_license,
      description: "Giấy chứng nhận đăng ký doanh nghiệp hoặc hộ kinh doanh, thấy rõ tên và mã số.",
      requirement: "required",
    },
    {
      type: "food_safety_cert",
      title: DOC_TYPE_LABEL.food_safety_cert,
      description: "Giấy chứng nhận cơ sở đủ điều kiện an toàn thực phẩm (nếu cơ sở của bạn có).",
      requirement: "optional",
    },
  ],
  charity: [
    {
      type: "establishment_decision",
      title: DOC_TYPE_LABEL.establishment_decision,
      description: "Quyết định thành lập hoặc công nhận tổ chức của cơ quan có thẩm quyền.",
      requirement: "one_of",
    },
    {
      type: "operating_license",
      title: DOC_TYPE_LABEL.operating_license,
      description: "Giấy phép hoạt động hoặc văn bản cho phép hoạt động của tổ chức.",
      requirement: "one_of",
    },
    {
      type: "other",
      title: "Báo cáo tài chính hoặc giấy tờ khác",
      description: "Báo cáo tài chính gần nhất, thư giới thiệu… giúp FoodSave duyệt nhanh hơn.",
      requirement: "optional",
    },
  ],
};

/** Thứ trong tuần theo thứ tự hiển thị (Thứ Hai → Chủ nhật); dow 0 = Chủ nhật (khớp `extract(dow)`). */
export const WEEKDAYS = [
  { dow: 1, label: "Thứ Hai" },
  { dow: 2, label: "Thứ Ba" },
  { dow: 3, label: "Thứ Tư" },
  { dow: 4, label: "Thứ Năm" },
  { dow: 5, label: "Thứ Sáu" },
  { dow: 6, label: "Thứ Bảy" },
  { dow: 0, label: "Chủ nhật" },
] as const;

export function weekdayLabel(dow: number): string {
  return WEEKDAYS.find((d) => d.dow === dow)?.label ?? `Ngày ${dow}`;
}

/** Từ ngữ theo loại tổ chức. */
export const KIND_COPY = {
  store: {
    noun: "cửa hàng",
    Noun: "Cửa hàng",
    nameLabel: "Tên cửa hàng",
    siteNoun: "điểm cửa hàng",
    hoursTitle: "Giờ mở cửa",
    hoursOpenLabel: "Mở cửa",
    wizardTitle: "Hồ sơ cửa hàng",
  },
  charity: {
    noun: "tổ chức",
    Noun: "Tổ chức",
    nameLabel: "Tên tổ chức",
    siteNoun: "điểm nhận",
    hoursTitle: "Giờ nhận hàng",
    hoursOpenLabel: "Nhận hàng",
    wizardTitle: "Hồ sơ tổ chức",
  },
} as const;

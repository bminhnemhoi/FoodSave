import type { OrgKind, OrgStatus } from "@/core/access/portal";

/**
 * Lời giải thích trạng thái hồ sơ cho trang /onboarding/status (F-02, US-STO-04).
 * Văn phong: gọi người dùng là "bạn", hệ thống tự xưng "FoodSave" (DESIGN-SYSTEM §16).
 */

export type StatusCta = { kind: "onboarding" | "portal" | "contact"; label: string };

export type StatusCopy = {
  title: string;
  body: string;
  steps: string[];
  /** Hiển thị lý do FoodSave ghi khi yêu cầu bổ sung / từ chối. */
  showReason: boolean;
  cta?: StatusCta;
};

export const ORG_KIND_LABEL: Record<OrgKind, string> = { store: "Cửa hàng", charity: "Tổ chức" };

const PORTAL_NAME: Record<OrgKind, string> = { store: "cổng Cửa hàng", charity: "cổng Tổ chức" };

export function statusCopy(status: OrgStatus, kind: OrgKind): StatusCopy {
  const portal = PORTAL_NAME[kind];
  switch (status) {
    case "draft":
      return {
        title: "Hồ sơ đang ở bản nháp",
        body: `Hồ sơ chưa được gửi duyệt nên bạn chưa vào được ${portal}. Dữ liệu đã nhập vẫn được lưu.`,
        steps: [
          "Hoàn thiện thông tin, vị trí trên bản đồ và giấy tờ.",
          "Đọc và đồng ý cam kết, sau đó bấm “Gửi duyệt”.",
        ],
        showReason: false,
        cta: { kind: "onboarding", label: "Tiếp tục hồ sơ" },
      };
    case "submitted":
      return {
        title: "Hồ sơ đang chờ FoodSave duyệt",
        body: "FoodSave đang kiểm tra thông tin và giấy tờ của bạn. Bạn sẽ nhận email ngay khi có kết quả.",
        steps: [
          "Bạn không cần làm gì thêm lúc này.",
          "Nếu thông tin trong hồ sơ thay đổi, hãy liên hệ FoodSave để cập nhật trước khi duyệt.",
        ],
        showReason: false,
        cta: { kind: "contact", label: "Liên hệ FoodSave" },
      };
    case "needs_changes":
      return {
        title: "Hồ sơ cần bổ sung",
        body: `FoodSave cần bạn sửa hoặc bổ sung một số thông tin trước khi mở ${portal}.`,
        steps: ["Đọc lý do FoodSave ghi bên dưới.", "Sửa hồ sơ theo yêu cầu, sau đó bấm “Gửi duyệt” lại."],
        showReason: true,
        cta: { kind: "onboarding", label: "Sửa hồ sơ" },
      };
    case "rejected":
      return {
        title: "Hồ sơ chưa được duyệt",
        body: "FoodSave chưa thể duyệt hồ sơ này. Giấy tờ đã nộp sẽ được xóa sau 30 ngày theo chính sách bảo mật.",
        steps: [
          "Đọc lý do FoodSave ghi bên dưới.",
          "Nếu bạn cho rằng có nhầm lẫn, hãy liên hệ FoodSave kèm tên tổ chức để được xem xét lại.",
        ],
        showReason: true,
        cta: { kind: "contact", label: "Liên hệ FoodSave" },
      };
    case "suspended":
      return {
        title: "Tổ chức đang bị tạm khóa",
        body: "Trong thời gian tạm khóa, tổ chức không thể đăng lô, nhận lô hoặc tạo yêu cầu mới.",
        steps: ["Liên hệ FoodSave để biết lý do và các bước để mở khóa."],
        showReason: false,
        cta: { kind: "contact", label: "Liên hệ FoodSave" },
      };
    case "closed":
      return {
        title: "Tổ chức đã đóng",
        body: "Tổ chức này không còn hoạt động trên FoodSave.",
        steps: ["Nếu muốn tham gia lại, bạn có thể tạo hồ sơ mới."],
        showReason: false,
        cta: { kind: "onboarding", label: "Tạo hồ sơ mới" },
      };
    case "approved":
      return {
        title: "Hồ sơ đã được duyệt",
        body: `Bạn có thể dùng ${portal} ngay bây giờ.`,
        steps: [],
        showReason: false,
        cta: { kind: "portal", label: kind === "store" ? "Vào cổng Cửa hàng" : "Vào cổng Tổ chức" },
      };
  }
}

import { describeAuditEntry } from "@/features/org-reviews/present";
import { ORG_ROLE_LABEL } from "@/features/organizations/labels";
import type { Database } from "@/types/database.types";

import type { AuditActionGroup, AuditEntityType } from "./filters";

/**
 * Trình bày nhật ký kiểm toán cho Admin (US-ADM-11, F-63; DATA-MODEL §14) — thuần, có unit test.
 * Dòng audit đã được các RPC tối giản PII; ở đây vẫn che phòng thủ mọi khóa giống token/mã/bí mật/mật khẩu.
 */

type OrgRole = Database["public"]["Enums"]["org_role"];

/** Nhãn tiếng Việt cho mọi hành động mà các RPC ghi (`<entity>.<verb>`). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "admin.grant": "Cấp quyền Admin",
  "admin.revoke": "Thu hồi quyền Admin",
  "allocation.request": "Tổ chức xin nhận lô",
  "allocation.confirm": "Cửa hàng xác nhận phân bổ",
  "allocation.reject": "Cửa hàng từ chối yêu cầu",
  "allocation.cancel": "Hủy phân bổ",
  "allocation.expire": "Phân bổ hết hạn giữ chỗ",
  "allocation.pack": "Đánh dấu đã đóng gói",
  "allocation.unpack": "Hoàn tác đã đóng gói",
  "audit.purge": "Xóa nhật ký quá hạn lưu giữ",
  "bundle.reserve": "Chọn phương án ghép",
  "consent.grant": "Ghi nhận đồng ý",
  "consent.withdraw": "Rút lại đồng ý",
  "demo.reset": "Reset dữ liệu demo",
  "demo.seed_history": "Sinh lịch sử dữ liệu demo",
  "document.purge": "Xóa tệp giấy tờ theo chính sách lưu giữ",
  "document.view": "Mở xem giấy tờ",
  "handover.issue": "Tạo mã bàn giao",
  "handover.pickup": "Bàn giao lấy hàng tại cửa hàng",
  "handover.dropoff": "Bàn giao giao hàng tại tổ chức",
  "handover.code_fail": "Nhập sai mã bàn giao",
  "incident.report": "Báo sự cố",
  "incident.resolve": "Xử lý sự cố",
  "ledger.reverse": "Đảo bút toán sổ tác động",
  "member.invite": "Mời thành viên",
  "member.invite_revoke": "Thu hồi lời mời",
  "member.accept": "Thành viên nhận lời mời",
  "member.update": "Đổi vai trò thành viên",
  "member.pause": "Tạm dừng thành viên",
  "member.resume": "Kích hoạt lại thành viên",
  "member.remove": "Gỡ thành viên",
  "need.publish": "Đăng nhu cầu",
  "need.cancel": "Hủy nhu cầu",
  "need.close": "Đóng nhu cầu",
  "offer.create": "Tạo lô nháp",
  "offer.update": "Sửa lô",
  "offer.update_quantity": "Cập nhật số lượng lô",
  "offer.publish": "Đăng lô",
  "offer.cancel": "Hủy lô",
  "offer.complete": "Lô hoàn tất",
  "offer.expire": "Lô hết hạn chưa ai nhận",
  "org.create": "Tạo hồ sơ nháp",
  "org.submit": "Gửi hồ sơ để duyệt",
  "org.suspend": "Tạm khóa tổ chức",
  "org.reinstate": "Mở khóa tổ chức",
  "org.close": "Đóng tổ chức",
  "org.pause": "Tự tạm ngưng hoạt động",
  "org.resume": "Hoạt động lại sau tạm ngưng",
  "org.verify_id": "Xác minh CCCD người đại diện",
  "org.representative_id_set": "Khai số CCCD người đại diện",
  "representative_id.reveal": "Admin xem số CCCD đầy đủ",
  "contact.reveal": "Xem số điện thoại tình nguyện viên trong chuyến",
  "org.change_submit": "Gửi yêu cầu cập nhật thông tin pháp lý",
  "pickup.assign": "Lên chuyến lấy hàng",
  "pickup.replan": "Lập lại tuyến của chuyến",
  "pickup.accept": "Tình nguyện viên nhận chuyến",
  "pickup.decline": "Tình nguyện viên từ chối chuyến",
  "pickup.start": "Bắt đầu chuyến",
  "pickup.cancel": "Hủy chuyến",
  "stop.check_in": "Check-in tại điểm dừng",
  "stop.skip": "Bỏ qua điểm dừng",
  "settings.update": "Đổi cấu hình hệ thống",
  "site.create": "Thêm điểm",
  "site.update": "Cập nhật điểm",
  "site.set_hours": "Cập nhật giờ mở cửa",
  "volunteer_profile.create": "Tạo hồ sơ tình nguyện viên",
  "volunteer_profile.update": "Cập nhật hồ sơ tình nguyện viên",
};

/**
 * Nhãn của một dòng nhật ký. Quyết định duyệt hồ sơ (`org.review`, `org.change_review`) đọc `after` để
 * ghi đúng "Duyệt / Yêu cầu bổ sung / Từ chối" — dùng chung cách diễn đạt với lịch sử hồ sơ.
 * Hành động chưa có nhãn ⇒ "Hoạt động khác" (mã gốc vẫn hiện bên cạnh).
 */
export function auditActionLabel(action: string, after: unknown): string {
  if (action === "org.review" || action === "org.change_review") {
    return describeAuditEntry({ action, after, actorKind: "admin" }).title;
  }
  return AUDIT_ACTION_LABEL[action] ?? "Hoạt động khác";
}

export const AUDIT_GROUP_LABEL: Record<AuditActionGroup, string> = {
  org: "Hồ sơ tổ chức",
  admin: "Quyền Admin",
  member: "Thành viên",
  site: "Điểm",
  document: "Giấy tờ",
  consent: "Đồng ý",
  offer: "Lô tặng",
  allocation: "Phân bổ",
  need: "Nhu cầu",
  bundle: "Phương án ghép",
  pickup: "Chuyến",
  stop: "Điểm dừng",
  handover: "Bàn giao",
  incident: "Sự cố",
  ledger: "Sổ tác động",
  volunteer_profile: "Hồ sơ tình nguyện viên",
  settings: "Cấu hình",
  demo: "Dữ liệu demo",
  audit: "Nhật ký",
  contact: "Liên hệ trong chuyến",
  representative_id: "CCCD người đại diện",
};

export const AUDIT_ENTITY_LABEL: Record<AuditEntityType, string> = {
  organization: "Tổ chức",
  org_change_request: "Yêu cầu cập nhật hồ sơ",
  org_document: "Giấy tờ",
  org_member: "Thành viên",
  org_invitation: "Lời mời",
  profile: "Tài khoản",
  site: "Điểm",
  consent: "Đồng ý",
  offer: "Lô tặng",
  allocation: "Phân bổ",
  need: "Nhu cầu",
  need_bundle: "Phương án ghép",
  pickup: "Chuyến",
  pickup_stop: "Điểm dừng",
  handover: "Bàn giao",
  incident: "Sự cố",
  impact_ledger: "Sổ tác động",
  volunteer_profile: "Hồ sơ tình nguyện viên",
  app_setting: "Cấu hình",
  demo: "Dữ liệu demo",
  audit_logs: "Nhật ký",
};

export function entityTypeLabel(type: string): string {
  return AUDIT_ENTITY_LABEL[type as AuditEntityType] ?? type;
}

/** 8 ký tự đầu của mã đối tượng — đủ để đối chiếu, không chiếm chỗ. */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

/** Liên kết tới màn Admin của đối tượng (nếu có màn tương ứng). */
export function auditEntityHref(type: string, entityId: string | null, orgId: string | null): string | null {
  switch (type) {
    case "organization":
      return entityId ? `/admin/reviews/${entityId}` : null;
    case "org_change_request":
      return orgId ? `/admin/reviews/${orgId}#change-request` : null;
    case "org_document":
    case "org_member":
    case "org_invitation":
    case "site":
      return orgId ? `/admin/reviews/${orgId}` : null;
    case "offer":
      return entityId ? `/admin/offers/${entityId}` : null;
    case "allocation":
      return entityId ? `/admin/allocations?id=${entityId}` : null;
    default:
      return null;
  }
}

/** Vai trò của người thực hiện tại thời điểm ghi (`actor_kind` + `actor_org_role`). */
export function actorRoleLabel(actorKind: string, orgRole: OrgRole | null): string {
  switch (actorKind) {
    case "admin":
      return "Admin";
    case "system":
      return "Hệ thống";
    case "service":
      return "Quản trị kỹ thuật (script)";
    default:
      return orgRole ? ORG_ROLE_LABEL[orgRole] : "Người dùng";
  }
}

/** Tên người thực hiện; tài khoản đã xóa/ẩn danh hoặc tác vụ hệ thống không có tên. */
export function actorDisplayName(
  actorKind: string,
  actorId: string | null,
  profile: { fullName: string | null; email: string | null } | null,
): string {
  const name = profile?.fullName?.trim() || profile?.email?.trim();
  if (name) return name;
  if (!actorId) return actorKind === "service" ? "Script quản trị" : "Hệ thống FoodSave";
  return "Tài khoản đã ẩn danh";
}

// ---------------------------------------------------------------------------
// Che phòng thủ (SECURITY-PRIVACY C15): before/after không được chứa token/hash; nếu lọt vào vẫn không hiện.
// ---------------------------------------------------------------------------

export const REDACTED = "[đã ẩn]";

const SENSITIVE_WORDS = new Set([
  "token",
  "tokens",
  "code",
  "codes",
  "secret",
  "secrets",
  "password",
  "passwords",
  "passwd",
  "pwd",
  "hash",
  "hashes",
  "otp",
  "salt",
]);

/** Khóa an toàn có chứa từ "code" (mã danh mục thực phẩm — dữ liệu tham chiếu công khai). */
const SAFE_KEYS = new Set(["category_code", "category_codes"]);

/** `token_hash`, `code6`, `otpCode`, `client_secret`, `password`… ⇒ nhạy cảm. Tách từ theo `_`, số, camelCase. */
export function isSensitiveKey(key: string): boolean {
  if (SAFE_KEYS.has(key.toLowerCase())) return false;
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z]+/);
  return words.some((w) => SENSITIVE_WORDS.has(w));
}

const MAX_DEPTH = 8;

/** Bản sao đã che: giá trị của khóa nhạy cảm (ở mọi tầng) thay bằng "[đã ẩn]". */
export function redactAuditJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "…";
  if (Array.isArray(value)) return value.map((v) => redactAuditJson(v, depth + 1));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        isSensitiveKey(k) ? REDACTED : redactAuditJson(v, depth + 1),
      ]),
    );
  }
  return value;
}

/** JSON đã che, thụt lề 2 — để hiển thị trong khối `<pre>`; `null`/rỗng ⇒ null. */
export function prettyAuditJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return null;
  return JSON.stringify(redactAuditJson(value), null, 2);
}

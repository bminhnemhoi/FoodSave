import { LEGAL_FIELD_LABEL, LEGAL_FIELDS, type LegalField } from "@/features/organizations/labels";

/**
 * Hàm thuần trình bày dữ liệu hàng đợi duyệt (không IO) — có unit test.
 */

// ---------------------------------------------------------------------------
// Thời gian chờ (US-ADM-02 AC1)
// ---------------------------------------------------------------------------

/** Số ngày trọn vẹn kể từ lúc gửi; dữ liệu lỗi ⇒ 0. */
export function waitingDays(submittedAt: string | null, now: Date = new Date()): number {
  if (!submittedAt) return 0;
  const t = new Date(submittedAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function waitingLabel(days: number): string {
  return days < 1 ? "Chờ dưới 1 ngày" : `Chờ ${days} ngày`;
}

// ---------------------------------------------------------------------------
// Lịch sử (audit_logs) — DATA-MODEL §14
// ---------------------------------------------------------------------------

export type HistoryTone = "neutral" | "info" | "success" | "warning" | "danger";

export type AuditEntryInput = {
  action: string;
  after: unknown;
  actorKind: string;
};

type Described = { title: string; tone: HistoryTone };

function field(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

const SIMPLE: Record<string, Described> = {
  "org.create": { title: "Tạo hồ sơ nháp", tone: "neutral" },
  "org.submit": { title: "Gửi hồ sơ để duyệt", tone: "info" },
  "org.suspend": { title: "Tạm khóa tổ chức", tone: "danger" },
  "org.reinstate": { title: "Mở khóa tổ chức", tone: "success" },
  "org.close": { title: "Đóng tổ chức", tone: "neutral" },
  "org.verify_id": { title: "Xác minh CCCD người đại diện", tone: "success" },
  "org.change_submit": { title: "Gửi yêu cầu cập nhật thông tin pháp lý", tone: "info" },
  "site.create": { title: "Thêm điểm", tone: "neutral" },
  "site.update": { title: "Cập nhật điểm", tone: "neutral" },
  "site.set_hours": { title: "Cập nhật giờ mở cửa", tone: "neutral" },
  "member.invite": { title: "Mời thành viên", tone: "neutral" },
  "member.accept": { title: "Thành viên nhận lời mời", tone: "neutral" },
  "member.update": { title: "Đổi vai trò thành viên", tone: "neutral" },
  "member.remove": { title: "Gỡ thành viên", tone: "neutral" },
  "document.purge": { title: "Xóa tệp giấy tờ theo chính sách lưu giữ", tone: "neutral" },
};

/** Tiêu đề + tông màu cho một dòng nhật ký; hành động chưa biết ⇒ "Hoạt động khác". */
export function describeAuditEntry(entry: AuditEntryInput): Described {
  if (entry.action === "org.review") {
    switch (field(entry.after, "decision")) {
      case "approve":
        return { title: "Duyệt hồ sơ", tone: "success" };
      case "request_changes":
        return { title: "Yêu cầu bổ sung hồ sơ", tone: "warning" };
      case "reject":
        return { title: "Từ chối hồ sơ", tone: "danger" };
    }
    return { title: "Ra quyết định duyệt", tone: "info" };
  }
  if (entry.action === "org.change_review") {
    return field(entry.after, "status") === "approved"
      ? { title: "Duyệt yêu cầu cập nhật thông tin pháp lý", tone: "success" }
      : { title: "Từ chối yêu cầu cập nhật thông tin pháp lý", tone: "danger" };
  }
  return SIMPLE[entry.action] ?? { title: "Hoạt động khác", tone: "neutral" };
}

/** Ai thực hiện: tên người (nếu đọc được) + vai trò hệ thống. */
export function describeActor(actorKind: string, actorName: string | null | undefined): string {
  const name = actorName?.trim();
  switch (actorKind) {
    case "admin":
      return name ? `Admin ${name}` : "Admin";
    case "service":
      return "Quản trị kỹ thuật (script)";
    case "system":
      return "Hệ thống FoodSave";
    default:
      return name || "Người dùng";
  }
}

// ---------------------------------------------------------------------------
// So sánh yêu cầu cập nhật (US-ADM-02 AC3): giá trị cũ / mới
// ---------------------------------------------------------------------------

export type ChangeDiffRow = { field: LegalField; label: string; before: string; after: string };

function asText(v: unknown): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return "—";
}

/**
 * Các dòng thay đổi theo thứ tự cột pháp lý cố định; chỉ các khóa hợp lệ có trong `changes`.
 * CCCD chỉ có 4 số cuối nên hiển thị nguyên (không có số đầy đủ để lộ).
 */
export function buildChangeDiff(previous: unknown, changes: unknown): ChangeDiffRow[] {
  return LEGAL_FIELDS.filter((f) => field(changes, f) !== undefined).map((f) => ({
    field: f,
    label: LEGAL_FIELD_LABEL[f],
    before: asText(field(previous, f)),
    after: asText(field(changes, f)),
  }));
}

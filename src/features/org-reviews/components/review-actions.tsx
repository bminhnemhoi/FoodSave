"use client";

import { Ban, BadgeCheck, CircleX, LockOpen, MessageSquareWarning } from "lucide-react";

import {
  reviewChangeRequestAction,
  reviewOrganizationAction,
  setOrgStandingAction,
  type ActionResult,
} from "../actions";
import { ConfirmActionDialog } from "./confirm-action-dialog";

const CHANGES_PRESETS = [
  "Ảnh giấy tờ bị mờ hoặc thiếu trang, vui lòng tải lại bản rõ hơn.",
  "Thông tin trên giấy tờ chưa khớp với tên hoặc địa chỉ đã khai.",
  "Vị trí ghim trên bản đồ chưa đúng địa chỉ thực tế, vui lòng ghim lại.",
  "Thiếu giấy tờ bắt buộc, vui lòng bổ sung.",
];

const REJECT_PRESETS = [
  "Không xác minh được tính hợp pháp của giấy tờ đã nộp.",
  "Tổ chức không thuộc đối tượng FoodSave hỗ trợ.",
  "Hồ sơ trùng với một tổ chức đã đăng ký trên FoodSave.",
];

const emailWarning = (r: ActionResult<object> & { ok: true }) =>
  "emailSent" in r && r.emailSent === false
    ? "Quyết định đã được lưu nhưng FoodSave chưa gửi được email cho chủ hồ sơ. Hãy liên hệ họ trực tiếp."
    : null;

/** Ba quyết định cho hồ sơ `submitted` (US-ADM-04): Duyệt · Yêu cầu bổ sung · Từ chối. */
export function ReviewDecisionButtons({ orgId, orgName }: { orgId: string; orgName: string }) {
  const run =
    (decision: "approve" | "request_changes" | "reject") => (p: { reason: string; clientOpId: string }) =>
      reviewOrganizationAction({ orgId, decision, reason: p.reason, clientOpId: p.clientOpId });

  return (
    <div className="flex flex-col gap-2">
      <ConfirmActionDialog
        triggerLabel="Duyệt"
        triggerIcon={BadgeCheck}
        triggerVariant="default"
        className="min-h-11 w-full"
        title={`Duyệt hồ sơ ${orgName}?`}
        consequence={
          <>
            Tổ chức sẽ vào được cổng làm việc ngay và chủ hồ sơ nhận email thông báo. Giấy tờ KYC sẽ tự xóa
            sau 30 ngày theo chính sách lưu giữ.
          </>
        }
        confirmLabel="Duyệt hồ sơ"
        onConfirm={run("approve")}
        successMessage={() => `Đã duyệt hồ sơ ${orgName}.`}
        successWarning={emailWarning}
      />
      <ConfirmActionDialog
        triggerLabel="Yêu cầu bổ sung"
        triggerIcon={MessageSquareWarning}
        className="min-h-11 w-full"
        title={`Yêu cầu ${orgName} bổ sung hồ sơ?`}
        consequence="Chủ hồ sơ nhận email kèm lý do, sửa hồ sơ rồi gửi duyệt lại. Lý do hiển thị nguyên văn cho họ."
        confirmLabel="Gửi yêu cầu bổ sung"
        reason={{ mode: "required", label: "Nội dung cần bổ sung", presets: CHANGES_PRESETS }}
        onConfirm={run("request_changes")}
        successMessage={() => `Đã gửi yêu cầu bổ sung cho ${orgName}.`}
        successWarning={emailWarning}
      />
      <ConfirmActionDialog
        triggerLabel="Từ chối"
        triggerIcon={CircleX}
        triggerVariant="destructive"
        className="min-h-11 w-full"
        title={`Từ chối hồ sơ ${orgName}?`}
        consequence="Đây là quyết định cuối: tổ chức không gửi lại được hồ sơ này. Chủ hồ sơ nhận email kèm lý do; giấy tờ tự xóa sau 30 ngày."
        confirmLabel="Từ chối hồ sơ"
        confirmVariant="destructive"
        reason={{ mode: "required", label: "Lý do từ chối", presets: REJECT_PRESETS }}
        onConfirm={run("reject")}
        successMessage={() => `Đã từ chối hồ sơ ${orgName}.`}
        successWarning={emailWarning}
      />
    </div>
  );
}

/** Duyệt / từ chối yêu cầu cập nhật thông tin pháp lý (US-ADM-02 AC3). */
export function ChangeRequestButtons({ requestId, orgName }: { requestId: string; orgName: string }) {
  const run = (decision: "approve" | "reject") => (p: { reason: string; clientOpId: string }) =>
    reviewChangeRequestAction({ requestId, decision, note: p.reason, clientOpId: p.clientOpId });
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <ConfirmActionDialog
        triggerLabel="Duyệt thay đổi"
        triggerIcon={BadgeCheck}
        triggerVariant="default"
        title={`Áp dụng thông tin mới cho ${orgName}?`}
        consequence="Giá trị mới thay thế giá trị hiện tại ngay. Nếu đổi người đại diện hoặc CCCD, trạng thái xác minh CCCD sẽ bị xóa để xác minh lại."
        confirmLabel="Duyệt thay đổi"
        onConfirm={run("approve")}
        successMessage={() => `Đã áp dụng thông tin mới cho ${orgName}.`}
      />
      <ConfirmActionDialog
        triggerLabel="Từ chối thay đổi"
        triggerIcon={CircleX}
        triggerVariant="destructive"
        title={`Từ chối yêu cầu cập nhật của ${orgName}?`}
        consequence="Giá trị hiện tại được giữ nguyên; tổ chức vẫn hoạt động bình thường và thấy lý do bạn ghi."
        confirmLabel="Từ chối thay đổi"
        confirmVariant="destructive"
        reason={{ mode: "required", label: "Lý do từ chối" }}
        onConfirm={run("reject")}
        successMessage={() => `Đã từ chối yêu cầu cập nhật của ${orgName}.`}
      />
    </div>
  );
}

/** Tạm khóa (gõ lại tên) / mở khóa tổ chức (F-69), luôn có lý do. */
export function OrgStandingButton({
  orgId,
  orgName,
  status,
  compact = false,
}: {
  orgId: string;
  orgName: string;
  status: "approved" | "suspended";
  compact?: boolean;
}) {
  if (status === "approved") {
    return (
      <ConfirmActionDialog
        triggerLabel="Tạm khóa"
        triggerIcon={Ban}
        triggerVariant="destructive"
        className={compact ? "min-h-10" : "min-h-11 w-full"}
        title={`Tạm khóa ${orgName}?`}
        consequence="Trong thời gian tạm khóa, tổ chức không đăng lô, nhận lô hay tạo yêu cầu mới. Chủ hồ sơ được thông báo; lý do được ghi vào nhật ký."
        confirmLabel="Tạm khóa tổ chức"
        confirmVariant="destructive"
        reason={{ mode: "required", label: "Lý do tạm khóa" }}
        confirmText={{ expected: orgName, label: `Gõ lại tên tổ chức để xác nhận: ${orgName}` }}
        onConfirm={(p) =>
          setOrgStandingAction({
            orgId,
            action: "suspend",
            reason: p.reason,
            confirmName: p.confirmName,
            clientOpId: p.clientOpId,
          })
        }
        successMessage={() => `Đã tạm khóa ${orgName}.`}
      />
    );
  }
  return (
    <ConfirmActionDialog
      triggerLabel="Mở khóa"
      triggerIcon={LockOpen}
      className={compact ? "min-h-10" : "min-h-11 w-full"}
      title={`Mở khóa ${orgName}?`}
      consequence="Tổ chức hoạt động lại ngay với trạng thái Đã duyệt. Ghi chú được lưu vào nhật ký."
      confirmLabel="Mở khóa tổ chức"
      reason={{ mode: "required", label: "Ghi chú mở khóa" }}
      onConfirm={(p) =>
        setOrgStandingAction({ orgId, action: "reinstate", reason: p.reason, clientOpId: p.clientOpId })
      }
      successMessage={() => `Đã mở khóa ${orgName}.`}
    />
  );
}

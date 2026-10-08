import { formatQty, type UnitCode } from "@/features/catalog/labels";
import { formatDayTime } from "@/features/charity-allocations/present";
import {
  mapRpcError,
  parseRpcDetail,
  RPC_MESSAGES,
  type ActionError,
  type PgLikeError,
} from "@/lib/rpc-errors";

/**
 * Lỗi của luồng nhu cầu (DATA-MODEL §8.4 "Ghi chú triển khai P3") → câu tiếng Việt cụ thể. Thuần để test.
 * `reserve_bundle` kiểm lại mọi dòng dưới khóa: lỗi theo lô (hết hàng, quá hạn, ngoài bán kính, không kịp…)
 * ⇒ `replan = true` để server tính lại phương án và giao diện thay bằng phương án mới.
 */

export type NeedActionError = ActionError & {
  /** Lỗi do dữ liệu lô vừa đổi ⇒ tính lại phương án. */
  replan?: boolean;
  /** `insufficient_quantity`: số còn lại của lô. */
  available?: number;
};

export type OfferRef = { title: string; storeName: string; unit: UnitCode };

export const NEED_MESSAGES_SERVER = {
  needClosed: "Nhu cầu đã đóng hoặc đã hủy nên không ghép thêm được. Hãy tải lại trang.",
  needCovered: "Nhu cầu đã được ghép đủ — không cần giữ thêm hàng.",
  needPastDeadline: "Đã quá thời điểm cần nhận của nhu cầu này nên không ghép thêm được.",
  orgPaused: "Tổ chức đang tạm ngưng nhận thực phẩm. Bật lại hoạt động trong Cài đặt để giữ hàng.",
  receivingSiteInactive: "Điểm nhận của nhu cầu đang tạm ngưng. Bật lại điểm nhận trong Cài đặt để ghép.",
  notAuthorized: "Tài khoản của bạn không có quyền với điểm nhận của nhu cầu này. Liên hệ chủ tổ chức.",
  plansChanged:
    "Số lô quanh bạn vừa thay đổi nên phương án đã được tính lại. Hãy xem lại rồi chọn phương án mới.",
  noPlans: "Hiện không còn lô phù hợp cho phần còn thiếu. FoodSave sẽ báo bạn khi có lô mới.",
  tooManyStops: (max: number) => `Một phương án đi tối đa ${max} cửa hàng. Hãy chọn phương án khác.`,
} as const;

function lotName(ref: OfferRef | null): string {
  return ref ? `“${ref.title}” của ${ref.storeName}` : "Một lô trong phương án";
}

const REPLAN = " FoodSave đã tính lại phương án — hãy xem lại.";

/** `reserve_bundle` ⇒ thông điệp; `lookup(offerId)` lấy tên lô/cửa hàng từ phương án người dùng đã chọn. */
export function mapReserveError(
  err: PgLikeError,
  lookup: (offerId: string) => OfferRef | null = () => null,
  now: Date = new Date(),
): NeedActionError {
  const detail = parseRpcDetail(err.details);
  const offerId = typeof detail?.offer_id === "string" ? detail.offer_id : null;
  const ref = offerId ? lookup(offerId) : null;
  const code = err.code ?? "";
  const message = err.message ?? "";

  if (code === "PT409") {
    switch (message) {
      case "insufficient_quantity": {
        const available = Number(detail?.available);
        const has = Number.isFinite(available);
        return {
          code: message,
          replan: true,
          ...(has ? { available } : {}),
          message:
            has && ref
              ? `Lô ${lotName(ref)} chỉ còn ${formatQty(available, ref.unit)} — tổ chức khác vừa giữ trước.${REPLAN}`
              : `${lotName(ref)} không còn đủ số lượng — tổ chức khác vừa giữ trước.${REPLAN}`,
        };
      }
      case "deadline_passed":
        if (err.details === "needed_by")
          return { code: "need_past_deadline", message: NEED_MESSAGES_SERVER.needPastDeadline };
        return { code: message, replan: true, message: `Lô ${lotName(ref)} vừa quá hạn hiệu lực.${REPLAN}` };
      case "invalid_state":
        if (err.details === "need_already_covered")
          return { code: "need_already_covered", message: NEED_MESSAGES_SERVER.needCovered };
        if (detail?.reason === "store_paused")
          return {
            code: "store_paused",
            replan: true,
            message: `${ref ? ref.storeName : "Một cửa hàng"} vừa tạm ngưng nhận yêu cầu.${REPLAN}`,
          };
        if (offerId)
          return {
            code: "offer_closed",
            replan: true,
            message: `Lô ${lotName(ref)} vừa được giữ hết hoặc đã đóng.${REPLAN}`,
          };
        return { code: "need_closed", message: NEED_MESSAGES_SERVER.needClosed };
      case "idempotency_conflict":
      case "concurrent_update":
        return { code: message, message: RPC_MESSAGES.busy };
    }
  }

  if (code === "PT404" && offerId)
    return {
      code: "offer_not_found",
      replan: true,
      message: `Lô ${lotName(ref)} không còn hiển thị với tổ chức của bạn.${REPLAN}`,
    };

  if (code === "PT403") {
    if (message === "self_dealing")
      return {
        code: message,
        replan: true,
        message: `Lô ${lotName(ref)} thuộc một cửa hàng mà bạn cũng là thành viên nên không thể tự nhận.${REPLAN}`,
      };
    if (message === "org_not_active" && err.details === "paused")
      return { code: "org_paused", message: NEED_MESSAGES_SERVER.orgPaused };
    if (message === "not_authorized")
      return { code: "forbidden", message: NEED_MESSAGES_SERVER.notAuthorized };
  }

  if (code === "PT422") {
    switch (message) {
      case "out_of_radius":
        return {
          code: message,
          replan: true,
          message: `Lô ${lotName(ref)} nằm ngoài bán kính phục vụ của điểm nhận.${REPLAN}`,
        };
      case "infeasible_timing": {
        const deadline = typeof detail?.effective_deadline === "string" ? detail.effective_deadline : null;
        return {
          code: message,
          replan: true,
          message: deadline
            ? `Không kịp lấy lô ${lotName(ref)} trước hạn hiệu lực ${formatDayTime(deadline, now)} (tính theo xe máy).${REPLAN}`
            : `Không kịp lấy lô ${lotName(ref)} trước hạn hiệu lực (tính theo xe máy).${REPLAN}`,
        };
      }
      case "unit_mismatch":
        return {
          code: message,
          replan: true,
          message: `Đơn vị của lô ${lotName(ref)} không khớp với nhu cầu.${REPLAN}`,
        };
      case "validation_failed": {
        const lines = typeof detail?.p_lines === "string" ? detail.p_lines : null;
        switch (lines) {
          case "exceeds_need": {
            const remaining = Number(detail?.remaining);
            return {
              code: "exceeds_need",
              replan: true,
              message: Number.isFinite(remaining)
                ? `Phương án vượt phần còn thiếu (chỉ còn thiếu ${formatAmountPlain(remaining)}) — vừa có thay đổi ở nhu cầu.${REPLAN}`
                : `Phương án vượt phần còn thiếu — vừa có thay đổi ở nhu cầu.${REPLAN}`,
            };
          }
          case "too_many_stops":
            return {
              code: "too_many_stops",
              message: NEED_MESSAGES_SERVER.tooManyStops(Number(detail?.max) || 5),
            };
          case "too_many_offers":
            return { code: "too_many_offers", replan: true, message: `Phương án có quá nhiều lô.${REPLAN}` };
          case "demo_mismatch":
            return {
              code: "demo_mismatch",
              replan: true,
              message: `Lô ${lotName(ref)} thuộc dữ liệu demo nên không ghép được với tổ chức thật (và ngược lại).${REPLAN}`,
            };
          case "category_not_in_need":
          case "category_not_accepted_by_site":
            return {
              code: lines,
              replan: true,
              message: `Danh mục của lô ${lotName(ref)} không còn khớp với nhu cầu hoặc điểm nhận.${REPLAN}`,
            };
          case "store_site_inactive":
            return {
              code: lines,
              replan: true,
              message: `Chi nhánh có lô ${lotName(ref)} vừa tạm ngưng.${REPLAN}`,
            };
          case "integer_required":
          case "line_format":
            return { code: lines, replan: true, message: `Số lượng trong phương án chưa hợp lệ.${REPLAN}` };
        }
        if (detail?.need === "receiving_site_inactive")
          return { code: "receiving_site_inactive", message: NEED_MESSAGES_SERVER.receivingSiteInactive };
        if (detail?.stop_count === "mismatch" || detail?.rematch_of)
          return { code: "plans_changed", replan: true, message: NEED_MESSAGES_SERVER.plansChanged };
        break;
      }
    }
  }

  return mapRpcError(err);
}

function formatAmountPlain(n: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(n);
}

/** `match_candidates` (tìm phương án) ⇒ thông điệp. */
export function mapMatchError(err: PgLikeError): NeedActionError {
  if (err.code === "PT409" && err.message === "deadline_passed")
    return { code: "need_past_deadline", message: NEED_MESSAGES_SERVER.needPastDeadline };
  if (err.code === "PT409" && err.message === "invalid_state")
    return { code: "need_closed", message: NEED_MESSAGES_SERVER.needClosed };
  if (err.code === "PT403" && err.message === "not_authorized")
    return { code: "forbidden", message: NEED_MESSAGES_SERVER.notAuthorized };
  return mapRpcError(err);
}

/** `cancel_need` ⇒ thông điệp (chỉ owner/manager; nhu cầu đã kết thúc ⇒ invalid_state). */
export function mapCancelNeedError(err: PgLikeError): NeedActionError {
  if (err.code === "PT409" && err.message === "invalid_state")
    return {
      code: "need_closed",
      message: "Nhu cầu đã kết thúc (đủ, đóng hoặc đã hủy) nên không hủy được nữa.",
    };
  if (err.code === "PT403" && err.message === "not_authorized")
    return {
      code: "forbidden",
      message: "Chỉ chủ sở hữu hoặc quản lý tổ chức (có quyền với điểm nhận) mới hủy được nhu cầu.",
    };
  return mapRpcError(err);
}

/** `publish_need`: lỗi không theo trường. */
export const PUBLISH_OVERRIDES: Record<string, string> = {
  "org_not_active:paused":
    "Tổ chức đang tạm ngưng nhận thực phẩm. Bật lại hoạt động trong Cài đặt để đăng nhu cầu.",
  org_not_active: "Tổ chức chưa ở trạng thái hoạt động (đã duyệt) nên chưa đăng được nhu cầu.",
  not_authorized: "Tài khoản của bạn không có quyền đăng nhu cầu cho điểm nhận này. Liên hệ chủ tổ chức.",
  not_found: "Không tìm thấy điểm nhận đã chọn, hoặc bạn không có quyền với điểm này. Hãy tải lại trang.",
};

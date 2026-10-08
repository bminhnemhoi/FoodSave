import { useRef } from "react";

import { newUuid } from "@/lib/hash";

/**
 * `p_client_op_id` cho một ý định của người dùng (DATA-MODEL §15): sinh một lần khi bấm, giữ nguyên nếu
 * lần gửi trước lỗi mạng (không biết RPC đã chạy chưa ⇒ gửi lại là idempotent), đổi mới sau khi server đã
 * trả lời (RPC lỗi thì giao dịch đã rollback, không giữ dấu `client_op_id`).
 */
export function useOpId() {
  const ref = useRef<string | null>(null);
  return {
    get: (): string => (ref.current ??= newUuid()),
    reset: (): void => {
      ref.current = null;
    },
  };
}

/** Lỗi khi gọi Server Action (mất mạng, máy chủ không trả lời). */
export const NETWORK_ERROR = "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.";

/**
 * `client_op_id` theo ý định (DATA-MODEL §15): cùng ý định (cùng khóa — thao tác + dữ liệu gửi) ⇒ cùng id, để
 * bấm lại sau lỗi mạng không ghi hai lần; đổi dữ liệu (ví dụ chọn lý do khác) ⇒ ý định mới ⇒ id mới (RPC
 * so khớp hash dữ liệu theo id, gửi dữ liệu khác với id cũ sẽ bị từ chối `idempotency_conflict`). Thuần, có test.
 */

export type IntentSlot = { key: string; id: string } | null;

export function intentIdFor(slot: IntentSlot, key: string, gen: () => string): { key: string; id: string } {
  return slot && slot.key === key ? slot : { key, id: gen() };
}

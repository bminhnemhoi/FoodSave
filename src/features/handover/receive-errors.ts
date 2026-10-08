/** Thông điệp màn Nhận hàng (dropoff — PRD US-CHA-21). Một nguồn cho server action và màn hình. */
export const RECEIVE_MESSAGES = {
  notDropoff:
    "Đây là mã lấy hàng tại cửa hàng, không phải mã giao về. Nhờ tình nguyện viên mở mã ở bước “Giao về tổ chức”.",
  wrongOrg: "Mã này thuộc chuyến giao về điểm nhận khác — bạn không có quyền nhận ở điểm đó.",
  notFound: "Không tìm thấy lượt giao về này ở điểm nhận của bạn. Hãy tải lại danh sách rồi thử lại.",
  notReady:
    "Chuyến chưa lấy xong mọi điểm, hoặc lượt giao về đã được nhận. Hãy tải lại danh sách để xem trạng thái mới nhất.",
  selfDealing: "Người mở mã giao về không thể tự xác nhận nhận hàng. Hãy để người khác ở điểm nhận quét mã.",
  scanNotHandover:
    "Mã QR này không phải mã bàn giao FoodSave. Hãy quét mã trên màn hình “Giao về tổ chức” của tình nguyện viên.",
} as const;

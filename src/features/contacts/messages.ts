/** Câu tiếng Việt cho các trường hợp không hiện số tình nguyện viên (reveal_trip_contact). */
export const TRIP_CONTACT_MESSAGES = {
  noConsent:
    "Tình nguyện viên chưa bật “Cho phép cửa hàng và điều phối viên gọi tôi khi chuyến đang chạy”, nên FoodSave không hiện số của họ.",
  notActive: "Chuyến chưa được tình nguyện viên nhận hoặc đã kết thúc, nên không hiện số điện thoại.",
  noVolunteer: "Chuyến này không có tình nguyện viên (tổ chức tự đến lấy hàng).",
  notFound: "Không tìm thấy chuyến này, hoặc bạn không phải một bên của chuyến.",
} as const;

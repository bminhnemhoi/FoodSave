# ADR-008: Làm mờ mặt phía client

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh
- **Liên quan:** [ARCHITECTURE.md §6.5](../ARCHITECTURE.md), [DATA-MODEL.md §2.4, §6.7, §10](../DATA-MODEL.md), `SECURITY-PRIVACY.md` §2.4

## Bối cảnh

- Tài liệu định hướng: minh chứng là ảnh phát thức ăn, nấu ăn; "nên tránh chụp rõ mặt người nhận, nhất là trẻ em; ảnh chỉ cửa hàng liên quan và Admin xem được".
- Người nhận là trẻ em mái ấm, người vô gia cư, người cao tuổi — dữ liệu nhạy cảm theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15. Ảnh gốc còn EXIF/GPS có thể lộ vị trí nơi tạm lánh.
- Chưa có AWS (Rekognition); không muốn ảnh **chưa làm mờ** rời khỏi điện thoại.
- Phải chạy trên điện thoại tầm trung, trong trình duyệt (PWA), cả iOS Safari.

## Quyết định

1. **Làm mờ trên máy trước khi upload.** Ảnh gốc không bao giờ được gửi lên server hay AI.
2. Phát hiện mặt bằng **`@mediapipe/tasks-vision` Face Detector, mô hình BlazeFace full-range** (bắt được mặt nhỏ, xa), chạy WASM/WebGL, tải lười khi mở màn minh chứng; file mô hình và WASM tự host trong `public/models/` (không phụ thuộc CDN khi demo).
3. Tăng độ nhạy cho mặt nhỏ: chạy trên **ảnh toàn khung + chia ô** (lưới 2×2 chồng lấn 20%, mỗi ô phóng về kích thước đầu vào của mô hình), ngưỡng tin cậy thấp (0,3, ưu tiên không bỏ sót), gộp hộp trùng (NMS), nới rộng mỗi hộp 25%.
4. Làm mờ mạnh không đảo ngược được: pixel hóa khối lớn rồi Gaussian blur trên canvas, áp lên vùng đã nới rộng; người dùng có **cọ làm mờ thủ công** cho chỗ máy bỏ sót và xem **so sánh trước/sau**; phải bấm xác nhận (`blur_confirmed = true`) mới upload được.
5. **Mã hóa lại** bằng `canvas.toBlob('image/webp', 0.82)` (dự phòng JPEG), cạnh dài ≤ 1600 px ⇒ loại bỏ EXIF/GPS; lưu `face_count`, `manual_blur_regions`, `exif_stripped`.
6. **Không tin kết quả client:** minh chứng `submitted` chỉ admin xem (bucket `proofs` private, signed URL 300 s); admin duyệt từng ảnh rồi cửa hàng liên quan mới xem được (RLS theo `status='approved'`); admin có thể thu hồi (`approved → needs_changes`) nếu phát hiện sót mặt.
7. Hướng dẫn chụp ngay trong UI: ưu tiên tay, món ăn, khung cảnh; tránh mặt trẻ em. Vị trí minh chứng lưu làm tròn ~110 m.
8. Sau giải: thêm **Amazon Rekognition DetectFaces** làm lớp kiểm thứ hai phía server trên ảnh **đã làm mờ** (cảnh báo admin nếu còn mặt rõ), không thay lớp client.

## Hệ quả

**Tích cực**
- Quyền riêng tư theo thiết kế: server không bao giờ giữ ảnh chưa làm mờ ⇒ giảm rủi ro rò rỉ và nghĩa vụ pháp lý; là câu chuyện mạnh khi trình bày.
- Không tốn chi phí server/AI cho xử lý ảnh; hoạt động khi chưa có AWS.
- Dung lượng upload nhỏ (webp đã nén) phù hợp mạng di động.

**Tiêu cực**
- Mô hình có thể bỏ sót mặt nghiêng, che khuất, quá nhỏ ⇒ dựa vào cọ thủ công và admin là lớp chặn cuối.
- Tải mô hình + WASM (vài MB) lần đầu; máy yếu xử lý chậm (mục tiêu ≤ 2 s/ảnh) ⇒ có trạng thái tiến độ, xử lý tuần tự từng ảnh.
- Không thể chứng minh với server rằng ảnh đã được làm mờ (client có thể bị sửa) ⇒ admin duyệt là bắt buộc, không có đường tắt tự duyệt.
- iOS Safari giới hạn bộ nhớ canvas ⇒ thu nhỏ ảnh trước khi phát hiện.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Làm mờ phía server (Rekognition, OpenCV trong hàm) | Ảnh gốc phải rời máy; chưa có AWS; tăng rủi ro và chi phí |
| Chỉ quy định "không chụp mặt", không xử lý | Phụ thuộc hoàn toàn vào người chụp; một lần sơ suất là lộ mặt trẻ em |
| Chỉ làm mờ thủ công | Dễ bỏ sót, tốn công; vẫn giữ làm lớp bổ sung |
| face-api.js / TensorFlow.js tự chọn mô hình | Thư viện ít bảo trì hoặc nặng hơn; MediaPipe có mô hình full-range tối ưu cho web |
| Gửi ảnh cho AI kiểm tra mặt | Lại gửi ảnh có thể còn mặt ra ngoài; AI chỉ dùng cho văn bản mô tả |

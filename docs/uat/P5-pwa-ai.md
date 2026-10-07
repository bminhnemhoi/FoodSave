# UAT P5 — PWA, AI, chất lượng ★M3 (freeze 22/11)

> **Mục tiêu phase:** cài app tình nguyện viên lên điện thoại (PWA), thông báo đẩy (Web Push) kèm dự phòng, vị trí khi app mở, AI kiểm minh chứng và nhận xét ESG, hiệu năng, khả năng tiếp cận, bảo mật, giám sát lỗi.
> **Mốc M3 = freeze 22/11:** E2E xanh, không còn lỗi High, Lighthouse landing và `/volunteer` ≥ 90 ở cả 4 nhóm Performance/Accessibility/Best Practices/SEO (Lighthouse 12 đã bỏ nhóm PWA; khả năng cài đặt kiểm bằng E2E và bằng tay ở mục A). Sau mốc này **chỉ sửa lỗi**.
> **Môi trường:** staging, cộng với kiểm tra lại trên prod các mục ghi **[prod]** · **Thời lượng:** khoảng 2 giờ · **Cần:** 🍎 (iOS 16.4+), 🤖, 💻

**Người chạy:** Khanh · **Ngày:** ___/___ · **Bản:** ______

---

## A. Cài app (PWA)

- [ ] **P5-01** 🤖 Chrome Android: mở `/volunteer`. → **Mong đợi:** có gợi ý **"Cài đặt ứng dụng"** (banner hoặc menu ⋮ → Cài đặt ứng dụng). Cài xong có biểu tượng FoodSave trên màn hình chính.
- [ ] **P5-02** 🤖 Mở app từ biểu tượng. → **Mong đợi:** mở toàn màn hình (không có thanh địa chỉ), màn chờ có logo, vào thẳng "Chuyến hôm nay" nếu đã đăng nhập.
- [ ] **P5-03** 🍎 Safari iPhone: mở `/volunteer`. → **Mong đợi:** có hướng dẫn **"Chia sẻ → Thêm vào Màn hình chính"** (iOS không có nút cài tự động). Làm theo; biểu tượng và tên hiển thị đúng.
- [ ] **P5-04** 🤖 Bật **chế độ máy bay**, mở app. → **Mong đợi:** hiện trang **"Bạn đang ngoại tuyến"** thân thiện (không phải khủng long Chrome); chuyến hôm nay đã mở trước đó vẫn xem được (nếu tính năng này còn trong phạm vi).

## B. Thông báo đẩy

- [ ] **P5-05** 🤖 Trong app, bật **Nhận thông báo**. → **Mong đợi:** hệ thống hỏi quyền; đồng ý xong có thông báo thử "Đã bật thông báo".
- [ ] **P5-06** 🤖 **Đóng app hoàn toàn**. Từ 💻, `[TC]` phân công `[TNV1]` một chuyến mới. → **Mong đợi:** Android hiện thông báo đẩy trong ≤ 1 phút; bấm vào thì mở đúng chuyến.
- [ ] **P5-07** 🍎 Trên iPhone đã "Thêm vào Màn hình chính" (P5-03), mở app từ biểu tượng và bật thông báo. → **Mong đợi:** iOS hỏi quyền; nhận được thông báo như P5-06. *(Chỉ chạy được trên iOS 16.4 trở lên và phải mở từ biểu tượng.)*
- [ ] **P5-08** 🍎 Mở bằng Safari thường (không cài). → **Mong đợi:** app **không** hứa thông báo đẩy; hướng dẫn cài hoặc cho biết sẽ nhận qua **email và thông báo trong app** (dự phòng).
- [ ] **P5-09** 💻 Tắt thông báo đẩy, chỉ để email. Lặp lại P5-06. → **Mong đợi:** nhận **email** thay thế; chuông trong app vẫn có.

## C. Vị trí khi app đang mở

- [ ] **P5-10** 🍎 Đã đồng ý vị trí, đang trong chuyến, để app **mở**. → **Mong đợi:** điều phối viên `[TC]` thấy vị trí cập nhật khoảng mỗi 30 giây.
- [ ] **P5-11** 🍎 Chuyển sang app khác 2 phút. → **Mong đợi:** vị trí **ngừng cập nhật** (đúng thiết kế); màn điều phối hiện "Cập nhật lần cuối x phút trước".
- [ ] **P5-12** 🍎 **Rút đồng ý** vị trí trong Cài đặt khi đang trong chuyến. → **Mong đợi:** ngừng gửi **ngay**; vị trí biến khỏi màn điều phối.

## D. AI

- [ ] **P5-13** 💻 `[ADMIN]` mở một minh chứng chờ duyệt. → **Mong đợi:** có phần **"AI kiểm tra"** (ví dụ: mô tả có khớp ảnh không, số người có hợp lý không, có phát hiện mặt chưa mờ không), ghi rõ là **gợi ý**, quyết định vẫn do Admin.
- [ ] **P5-14** 💻 `[CH-A]` → **Báo cáo tháng**. → **Mong đợi:** có đoạn **nhận xét do AI viết** bằng tiếng Việt tự nhiên, dựa trên số thật, không bịa số; có nhãn "Do AI tạo".
- [ ] **P5-15** 💻 *(Minh tắt cờ AI trong Admin → Cấu hình)* → **Mong đợi:** các nút và phần AI **biến mất** hoặc báo tạm tắt; mọi luồng khác vẫn chạy bình thường.

*(Ghi chú: phần D có thể bị cắt nếu P5 trễ, theo mục 7 của danh sách cắt. Khi đó Minh ghi "N/A – đã cắt".)*

## E. Hiệu năng và trải nghiệm trên máy yếu

- [ ] **P5-16** 🤖 Bấm giờ: mở trang chủ (lần đầu, xóa cache trước). → **Mong đợi:** nội dung chính hiện ≤ 3 giây trên 4G.
- [ ] **P5-17** 🤖 Đi luồng: đăng nhập `[CH-A]`, đăng lô, xem kho lô. → **Mong đợi:** mỗi lần chuyển trang ≤ 2 giây; có khung xương (skeleton) khi đang tải, không có màn trắng.
- [ ] **P5-18** 🤖 Xoay ngang điện thoại ở màn QR bàn giao. → **Mong đợi:** QR vẫn hiện đủ, không bị cắt.

## F. Khả năng tiếp cận

- [ ] **P5-19** 💻 Chỉ dùng bàn phím (Tab, Shift+Tab, Enter, Space, mũi tên), không dùng chuột: đăng nhập `[CH-A]` và đăng một lô. → **Mong đợi:** làm được hết; luôn thấy **viền focus** đang ở đâu; không bị kẹt trong hộp thoại.
- [ ] **P5-20** 🍎 Bật **VoiceOver** (Cài đặt → Trợ năng). Nghe thẻ lô trong kho tặng. → **Mong đợi:** đọc được tên lô, số lượng, **nhãn bằng chữ** ("Nhãn Đỏ, còn 2 giờ 10 phút"), không chỉ đọc "hình ảnh".
- [ ] **P5-21** 💻 Phóng to trình duyệt **200%** (Ctrl +). → **Mong đợi:** không mất nội dung, không phải cuộn ngang ở trang chính.

## G. Bảo mật và giám sát

- [ ] **P5-22** 💻 **[prod]** Mở https://securityheaders.com và nhập `https://<DOMAIN>`. → **Mong đợi:** hạng **A** trở lên. Chụp kết quả gửi Minh.
- [ ] **P5-23** 💻 `[ADMIN]` trên prod đăng nhập phải có mã MFA (nhắc lại P1). → **Mong đợi:** đúng.
- [ ] **P5-24** 💻 Gõ một đường dẫn không tồn tại (`/abc-xyz`). → **Mong đợi:** trang 404 tiếng Việt thân thiện, có nút về trang chủ.
- [ ] **P5-25** 💻 *(Minh tạo lỗi thử)* → **Mong đợi:** người dùng thấy trang lỗi thân thiện, **không** thấy chi tiết kỹ thuật (stack trace, tên bảng). Minh xác nhận lỗi có trong Sentry.
- [ ] **P5-26** 💻 **[prod]** Kiểm tra trang theo dõi hoạt động (uptime) Minh gửi link. → **Mong đợi:** prod "Up" và có lịch sử ≥ 7 ngày.

## H. Kiểm tra hồi quy nhanh (luồng chính)

- [ ] **P5-27** 💻 + 🍎 Chạy lại **P2-38** (luồng M1) trên **staging**. → **Mong đợi:** chạy hết, không lỗi.
- [ ] **P5-28** 💻 + 🍎 + 🤖 Chạy lại **P3-05 → P3-14** (50 bánh từ 3 cửa hàng), rút gọn. → **Mong đợi:** chạy hết, không lỗi.
- [ ] **P5-29** 💻 Chạy lại **P4-09 → P4-12** (quyền xem minh chứng). → **Mong đợi:** đúng như P4.

---

**Kết quả:** Đạt ___ / 29 · Lỗi: ______________________
**Ký UAT:** `Đồng ý ký UAT P5`. Đây là điều kiện để **freeze 22/11** và tag M3. **Minh quay video #3** (video dự phòng cho demo).

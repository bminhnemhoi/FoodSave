# UAT P6 — Sẵn sàng chung kết (tập dượt demo)

> **Mục tiêu:** demo 5 phút chạy **chắc chắn** trên **prod** với 2 thiết bị (laptop đóng vai cửa hàng quét QR trên điện thoại của tình nguyện viên). Tập dượt **3 lần**. Mọi rủi ro (mạng, dữ liệu, thiết bị) đều có phương án dự phòng.
> **Môi trường:** **prod** · **Thời lượng:** 3 lần × khoảng 45 phút · **Cần:** laptop demo, điện thoại demo (iPhone hoặc Android, đã cài PWA), điện thoại thứ ba phát 4G dự phòng, đồng hồ bấm giờ.
> **Kịch bản trình bày:** `docs/pitch/` (kịch bản demo 2 thiết bị). Checklist này chỉ kiểm tra **kỹ thuật** của buổi demo.

**Lần tập:** ☐ 1 (___/11) ☐ 2 (___/11) ☐ 3 (___/11, ngày trước chung kết) · **Người chạy:** Khanh + Minh

---

## A. Trước buổi demo (T−1 ngày)

- [ ] **P6-01** 💻 Prod đang ở **tag phát hành cuối cùng** (Minh xác nhận số version ở chân trang hoặc `/api/health`).
- [ ] **P6-02** 💻 Trang uptime: prod "Up" liên tục 7 ngày; Supabase prod **không** bị tạm dừng.
- [ ] **P6-03** 💻 Đăng nhập được cả 3 tài khoản giám khảo `[GK-CH]`, `[GK-TC]`, `[GK-TNV]` và tài khoản admin của nhóm (có MFA). In **phiếu tài khoản giám khảo** (không chứa mật khẩu admin) nếu BTC cần.
- [ ] **P6-04** 🍎/🤖 Điện thoại demo: đã cài PWA, đã đăng nhập `[GK-TNV]`, đã bật thông báo, **độ sáng tối đa**, tắt chế độ tiết kiệm pin, tắt thông báo của app khác (Zalo, Messenger), **tắt khóa màn hình tự động**.
- [ ] **P6-05** 💻 Laptop demo: Chrome sạch (không extension lạ), đã đăng nhập `[GK-CH]` ở cửa sổ 1 và `[GK-TC]` ở cửa sổ 2, **đã cấp quyền camera** cho trang bàn giao, zoom 110–125% cho dễ nhìn trên máy chiếu, tắt thông báo hệ điều hành.
- [ ] **P6-06** 💻 Video dự phòng #1–#3 đã tải **về máy** (không phụ thuộc mạng), mở thử được.
- [ ] **P6-07** 💻 Slide có sẵn ảnh chụp màn hình của từng bước demo (dự phòng mức 3).

## B. Ngay trước giờ demo (T−30 phút)

- [ ] **P6-08** 💻 Kết nối mạng hội trường, mở `https://<DOMAIN>`: tải ≤ 3 giây. Nếu mạng chậm thì chuyển sang **hotspot 4G** và kiểm tra lại.
- [ ] **P6-09** 💻 Admin bấm **Reset demo**. → **Mong đợi:** xong ≤ 15 giây; kho tặng có lô Xanh/Vàng/Đỏ với đếm ngược tính từ **bây giờ**; có nhu cầu "50 bánh" mẫu.
- [ ] **P6-10** 🍎 Mở QR trên điện thoại, đưa trước webcam laptop thử (**không** xác nhận). → **Mong đợi:** laptop đọc được QR trong ≤ 3 giây trong điều kiện ánh sáng phòng. Nếu không đọc được thì chuẩn bị dùng **mã 6 số**.
- [ ] **P6-11** 💻 Gửi thử 1 thông báo tới điện thoại. → **Mong đợi:** đến trong ≤ 10 giây.

## C. Chạy kịch bản (bấm giờ)

| # | Bước demo | Thiết bị | Mong đợi | Thời gian mục tiêu | ✓ |
|---|---|---|---|---|---|
| **P6-12** | Landing + bộ đếm tác động + bản đồ hoạt động | 💻 | Số thật (hoặc nhãn demo rõ ràng), bản đồ hiện | 0:30 | ☐ |
| **P6-13** | Cửa hàng đăng lô bằng **ảnh → AI tự điền**, tick cam kết an toàn | 💻 (hoặc 🍎) | Form tự điền trong ≤ 10 giây | 0:45 | ☐ |
| **P6-14** | Tổ chức: nhu cầu 50 bánh → **3 phương án**, bản đồ tuyến A-B-C | 💻 cửa sổ 2 | Phương án 1 = 20 + 18 + 12 | 0:45 | ☐ |
| **P6-15** | Phân công tình nguyện viên → điện thoại nhận **thông báo đẩy** | 🍎 | Thông báo hiện trên màn khóa hoặc trên đầu màn hình | 0:20 | ☐ |
| **P6-16** | **Bàn giao QR:** điện thoại hiện QR, laptop (cửa hàng) quét, đối soát dòng | 🍎 + 💻 | Quét ≤ 3 giây; điện thoại đổi trạng thái realtime | 0:40 | ☐ |
| **P6-17** | Dropoff → **tác động tăng** ngay trên dashboard | 💻 | Số kg/CO₂e/suất ăn tăng đúng | 0:20 | ☐ |
| **P6-18** | Minh chứng: ảnh có mặt → **làm mờ trên máy**, so sánh trước/sau | 🍎 | Mặt bị mờ | 0:40 | ☐ |
| **P6-19** | Admin duyệt minh chứng → cửa hàng thấy; **báo cáo ESG tháng** in được | 💻 | Báo cáo có nguồn hệ số | 0:40 | ☐ |
| | **Tổng** | | | **≤ 5:00** | |

- [ ] **P6-20** Tổng thời gian thực tế: ____ phút ____ giây. → **Mong đợi:** ≤ 5:00. Lần tập 1 có thể vượt; lần 3 **phải** đạt.
- [ ] **P6-21** Không có màn hình lỗi, không có chữ "undefined", "null", "Lỗi không xác định" xuất hiện trước khán giả.

## D. Diễn tập sự cố (ít nhất ở lần tập 2)

- [ ] **P6-22** Ngắt Wi-Fi giữa bước P6-16. → **Mong đợi:** người trình bày chuyển sang hotspot trong ≤ 30 giây và nói tiếp; hoặc dùng **mã 6 số** khi camera không đọc.
- [ ] **P6-23** Giả sử prod không phản hồi. → **Mong đợi:** chuyển sang **video dự phòng** trong ≤ 15 giây, không lúng túng (đã thống nhất câu chuyển: "Để tiết kiệm thời gian, nhóm xin chiếu đoạn ghi hình thao tác trên hệ thống thật…").
- [ ] **P6-24** Giả sử dữ liệu demo bị giám khảo thao tác làm rối (trước phần hỏi đáp). → **Mong đợi:** Reset demo ≤ 15 giây.
- [ ] **P6-25** Giám khảo hỏi "Cho tôi tự thử". → **Mong đợi:** đưa phiếu tài khoản giám khảo; tài khoản giám khảo **không** có quyền admin; role switcher hoạt động.

## E. Sau mỗi lần tập

- [ ] **P6-26** Ghi lại mọi chỗ vấp (kỹ thuật hoặc lời nói) vào issue `UAT P6 – lần n`. Lỗi kỹ thuật thì tạo issue Bug (UAT) mức **High**, vì sau freeze chỉ sửa lỗi.
- [ ] **P6-27** Admin **Reset demo** để trả prod về trạng thái sạch.
- [ ] **P6-28** Lần tập 3: mọi mục A–D đều ✓. → Khanh comment **`Đồng ý ký UAT P6 – sẵn sàng chung kết`**.

---

## Phụ lục: Mang theo ngày chung kết

- [ ] Laptop + sạc · điện thoại demo + sạc · điện thoại phát 4G (đã nạp data) · sạc dự phòng
- [ ] Cáp HDMI / USB-C sang HDMI (hỏi BTC loại cổng máy chiếu)
- [ ] Video dự phòng trên laptop **và** USB
- [ ] Phiếu tài khoản giám khảo in sẵn (2 bản)
- [ ] Mã khôi phục MFA admin (cất riêng, **không** đưa ai)

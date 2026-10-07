# UAT P3 — Ghép đơn & Điều phối

> **Mục tiêu phase:**
> - Tổ chức đăng nhu cầu; hệ thống **ghép từ nhiều cửa hàng** (tối đa 3 phương án).
> - Thông báo hai chiều theo bán kính (kèm Admin).
> - Tình nguyện viên được mời, có hồ sơ và đồng ý chia sẻ vị trí.
> - Chuyến lấy hàng: tuyến tối ưu, chỉ đường, check-in.
> - Ma trận hủy và ghép lại phần thiếu.
>
> **Gate:** kịch bản **"50 bánh từ 3 cửa hàng"** chạy trọn vẹn; tuyến hiển thị trên bản đồ thật.
> **Môi trường:** staging · **Thời lượng:** khoảng 2,5 giờ · **Cần:** 💻 (3 cửa sổ: thường, ẩn danh, một trình duyệt khác như Edge) + 🍎 + 🤖
> **Chuẩn bị (Minh làm trước):** staging có `[CH-A]` 20 bánh ngọt, `[CH-B]` 18, `[CH-C]` 12, tất cả trong bán kính của `[TC]`, cùng một cửa hàng D có 40 bánh **ngoài** bán kính. Mọi lô hạn còn ≥ 6 giờ.

**Người chạy:** Khanh · **Ngày:** ___/___ · **Bản:** ______

---

## A. Thông báo hai chiều theo bán kính

- [ ] **P3-01** 💻 `[CH-A]` đăng một lô mới, danh mục **Bánh ngọt**. → **Mong đợi:** `[TC]` (trong bán kính, có nhận bánh ngọt) nhận thông báo trong ≤ 1 phút; `[ADMIN]` cũng nhận.
- [ ] **P3-02** 💻 Đăng một lô danh mục mà `[TC]` **không nhận**. → **Mong đợi:** `[TC]` **không** nhận thông báo; Admin vẫn nhận.
- [ ] **P3-03** 💻 Đăng một lô **Đỏ** (cơm hộp, hạn +2 giờ). → **Mong đợi:** thông báo có chữ **GẤP**, nổi bật hơn thông báo thường.
- [ ] **P3-04** 💻 Tắt thông báo "Donation mới (thường)" trong **Cài đặt thông báo** của `[TC]`, rồi đăng lô Xanh. → **Mong đợi:** không nhận thông báo thường; lô Đỏ vẫn nhận GẤP (nếu còn bật).

## B. Kịch bản "50 bánh từ 3 cửa hàng" ★

- [ ] **P3-05** 💻 `[TC]` vào **Nhu cầu → Đăng nhu cầu**: Bánh ngọt, **50 cái**, cần trước 4 giờ tới, điểm nhận mặc định. → **Mong đợi:** đăng được; `[CH-A]`, `[CH-B]`, `[CH-C]` và Admin nhận thông báo "Nhu cầu mới gần bạn"; cửa hàng D (ngoài bán kính) **không** nhận.
- [ ] **P3-06** 💻 `[TC]` bấm **Xem phương án ghép**. → **Mong đợi:** có **tối đa 3** phương án. Phương án 1 = **A 20 + B 18 + C 12 = 50**, gồm 3 điểm dừng, tổng km và tổng thời gian. Cửa hàng D **không** xuất hiện.
- [ ] **P3-07** 💻 Xem phương án 1 trên bản đồ. → **Mong đợi:** có tổ chức và 3 cửa hàng, **điểm dừng đánh số 1-2-3**, đường tuyến vẽ theo đường phố (không phải đường thẳng).
- [ ] **P3-08** 💻 So sánh 3 phương án. → **Mong đợi:** phương án nào cũng ≤ 50 cái (không vượt nhu cầu); phương án ít điểm dừng hoặc tuyến ngắn hơn được xếp trên.
- [ ] **P3-09** 💻 Chọn phương án 1. → **Mong đợi:** 3 cửa hàng nhận yêu cầu; nhu cầu ở trạng thái "Đã ghép một phần" cho tới khi đủ xác nhận.
- [ ] **P3-10** 💻 Lần lượt `[CH-A]`, `[CH-B]`, `[CH-C]` bấm **Xác nhận**. → **Mong đợi:** sau cửa hàng cuối, nhu cầu chuyển "Đã ghép đủ".
- [ ] **P3-11** 💻 `[TC]` vào **Chuyến lấy hàng → Tạo chuyến**: giao `[TNV1]` lấy ở A và B, `[TNV2]` lấy ở C. → **Mong đợi:** mỗi chuyến có thứ tự điểm dừng tối ưu; vượt **sức chở** khai trong hồ sơ tình nguyện viên thì có cảnh báo.
- [ ] **P3-12** 🍎 `[TNV1]` mở **Chuyến hôm nay**. → **Mong đợi:** thấy 2 điểm dừng theo thứ tự, bản đồ tới điểm kế tiếp, nút **"Mở Google Maps"** và **"Mở Apple Maps"**.
- [ ] **P3-13** 🍎 Bấm "Mở Apple Maps" (hoặc Google Maps). → **Mong đợi:** app bản đồ mở với **đúng điểm đến** là cửa hàng A, chế độ xe máy nếu app hỗ trợ.
- [ ] **P3-14** 🍎 + 💻 Thực hiện bàn giao pickup ở A, B (`[TNV1]`) và C (`[TNV2]` trên 🤖), rồi dropoff ở `[TC]`. → **Mong đợi:** nhu cầu chuyển **"Đã nhận đủ"**; dashboard tác động tăng theo 50 cái × khối lượng/cái.
- [ ] **P3-15** 💻 Kiểm tra **Tác động → Chuyến tình nguyện**. → **Mong đợi:** tăng **2 chuyến** (TNV1 và TNV2) và **3 điểm lấy**.

## C. Tình nguyện viên

- [ ] **P3-16** 💻 `[TC]` vào **Tình nguyện viên → Mời** và nhập email `[MOI]` mới. → **Mong đợi:** email mời đến trong ≤ 1 phút; link mời có hạn (ghi rõ trong email).
- [ ] **P3-17** 🤖 Mở link mời trên Android, tạo tài khoản, điền hồ sơ: phương tiện (xe máy), sức chở (kg), khu vực hoạt động. → **Mong đợi:** khu vực chỉ chọn mức **phường/xã**, không yêu cầu địa chỉ nhà.
- [ ] **P3-18** 💻 Mở link mời đó **lần thứ hai** (sau khi đã dùng). → **Mong đợi:** báo link đã dùng hoặc hết hạn.
- [ ] **P3-19** 🍎 `[TNV1]` bắt đầu chuyến lần đầu. → **Mong đợi:** hiện màn **đồng ý chia sẻ vị trí**, nói rõ: chỉ khi app đang mở, chỉ trong chuyến, không lưu lịch sử, tắt được. Bấm **Không đồng ý**. → **Mong đợi:** vẫn chạy được chuyến, dùng nút check-in thủ công.
- [ ] **P3-20** 🍎 Bật lại đồng ý trong **Cài đặt → Quyền riêng tư**, mở chuyến và di chuyển (hoặc đứng gần điểm dừng). → **Mong đợi:** `[TC]` (màn điều phối) thấy vị trí TNV và ETA cập nhật. **`[CH-A]` chỉ thấy ETA**, không thấy vị trí trên bản đồ.
- [ ] **P3-21** 🍎 Tới trong khoảng 100 m quanh cửa hàng *(hoặc Minh giả lập vị trí)*. → **Mong đợi:** nút **Check-in** sáng lên, hoặc tự gợi ý check-in.
- [ ] **P3-22** 🍎 Kết thúc chuyến, rồi `[TC]` mở lại màn điều phối. → **Mong đợi:** **không còn** vị trí của TNV.

## D. Ma trận hủy và ghép lại phần thiếu

- [ ] **P3-23** 💻 Tạo lại nhu cầu 50 bánh, chọn phương án A + B + C, cả 3 xác nhận. Sau đó `[CH-B]` bấm **Hủy** (đã xác nhận rồi). → **Mong đợi:** **bắt buộc chọn lý do**; có cảnh báo ảnh hưởng điểm uy tín.
- [ ] **P3-24** 💻 `[TC]`. → **Mong đợi:** nhận thông báo thiếu 18; hệ thống đề xuất ghép lại **chỉ 18 cái còn thiếu** (không ghép lại cả 50); tổng sau ghép lại vẫn ≤ 50.
- [ ] **P3-25** 💻 `[TC]` hủy một yêu cầu **trước khi** lấy hàng. → **Mong đợi:** số lượng **trả về** lô của cửa hàng (lô hiện lại số lượng có thể nhận).
- [ ] **P3-26** 💻 Điều phối viên đánh dấu `[TNV2]` **không đến**. → **Mong đợi:** chuyến của TNV2 bị hủy; phân bổ quay về trạng thái "Đã xác nhận" để phân công người khác.
- [ ] **P3-27** 💻 Sau khi **đã lấy hàng** (pickup xong), tìm nút Hủy. → **Mong đợi:** **không** hủy được; chỉ có **"Báo sự cố"**.

## E. Kiểm tra khả thi (lô Đỏ) và điểm ẩn

- [ ] **P3-28** 💻 *(Minh chuẩn bị)* Một lô Đỏ còn 30 phút ở cửa hàng cách `[TC]` khoảng 12 km. → **Mong đợi:** lô **không** được gợi ý cho `[TC]` (đi xe máy không kịp); lô gần còn 30 phút thì vẫn được gợi ý.
- [ ] **P3-29** 💻 `[CH-A]` mở **Nhu cầu gần bạn** (bản đồ). → **Mong đợi:** tổ chức có điểm "Ẩn" chỉ hiện **vùng gần đúng** hoặc tên phường, **không** có ghim chính xác. Chỉ khi có phân bổ đang chạy, cửa hàng mới thấy thông tin cần cho việc giao nhận.

## F. Thiết bị

- [ ] **P3-30** 🤖 Toàn bộ màn **Chuyến hôm nay** trên Android cấu hình thấp. → **Mong đợi:** dùng được bằng một tay; nút đủ to (≥ 44 px); bản đồ không làm máy treo.
- [ ] **P3-31** 🍎 Khóa màn hình iPhone 1 phút khi đang trong chuyến, mở lại. → **Mong đợi:** app quay lại đúng chuyến; có ghi chú rằng vị trí chỉ gửi khi app đang mở.

---

**Kết quả:** Đạt ___ / 31 · Lỗi: ______________________
**Ký UAT:** `Đồng ý ký UAT P3`.

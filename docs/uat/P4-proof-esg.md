# UAT P4 — Minh bạch & ESG ★M2

> **Mục tiêu phase:**
> - Minh chứng: làm mờ mặt ngay trên điện thoại, xóa vị trí trong ảnh, có hạn nộp kèm nhắc. Admin duyệt xong thì cửa hàng mới xem được.
> - ESG: chỉ số E/S/G cho 3 cổng và Admin; báo cáo tháng in được.
> - Trang tác động / KPI công khai.
>
> **Mốc M2 (17/11):** đủ 4 hướng trong tài liệu định hướng.
> **Môi trường:** staging (A–F) + prod (G) · **Thời lượng:** khoảng 2 giờ · **Cần:** 💻 + 🍎 + 🤖
> **Chuẩn bị:**
> - 2 ảnh chụp bằng điện thoại **có bật vị trí**. Ảnh 1 có 2–3 người, mặt nhìn thẳng (người trong nhóm, đã đồng ý). Ảnh 2 có một khuôn mặt nhỏ ở xa.
> - Bảng tính tay (mục E).
> - Có ít nhất 2 lần giao đã hoàn tất từ P2/P3 trên staging.

**Người chạy:** Khanh · **Ngày:** ___/___ · **Bản:** ______

---

## A. Đăng minh chứng (tổ chức)

- [ ] **P4-01** 🍎 `[TC]` vào **Minh chứng** lần đầu. → **Mong đợi:** hiện màn **cam kết chụp ảnh**: chỉ chụp khi người trong ảnh hoặc người giám hộ đồng ý, tránh mặt (nhất là trẻ em), ảnh được Admin duyệt trước khi cửa hàng xem. Phải bấm đồng ý mới tiếp tục được.
- [ ] **P4-02** 🍎 Danh sách **"Cần minh chứng"** có các lần nhận hàng vừa xong, kèm **hạn nộp** (mặc định 48 giờ sau khi nhận, ví dụ "còn 1 ngày 5 giờ").
- [ ] **P4-03** 🍎 Tạo minh chứng cho 2 lần nhận (gộp chung một lần phát). Chọn ảnh 1. → **Mong đợi:** app **tự làm mờ** các khuôn mặt; có màn **so sánh trước/sau** (vuốt hoặc bật tắt).
- [ ] **P4-04** 🍎 Chọn ảnh 2 (mặt nhỏ ở xa). Nếu mặt **chưa** được làm mờ, dùng **cọ làm mờ thủ công** tô lên. → **Mong đợi:** cọ dùng được bằng ngón tay; vùng tô bị mờ; có nút hoàn tác.
- [ ] **P4-05** 🍎 Điền mô tả ("Phát bánh cho trẻ em lớp học tình thương"), **số người** 35, địa điểm. → **Mong đợi:** địa điểm tự lấy từ định vị máy, **sửa tay được** (kéo ghim hoặc gõ). Mini-map hiện vị trí gần đúng.
- [ ] **P4-06** 🍎 Thử số người **0** hoặc **100000**. → **Mong đợi:** bị từ chối với thông báo dễ hiểu.
- [ ] **P4-07** 🍎 Gửi minh chứng. → **Mong đợi:** trạng thái **"Chờ duyệt"**; các lần nhận liên quan biến khỏi danh sách "Cần minh chứng".
- [ ] **P4-08** 💻 *(Admin)* Tải ảnh minh chứng đã lưu về máy, xem Properties → Details. → **Mong đợi:** **không** có GPS. Mặt đã mờ trong file đã lưu, không chỉ mờ trên màn hình.

## B. Quyền xem minh chứng

- [ ] **P4-09** 💻 `[CH-A]` (đã tặng lô trong minh chứng) vào **Minh chứng đã nhận**. → **Mong đợi:** **chưa thấy** minh chứng này (vì chưa duyệt).
- [ ] **P4-10** 💻 `[ADMIN]` vào **Duyệt minh chứng**. → **Mong đợi:** thấy ảnh, số mặt máy phát hiện, mô tả, số người, các lô liên quan. Có các nút: Duyệt / Yêu cầu sửa (bắt buộc lý do) / Từ chối.
- [ ] **P4-11** 💻 Admin bấm **Yêu cầu sửa**, lý do "Ảnh 2 còn thấy rõ mặt em bé bên trái". → **Mong đợi:** `[TC]` nhận thông báo kèm lý do, sửa và gửi lại được.
- [ ] **P4-12** 💻 Admin **Duyệt**. → **Mong đợi:** `[CH-A]` **thấy** minh chứng (ảnh đã mờ, mô tả, số người). Có thông báo cho cửa hàng.
- [ ] **P4-13** 💻 `[CH-C]` (**không** liên quan tới minh chứng này). → **Mong đợi:** **không** thấy minh chứng này.
- [ ] **P4-14** 💻 `[CH-A]` mở ảnh minh chứng, copy link ảnh, đợi **6 phút** rồi mở lại link trong tab mới. → **Mong đợi:** link hết hạn, không mở được.

## C. Nhắc khi quá hạn

- [ ] **P4-15** 💻 *(Minh chỉnh hạn nộp của một lần nhận về quá khứ, hoặc dùng dữ liệu seed)* → **Mong đợi:** `[TC]` nhận nhắc (trong app và/hoặc email) "Bạn có n lần nhận hàng chưa có minh chứng"; Admin thấy danh sách **quá hạn**.

## D. Dashboard ESG

- [ ] **P4-16** 💻 `[CH-A]` → **ESG**. → **Mong đợi:** có 3 nhóm **E (Môi trường)**, **S (Xã hội)**, **G (Quản trị)**:
  - E: kg cứu được, CO₂e, nước, % lô hết hạn không ai nhận.
  - S: suất ăn, lượt người được hỗ trợ, chuyến tình nguyện.
  - G: % lô có minh chứng hợp lệ.
  - Mỗi chỉ số có biểu tượng ⓘ giải thích công thức và nguồn.
- [ ] **P4-17** 💻 `[TC]` → **ESG**. → **Mong đợi:** có kg nhận, CO₂e, suất ăn, số người, **% nhu cầu được đáp ứng đủ**, thời gian đăng minh chứng trung bình (giờ), % minh chứng hợp lệ.
- [ ] **P4-18** 💻 `[ADMIN]` → **ESG hệ thống**. → **Mong đợi:** có thêm số cửa hàng/tổ chức **hoạt động trong tháng**, **thời gian duyệt hồ sơ trung bình (ngày)**, **% phản ánh đã xử lý**.
- [ ] **P4-19** 💻 Đổi tháng trên dashboard (tháng trước). → **Mong đợi:** số thay đổi theo tháng; tháng chưa có dữ liệu thì hiện "—" (không hiện 0%).
- [ ] **P4-20** 💻 Mỗi dashboard. → **Mong đợi:** có dòng **tuyên bố giới hạn** ("số liệu là ước tính, không phải kiểm toán…") và link **Phương pháp**.

## E. Đối chiếu số liệu bằng tay

Chọn **một** lần giao cụ thể trên staging rồi điền bảng. Hệ số lấy từ trang **Phương pháp** (`/impact/methodology`): CO₂e = 2,5 kg/kg; suất ăn = 0,42 kg/suất; hệ số nước theo trang Phương pháp.

| Mục | Giá trị |
|---|---|
| Số lượng giao thực (đã trừ phần từ chối) | ____ |
| Khối lượng mỗi đơn vị (kg) | ____ |
| **kg** = số lượng × khối lượng | ____ |
| **CO₂e** = kg × 2,5 | ____ |
| **Nước** = kg × hệ số nước | ____ |
| **Suất ăn** = kg ÷ 0,42, **làm tròn xuống** | ____ |

- [ ] **P4-21** 💻 So sánh với phần tăng thêm trên dashboard của cửa hàng tặng lô đó. → **Mong đợi:** khớp (kg lệch tối đa 0,1 do làm tròn hiển thị).
- [ ] **P4-22** 💻 Minh chứng P4-05 khai **35 người**. → **Mong đợi:** "Lượt người được hỗ trợ" của `[TC]` tăng 35 **sau khi** Admin duyệt (chưa duyệt thì không tăng).

## F. Báo cáo tháng (CSR)

- [ ] **P4-23** 💻 `[CH-A]` → **ESG → Báo cáo tháng**. → **Mong đợi:** gồm bìa (tên cửa hàng, tháng, mã báo cáo), tóm tắt, E/S/G, danh sách bàn giao, ảnh minh chứng **đã duyệt**, phần Phương pháp có nguồn (FAO 2013, WRAP).
- [ ] **P4-24** 💻 Bấm **In / Tải PDF** (Ctrl+P → Lưu thành PDF). → **Mong đợi:** khổ A4 dọc, không bị cắt bảng, không có menu hay nút thừa trong bản in.
- [ ] **P4-25** 💻 Dùng điện thoại quét **mã QR xác thực** trên báo cáo. → **Mong đợi:** mở trang công khai hiện đúng các tổng số của báo cáo đó.

## G. Trang tác động công khai (prod)

- [ ] **P4-26** 💻 Mở `https://<DOMAIN>/impact` khi **không đăng nhập**. → **Mong đợi:** bộ đếm (kg, CO₂e, suất ăn, …), biểu đồ theo tháng, bản đồ hoạt động.
- [ ] **P4-27** 💻 Phóng to tối đa bản đồ công khai. → **Mong đợi:** chỉ thấy **ô vuông vùng** (khoảng 500 m) hoặc phường, **không** thấy ghim chính xác hay tên mái ấm có điểm "Ẩn".
- [ ] **P4-28** 🤖 Mở `/impact` trên Android cấu hình thấp. → **Mong đợi:** tải ≤ 5 giây; số đọc rõ; biểu đồ không tràn màn hình.
- [ ] **P4-29** 💻 Trang **Phương pháp** (`/impact/methodology`). → **Mong đợi:** liệt kê công thức, hệ số kèm **nguồn có link**, version và ngày hiệu lực.

## H. Quyền dữ liệu cá nhân

- [ ] **P4-30** 💻 `[TNV1]` → **Cài đặt → Quyền riêng tư → Tải dữ liệu của tôi**. → **Mong đợi:** tải được file; mở bằng Notepad thấy thông tin của chính mình, **không** có thông tin người khác.
- [ ] **P4-31** 💻 `[TC]` thử **Xóa tài khoản** khi còn chuyến hoặc phân bổ chưa xong. → **Mong đợi:** bị chặn, có hướng dẫn cần làm gì trước.

---

**Kết quả:** Đạt ___ / 31 · Lỗi: ______________________
**Ký UAT:** `Đồng ý ký UAT P4` (điều kiện để tag M2). **Minh quay video #2.**

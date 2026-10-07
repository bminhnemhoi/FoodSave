# UAT P2 — Vòng lõi MVP ★M1

> **Mục tiêu phase:** cửa hàng đăng lô → tổ chức yêu cầu → xác nhận → bàn giao bằng QR hoặc mã 6 số → ghi nhận tác động. Kèm nhãn Xanh/Vàng/Đỏ, kho tặng có bản đồ, thông báo, AI tự điền, dữ liệu demo và tài khoản giám khảo.
> **Mốc M1 (27/10):** luồng **đăng → nhận → QR → giao → tác động** chạy trọn vẹn trên **prod**.
> **Môi trường:** staging (phần A–G) + prod (phần H) · **Thời lượng:** khoảng 2 giờ · **Cần:** 💻 (2 cửa sổ) + 🍎 + 🤖
> **Chuẩn bị:** ảnh chụp một ổ bánh mì hoặc hộp bánh (để thử AI), bút và giấy để ghi số kg.

**Người chạy:** Khanh · **Ngày:** ___/___ · **Bản:** ______

---

## A. Đăng lô (cửa hàng)

- [ ] **P2-01** 💻 Đăng nhập `[CH-A]`, chọn **Đăng lô mới**. Danh mục "Bánh mì", số lượng **20**, đơn vị **cái**. → **Mong đợi:** ô "Khối lượng mỗi cái" tự điền mức mặc định (ví dụ 0,08 kg) và **sửa được**.
- [ ] **P2-02** 💻 Đặt hạn sử dụng là **hôm nay**, khung giờ lấy là 2 giờ tới. **Không** tick ô "Cam kết an toàn thực phẩm", rồi bấm Đăng. → **Mong đợi:** không đăng được; báo phải cam kết.
- [ ] **P2-03** 💻 Tick cam kết, đăng. → **Mong đợi:** lô xuất hiện trong **Kho lô**, có nhãn màu **kèm chữ** (Xanh/Vàng/Đỏ) và **đếm ngược** thời gian còn lại.
- [ ] **P2-04** 💻 Nếu cửa hàng có giờ đóng cửa sớm hơn hạn (ví dụ đóng 21:00, hạn 23:59): xem thời gian đếm ngược. → **Mong đợi:** đếm ngược tới **giờ đóng cửa**, không phải tới hạn sử dụng (mốc nào đến trước thì dùng mốc đó).
- [ ] **P2-05** 💻 Thử số lượng **2,5 cái**. → **Mong đợi:** bị từ chối (đơn vị "cái" phải là số nguyên). Đổi đơn vị sang **kg** thì 2,5 hợp lệ.
- [ ] **P2-06** 💻 Đăng một lô, bấm nút **Đăng** 3 lần thật nhanh. → **Mong đợi:** chỉ có **1** lô mới.
- [ ] **P2-07** 🍎 Trên iPhone, chọn **Đăng lô bằng ảnh** (AI), chụp ảnh bánh mì. → **Mong đợi:** trong khoảng ≤ 10 giây form tự điền danh mục, tên và số lượng ước tính. Mọi ô **sửa được**. Có ghi chú nhỏ "AI gợi ý, vui lòng kiểm tra".
- [ ] **P2-08** 🍎 Ảnh vừa chụp hiện trong thẻ lô. Tải ảnh đó về máy tính và xem Properties → Details. → **Mong đợi:** **không** có mục GPS.

## B. Nhãn tươi

- [ ] **P2-09** 💻 Đăng 3 lô **Cơm hộp** (nấu chín) với hạn lần lượt **+20 giờ**, **+8 giờ**, **+3 giờ**. → **Mong đợi:** nhãn lần lượt **Xanh**, **Vàng**, **Đỏ** (ngưỡng nấu chín: >12h / 4–12h / <4h).
- [ ] **P2-10** 💻 Đăng 1 lô **Rau củ** với hạn +48 giờ và 1 lô **Đồ đóng gói** (mì gói) với hạn +5 ngày. → **Mong đợi:** cả hai đều **Vàng** (tươi 24–72h; đóng gói 3–7 ngày).
- [ ] **P2-11** 💻 Ở mọi màn có nhãn (kho lô cửa hàng, kho tặng tổ chức, admin), tên nhãn **thống nhất**: Xanh / Vàng / Đỏ. → **Mong đợi:** không còn chữ "Còn hạn / Cận hạn / Sắp hết hạn".
- [ ] **P2-12** 💻 Admin vào **Giám sát lô**. → **Mong đợi:** thấy mọi lô cùng nhãn; lọc được theo nhãn.

## C. Kho tặng (tổ chức)

- [ ] **P2-13** 💻 (ẩn danh) Đăng nhập `[TC]`, vào **Kho tặng**. → **Mong đợi:** bên trái là danh sách, bên phải là bản đồ; marker cửa hàng **có màu theo nhãn**; nhiều marker gần nhau thì gộp thành cụm (cluster) có số.
- [ ] **P2-14** 💻 Bấm một marker. → **Mong đợi:** hiện thẻ lô có khoảng cách (km), thời gian đi xe máy ước tính, đếm ngược.
- [ ] **P2-15** 💻 Lọc **chỉ Đỏ**; lọc khoảng cách ≤ 3 km. → **Mong đợi:** danh sách và bản đồ cùng thay đổi; số kết quả hợp lý.
- [ ] **P2-16** 💻 Kiểm tra: lô thuộc danh mục tổ chức **không nhận** (đã chọn ở P1) và lô ở **ngoài bán kính** → **Mong đợi:** không hiện trong kho tặng.
- [ ] **P2-17** 🤖 Mở Kho tặng trên Android cấu hình thấp. → **Mong đợi:** chuyển được giữa "Danh sách" và "Bản đồ"; bản đồ tải trong ≤ 8 giây; kéo bản đồ không giật nặng.

## D. Yêu cầu và xác nhận

- [ ] **P2-18** 💻 `[TC]` chọn lô 20 bánh mì của `[CH-A]` (từ P2-03), yêu cầu **15 cái**. → **Mong đợi:** gửi được; trạng thái "Đã gửi yêu cầu".
- [ ] **P2-19** 💻 Cửa sổ `[CH-A]`, **không tải lại trang**. → **Mong đợi:** trong ≤ 5 giây có thông báo (chuông hoặc toast) "Có yêu cầu mới". Số lượng còn lại của lô hiện **5** (đã giữ chỗ 15).
- [ ] **P2-20** 💻 `[CH-A]` bấm **Xác nhận**. → **Mong đợi:** `[TC]` nhận thông báo đã xác nhận (không cần tải lại trang).
- [ ] **P2-21** 💻 `[TC]` thử yêu cầu thêm **10 cái** từ lô đó (chỉ còn 5). → **Mong đợi:** không cho vượt; tối đa 5.
- [ ] **P2-22** 💻 `[CH-A]` vào cài đặt và bật **Tự động chấp nhận**. `[TC]` yêu cầu 5 cái còn lại. → **Mong đợi:** được xác nhận ngay, không chờ cửa hàng. Lô chuyển sang trạng thái "Đã phân bổ hết".
- [ ] **P2-23** 💻 Kiểm tra email của `[TC]`. → **Mong đợi:** có email thông báo (tiếng Việt, không lỗi font) cho ít nhất một sự kiện ở trên, tùy cài đặt thông báo.

## E. Bàn giao bằng QR (pickup và dropoff)

- [ ] **P2-24** 🍎 Đăng nhập `[TNV1]` (hoặc `[TC]` nếu là tự đến lấy) trên iPhone, mở chuyến hoặc lần lấy hàng của yêu cầu 15 cái. Bấm **Hiện mã QR**. → **Mong đợi:** QR toàn màn hình, độ sáng đủ; bên dưới có **mã 6 số** dự phòng; có ghi mã còn hiệu lực bao lâu (khoảng 15 phút) và nút **Tạo mã mới**.
- [ ] **P2-25** 💻 `[CH-A]` mở **Bàn giao → Quét QR** bằng webcam (hoặc dùng 🤖 làm máy quét của cửa hàng). Quét QR trên iPhone. → **Mong đợi:** hiện danh sách dòng hàng (Bánh mì – đặt 15), có ô **số lượng thực giao**.
- [ ] **P2-26** 💻 Nhập 15, xác nhận. → **Mong đợi:** iPhone tự đổi sang "Đã lấy hàng" (không cần tải lại).
- [ ] **P2-27** 💻 Thử quét **lại** đúng QR đó (chụp màn hình QR cũ trước khi quét lần đầu). → **Mong đợi:** báo "Mã đã được sử dụng".
- [ ] **P2-28** 🍎 + 💻 Tới tổ chức: `[TNV1]` hiện QR **giao hàng**, `[TC]` quét. Ở dòng Bánh mì nhập **12**, chọn lý do **"Không đạt chất lượng"** cho 3 cái còn lại, ghi chú "bánh bị ẩm". → **Mong đợi:** bắt buộc ghi chú khi từ chối; xác nhận thành công.
- [ ] **P2-29** 💻 Kiểm tra lô ở `[CH-A]`. → **Mong đợi:** 3 cái bị từ chối **không** quay lại lô; cửa hàng nhận thông báo có dòng bị từ chối vì chất lượng.

## F. Mã 6 số dự phòng

- [ ] **P2-30** 🤖 Tạo một yêu cầu khác (5 cái). Khi bàn giao, cửa hàng chọn **Nhập mã** thay vì quét. Nhập **sai** 5 lần. → **Mong đợi:** sau lần sai thứ 5, mã bị khóa; phải tạo mã mới.
- [ ] **P2-31** 🤖 Tạo mã mới, nhập đúng. → **Mong đợi:** bàn giao thành công như quét QR.
- [ ] **P2-32** 🍎 + 💻 Hiện QR rồi **chờ quá 15 phút** mới quét. → **Mong đợi:** báo mã đã hết hạn; bấm **Tạo mã mới** trên điện thoại thì quét lại được. *(Nếu Minh báo đã bật thêm kiểm tra khung giờ lấy hàng: thử bàn giao ngoài khung giờ thì cũng bị từ chối.)*

## G. Tác động

Ghi số trước và sau khi bàn giao:

| | Trước | Sau | Chênh lệch mong đợi |
|---|---|---|---|
| kg (dashboard `[TC]`) | | | 12 cái × 0,08 kg = **0,96 kg** *(thay 0,08 bằng khối lượng/cái thực tế ở P2-01)* |
| kg CO₂e | | | 0,96 × 2,5 = **2,4** |
| Suất ăn | | | 0,96 ÷ 0,42 = 2,28, hiện **2** |

- [ ] **P2-33** 💻 `[TC]` và `[CH-A]` xem **Tác động**. → **Mong đợi:** số tăng đúng như bảng trên (chỉ tính **12** cái đã giao, không tính 3 cái bị từ chối). Có dòng "Cập nhật lúc …".
- [ ] **P2-34** 💻 Trang chủ (khách) → bộ đếm tác động. → **Mong đợi:** **không** cộng số của dữ liệu demo/staging vào số "thật". Nếu chưa có dữ liệu thật thì hiện thông báo phù hợp, không hiện số giả.

## H. Demo và giám khảo (trên **prod**)

- [ ] **P2-35** 💻 Minh (hoặc Khanh với `[ADMIN]` trên prod) bấm **Reset demo** trong `/admin/demo`. → **Mong đợi:** xong trong ≤ 15 giây; có thông báo thành công.
- [ ] **P2-36** 💻 Đăng nhập `[GK-TC]` trên prod. → **Mong đợi:** kho tặng có sẵn lô **Xanh, Vàng, Đỏ** với đếm ngược **tính từ giờ hiện tại** (không có lô hết hạn sẵn); mọi tên cửa hàng là **tên hư cấu**; có nhãn "Dữ liệu demo".
- [ ] **P2-37** 💻 Với tài khoản giám khảo, mở **chuyển vai trò** (role switcher). → **Mong đợi:** chuyển qua lại cửa hàng / tổ chức / tình nguyện viên demo được. Với `[CH-A]` thường trên staging thì **không** thấy nút này.
- [ ] **P2-38** 💻 + 🍎 **Chạy trọn luồng M1 trên prod** bằng tài khoản giám khảo: `[GK-CH]` đăng lô, `[GK-TC]` yêu cầu, xác nhận, `[GK-TNV]` hiện QR trên iPhone, `[GK-CH]` quét trên laptop, giao, xem tác động. → **Mong đợi:** chạy hết không lỗi trong ≤ 5 phút. **Minh quay video #1 ở bước này.**

---

**Kết quả:** Đạt ___ / 38 · Lỗi: ______________________
**Ký UAT:** `Đồng ý ký UAT P2` (điều kiện để tag M1).

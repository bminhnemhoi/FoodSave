# Hướng dẫn UAT cho Khanh

> **UAT** (User Acceptance Testing) là bước **kiểm thử chấp nhận**: Khanh dùng thử sản phẩm như người dùng thật và xác nhận mỗi phase đã đạt yêu cầu trước khi chuyển sang phase sau.
> Không cần biết lập trình. Chỉ cần làm theo từng bước, so sánh với "Mong đợi", và báo lỗi theo mẫu.

---

## 1. Lịch UAT

| Checklist | Phase | Khi nào chạy (dự kiến) | Thời lượng | Môi trường |
|---|---|---|---|---|
| [P1-onboarding.md](P1-onboarding.md) | P1 Onboarding & Tin cậy | 15/10 | khoảng 1,5 giờ | staging |
| [P2-core-loop.md](P2-core-loop.md) | P2 Vòng lõi MVP ★M1 | 26–27/10 | khoảng 2 giờ | staging + smoke prod |
| [P3-matching-logistics.md](P3-matching-logistics.md) | P3 Ghép đơn & Điều phối | 07–08/11 | khoảng 2,5 giờ | staging |
| [P4-proof-esg.md](P4-proof-esg.md) | P4 Minh bạch & ESG ★M2 | 16–17/11 | khoảng 2 giờ | staging + smoke prod |
| [P5-pwa-ai.md](P5-pwa-ai.md) | P5 Xuất sắc ★M3 (freeze 22/11) | 21–22/11 | khoảng 2 giờ | staging + prod |
| [P6-final-demo.md](P6-final-demo.md) | P6 Sẵn sàng chung kết | 23/11 → chung kết (3 lần tập dượt) | 3 × 45 phút | **prod** |

Minh nhắn **"Sẵn sàng UAT Pn"** khi bản mới đã lên staging và các kiểm tra tự động đã xanh. Chưa có tin nhắn này thì chưa chạy.

---

## 2. Địa chỉ và tài khoản

| Môi trường | Địa chỉ | Dữ liệu |
|---|---|---|
| **staging** (để test) | `https://staging.<DOMAIN>` | Chỉ dữ liệu giả, test thoải mái, có thể bị reset |
| **prod** (thật) | `https://<DOMAIN>` | Dữ liệu thật và tổ chức demo. **Chỉ** dùng tài khoản giám khảo/demo. Không tạo dữ liệu rác |

`<DOMAIN>` là tên miền nhóm mua trong P0. Minh sẽ điền vào đây khi có.

**Tài khoản test trên staging:** mật khẩu Minh gửi riêng qua tin nhắn. **Không** ghi mật khẩu vào GitHub hay vào file này.

| Ký hiệu trong checklist | Email | Vai trò |
|---|---|---|
| `[CH-A]` | `uat.store.a@<DOMAIN>` | Cửa hàng A (đã duyệt) |
| `[CH-B]` | `uat.store.b@<DOMAIN>` | Cửa hàng B (đã duyệt) |
| `[CH-C]` | `uat.store.c@<DOMAIN>` | Cửa hàng C (đã duyệt) |
| `[TC]` | `uat.charity@<DOMAIN>` | Tổ chức từ thiện (đã duyệt) |
| `[TNV1]`, `[TNV2]` | `uat.volunteer.1@<DOMAIN>`, `uat.volunteer.2@<DOMAIN>` | Tình nguyện viên của `[TC]` |
| `[ADMIN]` | Email cá nhân của Khanh (đã được cấp quyền admin) | Admin, cần app xác thực (Google Authenticator / Microsoft Authenticator) trên điện thoại Khanh |
| `[MOI]` | Email mới tạo khi test đăng ký. Mẹo: Gmail hỗ trợ `tenban+uat1@gmail.com`, `tenban+uat2@gmail.com`… đều về cùng hộp thư | Tài khoản đăng ký mới |
| `[GK-CH]`, `[GK-TC]`, `[GK-TNV]` | `giamkhao.cuahang@<DOMAIN>`, `giamkhao.tochuc@<DOMAIN>`, `giamkhao.tnv@<DOMAIN>` | Tài khoản giám khảo trên **prod** |

---

## 3. Thiết bị

Mỗi bước có ký hiệu thiết bị. Không có ký hiệu nghĩa là dùng **💻** là đủ.

| Ký hiệu | Thiết bị | Ghi chú |
|---|---|---|
| 💻 | Máy tính, **Chrome** bản mới | Mở thêm cửa sổ ẩn danh (Ctrl+Shift+N) để đăng nhập vai trò thứ hai cùng lúc |
| 🤖 | **Điện thoại Android cấu hình thấp**, Chrome (ví dụ máy RAM 2–3 GB, đời 2019–2021) | Kiểm tra tốc độ và hiển thị trên màn nhỏ |
| 🍎 | **iPhone, Safari** (iOS 16.4 trở lên để test thông báo đẩy) | Safari khác Chrome nhiều nhất, hay có lỗi riêng |

**Mẹo:**
- Trên điện thoại, nếu chữ hoặc nút bị cắt, chụp màn hình ngay.
- Hai vai trò cùng lúc (cửa hàng và tổ chức) thì dùng 💻 Chrome thường + 💻 Chrome ẩn danh, hoặc máy tính + điện thoại.

---

## 4. Cách chạy một checklist

1. Vào GitHub repo **bminhnemhoi/FoodSave**, chọn **Issues**, bấm **New issue**, chọn template **"UAT run"**.
2. Tiêu đề: `UAT P2 – lần 1 – 26/10`.
3. Mở file checklist của phase (ví dụ `docs/uat/P2-core-loop.md`), bấm nút **Raw**, copy toàn bộ và dán vào ô nội dung issue, rồi **Submit**.
4. Làm lần lượt từng bước. Đạt thì **tick ô** ngay trên issue (bấm vào ô vuông).
5. Không đạt:
   - **Không tick** ô đó.
   - Tạo issue lỗi (mục 5).
   - Sửa dòng đó trong issue UAT, thêm `→ #<số issue lỗi>` ở cuối dòng.
6. Bước nào bị chặn vì bước trước lỗi: ghi `⛔ bị chặn bởi #<số>`, rồi làm tiếp phần khác nếu được.
7. Làm xong: comment tóm tắt `Đạt x/y bước. Lỗi: #12 (High), #13 (Low).`

---

## 5. Báo lỗi: template "Bug (UAT)"

Tạo bằng **Issues → New issue → "Bug (UAT)"**. Các trường của template:

| Trường | Cách điền | Ví dụ |
|---|---|---|
| **Tiêu đề** | `[Pn-mã bước] Mô tả ngắn điều sai` | `[P2-07] Bấm "Xác nhận" 2 lần tạo 2 lô` |
| **Mã bước UAT** | Mã trong checklist | `P2-07` |
| **Môi trường** | staging / prod | staging |
| **Đường dẫn (URL)** | Copy từ thanh địa chỉ | `https://staging.<DOMAIN>/store/offers/new` |
| **Thiết bị và trình duyệt** | Tên máy + trình duyệt | `iPhone 12, Safari, iOS 17.5` |
| **Tài khoản / vai trò** | Ký hiệu, **không ghi mật khẩu** | `[CH-A]` |
| **Các bước tái hiện** | Đánh số 1, 2, 3… đủ để Minh làm lại được | 1. Vào … 2. Bấm … |
| **Kết quả mong đợi** | Copy từ checklist | Chỉ tạo 1 lô |
| **Kết quả thực tế** | Điều đã xảy ra | Danh sách có 2 lô giống nhau |
| **Ảnh / video** | Kéo thả ảnh chụp màn hình hoặc video ngắn | |
| **Mức độ** | Xem bảng dưới | High |
| **Tái hiện được không?** | Luôn luôn / Thỉnh thoảng / Chỉ 1 lần | Luôn luôn |
| **Giờ xảy ra** | Giờ:phút, ngày (giúp Minh tìm log) | 14:32 26/10 |

**Mức độ:**

| Mức | Khi nào | Ví dụ |
|---|---|---|
| **Blocker** | Không làm tiếp được luồng chính, hoặc lộ dữ liệu người khác | Không đăng nhập được; thấy giấy tờ của cửa hàng khác |
| **High** | Sai chức năng chính hoặc sai số liệu, nhưng có cách đi vòng | Số kg trên dashboard sai; thông báo không đến |
| **Medium** | Sai phụ, khó dùng | Bộ lọc không nhớ lựa chọn; chữ bị cắt trên Android |
| **Low** | Thẩm mỹ, chính tả | Lệch 2 px; sai dấu tiếng Việt |

> ⚠️ **Repo có thể ở chế độ Public.** Không dán vào issue: mật khẩu, mã xác thực 6 số, số điện thoại hay email thật của người ngoài nhóm, ảnh giấy tờ thật. Nếu lỗi liên quan **lộ dữ liệu**, nhắn riêng cho Minh và **không** tạo issue công khai.

---

## 6. Ký UAT

- Phase **đạt** khi mọi bước đã tick, hoặc mọi bước chưa tick chỉ còn lỗi Medium/Low đã có issue.
- Khanh comment trên issue UAT: **`Đồng ý ký UAT Pn`**.
- Minh chạy `phase-gate`, rồi gắn tag phiên bản.
- Còn lỗi Blocker hoặc High thì **không** ký. Minh sửa xong, Khanh chạy lại **chỉ các bước liên quan** (tạo issue `UAT Pn – lần 2`).

---

## 7. Mẹo kiểm tra không cần kỹ thuật

| Muốn kiểm tra | Cách làm |
|---|---|
| Ảnh đã bị xóa thông tin vị trí (GPS) chưa | Chụp ảnh bằng điện thoại **có bật vị trí**, rồi upload. Tải ảnh đã lưu về máy Windows, chuột phải → Properties → Details. Mục **GPS** phải **trống**. Không dùng trang web "xem EXIF" trên mạng với ảnh thật |
| Trang có lỗi ẩn | Chrome: F12 → tab **Console**. Có dòng màu đỏ thì chụp lại và gửi kèm issue (không bắt buộc) |
| Tốc độ trên điện thoại yếu | Bấm giờ từ lúc chạm đến lúc trang hiện xong. Quá 5 giây thì ghi lại (Medium) |
| Link chia sẻ có đẹp không | Dán link trang chủ vào Zalo/Messenger: phải hiện ảnh xem trước và tiêu đề |
| Giờ có đúng giờ Việt Nam không | Mọi giờ trên màn hình phải khớp đồng hồ điện thoại |

# Tài khoản demo cho Ban tổ chức và giám khảo

> **Trạng thái:** bản đầu (08/10/2026, ROADMAP P2-16/P2-17). Rà lại ở M3 (22/11) bằng skill `pitch-sync` cùng [kịch bản demo](demo-script.md).
> **Gửi cho:** Ban tổ chức TISPA 2026 và hội đồng giám khảo, kèm mật khẩu gửi **riêng** (không nằm trong tài liệu này).
> **Liên quan:** [SECURITY-PRIVACY C20](../SECURITY-PRIVACY.md) (dữ liệu demo), [DEPLOYMENT §10](../DEPLOYMENT.md#10-dữ-liệu-demo-seed-và-reset) (cách nhóm seed/reset), [DATA-MODEL §17](../DATA-MODEL.md#17-chiến-lược-seed).

## 1. Truy cập

| Mục | Giá trị |
|---|---|
| Địa chỉ | **https://foodsave-psi.vercel.app** (bản production; dự án chưa có tên miền riêng — ADR-011) |
| Đăng nhập | Bấm **Đăng nhập** ở trang chủ, nhập email và mật khẩu bên dưới |
| Thiết bị | Laptop: Chrome, Edge hoặc Safari bản mới. Điện thoại: mở địa chỉ trên, chọn "Thêm vào màn hình chính" để dùng như ứng dụng |
| Thử hai vai cùng lúc | Dùng hai thiết bị, hoặc một cửa sổ thường + một cửa sổ ẩn danh (mỗi cửa sổ một tài khoản) |

## 2. Tài khoản theo vai trò

| Vai trò | Email | Thuộc | Dùng để thử |
|---|---|---|---|
| Cửa hàng | `giamkhao.cuahang@foodsave.test` | **Cửa hàng tiện lợi Phố Xanh** (mở 24/7, gần chợ Bến Thành) | Đăng lô, xem nhãn Xanh/Vàng/Đỏ, duyệt yêu cầu nhận, quét QR bàn giao |
| Tổ chức | `giamkhao.tochuc@foodsave.test` | **Mái ấm Hướng Dương** (nhận hàng cả ngày) | Kho tặng (bản đồ, danh sách), gửi yêu cầu, tạo chuyến tự đến lấy, xác nhận nhận hàng |
| Tình nguyện viên | `giamkhao.tnv@foodsave.test` | Tình nguyện viên của **Mái ấm Hướng Dương** | Chuyến được giao, mở chỉ đường, hiện QR/mã 6 số tại cửa hàng |

- **Mật khẩu:** một mật khẩu chung cho cả 3 tài khoản: `‹mật khẩu gửi riêng qua tin nhắn/email của trưởng nhóm›`. Mật khẩu không bao giờ được ghi vào repo hay tài liệu.
- **Email `@foodsave.test`** dùng tên miền dành riêng cho thử nghiệm (RFC 6761): không có hộp thư thật, hệ thống không gửi được thư tới đó. Vì vậy chức năng "Quên mật khẩu" không dùng được với tài khoản demo — cần đổi mật khẩu thì báo nhóm.
- **Không có tài khoản Admin cho giám khảo** (SECURITY-PRIVACY C20). Phần duyệt hồ sơ và duyệt minh chứng do nhóm trình diễn bằng tài khoản admin có xác thực hai lớp (MFA) của nhóm. Nếu BTC cần quyền xem chỉ-đọc, nhóm sẽ làm vai trò `admin_viewer` riêng kèm ADR và review bảo mật.
- Tài khoản giám khảo **chỉ thao tác trên dữ liệu demo**: hệ thống từ chối mọi yêu cầu ghép một tổ chức demo với cửa hàng/tổ chức thật.

## 3. Dữ liệu demo gồm những gì

| Thành phần | Nội dung |
|---|---|
| Tổ chức hư cấu | 8 cửa hàng (tiệm bánh, quán cơm, cửa hàng tiện lợi, siêu thị mini, cửa hàng rau) và 4 tổ chức (2 mái ấm trẻ em, 1 nơi tạm lánh có vị trí ẩn, 1 viện dưỡng lão) ở khu trung tâm TP.HCM. Tên đều hư cấu; địa chỉ chỉ ghi tên đường và mốc công cộng; mã số thuế là số giả `000…`; không có số điện thoại hay giấy tờ tùy thân thật |
| Lô đang mở | Khoảng 23 lô, tính theo **thời gian thực kể từ lúc reset**: luôn có đủ nhãn **Xanh**, **Vàng**, **Đỏ**, và có lô sắp chuyển Đỏ để thấy đồng hồ đếm ngược |
| Sẵn cho cửa hàng giám khảo | 3 yêu cầu nhận đang chờ duyệt (từ Mái ấm Bình Minh và Viện dưỡng lão An Khang) |
| Sẵn cho tổ chức giám khảo | 1 phân bổ đã được cửa hàng xác nhận ("Nước suối 500 ml", 24 chai) chờ tự đến lấy; 1 yêu cầu được Bếp Xanh **tự động chấp nhận** |
| Sẵn cho tình nguyện viên giám khảo | 1 chuyến đã giao: lấy "Bánh quy bơ" ở Cửa hàng tiện lợi Phố Xanh, giao về Mái ấm Hướng Dương |
| Đã hoàn tất hôm nay | 3 lần bàn giao bằng QR (chạy đúng luồng thật), nên sổ tác động có số liệu ngay |
| Lịch sử | 90 ngày gần nhất, khoảng 160 lần bàn giao và vài lô hết hạn không ai nhận, để biểu đồ ESG có xu hướng |

**Nhãn "Dữ liệu demo":** mọi màn hình của tài khoản demo hiển thị dải "Dữ liệu demo". Số liệu demo **không** được cộng vào bộ đếm tác động công khai ở trang chủ (trang chủ chỉ hiển thị số thật từ pilot).

**Nói thẳng về cách tạo dữ liệu:**
- Tài khoản, hồ sơ tổ chức, điểm nhận, giờ mở cửa, lô, yêu cầu, xác nhận, chuyến và 3 lần bàn giao hôm nay được tạo bằng **đúng các thao tác mà người dùng thật làm** (cùng quy tắc kiểm tra quyền và trạng thái).
- Ba chỗ dùng công cụ riêng của nhóm (chỉ chạy được bằng khóa quản trị của máy chủ, chỉ áp dụng cho tổ chức demo, có ghi nhật ký):
  - duyệt hồ sơ các tổ chức demo (vì không cấp tài khoản Admin cho script);
  - sinh lịch sử 90 ngày với mốc thời gian lùi về quá khứ (sổ tác động vẫn được ghi bằng đúng hàm ghi sổ của hệ thống);
  - xóa dữ liệu demo khi reset.

## 4. Gợi ý thử trong 5 phút

Theo đúng các beat của [kịch bản demo](demo-script.md). Nên mở **Cửa hàng** trên laptop và **Tổ chức / Tình nguyện viên** trên điện thoại (hoặc cửa sổ ẩn danh).

| Thời gian | Tài khoản | Thao tác | Điều cần để ý |
|---|---|---|---|
| 0:00–1:00 | Cửa hàng | **Lô tặng** → xem danh sách lô. Bấm **Đăng lô mới** → chụp/chọn ảnh hoặc điền tay → tick **Cam kết an toàn thực phẩm** → **Đăng** | Nhãn Xanh/Vàng/Đỏ và đồng hồ đếm ngược. Hạn hiệu lực = sớm nhất giữa hạn dùng, giờ đóng cửa và cuối khung lấy |
| 1:00–2:00 | Cửa hàng | **Tổng quan** → **Yêu cầu chờ duyệt** → **Xác nhận** một yêu cầu, **Từ chối** (kèm lý do) một yêu cầu khác | Số lượng được giữ chỗ ngay; hai tổ chức không thể giành cùng một phần |
| 2:00–3:00 | Tổ chức | **Kho tặng** → bản đồ và danh sách, lọc theo nhãn → mở một lô → **Gửi yêu cầu** | Lô Đỏ chỉ được gợi ý khi tổ chức **đến kịp** (khoảng cách, giờ nhận) |
| 3:00–4:00 | Tổ chức → Cửa hàng | Tổ chức: **Chuyến lấy hàng** → phân bổ "Nước suối 500 ml" → **Tự đến lấy** → hiện **QR** (hoặc mã 6 số). Cửa hàng: **Bàn giao** → **Quét QR** / nhập mã → đối soát từng dòng → xác nhận | QR dùng một lần, hết hạn sau 15 phút; số lượng đối soát từng dòng; sổ tác động tăng (kg, suất ăn, CO₂e) |
| 4:00–5:00 | Tình nguyện viên → Tổ chức | TNV: **Chuyến** → "Bánh quy bơ" → mở chỉ đường → hiện QR tại cửa hàng (Cửa hàng quét); TNV hiện mã giao, Tổ chức xác nhận nhận hàng. Sau đó mở **ESG** | Bàn giao hai bước (lấy ở cửa hàng, giao về tổ chức); biểu đồ 90 ngày có xu hướng |

> Một số màn hình mở theo lộ trình phát triển (ROADMAP P2–P4). Màn hình chưa mở hiển thị trang thông báo trung thực "Tính năng mở ở giai đoạn …", không có dữ liệu giả.

## 5. Chính sách reset

- Nhóm chạy **`pnpm demo:reset`** trên production **trong vòng 2 giờ trước** mỗi phiên chấm hoặc buổi tập dượt, và sau khi giám khảo thử nếu BTC yêu cầu. Mỗi lần mất **dưới 60 giây**.
- Reset xóa và tạo lại **chỉ** các tổ chức demo (cờ `is_demo`) cùng mọi dữ liệu của chúng. **Dữ liệu pilot thật không bị đụng tới**: điều này được kiểm bằng test tự động (pgTAP) và bằng phép đếm trước/sau ở mỗi lần chạy.
- Email và mật khẩu giám khảo **giữ nguyên** qua các lần reset (chỉ đổi khi BTC yêu cầu).
- Dữ liệu demo "sống" theo thời gian thật: yêu cầu chờ duyệt tự hết hạn sau 2 giờ, lô Đỏ hết hạn sau vài giờ. Nếu thấy thiếu, báo nhóm để reset.
- Mọi thứ giám khảo tạo (lô, yêu cầu, ảnh tải lên) sẽ bị xóa ở lần reset kế tiếp. **Không nhập thông tin cá nhân thật** vào tài khoản demo.
- **Không tạo tổ chức mới** bằng tài khoản giám khảo: tổ chức mới không phải dữ liệu demo nên sẽ vào hàng đợi duyệt và bị Admin từ chối.

## 6. Dành cho nhóm (không gửi BTC)

| Tài khoản | Vai trò trong [kịch bản demo](demo-script.md) |
|---|---|
| `demo.store@foodsave.test` | Chủ "Tiệm bánh Mây" (laptop, beat 1, 2, 4, 6). Trạng thái S0: tiệm chưa có lô |
| `demo.charity@foodsave.test` | Chủ "Mái ấm Ánh Dương" (điện thoại chính). Có 2 TNV: `demo.volunteer@…` (Lan), `demo.volunteer2@…` (Hùng) |
| `demo.charity2@foodsave.test` | Chủ "Mái ấm Bình Minh" (điện thoại dự phòng) |

- Tài khoản nhóm dùng mật khẩu riêng (`DEMO_TEAM_PASSWORD`), **khác** mật khẩu giám khảo.
- "Bếp Xanh" và "Lò bánh Sớm Mai" bật tự động chấp nhận, đã có lô "Bánh mì ổ" 18 và 12 cái theo trạng thái S0.
- Các trạng thái dự phòng S2, S3, S5 (nhu cầu 50 bánh, phương án ghép, minh chứng) cần tính năng P3–P4; bổ sung vào seed khi các tính năng đó xong.
- Liên hệ hỗ trợ trong buổi chấm: trưởng nhóm (số điện thoại gửi kèm mật khẩu, không ghi ở đây).

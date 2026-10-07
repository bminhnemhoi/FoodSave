# Kịch bản demo trực tiếp — 5 phút, 2 thiết bị

> **Trạng thái:** bản khung v0 (07/10/2026). Cập nhật ở các mốc: M1 (27/10) có beat 1 và 4; M2 (17/11) đủ 6 beat; **chốt ở M3 (22/11)** kèm timestamp video #3. Skill `pitch-sync` đối chiếu file này với tính năng đã xong.
>
> **Nguyên tắc:**
> - Demo **trên prod**, với tổ chức `is_demo` (tên hư cấu, gắn nhãn "Dữ liệu demo").
> - Không có thao tác giả: mọi thứ khán giả thấy đều chạy thật. Chỗ nào dùng trạng thái chuẩn bị trước thì **nói thẳng ra**.
> - Mỗi beat có phương án dự phòng; người điều khiển chuyển sang dự phòng sau **10 giây** không có phản hồi, không cố sửa trên sân khấu.

## 1. Bố trí

| Thiết bị | Vai trò trong demo | Tài khoản (demo) | Ghi chú |
|---|---|---|---|
| **Laptop** (nối máy chiếu) | Cửa hàng "Tiệm bánh Mây", rồi chuyển vai qua **role switcher** (chỉ có ở tài khoản demo, chỉ giữa cửa hàng/tổ chức/TNV) sang "Mái ấm Ánh Dương — nhận hàng"; màn **Admin** mở ở **tab riêng** bằng tài khoản admin của nhóm | `demo.store@…`; admin của nhóm (đã qua MFA trước giờ thi, **không** đưa giám khảo) | Webcam dùng để quét QR. Màn hình chia đôi: trái là trình duyệt laptop, phải là **cửa sổ phản chiếu điện thoại** |
| **Điện thoại Android** (PWA đã cài) | Tổ chức "Mái ấm Ánh Dương" (điều phối viên kiêm tình nguyện viên "Lan") | `demo.charity@…` | Phản chiếu lên laptop bằng **scrcpy qua cáp USB** (không phụ thuộc Wi-Fi) |
| Điện thoại dự phòng (iPhone hoặc Android thứ 2) | Dự phòng cho điện thoại chính; có bản video offline | `demo.charity2@…` (tổ chức dự phòng "Mái ấm Bình Minh") | Có SIM nhà mạng khác để làm hotspot thứ 2 |
| Tờ A4 in sẵn | Ảnh "bữa ăn đang được phát" có nhiều khuôn mặt (người đóng thế đã ký đồng ý, có trẻ em) | — | Dùng cho beat 5 |
| Khay bánh thật hoặc ảnh khay bánh in A4 | Đối tượng cho AI chụp ở beat 1 | — | Đã thử trước ≥ 5 lần cho kết quả ổn định |

**Người điều khiển:** Minh cầm laptop và dẫn lời. Khanh cầm điện thoại và nói các câu của tổ chức/TNV. Cả hai đều xuất hiện trên sân khấu (tiêu chí Đội ngũ, Trình bày).

## 2. Dòng thời gian (tổng 5:00)

| Mốc | Beat | Thiết bị | Khoảnh khắc ấn tượng |
|---|---|---|---|
| 0:00–0:20 | 0. Mở | Laptop | Câu chuyện 21h |
| 0:20–1:10 | 1. Đăng lô bằng ảnh | Laptop → Điện thoại | **AI ảnh → tự điền**, **nhãn đếm ngược**, thông báo GẤP |
| 1:10–2:05 | 2. Nhu cầu 50 bánh | Điện thoại | **50 bánh = 20 + 18 + 12 trên bản đồ** |
| 2:05–2:40 | 3. Phân công & tuyến | Điện thoại | 2 tuyến xe máy, deep link Google Maps, check-in |
| 2:40–3:30 | 4. Bàn giao QR | Điện thoại ↔ Laptop | **Quét QR**, đối soát từng dòng, bộ đếm tác động nhảy số |
| 3:30–4:15 | 5. Minh chứng | Điện thoại → Laptop | **Làm mờ khuôn mặt ngay trên máy**, Admin duyệt |
| 4:15–4:45 | 6. ESG | Laptop | **Báo cáo ESG tháng** có trích nguồn |
| 4:45–5:00 | 7. Chốt | Laptop | Trang tác động công khai với số pilot thật |

---

## 3. Kịch bản chi tiết

### Beat 0 — Mở (0:00–0:20) · Laptop

**Màn hình:** trang chủ FoodSave, bộ đếm tác động thật (đang hiển thị số pilot).

**Minh nói:**
> "21 giờ. Tiệm bánh Mây sắp đóng cửa, trên khay còn 20 chiếc bánh mì. Cách đó 2 cây số, Mái ấm Ánh Dương cần 50 phần ăn sáng cho ngày mai. Hai bên không biết nhau. Chúng tôi sẽ cho các anh chị thấy FoodSave nối họ trong chưa tới 5 phút, và mọi thứ ở đây đang chạy thật."

**Thao tác:** bấm "Đăng nhập" → tài khoản đã đăng nhập sẵn → vào cổng Cửa hàng.

**Dự phòng:** mạng chậm → mở tab đã tải sẵn của cổng Cửa hàng (luôn mở sẵn 6 tab theo thứ tự beat).

### Beat 1 — Đăng lô bằng ảnh (0:20–1:10) · Laptop → Điện thoại

**Thao tác:**
1. Laptop: "Đăng lô mới" → "Chụp ảnh" → hướng webcam vào khay bánh (hoặc chọn ảnh khay bánh có sẵn).
2. **AI tự điền** trong 2–4 giây: danh mục *Bánh mì*, số lượng *20*, đơn vị *cái*, khối lượng/đơn vị gợi ý, hạn dùng gợi ý *hôm nay 23:59*.
3. Chỉnh nhanh nếu cần, tick **"Cam kết an toàn thực phẩm"** → "Đăng".
4. Lô xuất hiện trong kho với nhãn **Vàng** và **đếm ngược** (hạn hiệu lực = giờ đóng cửa 21:30, sớm hơn hạn dùng 23:59).
5. Điện thoại (phản chiếu): thông báo realtime *"Lô mới gần bạn: 20 bánh mì — 1,8 km"* (Khanh đọc to).

**Minh nói:**
> "Cửa hàng chỉ cần chụp một tấm ảnh. AI điền sẵn, người bán chỉ việc kiểm lại và cam kết an toàn. Để ý nhãn: bánh hạn đến nửa đêm, nhưng tiệm đóng cửa lúc 21:30, nên hệ thống tính theo giờ đóng cửa. Nhãn Xanh, Vàng, Đỏ đổi theo thời gian, và lô Đỏ chỉ được gợi ý cho tổ chức nào **đến kịp**."

**Khanh nói (điện thoại):**
> "Mái ấm nhận thông báo ngay, kèm khoảng cách và thời gian đi xe máy."

**Wow:** AI tự điền + đếm ngược + thông báo tức thì sang thiết bị thứ hai.

**Dự phòng:**
| Sự cố | Cách xử lý | Câu nói |
|---|---|---|
| AI chậm hơn 5 giây hoặc lỗi | Tắt bằng feature flag không cần; bấm "Điền tay" và chọn mẫu lô gần nhất (danh mục nhớ sẵn) | "Nếu không có mạng tốt, cửa hàng vẫn đăng tay được trong 30 giây." |
| Webcam không nhận | Chọn ảnh `khay-banh.jpg` trong thư mục Ảnh | — |
| Không thấy thông báo trên điện thoại | Kéo xuống làm mới trung tâm thông báo; nếu vẫn không có, mở thẳng Kho tặng (lô vẫn hiện) | "Thông báo còn đi qua email và Web Push." |
| Mất hẳn mạng | Phát video #3 đoạn **[00:20–01:10]** | "Chúng tôi chuyển sang bản ghi lại cùng luồng này trên hệ thống thật." |

### Beat 2 — Nhu cầu 50 bánh, ghép 3 cửa hàng (1:10–2:05) · Điện thoại

**Thao tác:**
1. Điện thoại: "Đăng nhu cầu" → *Bánh mì, 50 cái, cần trước 07:00 sáng mai* → "Tìm phương án".
2. Màn **3 phương án** trên bản đồ:
   - **A**: Tiệm bánh Mây 20 + Bếp Xanh 18 + Lò bánh Sớm Mai 12, 3 điểm dừng, 6,4 km, 24 phút;
   - B, C: phương án khác (ít điểm hơn nhưng thiếu số lượng hoặc tuyến dài hơn).
3. Chọn **A** → "Xác nhận". Hai cửa hàng còn lại (đã bật tự chấp nhận trong dữ liệu demo) xác nhận ngay; laptop hiện yêu cầu ở Tiệm bánh Mây → Minh bấm "Xác nhận".

**Khanh nói:**
> "Mái ấm cần 50, một tiệm chỉ có 20. FoodSave tự tìm thêm 18 ở Bếp Xanh và 12 ở Lò bánh Sớm Mai. Hệ thống thử mọi tổ hợp tối đa 3 cửa hàng: ưu tiên đủ số lượng, ít điểm dừng, tuyến ngắn, rồi tới hàng sắp hết hạn."

**Minh nói (khi xác nhận trên laptop):**
> "Phía cửa hàng chỉ cần một nút. Số lượng được giữ chỗ ngay, hai tổ chức không thể giành cùng một chiếc bánh."

**Wow:** bản đồ có 3 điểm dừng đánh số, polyline, so sánh 3 phương án.

**Dự phòng:**
| Sự cố | Cách xử lý |
|---|---|
| Tính phương án lâu hơn 5 giây | Dùng nhu cầu **đã đăng sẵn** "50 bánh mì (đã tạo lúc 19:00)" trong danh sách nhu cầu, mở xem 3 phương án đã tính |
| Bản đồ Goong không tải tile | Provider tự chuyển OpenFreeMap; nếu vẫn trắng, nói "tuyến vẫn được tính, phần nền bản đồ đang chậm" và tiếp tục |
| Cửa hàng demo không tự xác nhận | Laptop role switcher → xác nhận thay (mất 10 giây) |
| Hỏng hẳn | Điện thoại dự phòng (tổ chức "Mái ấm Bình Minh") đã ở trạng thái **S3** (phương án đã xác nhận) → nhảy sang beat 3; hoặc video **[01:10–02:05]** |

### Beat 3 — Phân công tình nguyện viên & tuyến (2:05–2:40) · Điện thoại

**Thao tác:**
1. "Tạo chuyến" → hệ thống gợi ý chia: **TNV Lan** lấy ở Tiệm bánh Mây + Bếp Xanh, **TNV Hùng** lấy ở Lò bánh Sớm Mai → "Giao chuyến".
2. Chuyển tab **"Chuyến của tôi"** (Lan): bản đồ tới điểm kế tiếp, nút **"Mở Google Maps"** (bấm cho thấy deep link mở kèm điểm dừng, rồi quay lại).
3. Bấm **"Check-in"** tại Tiệm bánh Mây → thành công (ghim cửa hàng demo đặt tại **địa điểm chung kết**, nên geofence 100 m là thật).

**Khanh nói:**
> "Mái ấm phân công: Lan lấy hai điểm gần nhau, Hùng lấy điểm còn lại. Lan mở chỉ đường bằng Google Maps quen thuộc. Vị trí chỉ được chia sẻ khi Lan đồng ý và app đang mở, rồi bị xóa khi kết thúc chuyến."

**Dự phòng:**
| Sự cố | Cách xử lý |
|---|---|
| Check-in thất bại (GPS trong nhà kém) | Bấm "Tôi đã đến" (check-in thủ công kèm lý do, được đánh dấu khác màu cho điều phối viên; tính năng thật, nằm trong P3-10) |
| Google Maps không mở | Bỏ qua, nói "deep link mở ứng dụng chỉ đường có sẵn trên máy" |
| Hỏng hẳn | Video **[02:05–02:40]** |

### Beat 4 — Bàn giao QR (2:40–3:30) · Điện thoại ↔ Laptop

**Thao tác:**
1. Điện thoại (Lan): "Hiện mã lấy hàng" → **QR toàn màn hình** + mã 6 số.
2. Laptop (Tiệm bánh Mây): "Bàn giao" → "Quét QR" → đưa điện thoại trước webcam → nhận trong 1–3 giây.
3. Màn **đối soát từng dòng**: *Bánh mì — đặt 20 · giao 20* ✓ → "Xác nhận đã giao cho TNV".
4. Laptop role switcher → **"Mái ấm Ánh Dương — nhận hàng"** → nhập **mã 6 số** đang hiện trên điện thoại của Lan → xác nhận nhận 20 cái.
5. Bộ đếm tác động (góc màn hình) **nhảy số**: +X kg, +Y suất ăn, +Z kg CO₂e.

**Minh nói:**
> "Mỗi lần trao tay là một sự kiện có biên nhận: lúc lấy ở cửa hàng và lúc giao về mái ấm. Mã QR chỉ dùng một lần, hệ thống chỉ lưu bản băm, và số lượng được đối soát từng dòng. Khi hàng về tới nơi, tác động mới được ghi vào sổ cái, và sổ cái này chỉ được ghi thêm, không ai sửa được."

**Wow:** QR thật giữa 2 thiết bị; bộ đếm nhảy số.

**Dự phòng:**
| Sự cố | Cách xử lý |
|---|---|
| Webcam không đọc QR (ánh sáng sân khấu) | Nhập **mã 6 số** (tính năng thật, cùng giá trị pháp lý) |
| Lỗi mạng khi xác nhận | Bấm lại: thao tác có `client_op_id` nên không bị ghi trùng (nói điều này nếu được hỏi) |
| Hỏng hẳn | Video **[02:40–03:30]** |

### Beat 5 — Minh chứng làm mờ khuôn mặt (3:30–4:15) · Điện thoại → Laptop

**Thao tác:**
1. Điện thoại: "Minh chứng" → chọn lô vừa nhận → "Chụp ảnh" → chụp **tờ A4** in cảnh phát bánh có nhiều khuôn mặt, có trẻ em.
2. Trong 1–2 giây: mọi khuôn mặt được **làm mờ ngay trên điện thoại**; kéo thanh **trước/sau** để khán giả thấy; dùng cọ làm mờ thêm 1 vùng (nếu cần).
3. Điền "Phát 50 phần ăn sáng cho các em", số người *50* → "Gửi".
4. Laptop chuyển sang **tab Admin** (tài khoản admin của nhóm, đã MFA) → "Duyệt minh chứng" → "Hợp lệ".
5. Chuyển nhanh về Tiệm bánh Mây → mục "Minh chứng" đã hiện ảnh đã làm mờ.

**Khanh nói:**
> "Nhà tài trợ muốn thấy thực phẩm đi đâu, nhưng các em nhỏ có quyền riêng tư. Ảnh được làm mờ mặt **ngay trên điện thoại, trước khi gửi đi**, và thông tin vị trí trong ảnh bị xóa. Admin duyệt xong thì chỉ cửa hàng đã tặng mới xem được."

**Wow:** làm mờ tức thì trên máy, slider trước/sau.

**Dự phòng:**
| Sự cố | Cách xử lý |
|---|---|
| Mô hình nhận diện tải chậm (lần đầu) | Mô hình đã được tải trước khi lên sân khấu (mở màn minh chứng 1 lần ở checklist T-15); nếu vẫn chậm, chọn ảnh đã chụp trong thư viện |
| Sót 1 khuôn mặt | Dùng cọ làm mờ thủ công và nói: "Luôn có bước kiểm tra của con người." |
| Hỏng hẳn | Minh chứng **đã gửi sẵn** (trạng thái S5) trong hàng đợi Admin → duyệt luôn; hoặc video **[03:30–04:15]** |

### Beat 6 — Báo cáo ESG (4:15–4:45) · Laptop

**Thao tác:**
1. Laptop (Tiệm bánh Mây) → "ESG" → "Báo cáo tháng" → **xem trước bản in A4**: kg cứu được, CO₂e tránh được, nước tưới tránh lãng phí (ước tính), suất ăn tương đương, tỷ lệ lô có minh chứng hợp lệ; **bảng hệ số kèm nguồn** (FAO 2013, WRAP).
2. (Nếu còn ≥ 10 giây) Admin → **bản đồ hệ thống** với heatmap kg cứu được theo phường.

**Minh nói:**
> "Mỗi con số trong báo cáo có công thức và nguồn trích dẫn. Hệ số có phiên bản, nên báo cáo tháng trước không bị đổi khi chúng tôi cập nhật phương pháp. Báo cáo ESG này là thứ chuỗi bán lẻ sẵn sàng trả tiền, và nó nuôi phần miễn phí cho các tổ chức."

**Dự phòng:** tab báo cáo đã mở sẵn; hoặc bản PDF đã in ra từ trình duyệt (`bao-cao-esg-demo.pdf`) trên desktop.

### Beat 7 — Chốt (4:45–5:00) · Laptop

**Màn hình:** trang tác động công khai, **số liệu pilot thật** (15–28/11).

**Minh nói:**
> "Vừa rồi là dữ liệu demo. Còn đây là số thật: trong 2 tuần pilot, [N] lần bàn giao, [X] kg, [Y] suất ăn. Mọi con số do hệ thống tự đo. Sáu tháng tới, chúng tôi muốn làm điều này cho cả một cụm phường."

(Điền [N], [X], [Y] từ trang KPI công khai sáng ngày thi; **không làm tròn lên**.)

---

## 4. Trạng thái chuẩn bị sẵn (seed) cho dự phòng

`pnpm demo:reset` đưa mọi tổ chức `is_demo` về trạng thái đầu kịch bản (chỉ dữ liệu demo, không đụng dữ liệu pilot thật). Ngoài bộ "live", seed có thêm **tổ chức dự phòng** đã đứng sẵn ở từng mốc:

| Mã | Trạng thái | Dùng khi | Ở đâu |
|---|---|---|---|
| S0 | Đầu kịch bản: Tiệm bánh Mây chưa có lô; Bếp Xanh và Lò bánh Sớm Mai đã có lô 18 và 12 (tự chấp nhận); Mái ấm Ánh Dương có 2 TNV | Mặc định | Tài khoản live |
| S1 | Lô 20 bánh của Tiệm bánh Mây đã đăng | Beat 1 hỏng | Lô "đăng lúc 18:00" trong kho |
| S2 | Nhu cầu 50 bánh đã đăng, có 3 phương án | Beat 2 chậm | Nhu cầu "đã tạo lúc 19:00" |
| S3 | Phương án A đã xác nhận, chuyến đã phân công | Beat 2–3 hỏng | Tổ chức dự phòng "Mái ấm Bình Minh" trên điện thoại dự phòng |
| S5 | Minh chứng đã gửi, chờ duyệt | Beat 5 hỏng | Hàng đợi Admin |
| S6 | 90 ngày lịch sử để báo cáo ESG có số | Luôn có | Seed lịch sử sinh bằng RPC thật |

## 5. Video dự phòng

| Video | Quay ở | Nội dung | Vị trí lưu |
|---|---|---|---|
| #1 | M1 (27/10) | Vòng lõi (beat 1, 4) | Drive · laptop · điện thoại |
| #2 | M2 (17/11) | Beat 1–6 | Drive · laptop · điện thoại |
| **#3** | **M3 (22/11)** | **Bản chính thức: liền mạch 5:00 + 6 đoạn theo beat**, có phụ đề | Drive · laptop (offline, mở sẵn trong trình phát) · điện thoại dự phòng · USB |

Timestamp video #3 (điền ở G5):

| Beat | Đoạn trong video liền mạch | File đoạn riêng |
|---|---|---|
| 1 | [00:20–01:10] | `beat1-dang-lo.mp4` |
| 2 | [01:10–02:05] | `beat2-ghep-50-banh.mp4` |
| 3 | [02:05–02:40] | `beat3-chuyen.mp4` |
| 4 | [02:40–03:30] | `beat4-qr.mp4` |
| 5 | [03:30–04:15] | `beat5-minh-chung.mp4` |
| 6 | [04:15–04:45] | `beat6-esg.mp4` |

---

## 6. Checklist trước demo

### T-24 giờ (tối hôm trước, gắn Gate G6)
- [ ] `pnpm demo:reset` trên prod → kiểm tra S0 đúng; tổ chức dự phòng đúng S3, S5.
- [ ] **Đặt ghim "Tiệm bánh Mây (demo)" tại địa chỉ hội trường chung kết** (để check-in geofence là thật).
- [ ] Chạy trọn kịch bản 1 lần trên prod lúc 20:00, bấm giờ; rồi `demo:reset` lại.
- [ ] Kiểm tra số pilot thật trên trang KPI; điền [N], [X], [Y] vào lời thoại.
- [ ] Tải video #3 + 6 đoạn về laptop, điện thoại dự phòng, USB; mở thử offline.
- [ ] In: tờ A4 ảnh minh chứng (người đóng thế đã đồng ý), ảnh khay bánh, **QR mã 6 số dự phòng**, thẻ tài khoản giám khảo.
- [ ] Sạc đầy laptop, 2 điện thoại, sạc dự phòng 20.000 mAh; mang cáp USB-C/HDMI, bộ chuyển, cáp scrcpy.
- [ ] Cập nhật hệ điều hành/trình duyệt **trước 48 giờ** hoặc tắt cập nhật tự động; không cập nhật trong ngày thi.

### T-2 giờ (tại hội trường)
- [ ] Thử máy chiếu: độ phân giải, chia đôi màn hình, cỡ chữ (zoom trình duyệt 125%).
- [ ] Thử webcam quét QR **dưới ánh sáng sân khấu**; nếu kém, chuẩn bị đọc mã 6 số.
- [ ] Mạng: thử Wi-Fi hội trường; **hotspot 1** (nhà mạng A) và **hotspot 2** (nhà mạng B) sẵn sàng; đo tốc độ ≥ 5 Mbps.
- [ ] scrcpy phản chiếu điện thoại qua USB ổn định.
- [ ] Kiểm tra GPS check-in tại hội trường.

### T-15 phút
- [ ] Laptop: đăng nhập sẵn `demo.store`, `demo.admin` (đã qua MFA), mở **6 tab theo thứ tự beat**; tắt thông báo hệ thống, chế độ Không làm phiền; đóng ứng dụng khác.
- [ ] Điện thoại: PWA đăng nhập `demo.charity`; mở màn minh chứng 1 lần để **tải trước mô hình làm mờ**; Không làm phiền nhưng **cho phép thông báo của FoodSave**; độ sáng tối đa; tắt xoay màn hình.
- [ ] Pin: laptop ≥ 90% và cắm sạc; điện thoại ≥ 90%.
- [ ] `demo:reset` lần cuối (nếu đội trước dùng chung tài khoản giám khảo).
- [ ] Trình phát video mở sẵn ở đoạn beat 1, tạm dừng.

### Quy tắc trên sân khấu
- Quá 10 giây không phản hồi → chuyển dự phòng, **không xin lỗi dài dòng**, chỉ một câu chuyển tiếp.
- Trễ hơn 30 giây so với dòng thời gian → bỏ phần "nếu còn thời gian" của beat 6.
- Kết thúc đúng **5:00**; Khanh giơ tay báo khi còn 60 giây.

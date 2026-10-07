# FoodSave v2 — Tài liệu yêu cầu sản phẩm (PRD)

| Mục | Nội dung |
|---|---|
| Phiên bản | 1.0 — 07/10/2026 (đầu P0) |
| Chủ sở hữu | Minh (sản phẩm + kỹ thuật) · Khanh (kiểm thử, UAT) |
| Trạng thái | Đã duyệt theo plan; cập nhật khi đổi phạm vi (ghi vào mục 14) |
| Nguồn sự thật liên quan | `docs/ROADMAP.md` (tiến độ) · `docs/DATA-MODEL.md` (bảng, enum, state machine, ma trận hủy, RLS) · `docs/ARCHITECTURE.md` + `docs/adr/` · `docs/DESIGN-SYSTEM.md` · `docs/SECURITY-PRIVACY.md` · `docs/ESG-METHODOLOGY.md` · `docs/TESTING.md` |
| Quy ước | Code, route, tên bảng/enum: tiếng Anh. Giao diện và tài liệu: tiếng Việt. Giờ: `Asia/Ho_Chi_Minh`. |

> **Cách đọc tài liệu.** Mục 1–4 trả lời *vì sao* và *cho ai*. Mục 5 là danh mục tính năng (F-xx). Mục 6–7 là user story (US-ROLE-nn) kèm tiêu chí nghiệm thu. Mục 8–10 là yêu cầu phi chức năng, quy tắc nhãn và ma trận thông báo. Mục 11 là bảng truy vết từ tài liệu nhóm và lỗi bản cũ sang F/US. Khi PRD mâu thuẫn với DATA-MODEL về tên bảng/cột, **DATA-MODEL thắng**; khi mâu thuẫn về phạm vi/thứ tự ưu tiên, **PRD thắng**; khi mâu thuẫn về ngày, **ROADMAP thắng**.

## Mục lục

1. Tóm tắt & bối cảnh
2. Mục tiêu & chỉ số thành công
3. Personas
4. Phạm vi
5. Danh mục tính năng (Feature catalog)
6. Bản đồ màn hình & route
7. User stories & tiêu chí nghiệm thu
8. Yêu cầu phi chức năng
9. Quy tắc nhãn tươi Xanh/Vàng/Đỏ
10. Ma trận thông báo
11. Bảng truy vết
12. Giả định, phụ thuộc, rủi ro sản phẩm
13. Câu hỏi mở (có phase chốt)
14. Nhật ký thay đổi

---

## 0. Thuật ngữ

| Thuật ngữ (UI) | Tên kỹ thuật | Giải thích ngắn |
|---|---|---|
| Lô tặng | `offer` (`offers`) | Một lượng thực phẩm cửa hàng đăng để tặng: danh mục, số lượng + đơn vị, kg/đơn vị, hạn, khung giờ lấy |
| Nhu cầu | `need` (`needs`) | Tổ chức đăng cần bao nhiêu, loại gì, trước lúc nào |
| Phương án ghép | `bundle` (`need_bundles`) | Một tổ hợp 1–5 lô từ nhiều cửa hàng để đáp ứng một nhu cầu |
| Phân bổ | `allocation` (`allocations`) | Phần số lượng của một lô được giữ cho một tổ chức |
| Chuyến lấy hàng | `pickup` (`pickups`) | Một lượt đi lấy (tình nguyện viên hoặc tự đến lấy), gồm nhiều điểm dừng |
| Điểm dừng | `pickup_stop` (`pickup_stops`) | Một cửa hàng (hoặc điểm giao về tổ chức) trên tuyến |
| Bàn giao | `handover` (`handovers`, kind `pickup` \| `dropoff`) | Sự kiện quét QR/nhập mã 6 số, kèm `handover_lines` đối soát từng dòng |
| Minh chứng | `proof` (`proofs`, `proof_media`, `proof_allocations`) | Ảnh (đã làm mờ mặt) + mô tả + số người phục vụ + địa điểm |
| Sổ tác động | `impact_ledger` | Sổ ghi thêm (append-only) kg, CO₂e, nước, suất ăn theo từng dòng bàn giao |
| Điểm / chi nhánh | `site` (`sites`) | Một địa điểm vật lý của cửa hàng hoặc tổ chức, có tọa độ, giờ, cài đặt riêng |
| Nhãn tươi | `freshness_label` | `green` Xanh · `yellow` Vàng · `red` Đỏ · `expired` Hết hạn |
| Hạn hiệu lực | `effective_deadline` | Mốc đến trước giữa giờ hết hạn và giờ đóng cửa của điểm (giờ Việt Nam) |
| Tổ chức | `organizations.kind = charity` | Mái ấm, bếp ăn từ thiện, nhà mở, viện dưỡng lão… |
| Cửa hàng | `organizations.kind = store` | Tiệm bánh, nhà hàng/bếp ăn, cửa hàng tiện lợi, siêu thị |

---

## 1. Tóm tắt & bối cảnh

### 1.1 Một câu

**FoodSave là nền tảng điều phối thực phẩm dư thừa minh bạch đến từng suất ăn**: cửa hàng đăng thực phẩm, tổ chức đăng nhu cầu, hệ thống tự ghép từ nhiều cửa hàng, tình nguyện viên lấy hàng theo tuyến tối ưu, bàn giao bằng QR, minh chứng được làm mờ khuôn mặt, và chỉ số ESG tự tính có trích nguồn.

### 1.2 Vấn đề

| Bên | Nỗi đau hiện tại | Hệ quả |
|---|---|---|
| Cửa hàng (tiệm bánh, nhà hàng, cửa hàng tiện lợi, siêu thị) | Cuối ngày còn hàng ăn được nhưng không bán; không biết tặng ai, ai đến kịp; sợ rủi ro an toàn thực phẩm; không có số liệu CSR | Bỏ đi, hoặc tặng ngẫu nhiên không ghi nhận |
| Tổ chức (mái ấm trẻ em, bếp ăn từ thiện, nhà mở/tạm lánh, viện dưỡng lão, trung tâm khuyết tật, cộng đồng tôn giáo) | Phụ thuộc quan hệ cá nhân; thông tin đến muộn; một cửa hàng thường không đủ số lượng; điều phối tình nguyện viên bằng điện thoại/nhắn tin | Lỡ lô sắp hết hạn; đi nhiều chuyến lẻ; khó chứng minh minh bạch với nhà tài trợ |
| Tình nguyện viên | Nhận địa chỉ qua tin nhắn, không có tuyến, không biết lấy bao nhiêu | Đi vòng, sai số lượng, không có xác nhận |
| Xã hội / nhà tài trợ | Không có số liệu tin cậy về lượng thực phẩm được cứu và người được hỗ trợ | Khó huy động thêm nguồn lực |

### 1.3 Cấp thiết (số liệu cho tiêu chí "Cấp thiết", 4 điểm)

> Tất cả số liệu dưới đây **cần kiểm chứng nguồn** trước khi đưa vào deck. Track B có hạn **18/10** để chốt số liệu có nguồn (UNEP Food Waste Index, số liệu Việt Nam) vào `docs/pitch/so-lieu-cap-thiet.md`. PRD chỉ ghi các con số làm "móc" kể chuyện.

| Móc | Giá trị đang biết | Nguồn dự kiến | Trạng thái |
|---|---|---|---|
| Lượng thực phẩm bị lãng phí toàn cầu/năm | khoảng 1,05 tỷ tấn (năm 2022), khoảng 19% thực phẩm đến tay người tiêu dùng | UNEP Food Waste Index Report 2024 | cần kiểm chứng nguồn |
| Lãng phí bình quân hộ gia đình | khoảng 132 kg/người/năm (toàn cầu) | UNEP FWI 2024 | cần kiểm chứng nguồn |
| Số liệu riêng Việt Nam (hộ gia đình, bán lẻ, dịch vụ ăn uống) | chưa chốt | UNEP FWI (bảng quốc gia), báo cáo trong nước | cần kiểm chứng nguồn |
| Phát thải gắn với thực phẩm bị lãng phí | hệ số 2,0 kg CO₂e/kg dùng trong ESG (3,3 Gt CO₂e ÷ 1,6 Gt) | FAO (2013) *Food wastage footprint*, tr. 6 và tr. 11 | đã kiểm chứng (ADR-009 Accepted); xem `ESG-METHODOLOGY.md` |
| Số người thiếu đói toàn cầu | khoảng 700–800 triệu người | FAO SOFI (năm gần nhất) | cần kiểm chứng nguồn |

### 1.4 Cuộc thi & ràng buộc

- **TISPA 2026** (IEC ĐHQG TP.HCM và Quỹ Khởi Sự Từ Tâm). Đội đang ở Top 25; chung kết đầu tháng 12/2026. Giải: 25 triệu đồng tại chung kết và 75 triệu đồng để triển khai 6 tháng.
- Bảng chấm 37 điểm: Đội ngũ 6 · Giải pháp & công nghệ 8 · Cấp thiết 4 · Khả thi & tác động 5 · Mô hình bền vững 5 · Sản phẩm mẫu 4 · Trình bày 5. **25/37 điểm không phụ thuộc code** → hồ sơ, pilot, thuyết trình chạy song song (Track B trong ROADMAP).
- Đội: Minh + Claude Code làm toàn bộ code; Khanh kiểm thử và UAT. Freeze **22/11/2026**.
- Bản cũ (`foodsavevietnam/FoodSaveVietNam`) không dùng tiếp: luồng tặng–nhận chưa lưu DB, đăng nhập lỗi (L1–L5), lỗ hổng nghiêm trọng (B1–B8), di sản B2C, bản đồ giả, quét mặt giả. FoodSave v2 viết lại từ đầu trong repo `bminhnemhoi/FoodSave`.

### 1.5 Bảy điểm khác biệt (tiêu chí "Giải pháp & công nghệ", 8 điểm)

| # | Khác biệt | Tính năng chính |
|---|---|---|
| 1 | Ghép đơn hai chiều, nhiều cửa hàng (cần 50 bánh → 20 + 18 + 12), tối ưu chính xác có công bằng | F-24, F-25, F-26, F-28 |
| 2 | Nhãn tươi Xanh/Vàng/Đỏ theo nhóm hàng, hạn hiệu lực tính cả giờ đóng cửa, chỉ gợi ý lô Đỏ cho tổ chức đến kịp | F-16, F-17, F-30 |
| 3 | Bản đồ & điều phối thật (MapLibre + PostGIS + Goong, xe máy, tối ưu thứ tự, check-in) | F-31 → F-38 |
| 4 | Chuỗi bàn giao QR một lần dùng, chỉ lưu hash, đối soát từng dòng đặt/lấy/giao | F-39 → F-42 |
| 5 | Minh chứng tôn trọng quyền riêng tư: làm mờ mặt trên máy, xóa EXIF/GPS, Admin duyệt rồi cửa hàng mới xem | F-44 → F-48 |
| 6 | ESG tự động, sổ append-only, hệ số có version + nguồn, báo cáo tháng in được | F-49 → F-53 |
| 7 | AI (Claude; Bedrock khi có AWS) có feature flag: ảnh → tự điền lô, kiểm minh chứng, nhận xét ESG | F-81 → F-84 |

### 1.6 Nguyên tắc sản phẩm (bắt buộc)

1. **Không có tính năng giả.** Mọi nút đều làm việc thật; mọi số liệu là thật hoặc gắn nhãn **"Dữ liệu demo"**. Không có bản đồ giả, AI insight giả, quét mặt giả, số tĩnh giả làm số thật.
2. **Bỏ toàn bộ di sản B2C:** không bán, không giá, không ví, không hoa hồng, không đơn hàng của khách mua.
3. **Một cách gọi nhãn thống nhất:** Xanh / Vàng / Đỏ (và "Hết hạn") ở mọi cổng. Không dùng "Còn hạn / Cận hạn / Sắp hết hạn".
4. **Dữ liệu demo dùng tên hư cấu**, không dùng thương hiệu thật (ví dụ trong tài liệu nhóm có "Bách Hóa Xanh"; seed dùng tên hư cấu như "Siêu thị mini Chợ Xanh").
5. **An toàn thực phẩm:** cửa hàng tick cam kết an toàn khi đăng; người nhận có quyền từ chối từng dòng vì chất lượng; có điều khoản miễn trừ trách nhiệm cho bên tặng thiện chí.
6. **Riêng tư theo mặc định:** giấy tờ private, vị trí tình nguyện viên chỉ khi đồng ý, mái ấm/nơi tạm lánh được ẩn vị trí, ảnh minh chứng làm mờ mặt.
7. **Ghim bản đồ là nguồn sự thật cho vị trí**, không phải chuỗi địa chỉ.

---

## 2. Mục tiêu & chỉ số thành công

### 2.1 Mục tiêu

| Mã | Mục tiêu | Đo bằng | Mốc |
|---|---|---|---|
| G-1 | Luồng lõi đăng → nhận → QR → giao → tác động chạy thật trên prod | E2E xanh trên prod; video #1 | M1 — 27/10 |
| G-2 | Đủ 4 hướng định hướng (kết nối hai chiều + ghép, định vị, minh chứng, ESG) | Kịch bản "50 bánh từ 3 cửa hàng" E2E; ESG khớp công thức | M2 — 17/11 |
| G-3 | Bản xuất sắc: PWA, Web Push, AI, a11y, hiệu năng | Lighthouse landing/PWA ≥ 90; không lỗi High; E2E xanh | M3 — 22/11 (freeze) |
| G-4 | Bằng chứng khả thi: pilot thật trên prod | ≥ 10 lần bàn giao thật, ≥ 2 cửa hàng + 1 tổ chức thật có LOI | 15–28/11 |
| G-5 | Demo chung kết không rủi ro | Demo 2 thiết bị, tài khoản giám khảo, reset demo < 1 phút, video dự phòng | P6 |

### 2.2 Chỉ số sản phẩm (KPI)

Tất cả KPI được tính từ dữ liệu hệ thống (không nhập tay), hiển thị ở `/admin` (F-51) và một phần công khai ở `/impact` (F-79). Khi dữ liệu là demo, KPI hiển thị kèm nhãn "Dữ liệu demo" và tách khỏi số pilot thật (`organizations.is_demo`).

| KPI | Định nghĩa chính xác | Nguồn dữ liệu | Mục tiêu pilot (đề xuất) |
|---|---|---|---|
| **Time-to-match (lô)** | Trung vị thời gian từ `offers` chuyển `open` đến phân bổ đầu tiên của lô sang `confirmed` | `offers`, `allocations.confirmed_at` | Lô Đỏ ≤ 30 phút · mọi lô ≤ 2 giờ |
| **Time-to-match (nhu cầu)** | Trung vị thời gian từ khi nhu cầu được đăng đến khi `need_bundles` đầu tiên của nó `confirmed` | `needs`, `need_bundles` | ≤ 2 giờ |
| **% kg được cứu** | Σ kg đã giao (ledger credit − reversal) ÷ Σ kg đã đăng (offers mở, theo `quantity × unit_weight_kg`) trong kỳ | `impact_ledger`, `offers` | ≥ 70% |
| **Tỷ lệ lô hết hạn chưa được nhận** (chỉ số E của định hướng) | Số lô đóng `expired` mà `qty_unclaimed = quantity` ÷ tổng lô đã đăng | `offers` | ≤ 15% |
| **Pickup lead time** | Trung vị từ `allocations.confirmed_at` đến `picked_at` | `allocations` | Đỏ ≤ 90 phút · Vàng ≤ 4 giờ |
| **Tỷ lệ bàn giao đúng hạn** | % phân bổ có `picked_at` ≤ `effective_deadline` của lô | `allocations`, `offers` | ≥ 95% |
| **Proof compliance** | % phân bổ đã giao có minh chứng `approved` nộp trước `due_at` | `proofs`, `proof_allocations` | ≥ 80% |
| **Thời gian đăng minh chứng** | Trung bình giờ từ dropoff đến `proofs.submitted_at` | `handovers`, `proofs` | ≤ 24 giờ |
| **Thời gian duyệt hồ sơ** | Trung bình ngày từ `organizations.submitted_at` đến `reviewed_at` | `organizations` | ≤ 2 ngày |
| **Độ chính xác đối soát** | % dòng bàn giao có `qty_delivered = qty_reserved` | `handover_lines`, `allocations` | ≥ 90% |
| **Tỷ lệ nhu cầu được đáp ứng đủ** | Nhu cầu `fulfilled` ÷ nhu cầu đã đăng (đã đóng) | `needs` | ≥ 60% |
| **Kích hoạt** | Số cửa hàng / tổ chức có ≥ 1 lần tặng/nhận trong tháng | ledger | Pilot: 2 cửa hàng + 1 tổ chức |

### 2.3 Chỉ số chất lượng kỹ thuật (gắn gate)

- E2E theo vai trò xanh trên CI và trên prod ở mỗi mốc ★.
- 0 lỗi mức High mở tại freeze (security review + UAT của Khanh).
- Lighthouse ≥ 90 (Performance, Accessibility, Best Practices, SEO) cho landing và PWA; các trang trong app ≥ 80 Performance trên mobile giả lập.
- pgTAP: 100% bảng có RLS; hồi quy cho từng lỗi B1–B8.
- Property test của engine ghép đơn: không cấp vượt lô, không vượt nhu cầu, tôn trọng bán kính.

---

## 3. Personas

> Tên và tổ chức đều hư cấu. Mỗi persona gắn với một vai trò và route prefix.

### P1 — Chị Nguyễn Thị Thu Lan · Chủ tiệm bánh (vai trò **Cửa hàng**, `/store/*`)

- 38 tuổi, chủ "Tiệm bánh Hạt Lúa" ở phường Bàn Cờ (khu Quận 3 cũ), TP.HCM; 2 chi nhánh (phường Bàn Cờ, phường Gia Định), 6 nhân viên.
- Thiết bị: iPhone đời cũ khi đứng quầy, laptop ở văn phòng nhỏ. Thao tác nhanh, ít kiên nhẫn với form dài.
- Mỗi tối dư 20–60 bánh mì, bánh ngọt; tiệm đóng cửa 21:00.
- **Mục tiêu:** đăng lô trong dưới 1 phút lúc 19:30; biết chắc có người đến lấy trước 21:00; có giấy tờ chứng minh đã tặng.
- **Nỗi lo:** người lạ đến lấy không rõ là ai; bánh hỏng rồi bị trách; mất thời gian đếm lại.
- **Cần từ FoodSave:** chụp ảnh → tự điền; nhãn tự động; QR để biết đúng người; tự động chấp nhận với tổ chức đã duyệt; báo cáo tháng để treo ở tiệm và đăng fanpage.

### P2 — Cô Võ Thị Hạnh · Điều phối bếp ăn mái ấm (vai trò **Tổ chức**, `/charity/*`)

- 46 tuổi, phụ trách bếp "Mái ấm trẻ em Nắng Mai" (hư cấu) ở phường Chánh Hưng (khu Quận 8 cũ); 45 trẻ, 3 nhân viên, 12 tình nguyện viên sinh viên.
- Thiết bị: Android tầm trung, máy tính để bàn ở văn phòng mái ấm. Quen Zalo, chưa quen ứng dụng web phức tạp.
- Địa chỉ mái ấm không muốn công khai (an toàn trẻ em) → vị trí `approximate`.
- **Mục tiêu:** đủ 50 phần bánh cho bữa xế thứ Bảy; ưu tiên lô sắp hết hạn trong bán kính 5 km; phân công tình nguyện viên rõ ràng; có ảnh minh chứng gửi nhà tài trợ mà không lộ mặt trẻ.
- **Nỗi lo:** nhận hàng kém chất lượng; tình nguyện viên đi lạc; phải báo cáo nhiều nơi.

### P3 — Lê Minh Khoa · Sinh viên tình nguyện (vai trò **Tình nguyện viên**, `/volunteer/*` PWA)

- 20 tuổi, sinh viên năm 2, đi xe máy, chở được khoảng 15 kg; điện thoại Android giá rẻ (3 GB RAM), gói 4G hạn chế dung lượng.
- **Mục tiêu:** mở app thấy ngay chuyến hôm nay, bấm một nút là có chỉ đường Google Maps, đưa QR cho cửa hàng, xong trong 45 phút giữa hai buổi học.
- **Nỗi lo:** bị theo dõi vị trí liên tục; app nặng, tốn pin, tốn data; không biết lấy bao nhiêu.

### P4 — Ngô Thanh Tâm · Điều phối viên FoodSave (vai trò **Admin**, `/admin/*`)

- 27 tuổi, thành viên ban vận hành, làm việc trên laptop; dùng app xác thực (TOTP) trên điện thoại.
- **Mục tiêu:** duyệt hồ sơ trong ngày mà không phải tải giấy tờ về máy; nhìn bảng lô theo nhãn để can thiệp lô Đỏ chưa ai nhận; duyệt minh chứng; xuất báo cáo ESG tháng cho đối tác; reset demo trước buổi chấm.
- **Nỗi lo:** lộ CCCD/giấy tờ; người lạ tự nâng quyền; số liệu không khớp khi giám khảo hỏi.

### P5 — Chị Đặng Mỹ Linh · Trưởng phòng CSR chuỗi bán lẻ / giám khảo (vai trò **Khách**, `/`, `/impact`)

- 35 tuổi, phụ trách CSR của một chuỗi cửa hàng tiện lợi (hư cấu); cũng đại diện cho kiểu người xem như giám khảo, nhà tài trợ, báo chí.
- **Mục tiêu:** trong 30 giây hiểu FoodSave làm gì; thấy số liệu thật (kg, CO₂e, suất ăn) có nguồn; xem bản đồ hoạt động; biết cách đăng ký cho chuỗi.
- **Nỗi lo:** số liệu "đẹp" nhưng không kiểm chứng được; nền tảng lộ dữ liệu người nhận.

### Persona phụ

- **Nhân viên ca tối của cửa hàng** (org_members `staff`, chỉ một chi nhánh): chỉ cần màn bàn giao và kho hàng của chi nhánh mình.
- **Nhà tài trợ của tổ chức** (không có tài khoản): nhận báo cáo tháng qua email do tổ chức gửi (F-11, F-52).

---

## 4. Phạm vi

### 4.1 Trong phạm vi (release dự thi, đến 22/11/2026)

| Nhóm | Bao gồm |
|---|---|
| Vai trò | Khách, Cửa hàng, Tổ chức, Tình nguyện viên (PWA), Admin |
| Luồng lõi | Đăng ký + duyệt → đăng lô → kho tặng → yêu cầu/đặt chỗ → xác nhận → chuyến → bàn giao QR (lấy + giao) → sổ tác động → minh chứng → ESG |
| Ghép đơn | Nhu cầu, 3 phương án ghép từ 1–5 cửa hàng, ghép lại phần thiếu, thông báo hai chiều theo bán kính, công bằng |
| Bản đồ | 9 màn bản đồ (mục 6.2), Goong tile + Places + Directions xe máy, PostGIS |
| Minh bạch | Minh chứng làm mờ mặt trên máy, Admin duyệt, cửa hàng liên quan xem |
| ESG | Đủ chỉ số E/S/G của tài liệu định hướng, theo cổng + toàn hệ thống, báo cáo tháng in được |
| Thông báo | In-app realtime, email (Resend), Web Push (PWA) |
| AI | Ảnh → tự điền lô (giữ); kiểm minh chứng, nhận xét ESG, trích xuất giấy tờ (tùy chọn, có flag) |
| Quản trị | Duyệt hồ sơ, MFA, giám sát lô, phân bổ, chuyến, minh chứng, phản ánh, nhật ký kiểm toán, xem ngưỡng nhãn/hệ số (chỉ đọc; đổi qua migration có version), cấu hình `app_settings`, reset demo |
| Nền tảng | Next.js trên Vercel, Supabase (Postgres + PostGIS + RLS + Auth + Storage + Realtime + pg_cron), CI, 3 môi trường |

### 4.2 Ngoài phạm vi (OUT) — không làm, không hiển thị

| Hạng mục | Lý do |
|---|---|
| **Bán hàng B2C**, người mua/khách hàng mua đồ giảm giá, đơn hàng của khách, voucher, giỏ hàng | Di sản bản 3 bên; FoodSave là phi lợi nhuận, chỉ tặng |
| **Thanh toán, ví, đối soát tiền, chi trả đối tác, hoàn tiền** | Không có giao dịch tiền |
| **Hoa hồng, phí dịch vụ, gói thu phí trong app** | Mô hình bền vững (gói báo cáo ESG/CSR, nhà tài trợ tuyến) là kế hoạch kinh doanh trong pitch, không phải tính năng thu tiền trong release này |
| **Giá sản phẩm** (cột "giá" ở màn Lô hàng tồn kho cũ) | Thực phẩm tặng không có giá; đo bằng kg và suất ăn |
| **Tính năng giả**: quét khuôn mặt mô phỏng, bản đồ minh họa tĩnh, "AI insight" sinh sẵn, số liệu tĩnh trình bày như số thật, nút "Cấu hình" không làm gì | Nguyên tắc 1.6.1 |
| Rekognition Face Liveness, xác thực khuôn mặt | Sau giải (AWS), xem `AWS-MIGRATION.md` |
| Zalo OA/ZNS, SMS (kể cả "SMS tức thì" trong tài liệu Charity) | Kế hoạch 6 tháng; trong release này thông báo GẤP dùng push + in-app + email |
| Ứng dụng native iOS/Android | PWA đủ cho tình nguyện viên |
| Giao diện đa ngôn ngữ | Chỉ tiếng Việt; cấu trúc chuỗi sẵn sàng i18n sau |
| Đăng ký tình nguyện viên tự do (marketplace tình nguyện) | Tình nguyện viên chỉ vào qua lời mời của tổ chức |
| Danh sách người hưởng lợi có danh tính (tab "Người hưởng lợi" cũ) | Rủi ro dữ liệu cá nhân; chỉ lưu số người phục vụ |
| Mạng xã hội "Cộng đồng" (bài đăng) cũ | Không phục vụ 4 hướng định hướng |
| Lưu toàn bộ payload CCCD, ảnh CCCD lâu dài | Tối thiểu hóa dữ liệu; chỉ `id_last4`, `id_verified_at`, `verified_by` |
| Theo dõi vị trí nền khi app đóng | Chỉ khi app đang mở và có đồng ý |

### 4.3 Danh sách cắt (cắt theo thứ tự khi gate trễ quá 2 ngày)

1. Offline action queue (F-75) · 2. Vị trí trực tiếp, thay bằng check-in (F-38) · 3. Dark mode, ⌘K, `/dev/ui` (F-86) · 4. react-pdf, dùng print CSS (F-52 phần PDF) · 5. Bảng xếp hạng Xanh (F-53) · 6. Quét QR CCCD (F-13) · 7. AI nhận xét ESG và AI kiểm minh chứng (F-83, F-84).

AI "ảnh → tự điền" (F-81) **không** nằm trong danh sách cắt.

---

## 5. Danh mục tính năng (Feature catalog)

**Mức ưu tiên:** **Must** = bắt buộc cho gate/mốc của phase đó; **Should** = cần cho M2/M3 nhưng có thể thu hẹp; **Could** = nằm trong danh sách cắt hoặc tùy chọn; **Won't** = không làm trong release này (ghi để truy vết).
**Phase:** P0 Nền móng (07–11/10) · P1 Onboarding & Tin cậy (12–15/10) · P2 Vòng lõi MVP ★M1 (16–27/10) · P3 Ghép đơn & Điều phối (28/10–08/11) · P4 Minh bạch & ESG ★M2 (09–17/11) · P5 Xuất sắc ★M3 (18–22/11) · P6 Sẵn sàng chung kết (23/11–chung kết).

### E1 — Onboarding, Hồ sơ & Tin cậy

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-01 | Tài khoản & xác thực | Đăng ký email + mật khẩu, xác minh email bằng OTP, đăng nhập, quên/đặt lại mật khẩu, đăng xuất, nhận lời mời qua link (thành viên, tình nguyện viên). SMTP qua Resend trên domain riêng | Must | P0 |
| F-02 | Phân quyền theo vai trò & trạng thái | Guard phía server cho mọi route; tổ chức ở `draft`/`submitted`/`needs_changes`/`rejected`/`suspended`/`closed` không vào cổng nghiệp vụ (chỉ thấy trang trạng thái); vai trò lấy từ `org_members`/`profiles.platform_role`, **không bao giờ từ metadata**; người thuộc nhiều tổ chức chọn tổ chức đang làm việc; chuyển trạng thái chỉ qua RPC (ADR-004) | Must | P0–P1 |
| F-03 | Wizard onboarding cửa hàng | 4 bước tự lưu nháp: Thông tin cửa hàng (tên, loại hình: Tiệm bánh, Nhà hàng/Bếp ăn, Cửa hàng tiện lợi, Siêu thị, Khác) → Điểm đầu tiên (ghim bản đồ, giờ mở cửa) → Người đại diện & giấy tờ (private) → Cam kết & gửi duyệt | Must | P1 |
| F-04 | Wizard onboarding tổ chức | 4 bước tự lưu nháp: Thông tin tổ chức (loại hình: Mái ấm trẻ em, Bếp ăn từ thiện, Nhà mở/Tạm lánh, Viện dưỡng lão, Trung tâm khuyết tật, Cộng đồng tôn giáo, Khác; ngày thành lập; mã số tổ chức) → Điểm nhận (ghim, **bán kính phục vụ**, loại thực phẩm nhận, giờ nhận, sức chứa, chế độ hiển thị vị trí) → Người đại diện & giấy tờ → Cam kết & gửi duyệt | Must | P1 |
| F-05 | Bộ chọn vị trí (LocationPicker) | Tìm địa chỉ có gợi ý (Goong Places Autocomplete), kéo ghim, "Dùng vị trí hiện tại", tự điền phường/xã (reverse geocode; TP.HCM không còn cấp quận từ 01/7/2025), ghim là nguồn sự thật | Must | P1 |
| F-06 | Giấy tờ & dữ liệu nhạy cảm private | `org_sensitive`, `org_documents` chỉ owner + Admin; bucket `kyc` private, signed URL 60 s; ảnh mã hóa lại qua canvas; file KYC tự xóa 30 ngày sau quyết định duyệt | Must | P1 |
| F-07 | Đồng ý & trang pháp lý | Điều khoản sử dụng, Chính sách bảo mật, điều khoản miễn trừ cho bên tặng thiện chí, cam kết an toàn thực phẩm; `consents` theo mục đích (`terms`, `location_trip`, `proof_photo`, `marketing`) có `policy_version`, rút lại được | Must | P1 |
| F-08 | Điểm/chi nhánh, giờ, ngày nghỉ | CRUD `sites`; `site_hours` theo thứ trong tuần (hỗ trợ qua nửa đêm `closes_next_day`); `site_closures` theo ngày; tính theo giờ Việt Nam | Must | P1 (tạo) · P2 (quản lý) |
| F-09 | Thành viên & nhân viên | Mời qua email; vai trò `owner`/`manager`/`staff`; giới hạn theo điểm (`site_ids`, null = mọi điểm); thu hồi quyền | Should | P2 |
| F-10 | Cài đặt cửa hàng ("Cài đặt hệ thống") | Hồ sơ cửa hàng (sửa từng mục), chi nhánh, giờ mở cửa, ngày nghỉ, nhân viên, chế độ duyệt yêu cầu (thủ công / tự động chấp nhận), tùy chọn thông báo, tham gia Bảng xếp hạng Xanh | Must | P2 |
| F-11 | Cài đặt tổ chức | (1) Hồ sơ: tên, loại hình, email, SĐT, địa chỉ, ngày thành lập, mã số tổ chức, điểm uy tín (chỉ đọc); mỗi mục có nút "Sửa". (2) Nhà tài trợ liên kết (`sponsors`) + "Thêm nhà tài trợ". (3) Cài đặt thông báo. (4) Giờ hoạt động & nhận hàng theo từng ngày + "Lưu giờ hoạt động". (5) Loại thực phẩm chấp nhận. (6) Thiết bị & tích hợp (chỉ các mục có thật — xem US-CHA-36). (7) Tạm ngưng nhận donation. (8) Đăng xuất tổ chức | Must | P2 (1,3–5,7,8) · P3 (6) · P4 (2) |
| F-12 | Điểm uy tín | `trust_score` do hệ thống tính (bàn giao đúng hạn, hủy sau xác nhận, minh chứng đúng hạn, phản ánh), chủ hồ sơ không sửa được (đóng B6); dùng trong điểm ghép đơn (trọng số 0,1) | Should | P3 |
| F-13 | eKYC: quét QR trên CCCD gắn chip | Tùy chọn trong bước người đại diện; chỉ lưu `id_last4`, `id_verified_at`, `verified_by`; không lưu payload | Could (cắt #6) | P5 |

### E2 — Lô tặng & Nhãn

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-14 | Danh mục thực phẩm & đơn vị | `food_categories` với `perishability` (`cooked`/`fresh`/`packaged`), `default_unit`, `default_unit_weight_kg`. Danh mục khởi tạo: Bánh mì & bakery, Cơm hộp & chế biến, Rau củ tươi, Trái cây, Sữa & sản phẩm sữa, Thịt & hải sản, Bánh ngọt & dessert, Đồ uống, Đồ khô | Must | P2 |
| F-15 | Đăng lô tặng ("Thêm SP") | Danh mục, tên/mô tả ngắn, số lượng + đơn vị (cái, ổ, hộp, suất, chai, túi, kg, lít), kg/đơn vị (khai báo hoặc mặc định danh mục → `weight_source`), hạn sử dụng (ngày hoặc ngày + giờ), khung giờ lấy, điểm (chi nhánh), ảnh, ghi chú bảo quản, **tick cam kết an toàn** (bắt buộc); lưu nháp hoặc đăng ngay | Must | P2 |
| F-16 | Nhãn tươi tính lúc đọc | Hàm SQL immutable `freshness_label(deadline, perishability, at)` + hàm TS tương ứng, cùng một file fixture; `effective_deadline` do RPC tính và lưu khi đăng/sửa; hiển thị nhãn + icon + chữ + đếm ngược ở mọi nơi (ADR-005) | Must | P2 |
| F-17 | Tác vụ định kỳ nhãn | pg_cron mỗi 5 phút: (a) phát sự kiện "chuyển Đỏ" một lần cho mỗi lô; (b) đóng lô quá hạn hiệu lực → `expired`, ghi `qty_unclaimed` | Must | P2 |
| F-18 | Kho hàng cửa hàng | Danh sách lô theo điểm, nhóm/lọc theo nhãn (Đỏ trước), trạng thái, đếm ngược đến hạn hiệu lực, số đã giữ/đã lấy/còn lại; tab Nháp · Đang mở · Đã giữ hết · Đã xong · Hết hạn/Đã hủy | Must | P2 |
| F-19 | Chuyển từ thiện (công bố lô) | Nút "Chuyển từ thiện" chuyển lô `draft → open` và phát thông báo lô mới tới tổ chức đủ điều kiện + Admin; lô Đỏ phát GẤP | Must | P2 |
| F-20 | Vòng đời lô | Sửa khi chưa có phân bổ; giảm số lượng không thấp hơn số đã giữ; hủy lô (hủy phân bổ chưa lấy theo ma trận hủy, có lý do); đóng sớm; lô đóng ghi `qty_unclaimed`; `open ↔ fully_allocated` khi có số lượng trả lại | Must | P2 |

### E3 — Nhu cầu & Ghép đơn

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-21 | Kho tặng tổ chức ("Donation box") | Split view bản đồ + danh sách; marker cửa hàng tô màu theo nhãn có cluster; vòng bán kính; thẻ lô (khoảng cách, ETA xe máy, đếm ngược, số còn lại); lọc nhãn/khoảng cách/thời gian tới/danh mục; sắp xếp mặc định Đỏ → Vàng → Xanh rồi theo khoảng cách | Must | P2 |
| F-22 | Yêu cầu nhận lô & đặt chỗ nguyên tử | Tổ chức chọn số lượng → RPC giữ chỗ nguyên tử (khóa lô, trừ số khả dụng) tạo `allocations` `requested` với `reserved_until`; chống bấm trùng bằng `client_op_id`; yêu cầu quá hạn tự hết hạn khi có RPC khác chạm vào lô (không phụ thuộc cron) | Must | P2 |
| F-23 | Duyệt yêu cầu / tự động chấp nhận | Cửa hàng chấp nhận/từ chối (lý do) từng yêu cầu; hoặc bật tự động chấp nhận theo điểm (tất cả tổ chức đã duyệt, hoặc chỉ tổ chức có điểm uy tín ≥ ngưỡng) | Must | P2 |
| F-24 | Đăng nhu cầu | Danh mục (một hoặc nhiều danh mục thay thế được), số lượng + đơn vị, cần trước (`needed_by`), điểm nhận, ghi chú (ví dụ "cho 45 trẻ"); trạng thái tính từ tổng: `open → partially_matched → matched → fulfilled`; đến `needed_by` đóng `closed_partial` hoặc `expired` | Must | P3 |
| F-25 | Engine ghép đơn nhiều cửa hàng | SQL `match_candidates` (ST_DWithin bán kính, danh mục, còn hàng, khả thi thời gian, tối đa 15 ứng viên) + TS chấm điểm (0,4 độ gấp + 0,3 gần + 0,2 khớp số lượng + 0,1 uy tín), duyệt mọi tổ hợp ≤ 3 cửa hàng trong top 12, bổ sung tham lam đến 5; trả **tối đa 3 phương án** xếp theo phủ đủ → ít điểm dừng → tuyến ngắn → điểm cao (ADR-007) | Must | P3 |
| F-26 | Xác nhận phương án & ghép lại phần thiếu | Chọn phương án → `reserve_bundle()` giữ chỗ nguyên tử trên mọi lô (khóa `ORDER BY id`); bundle `proposed → partially_confirmed → confirmed`; cửa hàng từ chối/thiếu → chỉ ghép lại phần còn thiếu | Must | P3 |
| F-27 | "Tặng thực phẩm – Kết nối từ thiện" (cửa hàng) | Hai tab: **Nhu cầu gần bạn** (bản đồ + danh sách nhu cầu của tổ chức có cửa hàng nằm trong bán kính phục vụ; điểm `approximate`/`hidden` chỉ hiện vùng gần đúng) và **Yêu cầu nhận lô** (tổ chức muốn nhận lô cửa hàng đã đăng). Cửa hàng phản hồi nhu cầu bằng lô sẵn có hoặc tạo nhanh lô điền sẵn | Must | P3 (nhu cầu) · P2 (yêu cầu) |
| F-28 | Công bằng phân phối | Thứ tự thông báo lô mới cho tổ chức theo chỉ số kg đã nhận 30 ngày ÷ số người phục vụ (thấp hơn được báo trước); hiển thị chỉ số công bằng cho Admin | Should | P3 |
| F-29 | Ma trận hủy & sự cố | Tổ chức hủy trước khi lấy → trả số lượng về lô; cửa hàng hủy sau xác nhận → bắt buộc lý do, trừ uy tín, tự ghép lại; tình nguyện viên không đến → hủy chuyến, phân bổ về `confirmed`; sau khi đã lấy → không hủy, chỉ tạo `incident`; thiếu do `capacity`/`no_show` mới trả số lượng về lô và chỉ trước hạn hiệu lực | Must | P3 |
| F-30 | Kiểm tra khả thi thời gian tới | Thời gian tới ước tính = khoảng cách đường chim bay × 1,4 ở 18 km/h + 10 phút; lô chỉ được gợi ý/cho yêu cầu khi giờ đến dự kiến < hạn hiệu lực và nằm trong giờ nhận của tổ chức; lô Đỏ không kịp bị ẩn khỏi gợi ý và thông báo | Must | P2 |

### E4 — Hậu cần & Bản đồ

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-31 | Nền bản đồ & MapsProvider | `react-map-gl/maplibre` lazy-load; tile Goong (dự phòng OpenFreeMap); adapter `MapsProvider` (`MAPS_PROVIDER` = `goong` \| `ors` (kèm Nominatim) \| `aws` \| `fake`) cho autocomplete, geocode, reverse, directions `vehicle=bike`, distance matrix; cache geocode; lưu geometry tuyến (ADR-003, ADR-006) | Must | P0 (spike) · P2 |
| F-32 | Quản lý tình nguyện viên | Mời qua email; hồ sơ `volunteer_profiles` (phương tiện, sức chở kg, khu vực gần đúng); trạng thái hoạt động; đồng ý `location_trip` | Must | P3 |
| F-33 | Chuyến lấy hàng | Tạo chuyến từ phân bổ đã xác nhận (một nhu cầu có thể chia nhiều chuyến); gợi ý tình nguyện viên gần cửa hàng nhất và đủ sức chở; tối ưu thứ tự điểm dừng (hoán vị khi ≤ 5 điểm); gọi Directions thật cho tuyến được chọn; ETA từng điểm; hoặc chọn "Tự đến lấy" | Must | P3 |
| F-34 | Bản đồ phương án ghép | Tổ chức + 2–5 cửa hàng; điểm dừng đánh số; polyline tuyến; tổng km, thời gian; so sánh 3 phương án cạnh nhau | Must | P3 |
| F-35 | Bản đồ điều phối chuyến | Tuyến, trạng thái từng điểm dừng, ETA cập nhật, vị trí tình nguyện viên (nếu đồng ý và app đang mở); cửa hàng chỉ thấy ETA | Must | P3 |
| F-36 | Bản đồ & tuyến (tổ chức) | Khoảng cách và thời gian di chuyển ước tính từ tổ chức và từ từng tình nguyện viên (theo khu vực gần đúng hoặc vị trí check-in gần nhất) tới các cửa hàng có lô/phân bổ | Must | P3 |
| F-37 | Check-in theo geofence | Tình nguyện viên bấm "Tôi đã đến" khi trong bán kính 100 m của điểm dừng → `arrived_at`; ngoài 100 m phải ghi lý do | Must | P3 |
| F-38 | Vị trí tình nguyện viên khi app mở | Chỉ khi có đồng ý và app đang mở; Realtime Broadcast kênh private; chỉ giữ điểm mới nhất, làm tròn khoảng 11 m, xóa khi kết thúc chuyến | Could (cắt #2) | P5 |

### E5 — Bàn giao QR

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-39 | Token bàn giao | QR + mã 6 số dùng một lần cho mỗi điểm dừng (`pickup`) và cho điểm giao (`dropoff`); chỉ lưu `token_hash`; hợp lệ khi còn trong TTL 15 phút **và** (riêng bước `pickup`) trong khung giờ lấy ± 30 phút (DATA-MODEL "Hiệu lực token"); `client_op_id` chống quét trùng | Must | P2 |
| F-40 | Màn bàn giao tại cửa hàng | Toàn màn hình; quét QR bằng camera (`@zxing/browser`) hoặc nhập mã 6 số; hiển thị danh sách dòng (lô, số đặt); nhập số thực giao từng dòng; lý do thiếu (`store_short`, `quality_reject`, `capacity`, `no_show`); xác nhận hai phía | Must | P2 |
| F-41 | Xác nhận nhận hàng tại tổ chức (dropoff) | Điều phối viên tổ chức quét QR dropoff trên điện thoại tình nguyện viên (hoặc nhập mã), đối soát từng dòng, có quyền từ chối dòng vì chất lượng; **ghi sổ tác động lúc dropoff**; nếu tự đến lấy thì lấy và giao là một sự kiện | Must | P2 (tự lấy) · P3 (qua TNV) |
| F-42 | "Đơn hàng cần xử lý" (cửa hàng) | Danh sách phân bổ đang chạy theo dòng thời gian: tổ chức nhận lúc nào → đã xác nhận → tình nguyện viên nào (tên, phương tiện) → cửa hàng đã đóng gói chưa (nút "Đã đóng gói") → ETA → tình nguyện viên đã đến/đã nhận | Must | P2 (cơ bản) · P3 (TNV, ETA) |
| F-43 | Biên bản bàn giao in được | Trang in (print CSS) cho mỗi bàn giao: bên giao, bên nhận, từng dòng đặt/lấy/giao, thời điểm, mã tham chiếu | Should | P4 |

### E6 — Minh chứng

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-44 | Đăng minh chứng | Chọn phân bổ đã giao liên quan; ảnh (1–6, đang phát/đang chế biến/nấu ăn), mô tả ngắn, số người được phục vụ, thời điểm, địa điểm (mini-map, lấy từ máy, sửa tay được, hiển thị gần đúng) | Must | P4 |
| F-45 | Làm mờ mặt trên máy & mã hóa lại ảnh | MediaPipe BlazeFace **full-range**, chia ô cho ảnh đông người, cọ làm mờ thủ công; so sánh trước/sau; ảnh mã hóa lại qua canvas để xóa EXIF/GPS; ảnh gốc chưa làm mờ **không bao giờ** rời máy (ADR-008) | Must | P4 |
| F-46 | Hạn minh chứng & nhắc | `due_at` = dropoff + 48 giờ (cấu hình trong `app_settings`); nhắc trước hạn 12 giờ, nhắc khi quá hạn và báo Admin | Must | P4 |
| F-47 | Admin duyệt minh chứng | `submitted → approved \| needs_changes \| rejected` kèm nhận xét; xem ảnh qua signed URL 300 s | Must | P4 |
| F-48 | Gallery minh chứng | Tổ chức: gallery mọi minh chứng của mình theo trạng thái. Cửa hàng: chỉ xem minh chứng **đã duyệt** liên quan lô mình tặng; gửi "Lời cảm ơn" (ghi nhận ngắn) cho tổ chức | Must | P4 |

### E7 — ESG & Báo cáo

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-49 | Sổ tác động & hệ số | `impact_ledger` append-only, dòng `credit`/`reversal`, unique theo dòng bàn giao; `impact_factors` có version + nguồn (v1: CO₂e 2,0 kg/kg FAO 2013; nước 150 L/kg nước xanh lam FAO 2013; suất ăn 0,42 kg/suất WRAP — `adr/ADR-009-esg-factors.md`, Accepted) | Must | P2 (ledger) · P4 (hệ số UI) |
| F-50 | Dashboard ESG theo cổng | Cửa hàng và tổ chức thấy chỉ số E/S/G của riêng mình theo tháng, so sánh tháng trước, xu hướng 6 tháng; mỗi số có tooltip công thức + nguồn | Must | P4 |
| F-51 | ESG hệ thống & KPI (Admin) | Tổng toàn hệ thống, lọc theo phường/cụm phường/loại hình/tháng; KPI sản phẩm mục 2.2; tách dữ liệu demo | Must | P4 |
| F-52 | Báo cáo tháng in/xuất | Trang báo cáo kiểu tài liệu (print CSS A4) cho cửa hàng (giá trị CSR), tổ chức (gửi nhà tài trợ), Admin (toàn hệ thống); CSV dữ liệu thô; react-pdf tùy chọn | Must (print) · Could (PDF, cắt #4) | P4 |
| F-53 | Bảng xếp hạng Xanh | Cửa hàng chủ động tham gia; xếp theo kg cứu được/tháng; trang công khai | Could (cắt #5) | P4 |

### E8 — Thông báo

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-54 | Outbox idempotent & dispatcher | Mọi sự kiện ghi `notification_outbox` (khóa idempotency); pg_cron → pg_net → `/api/jobs/dispatch` (HMAC) phát ra `notifications` (mỗi người một dòng) và các kênh | Must | P2 |
| F-55 | Trung tâm thông báo in-app | Chuông + ngăn thông báo trong app shell, Realtime, đánh dấu đã đọc/đọc hết, lọc GẤP, link sâu tới đối tượng | Must | P2 |
| F-56 | Thông báo hai chiều theo bán kính | Lô mới → tổ chức có cửa hàng trong bán kính, nhận loại hàng đó, đến kịp, không tạm ngưng, theo thứ tự công bằng, **và Admin**; lô Đỏ → GẤP. Nhu cầu mới → cửa hàng nằm trong bán kính của điểm nhận **và Admin** | Must | P2 (lô) · P3 (nhu cầu) |
| F-57 | Email giao dịch | Resend + React Email, mẫu tiếng Việt: xác minh, mời, duyệt/từ chối hồ sơ, thông báo GẤP, nhắc minh chứng, báo cáo tháng | Must | P0 (auth) · P2 |
| F-58 | Web Push & dự phòng iOS | `web-push` VAPID; đăng ký `push_subscriptions` sau khi cài PWA; iOS chưa cài PWA → in-app + email | Should | P5 |
| F-59 | Tùy chọn thông báo | Bật/tắt theo loại × kênh (`notification_preferences`); một số loại bắt buộc (bảo mật, duyệt hồ sơ) không tắt được | Must | P3 |
| F-60 | Zalo OA/ZNS, SMS | Kênh bổ sung cho GẤP | Won't | Sau giải |

### E9 — Admin & Quản trị

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-61 | Hàng đợi duyệt hồ sơ | Danh sách `submitted` theo thời gian chờ; xem chi tiết, giấy tờ (signed URL), duyệt/từ chối kèm lý do; ghi người duyệt + thời điểm; không tự duyệt tổ chức mình là thành viên | Must | P1 |
| F-62 | Admin MFA bắt buộc | TOTP; `is_admin()` kiểm tra `aal2` trong DB; chưa đạt aal2 thì không vào `/admin/*` và mọi RPC admin từ chối | Must | P1 |
| F-63 | Nhật ký hoạt động (audit) | `audit_logs` cho mọi RPC chuyển trạng thái, duyệt, cấu hình, xem giấy tờ, reset demo; lọc theo người, đối tượng, hành động, thời gian; chỉ đọc | Must | P1 |
| F-64 | Lô hàng tồn kho (giám sát lô) | Bảng mọi lô: cửa hàng, điểm, danh mục, số lượng (đăng/giữ/lấy/còn), kg, hạn, hạn hiệu lực, nhãn, trạng thái; tự làm mới mỗi 5 phút + Realtime; nút **"Cập nhật nhãn ngay"** (chạy ngay tác vụ F-17) | Must | P2 |
| F-65 | Đơn hàng → Phân bổ & chuyến | Bảng phân bổ: tổ chức nào đặt từ cửa hàng nào, số lượng, trạng thái, phương án ghép, chuyến, tình nguyện viên; bảng chuyến; can thiệp (hủy theo ma trận, gán lại) có lý do + audit | Must | P2 (phân bổ) · P3 (chuyến) |
| F-66 | Phản ánh / vi phạm | `incidents`: tạo bởi cửa hàng/tổ chức/tình nguyện viên/Admin (chất lượng, không đến, sai số lượng, hành vi); xử lý, đóng, ảnh hưởng uy tín; tỷ lệ đã xử lý là chỉ số G | Should | P4 |
| F-67 | Bản đồ hệ thống | Mọi điểm theo trạng thái duyệt; heatmap kg cứu được theo phường; lô đang mở theo nhãn | Must | P4 |
| F-68 | Cấu hình hệ thống | Xem ngưỡng nhãn (`label_rules`, chỉ đọc; đổi qua migration có version — ADR-005) và hệ số tác động (`impact_factors`, chỉ đọc; đổi qua migration + ADR-009); sửa `app_settings` (hạn minh chứng, thời gian giữ chỗ, ngưỡng tự chấp nhận), feature flag AI | Should | P4 |
| F-69 | Quản lý tổ chức | Tìm kiếm, xem hồ sơ, tạm khóa/mở khóa (có lý do), xem lịch sử; tạm khóa hủy thông báo và chặn yêu cầu mới | Should | P4 |
| F-70 | Demo & giám khảo | Seed tương đối theo `now() + interval`; lịch sử 90 ngày sinh bằng RPC thật; **Reset demo** chỉ xóa/tạo lại tổ chức `is_demo`; tài khoản giám khảo theo vai trò (cửa hàng, tổ chức, TNV — **không** cấp tài khoản admin cho giám khảo; vai trò `admin_viewer` chỉ đọc chỉ làm khi BTC yêu cầu, cần ADR riêng); role switcher chỉ cho tài khoản demo | Must | P2 · P6 |

### E10 — PWA Tình nguyện viên

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-71 | Chuyến hôm nay | Danh sách chuyến được giao hôm nay/sắp tới; nhận/từ chối chuyến; chi tiết điểm dừng (cửa hàng, giờ lấy, dòng hàng, ghi chú) | Must | P3 |
| F-72 | Chỉ đường từng chặng | Bản đồ tuyến tới điểm kế tiếp; nút "Mở Google Maps" / "Mở Apple Maps" (deep link kèm waypoint) | Must | P3 |
| F-73 | QR / mã 6 số & xác nhận số lượng | Hiện QR toàn màn hình + mã 6 số (độ sáng cao, giữ màn hình sáng); xác nhận số lượng nhận ở cửa hàng; màn giao về tổ chức | Must | P3 |
| F-74 | Cài đặt PWA | Manifest, icon, Serwist (dự phòng `public/sw.js`), offline shell cho "Chuyến hôm nay" đã tải, gợi ý "Thêm vào màn hình chính" | Must | P0 (spike) · P5 |
| F-75 | Offline action queue | Hàng đợi thao tác khi mất mạng (check-in, xác nhận) có `client_op_id` | Could (cắt #1) | P5 |

### E11 — Công khai / Landing

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-76 | Landing kể chuyện | Hero "Cứu thực phẩm, Bảo vệ hành tinh.", cách hoạt động 4 bước, cho cửa hàng / cho tổ chức, bộ đếm tác động **thật** từ ledger (kg, CO₂e, suất ăn, số lần bàn giao) | Must | P2 (khung) · P4 (bộ đếm) |
| F-77 | Giải thích nhãn | Bảng ngưỡng theo nhóm hàng, ví dụ giờ đóng cửa, ý nghĩa ưu tiên | Must | P2 |
| F-78 | Bản đồ hoạt động ẩn danh | Lưới 500 m hoặc theo phường; không hiện điểm cụ thể của tổ chức; không có dữ liệu cá nhân | Must | P4 |
| F-79 | Trang tác động công khai `/impact` | KPI công khai, chỉ số E/S/G toàn hệ thống, phương pháp + nguồn hệ số, bản đồ hoạt động | Must | P4 |
| F-80 | SEO, metadata, trang lỗi | Metadata Next (title, description, viewport, charset), ảnh OG, sitemap/robots, 404/500 tiếng Việt, kiểm tra link hỏng trong CI | Must | P0 |

### E12 — Trợ lý AI

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-81 | AI ảnh → tự điền lô | Chụp ảnh → Claude vision gợi ý danh mục, tên, số lượng, đơn vị, kg ước tính; người dùng xác nhận/sửa; không tự đăng | Should (giữ, không cắt) | P2 |
| F-82 | AI trích xuất giấy tờ tổ chức | Claude vision đọc giấy phép/quyết định thành lập (Textract không hỗ trợ tiếng Việt) để điền sẵn; Admin vẫn duyệt | Could | P5 |
| F-83 | AI kiểm minh chứng | Gợi ý cho Admin: mô tả khớp ảnh, số người hợp lý, còn mặt chưa làm mờ; chỉ là gợi ý | Could (cắt #7) | P5 |
| F-84 | AI nhận xét báo cáo ESG | Đoạn nhận xét tiếng Việt cho báo cáo tháng, có trích số liệu; người dùng sửa được trước khi in | Could (cắt #7) | P5 |

### E13 — Nền tảng trải nghiệm chung

| ID | Tính năng | Mô tả | Ưu tiên | Phase |
|---|---|---|---|---|
| F-85 | App shell & trạng thái màn hình | Sidebar thu gọn (desktop), bottom tab (mobile), page header thống nhất, trung tâm thông báo, skeleton/empty có CTA/error ở mọi màn (xem DESIGN-SYSTEM) | Must | P0–P2 |
| F-86 | Dark mode, ⌘K, `/dev/ui` | Chế độ tối theo token; bảng lệnh; trang xem component | Could (cắt #3) | P5 |

---

## 6. Bản đồ màn hình & route

> Route prefix là quy ước chung. Tên route con dưới đây là **đề xuất**; `ARCHITECTURE.md` là nơi chốt cấu trúc `src/app/`.

### 6.1 Màn hình theo vai trò

| Vai trò | Màn hình (route đề xuất) | Tính năng |
|---|---|---|
| Khách | `/` Landing · `/impact` Tác động công khai · `/labels` Giải thích nhãn · `/terms`, `/privacy` · `/login` · `/register` | F-76–F-80, F-07, F-01 |
| Onboarding | `/onboarding/store` · `/onboarding/charity` (wizard; trang chờ duyệt / bị từ chối) | F-03–F-07 |
| Cửa hàng | `/store` Tổng quan · `/store/inventory` Kho hàng · `/store/inventory/new` Thêm SP · `/store/connect` Tặng thực phẩm – Kết nối (tab Nhu cầu gần bạn, Yêu cầu nhận lô) · `/store/orders` Đơn hàng cần xử lý · `/store/handover` Bàn giao · `/store/proofs` Minh chứng · `/store/esg` ESG & báo cáo · `/store/settings` Cài đặt hệ thống | F-10, F-15–F-20, F-23, F-27, F-40, F-42, F-48, F-50, F-52 |
| Tổ chức | `/charity` Tổng quan · `/charity/donations` Kho tặng (Donation box) · `/charity/needs` Nhu cầu + phương án ghép · `/charity/pickups` Chuyến & điều phối · `/charity/map` Bản đồ & tuyến · `/charity/volunteers` Tình nguyện viên · `/charity/receive` Nhận hàng (dropoff) · `/charity/proofs` Minh chứng & Gallery · `/charity/esg` ESG & báo cáo · `/charity/settings` Cài đặt tổ chức | F-11, F-21–F-26, F-32–F-36, F-41, F-44–F-48, F-50, F-52 |
| Tình nguyện viên | `/volunteer` Chuyến hôm nay · `/volunteer/trips/[id]` Chi tiết chuyến · `/volunteer/trips/[id]/stops/[stopId]` Điểm dừng + QR · `/volunteer/profile` Hồ sơ & đồng ý | F-71–F-75, F-32, F-37, F-38 |
| Admin | `/admin` Tổng quan & KPI · `/admin/reviews` Hàng đợi duyệt · `/admin/offers` Lô hàng tồn kho · `/admin/allocations` Đơn hàng → Phân bổ · `/admin/pickups` Chuyến · `/admin/proofs` Duyệt minh chứng · `/admin/incidents` Phản ánh · `/admin/audit` Nhật ký hoạt động · `/admin/map` Bản đồ hệ thống · `/admin/esg` ESG hệ thống · `/admin/organizations` Tổ chức & cửa hàng · `/admin/settings` Cấu hình · `/admin/demo` Demo | F-61–F-70, F-47, F-51, F-52 |

### 6.2 Chín màn bản đồ (mục 3b của plan)

| # | Màn | Route | Tính năng bản đồ | F | US | Gate |
|---|---|---|---|---|---|---|
| M-1 | Onboarding cửa hàng/tổ chức | `/onboarding/*` | Tìm địa chỉ có gợi ý, kéo ghim, dùng vị trí hiện tại, tự điền phường/xã; tổ chức kéo thanh bán kính, thấy vòng tròn + số cửa hàng trong vùng | F-05, F-04 | US-STO-02, US-CHA-02 | P1 |
| M-2 | Tổ chức — Kho tặng | `/charity/donations` | Split view; marker theo nhãn + cluster; vòng bán kính; thẻ lô (khoảng cách, ETA xe máy, đếm ngược); lọc nhãn/khoảng cách/thời gian tới | F-21, F-30 | US-CHA-05, US-CHA-06, US-CHA-07 | P2 |
| M-3 | Cửa hàng — Nhu cầu gần bạn | `/store/connect` | Bản đồ nhu cầu; điểm `hidden`/`approximate` chỉ hiện vùng gần đúng | F-27 | US-STO-20 | P3 |
| M-4 | Phương án ghép | `/charity/needs/[id]` | Tổ chức + 2–5 cửa hàng, điểm dừng đánh số, polyline, tổng km/thời gian, so sánh 3 phương án | F-34, F-25 | US-CHA-10 | P3 |
| M-5 | Chuyến lấy hàng (điều phối) | `/charity/pickups/[id]` | Tuyến + trạng thái từng điểm dừng, vị trí TNV (đồng ý, app mở), ETA cập nhật | F-35 | US-CHA-18, US-STO-22 | P3 |
| M-6 | PWA tình nguyện viên | `/volunteer/trips/[id]` | Tuyến tới điểm kế tiếp; deep link Google/Apple Maps; check-in geofence 100 m | F-72, F-37 | US-VOL-05, US-VOL-06 | P3 |
| M-7 | Minh chứng | `/charity/proofs/new` | Mini-map nơi phát thực phẩm (lấy từ máy, sửa tay, hiển thị gần đúng) | F-44 | US-CHA-24 | P4 |
| M-8 | Admin | `/admin/map` | Mọi điểm theo trạng thái duyệt; heatmap kg theo phường; lô mở theo nhãn | F-67 | US-ADM-16 | P4 |
| M-9 | Landing / trang tác động công khai | `/`, `/impact` | Bản đồ hoạt động ẩn danh (lưới 500 m hoặc phường) + bộ đếm | F-78 | US-PUB-04 | P4 |

Thêm: màn **Bản đồ & tuyến** của tổ chức (`/charity/map`, F-36, US-CHA-19) dùng lại thành phần của M-2 và M-5 để hiển thị khoảng cách/ETA từ tổ chức và từ tình nguyện viên.

---

## 7. User stories & tiêu chí nghiệm thu

**Định dạng.** Mỗi story: *Là … tôi muốn … để …* · tính năng (F) · phase · ưu tiên. Tiêu chí nghiệm thu (AC) viết theo **Given / When / Then** (nội dung tiếng Việt); mỗi AC là một kịch bản kiểm thử được (Playwright, pgTAP hoặc Vitest — xem `TESTING.md`). Khanh dùng các AC này làm checklist UAT trong `docs/uat/`.

**Quy ước chung áp dụng cho mọi story (không nhắc lại):**
- Mọi màn có đủ 3 trạng thái: đang tải (skeleton), rỗng (có CTA), lỗi (thông điệp tiếng Việt + "Thử lại").
- Mọi thao tác đổi trạng thái đi qua RPC có `client_op_id`; bấm hai lần không tạo hai bản ghi.
- Mọi thời gian hiển thị theo `Asia/Ho_Chi_Minh`, định dạng vi-VN.
- Mọi nhãn tươi hiển thị icon + chữ, không chỉ màu.
- Người dùng chưa được duyệt, bị từ chối hoặc bị tạm khóa không đọc được dữ liệu nghiệp vụ (RLS), không chỉ bị ẩn trên giao diện.

### 7.1 Khách (PUB)

#### US-PUB-01 · Hiểu FoodSave trong 30 giây
*Là* người xem lần đầu (P5), *tôi muốn* đọc trang chủ thấy ngay FoodSave làm gì và cho ai *để* quyết định đăng ký hoặc tìm hiểu tiếp. · F-76 · P2 · Must
- **AC1** Given tôi mở `/` trên điện thoại 360 px, When trang tải xong, Then màn đầu tiên hiển thị wordmark FOOD/SAVE, tiêu đề "Cứu thực phẩm, Bảo vệ hành tinh.", một câu giá trị và hai nút "Tôi là cửa hàng" và "Tôi là tổ chức" mà không phải cuộn ngang.
- **AC2** Given tôi cuộn trang, When tới mục "Cách hoạt động", Then thấy 4 bước: Cửa hàng đăng lô → Hệ thống ghép → Tình nguyện viên lấy hàng bằng QR → Minh chứng & tác động.
- **AC3** Given trang landing, When kiểm tra bằng Lighthouse mobile, Then Performance, Accessibility, Best Practices, SEO đều ≥ 90 (gate P5).
- **AC4** Given trang landing, Then không có bất kỳ nội dung B2C nào (mua, giá, giảm giá, voucher, ví).

#### US-PUB-02 · Bộ đếm tác động thật
*Là* người xem, *tôi muốn* thấy số kg cứu được, CO₂e tránh được, số suất ăn và số lần bàn giao *để* tin rằng nền tảng đang hoạt động thật. · F-76, F-49 · P4 · Must
- **AC1** Given sổ tác động có dữ liệu, When tôi mở `/`, Then bộ đếm hiển thị tổng từ `impact_ledger` (credit − reversal), định dạng vi-VN (ví dụ "1.234,5 kg"), cập nhật tối thiểu mỗi 10 phút (cache).
- **AC2** Given phần lớn dữ liệu là demo, When bộ đếm hiển thị, Then có nhãn "Dữ liệu demo" và một liên kết "Phương pháp tính" tới `/impact`; khi có pilot thật, số thật và số demo được tách riêng.
- **AC3** Given ledger trống, Then bộ đếm hiển thị "Chưa có dữ liệu — hãy là cửa hàng đầu tiên" thay vì số 0 giả.

#### US-PUB-03 · Hiểu nhãn Xanh/Vàng/Đỏ
*Là* người xem hoặc người dùng mới, *tôi muốn* hiểu ý nghĩa nhãn tươi *để* biết vì sao lô Đỏ được ưu tiên. · F-77 · P2 · Must
- **AC1** Given mục "Nhãn tươi", Then hiển thị bảng ngưỡng ba nhóm hàng đúng với `label_rules` hiện hành (đọc từ DB, không ghi cứng) và ví dụ "bánh hết hạn 24:00, tiệm đóng cửa 21:00 → Đỏ từ 17:00".
- **AC2** Given ngưỡng được đổi bằng một migration có version mới (ADR-005; Admin chỉ xem, không sửa lúc chạy — US-ADM-12), When tôi tải lại trang sau khi deploy, Then bảng hiển thị ngưỡng mới kèm phiên bản.

#### US-PUB-04 · Bản đồ hoạt động ẩn danh
*Là* người xem, *tôi muốn* thấy FoodSave hoạt động ở khu vực nào *để* hiểu phạm vi tác động. · F-78 · P4 · Must
- **AC1** Given có dữ liệu bàn giao, When mở bản đồ trên `/impact` (và khối thu gọn trên `/`), Then dữ liệu được gộp theo ô lưới 500 m (hoặc theo phường khi thu nhỏ), mỗi ô hiển thị số lần bàn giao và kg; không có marker của từng tổ chức.
- **AC2** Given một ô có dưới 3 sự kiện, Then ô đó bị gộp lên mức phường hoặc ẩn (chống suy ngược vị trí).
- **AC3** Given bản đồ, Then tile Goong thể hiện đúng chủ quyền Hoàng Sa – Trường Sa; nếu Goong lỗi thì chuyển OpenFreeMap và ghi nhận lỗi vào Sentry.

#### US-PUB-05 · Trang tác động & KPI công khai
*Là* giám khảo/nhà tài trợ (P5), *tôi muốn* xem KPI và phương pháp tính có nguồn *để* kiểm chứng số liệu. · F-79 · P4 · Must
- **AC1** Given mở `/impact`, Then thấy các chỉ số E/S/G toàn hệ thống của tháng hiện tại và 6 tháng gần nhất, mỗi chỉ số có công thức và nguồn hệ số (phiên bản `impact_factors`).
- **AC2** Given trang `/impact`, Then không hiển thị tên người nhận, ảnh minh chứng hay vị trí chính xác của tổ chức.

#### US-PUB-06 · Điều khoản & bảo mật
*Là* người dùng, *tôi muốn* đọc Điều khoản, Chính sách bảo mật và điều khoản miễn trừ cho bên tặng *để* biết quyền và trách nhiệm. · F-07 · P1 · Must
- **AC1** Given footer mọi trang công khai, When bấm "Điều khoản" hoặc "Chính sách bảo mật", Then mở trang tương ứng (không 404), có số phiên bản và ngày hiệu lực.
- **AC2** Given phiên bản chính sách mới hơn phiên bản tôi đã đồng ý, When tôi đăng nhập, Then được yêu cầu đọc và đồng ý lại trước khi tiếp tục; lần đồng ý ghi vào `consents` với `policy_version`.

#### US-PUB-07 · Đăng ký tài khoản cửa hàng / tổ chức
*Là* chủ cửa hàng hoặc người phụ trách tổ chức, *tôi muốn* đăng ký bằng email *để* bắt đầu onboarding. · F-01, F-02 · P0 · Must
- **AC1** Given `/register`, When tôi chọn loại "Cửa hàng" hoặc "Tổ chức", nhập email + mật khẩu (≥ 8 ký tự) và đồng ý điều khoản, Then hệ thống gửi email xác minh (OTP 6 số) qua domain riêng trong vòng 1 phút.
- **AC2** Given tôi nhập OTP đúng, Then tài khoản được tạo với `platform_role = user` và tôi được chuyển tới `/onboarding/store` hoặc `/onboarding/charity`.
- **AC3** Given ai đó gửi request đăng ký kèm metadata `role = admin`, Then tài khoản tạo ra vẫn là `user`, không có quyền admin (hồi quy B1, pgTAP).
- **AC4** Given trang đăng ký, Then không có lựa chọn "Tình nguyện viên" (chỉ vào qua lời mời) và không có lựa chọn "Khách hàng mua".

#### US-PUB-08 · Đăng nhập & quên mật khẩu
*Là* người dùng đã có tài khoản, *tôi muốn* đăng nhập một nơi duy nhất *để* vào đúng cổng của mình. · F-01, F-02 · P0 · Must
- **AC1** Given `/login`, When đăng nhập đúng, Then được chuyển tới cổng theo membership: cửa hàng → `/store`, tổ chức → `/charity`, tình nguyện viên → `/volunteer`, admin → `/admin` (sau MFA); chưa có tổ chức → onboarding.
- **AC2** Given tổ chức của tôi đang `submitted` (chờ duyệt) hoặc `rejected`, When đăng nhập, Then tôi chỉ thấy trang trạng thái hồ sơ (kèm lý do nếu bị từ chối), không vào được cổng nghiệp vụ, kể cả khi gõ URL trực tiếp (hồi quy L2, L3, L4).
- **AC3** Given tôi bấm "Quên mật khẩu", When nhập email, Then nhận link đặt lại; thông báo trên màn hình giống nhau dù email có tồn tại hay không.
- **AC4** Given đăng nhập sai 5 lần trong 15 phút, Then bị giới hạn tạm thời với thông báo rõ thời gian thử lại (`rate_limits`).

#### US-PUB-09 · Không có link hỏng, metadata đầy đủ
*Là* người xem bấm từ slide/QR/mạng xã hội, *tôi muốn* mọi link hoạt động và chia sẻ có ảnh xem trước *để* không gặp trang lỗi. · F-80 · P0 · Must
- **AC1** Given CI, When chạy kiểm tra link nội bộ trên bản build, Then không có link 404 (hồi quy L1, L12).
- **AC2** Given mọi trang, Then có `<title>`, `meta description`, `viewport`, `charset`, ảnh OG tồn tại (hồi quy L14).
- **AC3** Given URL không tồn tại, Then hiển thị trang 404 tiếng Việt có nút về trang chủ.

### 7.2 Cửa hàng (STO)

#### US-STO-01 · Onboarding tự lưu nháp
*Là* chủ cửa hàng (P1), *tôi muốn* điền hồ sơ theo từng bước và quay lại tiếp tục bất cứ lúc nào *để* không mất dữ liệu khi bị gián đoạn. · F-03 · P1 · Must
- **AC1** Given tôi đang ở bước 2, When tôi đóng trình duyệt và đăng nhập lại, Then wizard mở đúng bước 2 với dữ liệu đã nhập (tự lưu sau mỗi trường hợp lệ, debounce ≤ 2 giây, có chỉ báo "Đã lưu nháp lúc hh:mm").
- **AC2** Given tôi đăng ký lại nhiều lần, Then mỗi chủ tài khoản chỉ có **một** tổ chức nháp loại `store` (ràng buộc unique; hồi quy L5).
- **AC3** Given thiếu trường bắt buộc, When bấm "Tiếp tục", Then trường lỗi được đánh dấu, có thông điệp tiếng Việt cụ thể và focus nhảy tới trường lỗi đầu tiên.
- **AC4** Given bước cuối, When tôi tick cam kết và bấm "Gửi duyệt", Then `organizations.status` chuyển `submitted` (qua RPC), `submitted_at` được ghi, Admin nhận thông báo, tôi thấy trang "Đang chờ duyệt" với thời gian duyệt dự kiến.

#### US-STO-02 · Ghim vị trí cửa hàng
*Là* chủ cửa hàng, *tôi muốn* tìm địa chỉ và kéo ghim đúng cửa tiệm *để* tổ chức và tình nguyện viên đến đúng chỗ. · F-05 · P1 · Must · Màn bản đồ M-1
- **AC1** Given tôi gõ "123 Võ Văn Tần", When gõ ≥ 3 ký tự, Then gợi ý địa chỉ xuất hiện trong ≤ 500 ms (debounce 250 ms) từ Goong Places.
- **AC2** Given tôi chọn gợi ý, Then bản đồ bay tới vị trí, ghim đặt ở đó, phường/xã và tỉnh/thành tự điền; khi tôi kéo ghim, phường/xã cập nhật theo reverse geocode nhưng **tọa độ ghim** là giá trị được lưu.
- **AC3** Given tôi bấm "Dùng vị trí hiện tại" và cho phép định vị, Then ghim đặt ở vị trí máy; nếu từ chối, Then hiển thị hướng dẫn nhập tay, không lỗi.
- **AC4** Given dịch vụ Goong lỗi, Then vẫn kéo ghim được trên tile dự phòng và nhập địa chỉ tay; lỗi được ghi Sentry.

#### US-STO-03 · Giấy tờ được bảo vệ
*Là* chủ cửa hàng, *tôi muốn* tải giấy phép kinh doanh, giấy ATTP và thông tin người đại diện mà chỉ Admin xem được *để* yên tâm không bị lộ. · F-06 · P1 · Must
- **AC1** Given tôi tải lên ảnh/PDF ≤ 10 MB, Then file lưu ở bucket `kyc` private; ảnh được mã hóa lại (xóa EXIF) trước khi tải lên.
- **AC2** Given một người dùng khác (kể cả cửa hàng/tổ chức đã duyệt hoặc khách), When truy vấn `org_sensitive`, `org_documents` hoặc đường dẫn file, Then bị từ chối (hồi quy B3, B4, pgTAP).
- **AC3** Given Admin đã ra quyết định duyệt/từ chối 30 ngày trước, Then file KYC bị xóa tự động; metadata (loại giấy tờ, thời điểm duyệt, người duyệt) còn lại.
- **AC4** Given số CCCD người đại diện, Then hệ thống chỉ lưu 4 số cuối (`id_last4`).

#### US-STO-04 · Biết trạng thái hồ sơ và sửa khi bị từ chối
*Là* chủ cửa hàng, *tôi muốn* biết hồ sơ đang chờ, được duyệt hay bị từ chối kèm lý do *để* sửa và gửi lại. · F-02, F-61 · P1 · Must
- **AC1** Given hồ sơ bị từ chối với lý do "Giấy phép mờ", When tôi đăng nhập, Then thấy lý do, nút "Sửa hồ sơ", và email thông báo đã được gửi.
- **AC2** Given Admin chọn "Cần bổ sung" (`needs_changes`) kèm nội dung cần sửa, Then tôi thấy các trường cần sửa được đánh dấu; khi sửa và gửi lại, trạng thái về `submitted`, lịch sử duyệt giữ nguyên trong audit. Hồ sơ `rejected` là quyết định cuối (đăng ký lại cần liên hệ Admin).
- **AC3** Given hồ sơ được duyệt, Then tôi nhận email + thông báo in-app và lần đăng nhập kế tiếp vào thẳng `/store`.

#### US-STO-05 · Chi nhánh, giờ mở cửa, ngày nghỉ
*Là* chủ cửa hàng có 2 chi nhánh, *tôi muốn* khai báo từng điểm với giờ mở cửa và ngày nghỉ riêng *để* hạn hiệu lực và khung giờ lấy tính đúng. · F-08, F-10 · P1–P2 · Must
- **AC1** Given cài đặt → Chi nhánh, When thêm điểm mới (ghim bản đồ, tên, SĐT liên hệ), Then điểm xuất hiện trong danh sách và trong bộ chọn điểm khi đăng lô.
- **AC2** Given điểm mở 06:00–22:00 thứ Hai–Chủ nhật và ngày 20/11 nghỉ, When đăng lô cho ngày 20/11, Then hệ thống cảnh báo điểm đóng cửa và không cho chọn khung giờ lấy trong ngày đó.
- **AC3** Given điểm mở 18:00–02:00 (qua nửa đêm), Then `closes_next_day = true` và hạn hiệu lực tính tới 02:00 ngày hôm sau.

#### US-STO-06 · Nhân viên theo chi nhánh
*Là* chủ cửa hàng, *tôi muốn* mời nhân viên ca tối chỉ thao tác ở chi nhánh Gia Định *để* họ bàn giao mà không thấy dữ liệu chi nhánh khác. · F-09 · P2 · Should
- **AC1** Given tôi mời email nhân viên với vai trò `staff` và chi nhánh Gia Định, When họ chấp nhận lời mời, Then họ chỉ thấy kho hàng, đơn cần xử lý và màn bàn giao của chi nhánh đó.
- **AC2** Given nhân viên `staff`, Then không truy cập được Cài đặt, ESG và quản lý thành viên.
- **AC3** Given tôi thu hồi quyền, Then phiên tiếp theo của nhân viên không còn truy cập (RLS), thao tác được ghi audit.

#### US-STO-07 · Thêm SP — đăng lô tặng
*Là* chủ cửa hàng, *tôi muốn* đăng lô tặng với số lượng, đơn vị, hạn và khung giờ lấy *để* hệ thống ghép được với tổ chức. · F-15, F-14 · P2 · Must
- **AC1** Given form "Thêm sản phẩm", When tôi chọn danh mục "Bánh mì & bakery", Then đơn vị mặc định "ổ" và kg/đơn vị mặc định của danh mục được điền sẵn, đánh dấu "ước tính theo danh mục" (`weight_source = category_default`).
- **AC2** Given đơn vị không phải kg/lít, When tôi nhập số lượng "12,5", Then báo lỗi "Số lượng phải là số nguyên với đơn vị ổ".
- **AC3** Given tôi chỉ nhập ngày hết hạn (không có giờ), Then `expires_at` được hiểu là 23:59 ngày đó giờ Việt Nam và hiển thị rõ cho tôi.
- **AC4** Given tôi chưa tick "Tôi cam kết thực phẩm còn an toàn để sử dụng và được bảo quản đúng cách", Then nút "Đăng" bị vô hiệu và có giải thích; khi đăng, `safety_attested_at` được ghi.
- **AC5** Given khung giờ lấy kết thúc sau giờ đóng cửa hoặc sau giờ hết hạn, Then báo lỗi và đề xuất khung hợp lệ.
- **AC6** Given tôi bấm "Lưu nháp", Then lô ở `draft`, không phát thông báo.

#### US-STO-08 · Chụp ảnh tự điền (AI)
*Là* chủ tiệm bận rộn, *tôi muốn* chụp ảnh khay bánh để hệ thống tự điền form *để* đăng lô dưới 1 phút. · F-81 · P2 · Should
- **AC1** Given feature flag AI bật, When tôi chụp/tải ảnh trong form Thêm SP, Then trong ≤ 8 giây form được điền gợi ý: danh mục, tên, số lượng, đơn vị, kg ước tính; các trường gợi ý có đánh dấu "AI gợi ý — kiểm tra lại".
- **AC2** Given AI không chắc chắn hoặc lỗi/timeout, Then form vẫn dùng bình thường với thông báo "Không nhận diện được, vui lòng nhập tay".
- **AC3** Given AI gợi ý, Then lô **không** tự đăng; tôi phải xác nhận và tick cam kết an toàn.
- **AC4** Given flag AI tắt, Then nút chụp tự điền không hiển thị.

#### US-STO-09 · Nhãn và hạn hiệu lực khi đăng
*Là* chủ cửa hàng, *tôi muốn* thấy trước nhãn và hạn hiệu lực của lô *để* biết tổ chức sẽ ưu tiên thế nào. · F-16 · P2 · Must
- **AC1** Given bánh (nhóm nấu chín/bánh tươi) hết hạn 24:00, điểm đóng cửa 21:00, lúc đăng 15:00, Then xem trước hiển thị "Hạn hiệu lực 21:00 hôm nay (giờ đóng cửa)", nhãn **Vàng** (còn 6 giờ), và "Chuyển Đỏ lúc 17:00".
- **AC2** Given cùng lô, When thời gian thực tới 17:00, Then nhãn hiển thị **Đỏ** ở mọi màn (tính lúc đọc), không cần cron.
- **AC3** Given hàm TS và hàm SQL, When chạy chung file fixture biên (đúng ngưỡng 4 h, 12 h, 24 h, 72 h, 3 ngày, 7 ngày, qua nửa đêm, ngày nghỉ), Then hai bên cho cùng kết quả (US-SYS-01).

#### US-STO-10 · Kho hàng theo nhãn có đếm ngược
*Là* chủ cửa hàng, *tôi muốn* xem tất cả lô của mình theo nhãn, có đếm ngược *để* xử lý lô Đỏ trước. · F-18 · P2 · Must
- **AC1** Given kho có lô Xanh, Vàng, Đỏ, Then mặc định sắp xếp Đỏ → Vàng → Xanh, trong cùng nhãn theo hạn hiệu lực gần nhất.
- **AC2** Given lô Đỏ, Then thẻ hiển thị đếm ngược "Còn 2 giờ 14 phút" cập nhật mỗi phút (mỗi giây khi < 10 phút), có `aria-live="off"` để không làm phiền trình đọc màn hình.
- **AC3** Given tab "Đang mở", Then mỗi lô hiển thị: đã đăng / đã giữ / đã lấy / còn lại (đúng đơn vị) và kg tương ứng.
- **AC4** Given tôi có 2 chi nhánh, Then có bộ lọc chi nhánh; nhân viên `staff` chỉ thấy chi nhánh được giao.

#### US-STO-11 · Chuyển từ thiện
*Là* chủ cửa hàng, *tôi muốn* bấm "Chuyển từ thiện" *để* thông báo ngay tới các tổ chức phù hợp gần tôi. · F-19, F-56 · P2 · Must
- **AC1** Given lô `draft`, When bấm "Chuyển từ thiện" và xác nhận, Then lô chuyển `open` qua RPC, xuất hiện trong kho tặng của tổ chức đủ điều kiện trong ≤ 5 giây (Realtime).
- **AC2** Given lô mở, Then sự kiện ghi `notification_outbox` một lần; người nhận gồm các tổ chức có điểm nhận chứa cửa hàng trong bán kính, nhận danh mục đó, không tạm ngưng, đến kịp (F-30), sắp theo thứ tự công bằng (F-28), **và Admin**.
- **AC3** Given lô có nhãn Đỏ tại thời điểm mở, Then thông báo gắn mức GẤP (kênh theo ma trận mục 10).
- **AC4** Given không có tổ chức nào đủ điều kiện, Then tôi thấy thông báo "Hiện chưa có tổ chức nào trong phạm vi nhận loại hàng này; lô vẫn hiển thị cho Admin" và lô vẫn mở.

#### US-STO-12 · Sửa, giảm, hủy lô
*Là* chủ cửa hàng, *tôi muốn* sửa hoặc hủy lô khi tình hình thay đổi *để* thông tin luôn đúng. · F-20, F-29 · P2 · Must
- **AC1** Given lô chưa có phân bổ, When sửa bất kỳ trường nào, Then lưu và tính lại `effective_deadline`.
- **AC2** Given lô đã có 20 ổ được giữ, When tôi giảm tổng xuống 15, Then bị chặn với thông báo "Không thể thấp hơn số đã được giữ (20)".
- **AC3** Given lô có phân bổ đã xác nhận nhưng chưa lấy, When tôi hủy lô, Then bắt buộc nhập lý do, các phân bổ bị hủy theo ma trận hủy, tổ chức liên quan được báo, điểm uy tín bị trừ, và nhu cầu liên quan được ghép lại phần thiếu (US-CHA-12).
- **AC4** Given phân bổ đã `picked_up`, Then không hủy được; chỉ có "Báo sự cố" (F-66).

#### US-STO-13 · Duyệt yêu cầu nhận lô
*Là* chủ cửa hàng, *tôi muốn* xem tổ chức nào muốn nhận lô của tôi và chấp nhận/từ chối *để* chủ động người nhận. · F-23, F-27 · P2 · Must
- **AC1** Given tab "Yêu cầu nhận lô" trong "Tặng thực phẩm – Kết nối", Then mỗi yêu cầu hiển thị: tổ chức (tên, loại hình, điểm uy tín, đã duyệt), lô, số lượng, thời gian dự kiến tới, hạn giữ chỗ còn lại.
- **AC2** Given tôi bấm "Chấp nhận", Then phân bổ `requested → confirmed`, tổ chức nhận thông báo, QR/mã cho điểm dừng sẵn sàng.
- **AC3** Given tôi bấm "Từ chối" (bắt buộc chọn lý do), Then phân bổ `rejected`, số lượng trả về lô, tổ chức được báo.
- **AC4** Given tôi không xử lý trước `reserved_until`, Then yêu cầu hết hạn (`expired`), số lượng trả về lô, tổ chức được báo và gợi ý lô khác.

#### US-STO-14 · Tự động chấp nhận
*Là* chủ tiệm không có thời gian duyệt từng yêu cầu, *tôi muốn* bật tự động chấp nhận cho tổ chức đã duyệt *để* lô Đỏ không bị lỡ. · F-23, F-10 · P2 · Must
- **AC1** Given cài đặt điểm "Tự động chấp nhận: Tất cả tổ chức đã duyệt", When có yêu cầu mới, Then phân bổ chuyển `confirmed` ngay trong cùng giao dịch, tôi nhận thông báo "Đã tự động chấp nhận".
- **AC2** Given chế độ "Chỉ tổ chức có điểm uy tín ≥ ngưỡng", When tổ chức dưới ngưỡng yêu cầu, Then yêu cầu vào hàng chờ duyệt thủ công.

#### US-STO-15 · Đơn hàng cần xử lý — theo dõi tiến trình
*Là* chủ cửa hàng, *tôi muốn* xem từng đơn đang chuẩn bị giao nhận với tiến trình rõ ràng *để* biết khi nào ai đến lấy. · F-42 · P2–P3 · Must
- **AC1** Given có phân bổ `confirmed`/`assigned`, Then mỗi đơn hiển thị dòng thời gian: "Tổ chức nhận lúc …" → "Đã xác nhận" → "Phân công: [tên TNV], xe máy" → "Đã đóng gói" → "TNV dự kiến tới hh:mm" → "Đã đến" → "Đã bàn giao".
- **AC2** Given tình nguyện viên đang trên đường, Then tôi chỉ thấy ETA, không thấy vị trí trực tiếp của họ.
- **AC3** Given đơn từ một phương án ghép, Then đơn hiển thị "Một phần của nhu cầu 50 bánh — Mái ấm Nắng Mai" để tôi hiểu bối cảnh.
- **AC4** Given không có đơn, Then trạng thái rỗng "Chưa có đơn cần xử lý" kèm nút "Thêm sản phẩm".

#### US-STO-16 · Đánh dấu đã đóng gói
*Là* nhân viên cửa hàng, *tôi muốn* bấm "Đã đóng gói" *để* tổ chức và tình nguyện viên biết hàng sẵn sàng. · F-42 · P2 · Must
- **AC1** Given đơn `confirmed` hoặc `assigned`, When bấm "Đã đóng gói", Then RPC `mark_allocation_packed` ghi `allocations.packed_at` (DATA-MODEL 2.3, 8.4), tổ chức và TNV được báo in-app (sự kiện `allocation_packed`, N-13).
- **AC2** Given đã đóng gói, Then nút đổi thành "Đã đóng gói lúc hh:mm" và có thể hoàn tác trong 2 phút (`mark_allocation_packed(..., p_packed => false)` xóa `packed_at`).

#### US-STO-17 · Bàn giao — quét QR hoặc nhập mã
*Là* nhân viên cửa hàng, *tôi muốn* quét QR trên điện thoại tình nguyện viên hoặc nhập mã 6 số *để* chắc chắn giao đúng người. · F-40, F-39 · P2 · Must
- **AC1** Given màn "Bàn giao" toàn màn hình, When tôi quét QR hợp lệ, Then hiển thị đúng tổ chức, tình nguyện viên (tên + ảnh đại diện nếu có), và danh sách dòng của điểm dừng này.
- **AC2** Given camera bị từ chối hoặc không đọc được, When tôi nhập mã 6 số, Then kết quả như quét QR.
- **AC3** Given token đã dùng, hết hạn, hoặc thuộc cửa hàng khác, Then báo lỗi rõ ràng ("Mã đã được sử dụng lúc hh:mm") và không ghi gì; nhập sai 5 lần bị khóa tạm 5 phút.
- **AC4** Given quét hai lần liên tiếp cùng mã (mạng chập chờn), Then chỉ một `handover` được ghi (`client_op_id`).

#### US-STO-18 · Đối soát từng dòng & thiếu hàng
*Là* nhân viên cửa hàng, *tôi muốn* nhập số thực giao cho từng dòng và lý do nếu thiếu *để* số liệu khớp thực tế. · F-40, F-29 · P2 · Must
- **AC1** Given dòng đặt 20 ổ, When tôi nhập giao 18 và chọn lý do `store_short`, Then `qty_picked = 18`, `shortfall_reason = store_short`; 2 ổ thiếu **không** trả về lô.
- **AC2** Given tình nguyện viên từ chối 3 hộp sữa vì móp, Then dòng ghi `quality_reject`, số này không trả về lô.
- **AC3** Given tình nguyện viên chỉ chở được 15/20 kg, Then dòng ghi `capacity`; phần dư trả về lô **chỉ khi** còn trước hạn hiệu lực.
- **AC4** Given tôi xác nhận và tình nguyện viên xác nhận trên máy họ, Then bàn giao `pickup` hoàn tất, phân bổ `picked_up`, tổ chức được báo; nếu đây là tự đến lấy thì đồng thời là dropoff và ghi sổ tác động (US-SYS-07).
- **AC5** Given ràng buộc `qty_reserved ≥ qty_picked ≥ qty_delivered`, When nhập số lớn hơn số đặt, Then bị chặn.

#### US-STO-19 · Hủy sau khi đã xác nhận
*Là* chủ cửa hàng gặp sự cố (hàng hỏng), *tôi muốn* hủy phân bổ đã xác nhận *để* tổ chức không đến vô ích. · F-29, F-12 · P3 · Must
- **AC1** Given phân bổ `confirmed`/`assigned`, When tôi hủy, Then bắt buộc chọn lý do, tổ chức và TNV được báo ngay (GẤP nếu chuyến đang chạy), điểm uy tín của cửa hàng bị trừ theo bảng điểm cố định (−5, DATA-MODEL `trust_events`).
- **AC2** Given phân bổ thuộc một phương án ghép, Then hệ thống tự chạy ghép lại phần thiếu và báo tổ chức các lựa chọn mới.

#### US-STO-20 · Nhu cầu gần bạn (bản đồ)
*Là* chủ cửa hàng, *tôi muốn* xem tổ chức gần tôi đang cần gì trên bản đồ *để* chủ động tặng đúng nhu cầu. · F-27 · P3 · Must · Màn bản đồ M-3
- **AC1** Given tab "Nhu cầu gần bạn", Then hiển thị bản đồ + danh sách nhu cầu `open`/`partially_matched` của các tổ chức mà điểm cửa hàng nằm trong bán kính phục vụ của họ; mỗi nhu cầu có danh mục, số còn thiếu, cần trước, khoảng cách.
- **AC2** Given điểm nhận `approximate`, Then hiển thị vòng tròn gần đúng (bán kính ≥ 500 m, tâm lệch ngẫu nhiên ổn định) thay vì ghim; `hidden` thì chỉ hiện tên phường, không có hình trên bản đồ.
- **AC3** Given tôi lọc theo danh mục tôi thường có, Then danh sách và bản đồ đồng bộ.

#### US-STO-21 · Phản hồi nhu cầu
*Là* chủ cửa hàng, *tôi muốn* đáp ứng một nhu cầu bằng lô có sẵn hoặc lô mới *để* giúp tổ chức đủ số lượng. · F-27, F-25 · P3 · Must
- **AC1** Given nhu cầu "50 bánh" còn thiếu 30, When tôi bấm "Đáp ứng", Then được chọn lô đang mở cùng danh mục hoặc "Tạo lô mới" với form điền sẵn danh mục và số lượng gợi ý.
- **AC2** Given tôi đã đáp ứng, Then tổ chức nhận thông báo "Cửa hàng X có thể đáp ứng 18 bánh", engine ghép chạy lại cho nhu cầu đó, và yêu cầu nhận lô từ tổ chức này trên lô tôi vừa chọn được tự động chấp nhận.
- **AC3** Given nhu cầu đã `matched`, Then nút "Đáp ứng" bị vô hiệu với giải thích.

#### US-STO-22 · Xem ETA tình nguyện viên
*Là* nhân viên cửa hàng, *tôi muốn* biết bao giờ tình nguyện viên tới *để* chuẩn bị hàng đúng lúc. · F-35, F-42 · P3 · Must · Màn bản đồ M-5 (giới hạn)
- **AC1** Given chuyến đang chạy có điểm dừng tại cửa hàng tôi, Then thấy "Dự kiến tới 18:40 (còn 12 phút)" cập nhật khi TNV check-in điểm trước đó.
- **AC2** Given bất kỳ trường hợp nào, Then cửa hàng không truy vấn được tọa độ tình nguyện viên (RLS, pgTAP).

#### US-STO-23 · Xem minh chứng & gửi lời cảm ơn
*Là* chủ cửa hàng, *tôi muốn* xem ảnh minh chứng thực phẩm mình tặng đã được dùng *để* yên tâm và chia sẻ với khách hàng. · F-48 · P4 · Must
- **AC1** Given minh chứng liên quan lô của tôi được Admin duyệt, Then tôi nhận thông báo và thấy nó trong `/store/proofs` (ảnh đã làm mờ, mô tả, số người, thời gian, khu vực gần đúng).
- **AC2** Given minh chứng chưa duyệt, `needs_changes` hoặc `rejected`, Then tôi không thấy (RLS).
- **AC3** Given tôi bấm "Gửi lời cảm ơn" và viết tối đa 500 ký tự, Then một dòng `thank_you_notes` được tạo (gắn minh chứng hoặc phân bổ) và tổ chức nhận thông báo loại "Lời cảm ơn" (sự kiện `thank_you_received`, N-29).
- **AC4** Given minh chứng không liên quan lô của tôi, Then không truy cập được kể cả bằng URL trực tiếp.

#### US-STO-24 · Dashboard ESG của cửa hàng
*Là* chủ cửa hàng, *tôi muốn* xem kg đã cứu, CO₂e, nước, suất ăn và các chỉ số của mình *để* đo đóng góp. · F-50 · P4 · Must
- **AC1** Given `/store/esg`, Then hiển thị theo tháng (mặc định tháng hiện tại) các chỉ số E (kg cứu, CO₂e, nước, tỷ lệ lô hết hạn chưa nhận), S (suất ăn, số người được hỗ trợ từ minh chứng liên quan, số tổ chức đã nhận), G (tỷ lệ lô có minh chứng hợp lệ).
- **AC2** Given mỗi chỉ số, Then có tooltip "Cách tính" ghi công thức + phiên bản hệ số + nguồn.
- **AC3** Given số liệu của tôi khớp tổng ledger theo `store_org_id` trong tháng (unit test so với ESG-METHODOLOGY), Then dashboard và báo cáo tháng trùng nhau đến 0,1 kg.

#### US-STO-25 · Báo cáo tháng CSR
*Là* chủ cửa hàng / trưởng phòng CSR, *tôi muốn* in hoặc xuất báo cáo tháng *để* đưa vào báo cáo CSR và truyền thông. · F-52 · P4 · Must
- **AC1** Given `/store/esg/report?month=2026-11`, When bấm "In / Lưu PDF", Then bản in A4 sạch (không sidebar, không nút), có logo FoodSave, tên cửa hàng, kỳ báo cáo, bảng chỉ số, biểu đồ, danh sách bàn giao, phương pháp & nguồn, ngày xuất.
- **AC2** Given bấm "Tải CSV", Then nhận file dữ liệu các dòng bàn giao trong tháng (UTF-8 có BOM để Excel đọc đúng tiếng Việt).
- **AC3** Given ngày 1 hằng tháng, Then chủ cửa hàng nhận email "Báo cáo tác động tháng …" có link (nếu bật trong tùy chọn thông báo).

#### US-STO-26 · Bảng xếp hạng Xanh (tùy chọn)
*Là* chủ cửa hàng, *tôi muốn* chủ động tham gia Bảng xếp hạng Xanh *để* được ghi nhận công khai. · F-53 · P4 · Could (cắt #5)
- **AC1** Given mặc định, Then cửa hàng **không** xuất hiện trên bảng xếp hạng; chỉ xuất hiện khi bật "Tham gia Bảng xếp hạng Xanh" trong cài đặt.
- **AC2** Given bảng xếp hạng, Then xếp theo kg cứu được trong tháng, chỉ hiển thị tên cửa hàng và phường.

#### US-STO-27 · Cài đặt hệ thống — hồ sơ cửa hàng
*Là* chủ cửa hàng, *tôi muốn* hoàn thiện và cập nhật thông tin cửa hàng *để* tổ chức và Admin có thông tin đúng. · F-10 · P2 · Must
- **AC1** Given `/store/settings`, Then có các mục: Hồ sơ cửa hàng · Chi nhánh & giờ mở cửa · Ngày nghỉ · Nhân viên · Duyệt yêu cầu · Thông báo · Bảng xếp hạng Xanh.
- **AC2** Given tôi sửa tên hiển thị, SĐT, ảnh đại diện/ảnh bìa (bucket `media` public), Then lưu ngay với toast "Đã lưu".
- **AC3** Given tôi sửa trường **không** pháp lý (mô tả, logo, giờ mở cửa, liên hệ, cài đặt), Then lưu ngay, **không** kích hoạt duyệt lại.
- **AC4** Given tôi sửa trường pháp lý/đã xác minh (tên pháp nhân, mã số thuế/số đăng ký, người đại diện, giấy tờ pháp lý), Then hệ thống tạo một yêu cầu thay đổi (`org_change_requests`, RPC `submit_org_change_request` — DATA-MODEL 6.8) chờ Admin duyệt; cửa hàng **vẫn ở `approved` và hoạt động bình thường** trong lúc chờ; giá trị mới chỉ được áp dụng khi Admin duyệt (`review_org_change_request`); bị từ chối thì giữ nguyên giá trị cũ và tôi thấy lý do.
- **AC5** Given chủ hồ sơ, Then không sửa được `status`, `trust_score`, `reviewed_by`, `is_demo` (hồi quy B2, B6).

#### US-STO-28 · Tùy chọn thông báo cửa hàng
*Là* chủ cửa hàng, *tôi muốn* chọn loại thông báo và kênh *để* không bị làm phiền. · F-59 · P3 · Must
- **AC1** Given trang Thông báo, Then có ma trận loại (Yêu cầu nhận lô mới, Nhu cầu mới gần bạn, TNV sắp tới, Minh chứng mới, Lời cảm ơn, Báo cáo tháng) × kênh (Trong app, Email, Push).
- **AC2** Given thông báo bảo mật và quyết định duyệt hồ sơ, Then không tắt được (khóa với chú thích).

#### US-STO-29 · Lô hết hạn chưa được nhận
*Là* chủ cửa hàng, *tôi muốn* biết lô nào hết hạn mà chưa ai nhận *để* điều chỉnh lượng và giờ đăng. · F-17, F-20 · P2 · Must
- **AC1** Given lô quá hạn hiệu lực, Then tác vụ định kỳ đóng lô `expired`, ghi `qty_unclaimed`, tôi nhận thông báo "Lô … đã hết hạn, 12 ổ chưa được nhận".
- **AC2** Given tab "Hết hạn/Đã hủy", Then thấy lô với số chưa nhận; số này vào chỉ số "Tỷ lệ hàng hết hạn chưa được nhận".

### 7.3 Tổ chức (CHA)

#### US-CHA-01 · Onboarding tổ chức tự lưu nháp
*Là* người phụ trách tổ chức (P2), *tôi muốn* đăng ký theo từng bước, lưu nháp tự động *để* hoàn thành dần khi có thời gian. · F-04, F-06, F-07 · P1 · Must
- **AC1** Given wizard tổ chức, Then 4 bước: Thông tin tổ chức → Điểm nhận → Người đại diện & giấy tờ → Cam kết & gửi duyệt; tự lưu như US-STO-01.
- **AC2** Given bước 1, Then loại hình chọn từ: Mái ấm trẻ em, Bếp ăn từ thiện, Nhà mở/Tạm lánh, Viện dưỡng lão, Trung tâm khuyết tật, Cộng đồng tôn giáo, Khác (ghi rõ); có ngày thành lập, mã số tổ chức (nếu có), email, SĐT, số người phục vụ trung bình/ngày.
- **AC3** Given gửi duyệt, Then trạng thái `submitted`, Admin được báo, tôi thấy trang chờ duyệt.

#### US-CHA-02 · Bán kính phục vụ trên bản đồ
*Là* người phụ trách tổ chức, *tôi muốn* kéo thanh bán kính và thấy vòng tròn cùng số cửa hàng trong vùng *để* chọn phạm vi phù hợp với khả năng đi lấy. · F-04, F-05 · P1 · Must · Màn bản đồ M-1
- **AC1** Given đã ghim điểm nhận, When kéo thanh bán kính 0,5–30 km (bước 0,5 km, mặc định 5 km; có ô số nhập trực tiếp), Then vòng tròn trên bản đồ cập nhật tức thì (turf.js) và dòng "Có 12 cửa hàng đã duyệt trong bán kính 5 km" cập nhật sau ≤ 500 ms (PostGIS `ST_DWithin`).
- **AC2** Given bán kính được lưu theo từng điểm nhận (`sites.radius_km`), Then thay đổi có hiệu lực cho thông báo và kho tặng ngay sau khi lưu.
- **AC3** Given chưa có cửa hàng nào trong vùng, Then hiển thị "Chưa có cửa hàng trong bán kính — FoodSave sẽ báo khi có" thay vì số 0 trơ trọi.

#### US-CHA-03 · Ẩn vị trí mái ấm / nơi tạm lánh
*Là* người phụ trách mái ấm trẻ em, *tôi muốn* vị trí chính xác không hiển thị cho người khác *để* bảo vệ trẻ. · F-04 · P1 · Must
- **AC1** Given chọn chế độ hiển thị `approximate`, Then cửa hàng và khách chỉ thấy vùng gần đúng (vòng ≥ 500 m); `hidden` thì chỉ thấy tên phường.
- **AC2** Given loại hình "Nhà mở/Tạm lánh", Then mặc định chế độ `hidden` (có thể đổi).
- **AC3** Given bất kỳ chế độ nào, Then tình nguyện viên **của chính tổ chức** thấy vị trí chính xác điểm giao (để giao hàng); cửa hàng không thấy tọa độ chính xác qua API (RLS/view, pgTAP).

#### US-CHA-04 · Giấy tờ tổ chức (và AI trích xuất tùy chọn)
*Là* người phụ trách tổ chức, *tôi muốn* tải quyết định thành lập/giấy phép và được điền sẵn thông tin *để* đăng ký nhanh. · F-06, F-82 · P1 (tải) · P5 (AI) · Must / Could
- **AC1** Given tải giấy tờ, Then lưu private như US-STO-03.
- **AC2** Given flag AI bật, When tải giấy phép, Then tên tổ chức, mã số, ngày cấp được gợi ý điền sẵn kèm nhãn "AI gợi ý"; Admin vẫn duyệt bằng mắt.

#### US-CHA-05 · Kho tặng: bản đồ + danh sách
*Là* điều phối viên tổ chức, *tôi muốn* xem lô tặng gần tôi trên bản đồ và danh sách cùng lúc *để* chọn nhanh lô phù hợp. · F-21, F-31 · P2 · Must · Màn bản đồ M-2
- **AC1** Given desktop ≥ 1024 px, Then split view: bản đồ bên phải, danh sách bên trái, cuộn danh sách làm nổi marker tương ứng và ngược lại; mobile dùng nút chuyển "Bản đồ / Danh sách".
- **AC2** Given các lô đang mở trong bán kính điểm nhận, Then marker cửa hàng tô màu theo **nhãn gấp nhất** của cửa hàng đó, có icon trong marker; nhiều marker gần nhau gom cluster có số đếm; vòng bán kính hiển thị.
- **AC3** Given bấm marker, Then thẻ lô hiện: tên cửa hàng, danh mục, số còn lại + đơn vị, kg, nhãn + đếm ngược, khoảng cách, ETA xe máy, khung giờ lấy, nút "Yêu cầu nhận".
- **AC4** Given tổ chức đang tạm ngưng (US-CHA-37) hoặc chưa duyệt, Then không truy vấn được lô (hồi quy B8).
- **AC5** Given bản đồ lazy-load, Then danh sách hiển thị trước, bản đồ tải sau mà không chặn tương tác.

#### US-CHA-06 · Lọc và ưu tiên lô Đỏ, Vàng
*Là* điều phối viên, *tôi muốn* lọc theo nhãn, khoảng cách, thời gian tới và danh mục *để* ưu tiên lô sắp hết hạn. · F-21 · P2 · Must
- **AC1** Given mặc định, Then sắp xếp Đỏ → Vàng → Xanh, cùng nhãn thì gần trước.
- **AC2** Given lọc "Chỉ Đỏ + Vàng", "≤ 3 km", "Tới trong ≤ 30 phút", Then danh sách và bản đồ cùng cập nhật, URL giữ tham số lọc (chia sẻ được).
- **AC3** Given lọc không có kết quả, Then trạng thái rỗng gợi ý nới bộ lọc hoặc "Đăng nhu cầu" để hệ thống tìm giúp.

#### US-CHA-07 · Chỉ gợi ý lô Đỏ khi đến kịp
*Là* điều phối viên, *tôi muốn* hệ thống không gợi ý lô Đỏ mà tôi không thể đến kịp *để* tránh đi vô ích. · F-30 · P2 · Must
- **AC1** Given lô Đỏ còn 40 phút và cửa hàng cách 12 km (ước tính 12 × 1,4 ÷ 18 × 60 + 10 ≈ 66 phút), Then lô không xuất hiện trong gợi ý mặc định và tổ chức không nhận thông báo GẤP cho lô đó.
- **AC2** Given tôi bật "Hiện cả lô không kịp", Then lô xuất hiện mờ với nhãn "Không kịp tới" và nút "Yêu cầu nhận" bị vô hiệu.
- **AC3** Given giờ đến dự kiến nằm ngoài giờ nhận của điểm nhận, Then lô bị coi là không khả thi với lý do hiển thị.

#### US-CHA-08 · Yêu cầu nhận lô
*Là* điều phối viên, *tôi muốn* yêu cầu nhận một phần hoặc toàn bộ lô *để* cửa hàng chuẩn bị. · F-22 · P2 · Must
- **AC1** Given lô còn 30 ổ, When tôi yêu cầu 20, Then RPC giữ chỗ nguyên tử: phân bổ `requested` với `reserved_until`, số khả dụng của lô còn 10 ngay lập tức cho mọi người.
- **AC2** Given hai tổ chức cùng yêu cầu 20 trên lô còn 30 trong cùng một giây, Then đúng một yêu cầu được 20, yêu cầu còn lại nhận lỗi "Chỉ còn 10" và được đề xuất nhận 10 (test đồng thời).
- **AC3** Given cửa hàng chấp nhận (thủ công hoặc tự động), Then tôi nhận thông báo và có thể "Tự đến lấy" (P2) hoặc "Tạo chuyến" (P3).
- **AC4** Given tôi hủy trước khi lấy, Then số lượng trả về lô, cửa hàng được báo, không trừ uy tín nếu hủy trước khi cửa hàng xác nhận.

#### US-CHA-09 · Đăng nhu cầu
*Là* điều phối viên, *tôi muốn* đăng "cần 50 bánh trước 15:00 thứ Bảy" *để* hệ thống tự tìm từ nhiều cửa hàng. · F-24, F-56 · P3 · Must
- **AC1** Given form nhu cầu, Then nhập: danh mục (cho phép chọn nhiều danh mục thay thế được, ví dụ "Bánh mì & bakery" hoặc "Bánh ngọt & dessert"), số lượng + đơn vị, cần trước (ngày giờ), điểm nhận, ghi chú.
- **AC2** Given đăng thành công, Then nhu cầu `open`, sự kiện thông báo gửi tới cửa hàng nằm trong bán kính của điểm nhận có danh mục phù hợp **và Admin**, và engine ghép chạy ngay.
- **AC3** Given `needed_by` ở quá khứ hoặc sau 7 ngày, Then báo lỗi.

#### US-CHA-10 · Xem tối đa 3 phương án ghép trên bản đồ
*Là* điều phối viên, *tôi muốn* thấy tối đa 3 phương án lấy hàng từ nhiều cửa hàng trên bản đồ *để* chọn phương án tốt nhất. · F-25, F-34 · P3 · Must · Màn bản đồ M-4
- **AC1** Given nhu cầu 50 bánh và các lô: A 20, B 18, C 12, D 25 (xa), Then phương án 1 = A 20 + B 18 + C 12 (phủ đủ, 3 điểm dừng) được xếp đầu nếu tuyến ngắn hơn phương án có D; mỗi phương án ghi: số cửa hàng, tổng số lượng / cần, tổng km, thời gian, số lô Đỏ.
- **AC2** Given bấm một phương án, Then bản đồ vẽ điểm tổ chức + điểm dừng đánh số 1, 2, 3 + polyline tuyến (ước tính bằng đường chim bay × 1,4 cho phương án chưa chọn; tuyến thật sau khi chọn), có thể so sánh 3 phương án cạnh nhau (desktop) hoặc vuốt (mobile).
- **AC3** Given không đủ hàng, Then phương án tốt nhất hiển thị "Đáp ứng 38/50 — thiếu 12" và gợi ý giữ nhu cầu mở để ghép thêm khi có lô mới.
- **AC4** Given engine, Then thời gian tính phương án ≤ 1 giây với 15 ứng viên (đo trong test).

#### US-CHA-11 · Chọn phương án → giữ chỗ nguyên tử
*Là* điều phối viên, *tôi muốn* bấm "Chọn phương án này" *để* giữ hàng ở tất cả cửa hàng cùng lúc. · F-26 · P3 · Must
- **AC1** Given chọn phương án 1, Then `reserve_bundle()` khóa các lô theo `ORDER BY id`, tạo 3 phân bổ `requested` trong **một giao dịch**; nếu một lô không còn đủ thì cả giao dịch rollback và hệ thống tính lại phương án.
- **AC2** Given cửa hàng A và B chấp nhận, C chưa, Then bundle `partially_confirmed`; khi C chấp nhận → `confirmed`.
- **AC3** Given nhu cầu, Then trạng thái tính từ tổng: đặt + giao ≥ cần → `matched`; giao ≥ cần → `fulfilled`.

#### US-CHA-12 · Ghép lại phần thiếu
*Là* điều phối viên, *tôi muốn* hệ thống tự tìm phần còn thiếu khi một cửa hàng từ chối hoặc giao thiếu *để* vẫn đủ 50 bánh. · F-26, F-29 · P3 · Must
- **AC1** Given cửa hàng C từ chối 12 bánh, Then hệ thống chỉ ghép lại **12** (không đụng tới A, B) và báo tôi phương án bổ sung.
- **AC2** Given không còn lô phù hợp, Then nhu cầu giữ `partially_matched`, tôi được báo "Thiếu 12 — sẽ tiếp tục tìm khi có lô mới"; khi lô mới phù hợp mở, nhu cầu được ghép lại tự động thành đề xuất (cần tôi xác nhận).
- **AC3** Given đến `needed_by`, Then nhu cầu đóng `closed_partial` (nếu đã giao một phần) hoặc `expired`.

#### US-CHA-13 · Theo dõi nhu cầu
*Là* điều phối viên, *tôi muốn* xem tiến độ mỗi nhu cầu *để* biết đã đủ chưa. · F-24 · P3 · Must
- **AC1** Given danh sách nhu cầu, Then mỗi dòng có thanh tiến độ ba lớp: đã giao / đã giữ / còn thiếu, và trạng thái bằng chữ.
- **AC2** Given tôi hủy nhu cầu chưa có hàng lấy, Then các phân bổ chưa lấy được hủy theo ma trận hủy, số lượng trả về lô.

#### US-CHA-14 · Mời tình nguyện viên
*Là* điều phối viên, *tôi muốn* mời tình nguyện viên qua email *để* họ dùng PWA nhận chuyến. · F-32, F-01 · P3 · Must
- **AC1** Given nhập email + tên, Then hệ thống gửi email mời (link hết hạn 7 ngày); trạng thái "Đã mời" trong danh sách.
- **AC2** Given người được mời bấm link, Then tạo tài khoản (hoặc đăng nhập) và trở thành `org_members.role = volunteer` của tổ chức tôi, không cần Admin duyệt.
- **AC3** Given lời mời hết hạn, Then có nút "Gửi lại".

#### US-CHA-15 · Hồ sơ tình nguyện viên
*Là* điều phối viên, *tôi muốn* xem phương tiện, sức chở, khu vực của từng tình nguyện viên *để* phân công phù hợp. · F-32 · P3 · Must
- **AC1** Given danh sách TNV, Then mỗi người có: tên, phương tiện (xe máy, xe đạp, ô tô, đi bộ), sức chở (kg), khu vực gần đúng (phường/xã), trạng thái đồng ý vị trí, số chuyến đã hoàn thành.
- **AC2** Given tôi tạm ngưng một TNV, Then họ không được gợi ý cho chuyến mới.

#### US-CHA-16 · Tạo chuyến & phân công (ví dụ 50 bánh, 2 tình nguyện viên)
*Là* điều phối viên, *tôi muốn* chia các phân bổ cho nhiều tình nguyện viên *để* mỗi người đi một tuyến hợp lý. · F-33 · P3 · Must
- **AC1** Given bundle 50 bánh đã xác nhận ở A (20), B (18), C (12), When tôi tạo chuyến 1 gồm A + B giao cho TNV Khoa và chuyến 2 gồm C giao cho TNV Vy, Then hai `pickups` được tạo, mỗi phân bổ chuyển `assigned`, mỗi TNV nhận thông báo.
- **AC2** Given chọn điểm dừng, Then hệ thống gợi ý TNV theo thứ tự: gần cửa hàng đầu tiên nhất (theo khu vực gần đúng), đủ sức chở (Σ kg ≤ `capacity_kg`), đang không có chuyến trùng giờ.
- **AC3** Given tổng kg vượt sức chở, Then cảnh báo và đề xuất tách chuyến.
- **AC4** Given TNV từ chối chuyến, Then tôi được báo và chuyến về trạng thái chờ phân công.

#### US-CHA-17 · Tối ưu thứ tự điểm dừng & tuyến
*Là* điều phối viên, *tôi muốn* hệ thống tự sắp thứ tự lấy hàng *để* đi ngắn nhất mà vẫn kịp lô Đỏ. · F-33 · P3 · Must
- **AC1** Given chuyến ≤ 5 điểm dừng, Then hệ thống thử mọi hoán vị, chọn thứ tự có tổng thời gian nhỏ nhất **thỏa** mọi điểm được tới trước hạn hiệu lực của lô tại đó; điểm cuối là điểm giao về tổ chức.
- **AC2** Given thứ tự đã chọn, Then gọi Goong Directions (`vehicle=bike`) **một lần** cho tuyến này, lưu geometry tuyến, tổng km, ETA từng điểm.
- **AC3** Given tôi kéo thả đổi thứ tự, Then ETA tính lại và cảnh báo nếu một điểm trễ hạn.

#### US-CHA-18 · Bản đồ điều phối chuyến
*Là* điều phối viên, *tôi muốn* theo dõi chuyến trên bản đồ *để* can thiệp khi có trễ. · F-35 · P3 · Must · Màn bản đồ M-5
- **AC1** Given chuyến đang chạy, Then bản đồ hiển thị tuyến, điểm dừng đánh số với trạng thái (chưa tới, đã đến, đã lấy, bỏ qua), ETA cập nhật sau mỗi check-in.
- **AC2** Given TNV đã đồng ý chia sẻ vị trí và đang mở app (P5, F-38), Then hiển thị vị trí gần đúng mới nhất kèm "cập nhật x phút trước"; nếu không, chỉ hiển thị điểm check-in gần nhất.
- **AC3** Given một điểm dừng trễ hơn ETA 15 phút, Then đánh dấu cảnh báo và gợi ý gọi TNV (nút gọi điện `tel:`).

#### US-CHA-19 · Bản đồ & tuyến: khoảng cách và thời gian
*Là* điều phối viên, *tôi muốn* thấy khoảng cách và thời gian ước tính từ tổ chức và từ từng tình nguyện viên tới các cửa hàng *để* phân công nhanh. · F-36 · P3 · Must
- **AC1** Given `/charity/map`, Then bảng + bản đồ hiển thị với mỗi cửa hàng có lô/phân bổ: khoảng cách và ETA xe máy từ điểm nhận, và từ từng TNV đang hoạt động (dựa trên khu vực gần đúng hoặc check-in gần nhất, ghi rõ nguồn).
- **AC2** Given số cặp lớn, Then dùng Distance Matrix một lần cho tối đa 10 × 10 cặp, kết quả cache 10 phút.

#### US-CHA-20 · Tự đến lấy
*Là* nhân viên tổ chức đi lấy trực tiếp, *tôi muốn* hiện QR ở cửa hàng mà không cần tạo chuyến TNV *để* xong nhanh. · F-39, F-41 · P2 · Must
- **AC1** Given phân bổ `confirmed`, When chọn "Tự đến lấy", Then hệ thống tạo chuyến tự lấy và hiển thị QR + mã 6 số trên điện thoại của tôi.
- **AC2** Given cửa hàng quét và đối soát, Then sự kiện bàn giao được ghi **một lần** đóng vai trò cả lấy và giao; phân bổ `delivered`; ledger được ghi; minh chứng đến hạn sau 48 giờ.

#### US-CHA-21 · Xác nhận nhận hàng (dropoff)
*Là* điều phối viên tại tổ chức, *tôi muốn* quét QR trên điện thoại tình nguyện viên khi họ về *để* xác nhận số lượng thực nhận. · F-41 · P3 · Must
- **AC1** Given TNV mở màn "Giao về tổ chức", When tôi quét QR dropoff (hoặc nhập mã), Then hiển thị các dòng đã lấy của chuyến với số `qty_picked`.
- **AC2** Given tôi nhập số nhận từng dòng (≤ đã lấy), và có thể từ chối dòng vì chất lượng (`quality_reject`), Then phân bổ `delivered`, `qty_delivered` ghi đúng, ledger ghi credit cho phần nhận (US-SYS-07).
- **AC3** Given dropoff xong, Then cửa hàng liên quan nhận thông báo "Hàng đã tới Mái ấm Nắng Mai" và minh chứng đến hạn sau 48 giờ.

#### US-CHA-22 · Hủy trước khi lấy
*Là* điều phối viên, *tôi muốn* hủy phân bổ khi không còn cần *để* cửa hàng tặng cho tổ chức khác. · F-29 · P3 · Must
- **AC1** Given phân bổ `requested`/`confirmed`/`assigned` chưa lấy, When hủy (chọn lý do), Then số lượng trả về lô (nếu trước hạn hiệu lực), cửa hàng và TNV được báo.
- **AC2** Given hủy sau khi cửa hàng đã đóng gói (`packed_at` có giá trị), Then điểm uy tín tổ chức bị trừ theo bảng điểm cố định (−2, `charity_cancel_after_packed`, DATA-MODEL `trust_events`).

#### US-CHA-23 · Tình nguyện viên không đến
*Là* điều phối viên, *tôi muốn* xử lý khi TNV không đến *để* hàng vẫn được lấy. · F-29 · P3 · Must
- **AC1** Given tôi (hoặc cửa hàng) báo "TNV không đến", Then chuyến bị hủy, các phân bổ chưa lấy trở về `confirmed`, tôi được gợi ý phân công TNV khác hoặc "Tự đến lấy".
- **AC2** Given đã quá hạn hiệu lực, Then phân bổ hết hạn với `shortfall_reason = no_show`, số lượng **không** trả về lô.

#### US-CHA-24 · Đăng minh chứng
*Là* điều phối viên, *tôi muốn* đăng ảnh, mô tả, số người được phục vụ và địa điểm *để* chứng minh thực phẩm được dùng đúng mục đích. · F-44 · P4 · Must · Màn bản đồ M-7
- **AC1** Given có phân bổ `delivered` chưa có minh chứng, Then màn "Minh chứng" liệt kê chúng với hạn còn lại; tôi chọn một hoặc nhiều phân bổ cho một minh chứng.
- **AC2** Given form, Then bắt buộc: ít nhất 1 ảnh (tối đa 6), mô tả ≥ 20 ký tự (phát cho ai, bao nhiêu suất), số người được phục vụ (số nguyên > 0), thời điểm diễn ra; địa điểm lấy từ định vị máy (có đồng ý), hiển thị trên mini-map, kéo ghim để sửa tay.
- **AC3** Given lưu, Then địa điểm chỉ được lưu đã làm tròn ~110 m (DATA-MODEL `proofs.location`, không có bản chính xác) và hiển thị gần đúng (ô ~500 m) cho cửa hàng.
- **AC4** Given gửi, Then `proofs.status = submitted`, `submitted_at` ghi, Admin được báo.

#### US-CHA-25 · Làm mờ khuôn mặt trước khi tải lên
*Là* điều phối viên mái ấm, *tôi muốn* mặt trẻ em được làm mờ ngay trên điện thoại *để* không lộ danh tính. · F-45 · P4 · Must
- **AC1** Given tôi chọn ảnh, Then trên thiết bị chạy phát hiện mặt (BlazeFace full-range, chia ô cho ảnh lớn) và làm mờ mọi khuôn mặt tìm thấy; hiển thị so sánh trước/sau (thanh kéo) và số mặt đã làm mờ.
- **AC2** Given còn mặt bị sót, When tôi dùng "Cọ làm mờ" tô lên vùng đó, Then vùng được làm mờ.
- **AC3** Given ảnh tải lên, Then đó là ảnh **đã làm mờ**, mã hóa lại qua canvas (không EXIF/GPS, kiểm tra bằng test), kích thước cạnh dài ≤ 2048 px; ảnh gốc không rời thiết bị (kiểm tra network trong E2E).
- **AC4** Given thiết bị không tải được mô hình (máy yếu/mạng), Then tôi vẫn làm mờ thủ công được, và minh chứng ghi `face_count = null` + cờ "chưa tự động kiểm tra" cho Admin.

#### US-CHA-26 · Được nhắc khi sắp quá hạn minh chứng
*Là* điều phối viên, *tôi muốn* được nhắc trước và khi quá hạn *để* không quên. · F-46 · P4 · Must
- **AC1** Given minh chứng hạn 48 giờ sau dropoff, Then nhắc trong app + email lúc còn 12 giờ; lúc quá hạn nhắc lại và Admin được báo.
- **AC2** Given quá hạn, Then chỉ số "Thời gian đăng minh chứng" và "Tỷ lệ lô có minh chứng hợp lệ" phản ánh đúng; điểm uy tín bị trừ theo bảng điểm cố định (−2, `proof_overdue`, DATA-MODEL `trust_events`).

#### US-CHA-27 · Gallery minh chứng
*Là* điều phối viên, *tôi muốn* xem lại toàn bộ minh chứng của tổ chức *để* gửi nhà tài trợ và theo dõi trạng thái duyệt. · F-48 · P4 · Must
- **AC1** Given `/charity/proofs`, Then lưới ảnh có lọc theo trạng thái (Đã gửi, Đã duyệt, Cần sửa, Bị từ chối) và theo tháng; bấm mở chi tiết với ảnh, mô tả, phân bổ liên quan, nhận xét của Admin.
- **AC2** Given có "Lời cảm ơn" từ cửa hàng, Then hiển thị kèm minh chứng tương ứng.

#### US-CHA-28 · Sửa minh chứng khi Admin yêu cầu
*Là* điều phối viên, *tôi muốn* sửa minh chứng bị đánh dấu "Cần sửa" *để* được duyệt. · F-47 · P4 · Must
- **AC1** Given minh chứng `needs_changes` với nhận xét "Ảnh còn 1 khuôn mặt rõ", When tôi sửa và gửi lại, Then trạng thái về `submitted`, lịch sử phiên bản được giữ.

#### US-CHA-29 · ESG của tổ chức
*Là* điều phối viên, *tôi muốn* xem số suất ăn, số người được hỗ trợ, kg nhận và các chỉ số quản trị của tổ chức *để* báo cáo cho nhà tài trợ. · F-50 · P4 · Must
- **AC1** Given `/charity/esg`, Then hiển thị: kg nhận, CO₂e, nước, suất ăn tương đương, số người được hỗ trợ (từ minh chứng), tỷ lệ nhu cầu được đáp ứng đủ, số chuyến TNV đã xác nhận, tỷ lệ phân bổ có minh chứng hợp lệ, thời gian đăng minh chứng trung bình.
- **AC2** Given mỗi chỉ số, Then có công thức + nguồn như US-STO-24.

#### US-CHA-30 · Báo cáo tháng cho nhà tài trợ
*Là* điều phối viên, *tôi muốn* in báo cáo tháng và gửi cho nhà tài trợ liên kết *để* minh bạch. · F-52, F-11 · P4 · Must
- **AC1** Given báo cáo tháng, Then bố cục in A4 như US-STO-25, thêm mục "Nhà tài trợ đồng hành" (danh sách `sponsors`) và tối đa 6 ảnh minh chứng đã duyệt.
- **AC2** Given bật "Email báo cáo tự động" (Thiết bị & tích hợp), Then ngày 1 hằng tháng gửi email có link báo cáo tới email của tổ chức và (nếu chọn) email nhà tài trợ.

#### US-CHA-31 · Cài đặt tổ chức — hồ sơ
*Là* người phụ trách, *tôi muốn* xem và sửa từng mục hồ sơ *để* thông tin luôn đúng. · F-11 · P2 · Must
- **AC1** Given mục "Hồ sơ tổ chức", Then hiển thị: tên tổ chức, loại hình, email, số điện thoại, địa chỉ, ngày thành lập, mã số tổ chức, điểm uy tín (chỉ đọc, có giải thích cách tính); mỗi mục có nút "Sửa" mở chỉnh sửa tại chỗ.
- **AC2** Given sửa trường pháp lý/đã xác minh (tên pháp lý, mã số, người đại diện, giấy tờ), Then đi qua yêu cầu thay đổi `org_change_requests` như US-STO-27 AC4 (tổ chức vẫn `approved` và hoạt động trong lúc chờ); sửa trường không pháp lý thì lưu ngay như US-STO-27 AC3.
- **AC3** Given chủ hồ sơ, Then không sửa được điểm uy tín, trạng thái (hồi quy B2, B6).

#### US-CHA-32 · Nhà tài trợ liên kết
*Là* người phụ trách, *tôi muốn* quản lý danh sách nhà tài trợ kèm email liên hệ *để* đưa vào báo cáo tháng. · F-11 · P4 · Should
- **AC1** Given mục "Nhà tài trợ liên kết", When bấm "Thêm nhà tài trợ" và nhập tên, email liên hệ, (logo tùy chọn), Then nhà tài trợ xuất hiện trong danh sách; sửa/xóa được.
- **AC2** Given email nhà tài trợ, Then chỉ tổ chức sở hữu và Admin đọc được (RLS).

#### US-CHA-33 · Cài đặt thông báo theo loại
*Là* người phụ trách, *tôi muốn* bật/tắt từng loại thông báo *để* chỉ nhận điều quan trọng. · F-59, F-11 · P3 · Must
- **AC1** Given mục "Cài đặt thông báo", Then có 5 loại theo tài liệu nhóm: **Lô mới (GẤP)** — lô Đỏ, **Lô mới (thường)**, **Tình nguyện viên xác nhận**, **Báo cáo tháng**, **Lời cảm ơn**; cộng các loại vận hành (yêu cầu được chấp nhận/từ chối, nhắc minh chứng); mỗi loại bật/tắt theo kênh Trong app / Email / Push.
- **AC2** Given loại "Lô mới (GẤP)", Then có chú thích "SMS/Zalo sẽ có trong giai đoạn triển khai 6 tháng"; hiện tại GẤP gửi đồng thời in-app + push + email ngay.
- **AC3** Given tôi tắt "Lô mới (thường)", Then vẫn thấy lô trong kho tặng; chỉ không nhận thông báo.

#### US-CHA-34 · Giờ hoạt động & nhận hàng
*Là* người phụ trách, *tôi muốn* đặt khung giờ nhận hàng cho từng ngày trong tuần *để* hệ thống không gợi ý lô ngoài giờ. · F-11, F-08 · P2 · Must
- **AC1** Given bảng 7 ngày, When nhập một hoặc nhiều khung giờ mỗi ngày và bấm "Lưu giờ hoạt động", Then lưu vào `site_hours` của điểm nhận, toast "Đã lưu giờ hoạt động".
- **AC2** Given khung giờ chồng lấn hoặc giờ đóng trước giờ mở (không qua đêm), Then báo lỗi tại dòng đó.
- **AC3** Given ngày nghỉ đột xuất, Then thêm vào `site_closures`; ngày đó không nhận thông báo lô mới.

#### US-CHA-35 · Loại thực phẩm chấp nhận
*Là* người phụ trách, *tôi muốn* bật/tắt nhóm thực phẩm nhận được *để* chỉ thấy và được báo lô phù hợp. · F-11, F-04 · P2 · Must
- **AC1** Given danh sách nhóm (Bánh mì & bakery, Cơm hộp & chế biến, Rau củ tươi, Trái cây, Sữa & sản phẩm sữa, Thịt & hải sản, Bánh ngọt & dessert, Đồ uống, Đồ khô), When bật/tắt và lưu, Then `sites.accepted_categories` cập nhật; kho tặng, gợi ý ghép đơn và thông báo chỉ dùng các nhóm được bật.
- **AC2** Given tắt "Thịt & hải sản" vì không có tủ lạnh, Then lô danh mục đó không còn xuất hiện trong gợi ý mặc định.

#### US-CHA-36 · Thiết bị & tích hợp (chỉ mục có thật)
*Là* người phụ trách, *tôi muốn* cấu hình các thiết bị và tích hợp phục vụ điều phối *để* vận hành gọn hơn. · F-11, F-74, F-43, F-52, F-38 · P3–P5 · Should
- **AC1** Given mục "Thiết bị & tích hợp", Then chỉ hiển thị các mục hoạt động thật: **Tablet quản lý** (hướng dẫn cài PWA trên máy tính bảng + tạo tài khoản nhân viên `staff` cho máy đó), **Máy in biên bản** (in biên bản bàn giao bằng trình duyệt, F-43), **GPS điều phối** (bật yêu cầu TNV đồng ý chia sẻ vị trí khi đang chạy chuyến, F-38; nếu F-38 bị cắt thì hiển thị "Điều phối bằng check-in"), **Email báo cáo tự động** (bật/tắt + chọn người nhận, F-52).
- **AC2** Given một tích hợp chưa sẵn sàng trong phase hiện tại, Then mục đó **không hiển thị** (không có nút "Cấu hình" vô tác dụng).

#### US-CHA-37 · Tạm ngưng nhận donation / Đăng xuất tổ chức
*Là* người phụ trách, *tôi muốn* tạm ngưng nhận khi bếp đóng cửa sửa chữa *để* cửa hàng không chờ tôi. · F-11 · P2 · Must
- **AC1** Given bấm "Tạm ngưng nhận donation", chọn thời hạn (đến ngày …, hoặc đến khi bật lại) và xác nhận, Then tổ chức không nhận thông báo lô mới, không được gợi ý trong ghép đơn, nhu cầu đang mở được hỏi giữ hay đóng; banner "Đang tạm ngưng nhận" hiển thị ở cổng.
- **AC2** Given phân bổ đang chạy khi tạm ngưng, Then vẫn hoàn tất bình thường (không bị hủy tự động).
- **AC3** Given bấm "Đăng xuất tổ chức", Then kết thúc phiên trên thiết bị này và quay về `/login`; nếu thuộc nhiều tổ chức, có lựa chọn "Chuyển tổ chức" thay vì đăng xuất.

#### US-CHA-38 · Phản ánh sự cố chất lượng
*Là* điều phối viên, *tôi muốn* phản ánh khi nhận hàng kém chất lượng hoặc sai số lượng *để* Admin xử lý. · F-66 · P4 · Should
- **AC1** Given một bàn giao trong 72 giờ qua, When bấm "Phản ánh", chọn loại, mô tả, ảnh (đã làm mờ nếu có người), Then `incidents` được tạo, Admin được báo, cửa hàng liên quan được báo (không thấy danh tính người phản ánh ngoài tên tổ chức).

### 7.4 Tình nguyện viên (VOL)

#### US-VOL-01 · Nhận lời mời & hoàn thiện hồ sơ
*Là* sinh viên tình nguyện (P3), *tôi muốn* nhận lời mời qua email và tạo hồ sơ ngắn *để* bắt đầu nhận chuyến. · F-32, F-01 · P3 · Must
- **AC1** Given link mời hợp lệ, When tôi đặt mật khẩu (hoặc đăng nhập nếu đã có tài khoản), Then tôi là thành viên `volunteer` của tổ chức mời và được đưa tới `/volunteer/profile`.
- **AC2** Given hồ sơ, Then nhập: tên hiển thị, SĐT (để cửa hàng/tổ chức gọi khi cần), phương tiện, sức chở (kg), khu vực hoạt động (chọn phường/xã — chỉ lưu gần đúng `base_area`).
- **AC3** Given link đã dùng hoặc hết hạn, Then thông báo rõ và hướng dẫn liên hệ tổ chức.

#### US-VOL-02 · Đồng ý và rút lại đồng ý chia sẻ vị trí
*Là* tình nguyện viên, *tôi muốn* tự quyết định có chia sẻ vị trí trong chuyến hay không *để* không bị theo dõi ngoài ý muốn. · F-32, F-07, F-38 · P3 · Must
- **AC1** Given lần đầu bắt đầu chuyến, Then hiển thị màn giải thích ngắn: dùng vị trí để làm gì (check-in, ETA), chỉ khi app đang mở, làm tròn khoảng 11 m, xóa khi kết thúc chuyến, ai xem được (điều phối viên tổ chức; cửa hàng chỉ thấy ETA); nút "Đồng ý" và "Không, chỉ dùng check-in".
- **AC2** Given đồng ý, Then ghi `consents` (`purpose = location_trip`, `policy_version`); rút lại bất cứ lúc nào trong hồ sơ → ghi `withdrawn_at`, ngừng gửi vị trí ngay.
- **AC3** Given không đồng ý, Then mọi chức năng chuyến vẫn dùng được (check-in vẫn yêu cầu quyền vị trí tại thời điểm bấm, không lưu liên tục).

#### US-VOL-03 · Chuyến hôm nay
*Là* tình nguyện viên, *tôi muốn* mở app thấy ngay chuyến hôm nay *để* không phải hỏi lại điều phối viên. · F-71 · P3 · Must
- **AC1** Given `/volunteer`, Then màn đầu tiên là "Chuyến hôm nay": mỗi chuyến có giờ bắt đầu dự kiến, số điểm dừng, tổng kg, tên tổ chức, trạng thái; chuyến sắp tới ở dưới.
- **AC2** Given điện thoại Android tầm thấp trên 4G, Then màn hiển thị nội dung chính trong ≤ 3 giây (LCP), JS ban đầu của route ≤ 200 KB gzip, bản đồ chỉ tải khi mở chi tiết chuyến.
- **AC3** Given không có chuyến, Then trạng thái rỗng "Hôm nay bạn chưa có chuyến nào" kèm số chuyến đã hoàn thành.

#### US-VOL-04 · Nhận hoặc từ chối chuyến
*Là* tình nguyện viên, *tôi muốn* xác nhận nhận chuyến hoặc từ chối *để* điều phối viên biết. · F-71 · P3 · Must
- **AC1** Given chuyến mới được giao, When bấm "Nhận chuyến" (`respond_pickup(..., true)`), Then tổ chức nhận thông báo loại "Tình nguyện viên xác nhận" (sự kiện `volunteer_accepted`, N-15).
- **AC2** Given bấm "Không thể nhận" (chọn lý do), Then chuyến về trạng thái chờ phân công, điều phối viên được báo (sự kiện `volunteer_declined`, N-15).

#### US-VOL-05 · Chỉ đường tới điểm kế tiếp
*Là* tình nguyện viên, *tôi muốn* xem tuyến tới điểm kế tiếp và mở Google Maps/Apple Maps *để* đi đúng đường bằng xe máy. · F-72 · P3 · Must · Màn bản đồ M-6
- **AC1** Given chi tiết chuyến, Then bản đồ hiển thị tuyến đã lưu, điểm kế tiếp được nhấn mạnh, danh sách điểm dừng đánh số với giờ dự kiến.
- **AC2** Given bấm "Mở Google Maps", Then mở deep link chỉ đường tới điểm kế tiếp (kèm waypoint các điểm còn lại nếu hỗ trợ) với chế độ xe máy/xe hai bánh nếu có; trên iOS có thêm "Mở Apple Maps".
- **AC3** Given điểm giao về là tổ chức `approximate`/`hidden`, Then TNV của tổ chức đó vẫn thấy vị trí chính xác (US-CHA-03 AC3).

#### US-VOL-06 · Check-in tại điểm dừng
*Là* tình nguyện viên, *tôi muốn* bấm "Tôi đã đến" *để* cửa hàng và điều phối viên biết. · F-37 · P3 · Must
- **AC1** Given tôi trong bán kính 100 m của cửa hàng, When bấm "Tôi đã đến", Then `pickup_stops.arrived_at` ghi, cửa hàng được báo (sự kiện `volunteer_checked_in`, N-16), ETA các điểm sau cập nhật.
- **AC2** Given tôi ở ngoài 100 m (GPS lệch), Then hệ thống hỏi lý do ("GPS không chính xác", "Cửa hàng đổi lối vào", "Khác") và vẫn cho check-in kèm cờ để điều phối viên xem.
- **AC3** Given không có quyền vị trí, Then cho check-in thủ công kèm cờ "không xác minh vị trí".

#### US-VOL-07 · Hiện QR / mã 6 số tại cửa hàng
*Là* tình nguyện viên, *tôi muốn* hiện QR to, rõ *để* nhân viên cửa hàng quét nhanh. · F-73, F-39 · P3 · Must
- **AC1** Given điểm dừng đã check-in, When bấm "Hiện mã bàn giao", Then QR toàn màn hình với nền trắng, mã 6 số dạng "482 913" bên dưới, tăng độ sáng (nếu trình duyệt hỗ trợ) và giữ màn hình sáng (Wake Lock).
- **AC2** Given token hết hạn hoặc đã dùng, Then màn hình báo và có nút "Tạo mã mới" (token cũ vô hiệu).
- **AC3** Given QR, Then chỉ chứa token ngẫu nhiên, không chứa dữ liệu cá nhân hay ID nội bộ dễ đoán.

#### US-VOL-08 · Xác nhận số lượng đã nhận
*Là* tình nguyện viên, *tôi muốn* xác nhận số lượng thực nhận ở cửa hàng *để* hai bên cùng đồng ý. · F-73, F-40 · P3 · Must
- **AC1** Given cửa hàng đã quét và nhập số giao từng dòng, Then máy tôi hiển thị cùng các dòng để xác nhận; tôi có thể đánh dấu từ chối dòng vì chất lượng hoặc chỉ nhận một phần vì không đủ sức chở (chọn lý do).
- **AC2** Given hai bên đã xác nhận, Then bàn giao `pickup` hoàn tất, hai máy cùng hiển thị "Đã bàn giao lúc hh:mm".
- **AC3** Given tôi và cửa hàng nhập số khác nhau, Then hệ thống yêu cầu thống nhất trước khi hoàn tất (không ghi số mâu thuẫn).

#### US-VOL-09 · Giao về tổ chức
*Là* tình nguyện viên, *tôi muốn* hoàn tất chuyến khi giao hàng về tổ chức *để* kết thúc nhiệm vụ. · F-73, F-41 · P3 · Must
- **AC1** Given đã lấy ở mọi điểm dừng, Then điểm cuối "Giao về [tổ chức]" hiển thị QR dropoff để điều phối viên quét (US-CHA-21).
- **AC2** Given dropoff hoàn tất, Then chuyến `completed`, vị trí của tôi (nếu có) bị xóa, tôi thấy tóm tắt "Bạn vừa giúp chuyển 50 bánh (≈ 4,0 kg) tới 45 trẻ".

#### US-VOL-10 · Cài app lên điện thoại
*Là* tình nguyện viên, *tôi muốn* cài FoodSave như ứng dụng *để* mở nhanh từ màn hình chính. · F-74 · P5 · Must
- **AC1** Given Android Chrome, When vào `/volunteer` lần thứ hai, Then hiển thị gợi ý "Thêm FoodSave vào màn hình chính" (có thể đóng, không hiện lại trong 7 ngày).
- **AC2** Given iOS Safari, Then hiển thị hướng dẫn "Chia sẻ → Thêm vào MH chính" bằng hình minh họa.
- **AC3** Given app đã cài và mất mạng, Then mở được "Chuyến hôm nay" đã tải trước đó (chỉ đọc) với banner "Đang ngoại tuyến"; thao tác cần mạng bị vô hiệu kèm giải thích.
- **AC4** Given Lighthouse (bản 12 đã bỏ nhóm điểm PWA), Then `/volunteer` đạt Performance/Accessibility/Best Practices/SEO ≥ 90 và E2E kiểm tra installability (manifest hợp lệ, service worker đăng ký, sự kiện `beforeinstallprompt` trên Android Chrome) (gate P5).

#### US-VOL-11 · Thông báo đẩy
*Là* tình nguyện viên, *tôi muốn* nhận thông báo đẩy khi được giao chuyến *để* phản hồi kịp. · F-58 · P5 · Should
- **AC1** Given đã cài PWA và cho phép thông báo, When được giao chuyến, Then nhận Web Push trong ≤ 1 phút; bấm vào mở đúng chuyến.
- **AC2** Given iOS chưa cài PWA hoặc từ chối quyền, Then nhận qua in-app + email (dự phòng), màn hồ sơ ghi rõ "Thông báo đẩy: chưa bật".

#### US-VOL-12 · Chia sẻ vị trí khi app đang mở
*Là* tình nguyện viên đã đồng ý, *tôi muốn* vị trí của tôi tự cập nhật cho điều phối viên khi đang chạy chuyến *để* không phải nhắn tin báo. · F-38 · P5 · Could (cắt #2)
- **AC1** Given đồng ý `location_trip` và chuyến đang chạy và app ở foreground, Then gửi vị trí làm tròn khoảng 11 m tối đa mỗi 30 giây qua Realtime Broadcast kênh private của chuyến; chỉ lưu điểm mới nhất.
- **AC2** Given app chuyển nền hoặc chuyến kết thúc, Then ngừng gửi; khi chuyến kết thúc, điểm đã lưu bị xóa (pgTAP/E2E kiểm tra).
- **AC3** Given có banner thường trực "Đang chia sẻ vị trí — Dừng", When bấm "Dừng", Then ngừng ngay.

#### US-VOL-13 · Báo sự cố trong chuyến
*Là* tình nguyện viên, *tôi muốn* báo khi cửa hàng đóng cửa, hàng không đúng, hoặc tôi gặp sự cố *để* điều phối viên xử lý. · F-29, F-66 · P3 · Must
- **AC1** Given đang ở điểm dừng, When bấm "Báo sự cố" và chọn loại, Then điều phối viên nhận thông báo GẤP; nếu chọn "Cửa hàng không giao được", điểm dừng được đánh dấu bỏ qua và phân bổ xử lý theo ma trận hủy.

#### US-VOL-14 · Thao tác khi mất mạng
*Là* tình nguyện viên ở nơi sóng yếu, *tôi muốn* thao tác check-in/xác nhận được xếp hàng và tự gửi khi có mạng *để* không bị kẹt. · F-75 · P5 · Could (cắt #1)
- **AC1** Given mất mạng, When bấm "Tôi đã đến", Then thao tác vào hàng đợi cục bộ với `client_op_id`, hiển thị "Sẽ gửi khi có mạng"; khi có mạng gửi lại đúng một lần.
- **AC2** Given bàn giao QR, Then **không** hỗ trợ ngoại tuyến (cần xác thực token phía server) — hiển thị mã 6 số để cửa hàng nhập khi họ có mạng.

### 7.5 Admin (ADM)

#### US-ADM-01 · Đăng nhập Admin bắt buộc MFA
*Là* Admin (P4), *tôi muốn* đăng nhập với mã TOTP *để* tài khoản quản trị không bị chiếm dụng. · F-62, F-02 · P1 · Must
- **AC1** Given tài khoản `platform_role = admin` chưa đăng ký TOTP, When đăng nhập, Then bắt buộc đăng ký TOTP trước khi vào `/admin`.
- **AC2** Given phiên chỉ đạt `aal1`, When gọi bất kỳ RPC admin nào trực tiếp (bỏ qua UI), Then DB từ chối vì `is_admin()` yêu cầu `aal2` (pgTAP).
- **AC3** Given không có cách nào tự trở thành admin qua đăng ký, sửa profile, hoặc metadata (hồi quy B1, B2); admin chỉ được cấp/thu hồi qua RPC `grant_platform_admin` / `revoke_platform_admin` (chỉ service role — dùng trong script bootstrap — hoặc Admin khác đã đạt `aal2`), luôn có lý do và audit (DATA-MODEL 8.2).

#### US-ADM-02 · Hàng đợi duyệt hồ sơ
*Là* Admin, *tôi muốn* thấy hồ sơ chờ duyệt theo thời gian chờ *để* duyệt kịp trong ngày. · F-61 · P1 · Must
- **AC1** Given `/admin/reviews`, Then danh sách hồ sơ `submitted` của cửa hàng và tổ chức, sắp xếp chờ lâu nhất trước, hiển thị số ngày chờ, loại, phường; có lọc theo loại.
- **AC2** Given hồ sơ được gửi lại sau khi bị từ chối, Then có nhãn "Gửi lại" và lý do lần trước.
- **AC3** Given tổ chức đang `approved` gửi yêu cầu thay đổi trường pháp lý (`org_change_requests` `pending`), Then xuất hiện như một mục "Cập nhật hồ sơ" riêng, hiển thị giá trị cũ/mới; Admin duyệt (`review_org_change_request` → áp dụng thay đổi) hoặc từ chối có lý do; tổ chức vẫn `approved` và hoạt động suốt quá trình. `needs_changes` chỉ dùng trong lần duyệt onboarding đầu tiên.

#### US-ADM-03 · Xem giấy tờ an toàn
*Là* Admin, *tôi muốn* xem giấy tờ ngay trong trình duyệt *để* không phải tải về máy. · F-61, F-06 · P1 · Must
- **AC1** Given mở chi tiết hồ sơ, Then giấy tờ hiển thị qua signed URL hết hạn sau 60 giây, tạo mới mỗi lần mở; không có nút "Tải xuống" mặc định.
- **AC2** Given mỗi lần xem giấy tờ, Then ghi `audit_logs` (ai, hồ sơ nào, lúc nào).
- **AC3** Given trang chi tiết, Then không có khối "Dữ liệu gốc" dump toàn bộ cột (hồi quy B3).

#### US-ADM-04 · Duyệt hoặc từ chối có lý do
*Là* Admin, *tôi muốn* duyệt/từ chối kèm lý do *để* bên đăng ký biết phải sửa gì. · F-61 · P1 · Must
- **AC1** Given bấm "Duyệt", Then RPC chuyển `status = approved`, ghi `reviewed_by`, `reviewed_at`, audit; bên đăng ký nhận email + in-app.
- **AC2** Given bấm "Cần bổ sung" (`needs_changes`) hoặc "Từ chối" (`rejected`), Then bắt buộc chọn lý do mẫu hoặc nhập lý do (≥ 10 ký tự); lưu `rejection_reason`; "Cần bổ sung" cho phép bên đăng ký sửa và gửi lại.
- **AC3** Given Admin là thành viên của tổ chức đang duyệt, Then không được tự duyệt (RPC từ chối).
- **AC4** Given hai Admin cùng duyệt một hồ sơ, Then chỉ một quyết định được ghi; người còn lại thấy "Hồ sơ đã được xử lý bởi …".

#### US-ADM-05 · Lô hàng tồn kho theo nhãn
*Là* Admin, *tôi muốn* giám sát mọi lô cùng nhãn và trạng thái *để* can thiệp lô Đỏ chưa ai nhận. · F-64 · P2 · Must
- **AC1** Given `/admin/offers`, Then bảng (TanStack Table) có cột: cửa hàng, điểm, danh mục, đăng/giữ/lấy/còn (đơn vị), kg, hạn sử dụng, hạn hiệu lực, nhãn (icon + chữ), đếm ngược, trạng thái; **không có cột giá**.
- **AC2** Given bảng, Then tự làm mới mỗi 5 phút và nhận thay đổi qua Realtime; hiển thị "Cập nhật lúc hh:mm:ss".
- **AC3** Given lọc "Đỏ + chưa có phân bổ", Then thấy các lô cần can thiệp; bấm một lô xem tổ chức đủ điều kiện gần nhất và nút "Gửi nhắc GẤP" (tạo sự kiện outbox mới, có giới hạn 1 lần/30 phút/lô).
- **AC4** Given nhãn trên màn Admin, Then dùng đúng tên Xanh/Vàng/Đỏ/Hết hạn (không "Còn hạn/Cận hạn/Sắp hết hạn").

#### US-ADM-06 · Cập nhật nhãn ngay (phục vụ demo)
*Là* Admin đang demo, *tôi muốn* bấm "Cập nhật nhãn ngay" *để* thấy ngay lô chuyển Đỏ và lô hết hạn được đóng. · F-64, F-17 · P2 · Must
- **AC1** Given bấm nút, Then RPC admin chạy ngay tác vụ của F-17 (phát sự kiện chuyển Đỏ còn thiếu, đóng lô quá hạn) và tải lại bảng; kết quả hiển thị "Đã chuyển Đỏ 2 lô, đóng 1 lô hết hạn".
- **AC2** Given chạy liền hai lần, Then không phát thông báo trùng (idempotent).

#### US-ADM-07 · Đơn hàng → Phân bổ
*Là* Admin, *tôi muốn* biết tổ chức nào đã đặt từ cửa hàng nào *để* giám sát luồng tặng–nhận. · F-65 · P2 · Must
- **AC1** Given `/admin/allocations`, Then bảng: thời điểm yêu cầu, tổ chức, cửa hàng/điểm, lô, số đặt/lấy/giao, kg, trạng thái, nhu cầu/phương án ghép (nếu có), chuyến, lý do thiếu.
- **AC2** Given chọn một phân bổ, Then xem dòng thời gian đầy đủ (requested → confirmed → assigned → picked_up → delivered) với người thực hiện từng bước.
- **AC3** Given cần can thiệp, Then Admin hủy theo ma trận hủy (bắt buộc lý do, audit); không sửa tay số lượng.

#### US-ADM-08 · Giám sát chuyến
*Là* Admin, *tôi muốn* xem các chuyến đang chạy và trễ *để* hỗ trợ tổ chức. · F-65, F-35 · P3 · Must
- **AC1** Given `/admin/pickups`, Then danh sách chuyến theo trạng thái, đánh dấu chuyến có điểm dừng trễ ETA > 15 phút hoặc có lô Đỏ sắp quá hạn.
- **AC2** Given mở chuyến, Then thấy bản đồ điều phối như US-CHA-18 (vị trí TNV chỉ khi đồng ý).

#### US-ADM-09 · Duyệt minh chứng
*Là* Admin, *tôi muốn* duyệt minh chứng *để* xác nhận thực phẩm được dùng đúng mục đích. · F-47, F-83 · P4 · Must
- **AC1** Given `/admin/proofs`, Then hàng đợi `submitted` với ảnh (signed URL 300 s), mô tả, số người, địa điểm chính xác trên mini-map, phân bổ liên quan, `face_count`.
- **AC2** Given bấm "Hợp lệ", Then `approved`, cửa hàng liên quan và tổ chức được báo, minh chứng hiển thị cho cửa hàng liên quan.
- **AC3** Given bấm "Cần sửa" hoặc "Từ chối", Then bắt buộc nhận xét; tổ chức được báo.
- **AC4** Given flag AI bật (F-83), Then hiển thị khối "Gợi ý AI" (ví dụ "Có thể còn 1 khuôn mặt chưa làm mờ ở góc phải") được gắn nhãn rõ là gợi ý; quyết định vẫn do Admin.
- **AC5** Given minh chứng quá hạn chưa nộp, Then có danh sách "Quá hạn" để Admin nhắc thủ công.

#### US-ADM-10 · Phản ánh / vi phạm
*Là* Admin, *tôi muốn* xử lý phản ánh *để* giữ chất lượng và uy tín hệ thống. · F-66, F-12 · P4 · Should
- **AC1** Given `/admin/incidents`, Then danh sách phản ánh theo trạng thái (mới, đang xử lý, đã xử lý, bác bỏ), loại, bên liên quan.
- **AC2** Given xử lý, Then ghi kết luận, tác động điểm uy tín (nếu có), thông báo các bên; tỷ lệ đã xử lý cập nhật trong chỉ số G.

#### US-ADM-11 · Nhật ký hoạt động
*Là* Admin, *tôi muốn* xem nhật ký mọi hoạt động quan trọng *để* truy vết khi có tranh chấp. · F-63 · P1 · Must
- **AC1** Given `/admin/audit`, Then bảng chỉ đọc: thời gian, người thực hiện, vai trò, hành động, đối tượng, giá trị trước/sau (đã che PII), IP rút gọn; lọc theo người, hành động, đối tượng, khoảng thời gian.
- **AC2** Given bất kỳ ai (kể cả Admin), Then không sửa/xóa được `audit_logs` (pgTAP).

#### US-ADM-12 · Xem ngưỡng nhãn (chỉ đọc)
*Là* Admin, *tôi muốn* xem ngưỡng nhãn đang hiệu lực theo nhóm hàng và lịch sử phiên bản *để* giải thích cho đối tác và đề xuất điều chỉnh khi pilot cho thấy cần. · F-68, F-16 · P4 · Should
- **AC1** Given `/admin/settings/labels`, Then hiển thị bảng `label_rules` theo version (chỉ đọc, không có nút sửa); ghi chú "Đổi ngưỡng = migration có version mới + sửa fixture (ADR-005)".
- **AC2** Given cần đổi ngưỡng, Then thực hiện bằng migration mới (thêm dòng version, định nghĩa lại `freshness_label` immutable, sửa `src/core/labels/fixtures.json`) qua PR có review; ràng buộc `red_below < green_above` kiểm ở DB.

#### US-ADM-13 · Xem hệ số tác động (chỉ đọc)
*Là* Admin, *tôi muốn* xem hệ số CO₂e, nước, suất ăn kèm nguồn và version *để* số liệu ESG có trích dẫn. · F-68, F-49 · P4 · Should
- **AC1** Given `/admin/settings/factors`, Then hiển thị `impact_factors` theo version (giá trị, đơn vị, nguồn, trang, dẫn xuất, ADR duyệt), đánh dấu version hiện hành (`app_settings.impact_factor_version`); không sửa được trên UI. Thêm hệ số = migration seed version mới + ADR (ADR-009); kích hoạt version bằng `activate_impact_factors` (admin aal2, audit).
- **AC2** Given ledger đã ghi, Then dòng ledger cũ giữ nguyên version hệ số lúc ghi; báo cáo ghi rõ version dùng cho từng kỳ.

#### US-ADM-14 · ESG toàn hệ thống & báo cáo tháng
*Là* Admin, *tôi muốn* xem tổng ESG toàn hệ thống và xuất báo cáo tháng *để* báo cáo cho đối tác và BTC. · F-51, F-52 · P4 · Must
- **AC1** Given `/admin/esg`, Then hiển thị đủ 13 chỉ số E/S/G của bảng định hướng (mục 11.2), lọc theo tháng, phường/cụm phường, loại hình; tách "Dữ liệu demo" và "Dữ liệu thật".
- **AC2** Given "Xuất báo cáo tháng", Then trang in A4 + CSV như US-STO-25.
- **AC3** Given số liệu, Then khớp unit test công thức trong `ESG-METHODOLOGY.md`.

#### US-ADM-15 · KPI sản phẩm
*Là* Admin, *tôi muốn* xem KPI vận hành *để* đánh giá pilot và trình bày với giám khảo. · F-51 · P4 · Must
- **AC1** Given `/admin`, Then KPI tile: time-to-match (lô, nhu cầu), % kg cứu được, pickup lead time, tỷ lệ bàn giao đúng hạn, proof compliance, thời gian duyệt hồ sơ, tỷ lệ lô hết hạn chưa nhận — mỗi tile có xu hướng 30 ngày và định nghĩa (tooltip).

#### US-ADM-16 · Bản đồ hệ thống
*Là* Admin, *tôi muốn* xem toàn cảnh hệ thống trên bản đồ *để* phát hiện vùng thiếu tổ chức hoặc cửa hàng. · F-67 · P4 · Must · Màn bản đồ M-8
- **AC1** Given `/admin/map`, Then có 3 lớp bật/tắt: (1) mọi điểm theo trạng thái duyệt (đang chờ, đã duyệt, tạm khóa), (2) heatmap kg cứu được theo phường trong kỳ, (3) lô đang mở theo nhãn.
- **AC2** Given Admin, Then thấy vị trí chính xác của mọi điểm (kể cả `hidden`) kèm cảnh báo "Vị trí nhạy cảm".

#### US-ADM-17 · Nhận thông báo lô mới & nhu cầu mới
*Là* Admin, *tôi muốn* được báo mọi lô mới và nhu cầu mới *để* hỗ trợ kết nối khi cần. · F-56 · P2–P3 · Must
- **AC1** Given lô mới mở hoặc nhu cầu mới, Then Admin nhận thông báo in-app (gom nhóm theo 15 phút để không ngập); lô Đỏ và nhu cầu cần trong ≤ 4 giờ thì báo GẤP riêng.

#### US-ADM-18 · Tạm khóa tổ chức
*Là* Admin, *tôi muốn* tạm khóa cửa hàng/tổ chức vi phạm *để* bảo vệ hệ thống. · F-69 · P4 · Should
- **AC1** Given tạm khóa có lý do, Then thành viên tổ chức đó không vào được cổng nghiệp vụ (thấy trang thông báo), lô/nhu cầu đang mở bị đóng, phân bổ chưa lấy bị hủy theo ma trận hủy, audit ghi lại.
- **AC2** Given mở khóa, Then trạng thái trở lại `approved`, không tự mở lại lô đã đóng.

#### US-ADM-19 · Reset demo
*Là* Admin trước buổi chấm, *tôi muốn* đưa dữ liệu demo về trạng thái chuẩn *để* demo luôn chạy đúng kịch bản. · F-70 · P2 · Must
- **AC1** Given `/admin/demo`, When bấm "Reset demo" và gõ xác nhận "RESET", Then chỉ dữ liệu thuộc tổ chức `is_demo = true` bị xóa và tạo lại; dữ liệu pilot thật không bị ảnh hưởng (pgTAP kiểm tra).
- **AC2** Given seed, Then mọi mốc thời gian tính theo `now() + interval` (lô luôn có đủ Xanh/Vàng/Đỏ vào thời điểm demo), lịch sử 90 ngày được sinh bằng RPC thật để ESG có xu hướng.
- **AC3** Given reset, Then hoàn tất ≤ 60 giây, ghi audit, tài khoản giám khảo giữ nguyên mật khẩu.
- **AC4** Given tài khoản demo/giám khảo, Then có role switcher (Cửa hàng/Tổ chức/TNV demo); role switcher **không** bao giờ chuyển sang Admin (màn Admin trong demo do tài khoản admin của nhóm, đã qua MFA, thao tác); tài khoản thật không bao giờ thấy role switcher.
- **AC5** Given giám khảo, Then **không** được cấp tài khoản admin; mỗi vai trò có tài khoản demo riêng. Chỉ khi BTC yêu cầu mới tạo vai trò `admin_viewer` chỉ đọc (cần ADR riêng).

#### US-ADM-20 · Bật/tắt tính năng AI
*Là* Admin, *tôi muốn* bật/tắt từng tính năng AI *để* kiểm soát chi phí và rủi ro khi demo. · F-68, F-81–F-84 · P4 · Should
- **AC1** Given `/admin/settings/flags`, Then có công tắc tổng `ai_enabled` và công tắc riêng `ai_offer_autofill_enabled` (ảnh → tự điền), `ai_doc_extract_enabled` (trích xuất giấy tờ), `ai_proof_check_enabled` (kiểm minh chứng), `ai_esg_summary_enabled` (nhận xét ESG), cùng `push_enabled`, `public_map_enabled`, `signups_enabled`, `auto_accept_enabled` (DATA-MODEL `app_settings`); chỉ admin aal2 đổi được qua `set_app_setting`, có hiệu lực ≤ 1 phút, audit ghi lại.
- **AC2** Given tắt, Then UI ẩn nút tương ứng; server từ chối gọi provider AI.

### 7.6 Hệ thống (SYS)

#### US-SYS-01 · Nhãn tính lúc đọc, nhất quán SQL/TS
*Là* hệ thống, *tôi cần* tính nhãn từ hạn hiệu lực tại thời điểm đọc *để* nhãn luôn đúng mà không phụ thuộc cron. · F-16 · P2 · Must
- **AC1** Given `freshness_label(deadline, perishability, at)` (SQL immutable) và `freshnessLabel()` (TS), When chạy file fixture chung (≥ 40 trường hợp biên), Then hai bên trả cùng kết quả.
- **AC2** Given `expires_at` chỉ có ngày, Then quy đổi 23:59 giờ Việt Nam; `effective_deadline = least(expires_at, upper(pickup_window), giờ đóng cửa gần nhất của điểm theo site_hours/site_closures)` (DATA-MODEL 4.2, 4.3).

#### US-SYS-02 · Tác vụ định kỳ chuyển Đỏ & đóng lô
*Là* hệ thống, *tôi cần* báo khi lô chuyển Đỏ và đóng lô hết hạn *để* thông báo GẤP đúng lúc và số liệu sạch. · F-17 · P2 · Must
- **AC1** Given pg_cron chạy mỗi 5 phút, Then mỗi lô `open` vừa vào ngưỡng Đỏ phát đúng **một** sự kiện "chuyển Đỏ" (khóa idempotency theo offer + label).
- **AC2** Given lô quá `effective_deadline`, Then chuyển `expired`, phân bổ `requested` hết hạn, ghi `qty_unclaimed`; phân bổ `confirmed` chưa lấy chuyển `expired` với lý do.

#### US-SYS-03 · Outbox idempotent
*Là* hệ thống, *tôi cần* phát thông báo đúng một lần *để* người dùng không bị spam khi job chạy lại. · F-54 · P2 · Must
- **AC1** Given cùng sự kiện được ghi hai lần (retry), Then outbox chỉ có một dòng (unique khóa idempotency).
- **AC2** Given dispatcher gọi `/api/jobs/dispatch`, Then request bắt buộc chữ ký HMAC hợp lệ; sai chữ ký → 401.
- **AC3** Given kênh email lỗi tạm thời, Then retry theo chính sách outbox (DATA-MODEL §2.6 `notification_outbox`): backoff 1 phút, 5 phút, 15 phút, 1 giờ, 6 giờ — tối đa **6 lần thử**, sau đó `dead` và cảnh báo vận hành; kênh in-app không bị ảnh hưởng.

#### US-SYS-04 · Thông báo hai chiều theo bán kính và công bằng
*Là* hệ thống, *tôi cần* chọn đúng người nhận theo bán kính, danh mục, giờ nhận, khả thi và công bằng *để* kết nối nhanh mà không thiên vị. · F-56, F-28 · P2–P3 · Must
- **AC1** Given lô mới, Then người nhận = thành viên (owner/manager) của tổ chức có điểm nhận thỏa `ST_DWithin(site.location, offer.site.location, radius_km)`, danh mục nằm trong `accepted_categories`, không tạm ngưng, khả thi thời gian; sắp theo chỉ số công bằng tăng dần; cộng mọi Admin.
- **AC2** Given nhu cầu mới, Then người nhận = owner/manager của cửa hàng có điểm nằm trong bán kính điểm nhận của nhu cầu; cộng mọi Admin.
- **AC3** Given `app_settings.fairness_wave_count = 3` và `fairness_wave_minutes = 5` (mặc định theo DATA-MODEL; chốt lại ở P3 sau thử nghiệm seed), Then danh sách tổ chức được chia 3 đợt theo chỉ số công bằng, mỗi đợt cách 5 phút; lô vẫn hiển thị trong kho tặng cho mọi tổ chức đủ điều kiện ngay từ đầu (chia đợt chỉ áp dụng cho thông báo).

#### US-SYS-05 · Bất biến của engine ghép đơn
*Là* hệ thống, *tôi cần* đảm bảo phương án ghép không bao giờ vi phạm ràng buộc *để* dữ liệu luôn đúng. · F-25 · P3 · Must
- **AC1** Given property test (fast-check) với dữ liệu ngẫu nhiên, Then mọi phương án: Σ cấp từ mỗi lô ≤ số khả dụng của lô; Σ cấp ≤ nhu cầu còn thiếu; mọi cửa hàng nằm trong bán kính; mọi lô khả thi thời gian; ≤ 5 cửa hàng.
- **AC2** Given ví dụ chuẩn "50 bánh: A 20, B 18, C 12", Then phương án đầu tiên là {A 20, B 18, C 12}.

#### US-SYS-06 · Chuyển trạng thái chỉ qua RPC
*Là* hệ thống, *tôi cần* chặn cập nhật trực tiếp cột trạng thái *để* không ai đi tắt state machine. · F-02 · P0–P2 · Must
- **AC1** Given vai trò `authenticated`, When `UPDATE offers SET status = …` trực tiếp, Then bị từ chối (revoke UPDATE cả bảng, chỉ grant UPDATE cho danh sách cột được phép — cột trạng thái không nằm trong danh sách, DATA-MODEL §9.4; pgTAP) — áp dụng cho mọi bảng có trạng thái (organizations, offers, needs, need_bundles, allocations, pickups, proofs, incidents).
- **AC2** Given mọi RPC chuyển trạng thái, Then ghi `audit_logs` và nhận `client_op_id`; gọi lại cùng `client_op_id` trả kết quả cũ.

#### US-SYS-07 · Sổ tác động ghi lúc dropoff
*Là* hệ thống, *tôi cần* ghi tác động đúng một lần khi hàng tới tổ chức *để* ESG chính xác. · F-49 · P2 · Must
- **AC1** Given dòng bàn giao dropoff với `qty_delivered > 0`, Then ledger ghi một dòng `credit` (unique theo handover line) với kg = `qty_delivered × unit_weight_kg`, CO₂e, nước, suất ăn theo version hệ số hiện hành.
- **AC2** Given cần đính chính (Admin xử lý phản ánh sai số), Then ghi dòng `reversal`, không sửa/xóa dòng cũ.
- **AC3** Given tự đến lấy, Then bàn giao duy nhất ghi ledger ngay.

#### US-SYS-08 · Trạng thái nhu cầu tính từ tổng
*Là* hệ thống, *tôi cần* trạng thái nhu cầu suy ra từ số đặt và số giao *để* không lệch. · F-24 · P3 · Must
- **AC1** Given Σ đặt + Σ giao ≥ cần, Then `matched`; Σ giao ≥ cần, Then `fulfilled`; có một phần, Then `partially_matched`.
- **AC2** Given tới `needed_by`, Then `closed_partial` nếu đã giao > 0, ngược lại `expired`.

#### US-SYS-09 · Ảnh không còn metadata
*Là* hệ thống, *tôi cần* mọi ảnh tải lên được mã hóa lại *để* không rò GPS/EXIF. · F-45, F-06 · P1–P4 · Must
- **AC1** Given bất kỳ ảnh nào tải lên `kyc`, `proofs`, `media`, Then file lưu không chứa EXIF (test đọc lại file).

#### US-SYS-10 · Tự xóa dữ liệu nhạy cảm theo hạn
*Là* hệ thống, *tôi cần* xóa dữ liệu khi hết mục đích *để* tuân thủ tối thiểu hóa dữ liệu. · F-06, F-38 · P1–P5 · Must
- **AC1** Given file KYC 30 ngày sau quyết định duyệt, Then bị xóa bởi job hằng ngày, audit ghi lại.
- **AC2** Given chuyến kết thúc, Then vị trí tình nguyện viên của chuyến bị xóa.

#### US-SYS-11 · Giới hạn tần suất
*Là* hệ thống, *tôi cần* giới hạn tần suất các thao tác nhạy cảm *để* chống lạm dụng. · NFR-SEC · P1 · Must
- **AC1** Given đăng nhập, OTP, nhập mã 6 số, gọi AI, tạo lời mời, Then áp hạn mức theo `rate_limits` (giá trị trong `SECURITY-PRIVACY.md`); vượt → thông báo tiếng Việt có thời gian thử lại.

#### US-SYS-12 · Seed demo tương đối
*Là* hệ thống, *tôi cần* seed demo không bao giờ "hết hạn" vào ngày demo *để* giám khảo luôn thấy đủ trạng thái. · F-70 · P2 · Must
- **AC1** Given seed chạy bất kỳ ngày nào, Then có ≥ 3 cửa hàng hư cấu với lô Xanh, Vàng, Đỏ đang mở; ≥ 2 tổ chức (một `approximate`); ≥ 2 TNV; 1 nhu cầu "50 bánh" ghép được từ 3 cửa hàng; lịch sử 90 ngày.

#### US-SYS-13 · Giữ chỗ tự hết hạn không cần cron
*Là* hệ thống, *tôi cần* yêu cầu quá `reserved_until` tự được giải phóng khi có thao tác chạm vào lô *để* không khóa hàng oan khi cron trễ. · F-22 · P2 · Must
- **AC1** Given yêu cầu quá hạn trên lô X, When một RPC giữ chỗ khác khóa lô X, Then yêu cầu cũ chuyển `expired` và số lượng trả về trước khi tính số khả dụng.

#### US-SYS-14 · Tổng hợp ESG hằng tháng
*Là* hệ thống, *tôi cần* làm mới `esg_monthly` và gửi email báo cáo tháng *để* báo cáo sẵn sàng ngày 1. · F-52 · P4 · Must
- **AC1** Given pg_cron `fs_refresh_esg` 01:00 hằng đêm (giờ Việt Nam), Then materialized view `esg_monthly` được làm mới cho các tháng đã kết thúc; ngày 1 hằng tháng, email báo cáo tháng trước gửi cho người bật tùy chọn. Tháng hiện tại không chờ MV: RPC ESG ghép MV (tháng trước) với tổng hợp trực tiếp tháng hiện tại từ `impact_ledger` và bảng nguồn, nên dashboard cập nhật ngay sau mỗi bàn giao (DATA-MODEL 2.5).
- **AC2** Given MV, Then chỉ đọc qua RPC có kiểm tra quyền; anon/authenticated không đọc trực tiếp (pgTAP).

#### US-SYS-15 · Giữ hệ thống sống & giám sát
*Là* hệ thống, *tôi cần* không bị tạm dừng và phát hiện sự cố sớm *để* demo/pilot không gián đoạn. · NFR-REL · P0 · Must
- **AC1** Given workflow keepalive hằng ngày, Then Supabase staging/prod có hoạt động mỗi ngày (tránh bị tạm dừng sau 7 ngày).
- **AC2** Given uptime monitor 5 phút/lần trên `/` và `/api/health`, Then cảnh báo email khi lỗi 2 lần liên tiếp; lỗi runtime gửi Sentry.

#### US-SYS-16 · Tính điểm uy tín
*Là* hệ thống, *tôi cần* cập nhật điểm uy tín theo hành vi *để* tự động chấp nhận và ghép đơn dựa trên dữ liệu thật. · F-12 · P3 · Should
- **AC1** Given sự kiện (bàn giao đúng hạn, hủy sau xác nhận, tổ chức hủy sau khi đã đóng gói, minh chứng được duyệt/quá hạn, phản ánh được xác nhận — gồm no-show khi admin kết luận vi phạm), Then điểm thay đổi theo **bảng điểm cố định** ghi trong DATA-MODEL `trust_events` (không cấu hình lúc chạy; đổi bằng migration có version, như ngưỡng nhãn), giới hạn 0–100, mặc định 50 (theo `DATA-MODEL.md`, bảng `trust_events`); mọi thay đổi có lý do và xem được trong lịch sử.

---

## 8. Yêu cầu phi chức năng

### 8.1 Hiệu năng (NFR-PERF)

| ID | Yêu cầu | Đo bằng |
|---|---|---|
| NFR-PERF-01 | Landing và `/volunteer`: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 trên cấu hình "Moto G Power / Slow 4G" của Lighthouse | Lighthouse CI (gate P5: điểm ≥ 90) |
| NFR-PERF-02 | Trang trong app (cổng): LCP ≤ 3,5 s trên mobile giả lập; Lighthouse Performance ≥ 80 | Lighthouse CI định kỳ |
| NFR-PERF-03 | JS ban đầu mỗi route ≤ 200 KB gzip (không tính MapLibre); MapLibre + tile chỉ tải khi màn có bản đồ hiển thị (dynamic import) | `next build` report trong CI |
| NFR-PERF-04 | RPC chuyển trạng thái p95 ≤ 500 ms; truy vấn kho tặng (bán kính 15 km, ≤ 500 lô) p95 ≤ 300 ms (có GIST index) | log Supabase, test tải nhẹ |
| NFR-PERF-05 | Engine ghép đơn ≤ 1 s cho 15 ứng viên (298 tổ hợp + tham lam) | Vitest benchmark |
| NFR-PERF-06 | Thông báo in-app tới người nhận ≤ 5 s sau sự kiện; email ≤ 2 phút; GẤP ưu tiên trước | E2E đo thời gian |
| NFR-PERF-07 | Ảnh tải lên được nén phía client (cạnh dài ≤ 2048 px, WebP/JPEG chất lượng 0,8) | unit test bộ nén |
| NFR-PERF-08 | Directions/Distance Matrix chỉ gọi cho phương án được chọn; geocode cache ≥ 30 ngày | đếm lượt gọi provider |

### 8.2 Khả năng tiếp cận (NFR-A11Y)

- Tuân thủ **WCAG 2.2 AA**: tương phản chữ ≥ 4,5:1 (chữ lớn ≥ 3:1), thành phần không phải chữ ≥ 3:1, focus nhìn thấy rõ (không bị che — tiêu chí 2.4.11), vùng chạm ≥ 24 × 24 px (khuyến nghị 44 × 44 px trên mobile), không yêu cầu kéo thả là cách duy nhất (2.5.7 — kéo ghim luôn có ô nhập địa chỉ, thanh bán kính có ô số).
- Nhãn tươi **luôn có icon + chữ**, không chỉ màu; marker bản đồ có icon trong marker và danh sách tương đương bên cạnh bản đồ (bản đồ không bao giờ là cách duy nhất để chọn lô).
- Mọi form có `label` liên kết, thông báo lỗi gắn `aria-describedby`, focus nhảy tới lỗi đầu tiên; toast quan trọng có `role="status"`/`alert` phù hợp.
- Đếm ngược không đọc liên tục bởi trình đọc màn hình; có văn bản tĩnh "Hạn hiệu lực 21:00".
- QR toàn màn hình có mã 6 số thay thế đọc được.
- Tôn trọng `prefers-reduced-motion`.
- Kiểm tra tự động bằng axe trong Playwright cho mọi màn chính; kiểm tra tay bằng bàn phím + TalkBack/VoiceOver trước M3.

### 8.3 Bảo mật (NFR-SEC) — chi tiết trong `SECURITY-PRIVACY.md`

- RLS bật trên **100%** bảng; helper `is_admin()` (kiểm tra `aal2`), `is_org_member()`; view `security_invoker = true`; materialized view revoke anon/authenticated.
- Vai trò không bao giờ lấy từ `user_metadata`; revoke UPDATE cả bảng, grant UPDATE cho danh sách cột được phép (DATA-MODEL §9.4) — cột trạng thái không bao giờ trong danh sách; chuyển trạng thái chỉ qua RPC `security definer` có `search_path` cố định (ADR-002, ADR-004).
- Service role chỉ dùng trong `src/server/*` (`server-only`); không có secret trong bundle client; `.env*` bị chặn trong harness; quét secret trong CI.
- Storage: `kyc` private (signed URL 60 s), `proofs` private (300 s), `media` public chỉ cho ảnh đại diện/ảnh bìa/ảnh lô.
- Token bàn giao: ngẫu nhiên ≥ 128 bit, chỉ lưu hash, dùng một lần, có hạn; mã 6 số giới hạn 5 lần sai.
- Job endpoint ký HMAC; rate-limit theo `rate_limits`; header bảo mật (CSP, HSTS, X-Frame-Options, Referrer-Policy) ở Next middleware/config.
- pgTAP hồi quy cho từng lỗi B1–B8; security review agent trước mỗi mốc ★.

### 8.4 Quyền riêng tư (NFR-PRIV)

- Căn cứ: Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025 (các điều khoản cụ thể **cần kiểm chứng**, ghi trong `SECURITY-PRIVACY.md`).
- Đồng ý theo mục đích (`consents`: terms, location_trip, proof_photo, marketing) có phiên bản chính sách; rút lại được; rút lại có hiệu lực ngay.
- Tối thiểu hóa: CCCD chỉ `id_last4`; file KYC xóa sau 30 ngày; vị trí TNV chỉ điểm mới nhất, làm tròn ~11 m, xóa khi kết thúc chuyến; không lưu danh tính người hưởng lợi.
- Ảnh minh chứng: làm mờ mặt trên thiết bị, ảnh gốc không rời thiết bị, xóa EXIF/GPS; chỉ Admin + cửa hàng liên quan (sau duyệt) + tổ chức sở hữu xem được.
- Vị trí điểm nhận `approximate`/`hidden` được che ở mọi API trả cho bên ngoài tổ chức.
- Quyền của chủ thể dữ liệu: xem, sửa hồ sơ; yêu cầu xóa tài khoản qua mục Cài đặt (xử lý thủ công bởi Admin trong ≤ 7 ngày, giữ lại dữ liệu ledger ở dạng ẩn danh).

### 8.5 Ngôn ngữ & định dạng (NFR-I18N)

- Toàn bộ giao diện, email, thông báo, lỗi bằng **tiếng Việt có dấu**, giọng thân thiện, rõ ràng (hướng dẫn trong `DESIGN-SYSTEM.md` mục Copywriting).
- Số: `Intl.NumberFormat('vi-VN')` — "1.234,5"; khối lượng "12,5 kg"; ngày "07/10/2026"; giờ 24h "19:30"; múi giờ hiển thị và tính toán `Asia/Ho_Chi_Minh` (kể cả ở server Vercel chạy UTC).
- Chuỗi giao diện tập trung trong module messages để sẵn sàng i18n sau, nhưng không làm đa ngôn ngữ trong release này.
- Mã hóa UTF-8 ở mọi nơi (hồi quy L10); CSV xuất có BOM.

### 8.6 Ngoại tuyến & PWA (NFR-OFF)

- `/volunteer/*` là PWA cài được (manifest, icon 192/512 maskable, service worker Serwist hoặc `public/sw.js` dự phòng).
- Offline: app shell + dữ liệu "Chuyến hôm nay" gần nhất (chỉ đọc); thao tác ghi cần mạng (trừ khi F-75 được làm).
- Web Push qua VAPID; iOS chỉ nhận push khi đã cài PWA (iOS 16.4+) → dự phòng in-app + email.
- Wake Lock khi hiển thị QR; quét QR dùng camera sau qua `getUserMedia`.

### 8.7 Trình duyệt & thiết bị (NFR-COMP)

| Nhóm | Hỗ trợ |
|---|---|
| Android | Chrome 2 phiên bản lớn gần nhất trên Android 9+, máy 2–3 GB RAM (mục tiêu kiểm thử: một máy Android giá rẻ thật + giả lập Moto G Power) |
| iOS | Safari iOS 16.4+ (Web Push cần 16.4+ và PWA đã cài) |
| Desktop | Chrome, Edge, Firefox, Safari — 2 phiên bản lớn gần nhất |
| Kích thước | Từ 360 px (mobile) tới 1440 px+; không cuộn ngang ở 360 px; tablet 768–1024 px dùng bố cục trung gian |
| Mạng | Dùng được trên 4G chậm; ảnh lazy-load; bản đồ lazy-load |

### 8.8 Độ tin cậy, quan sát, bảo trì (NFR-REL / NFR-OBS / NFR-MAINT)

- Idempotency bằng `client_op_id` cho mọi thao tác ghi quan trọng; outbox idempotent.
- Sentry cho client + server; Vercel Analytics; uptime monitor; keepalive Supabase hằng ngày.
- Môi trường: Dev (Supabase local Docker), Staging (cloud, Vercel Preview), Prod (cloud) từ P0.
- TypeScript strict, type DB sinh tự động (hồi quy L7, L8 — không còn chọn cột không tồn tại); thay đổi DB chỉ qua migration mới; CI: lint, typecheck, unit, build, `supabase db lint`, pgTAP, E2E.
- Không phụ thuộc kết nối Postgres trực tiếp hay WebSocket tự host trên serverless (hồi quy L16) — dùng Supabase client + Realtime.

---

## 9. Quy tắc nhãn tươi Xanh/Vàng/Đỏ

### 9.1 Ngưỡng (phiên bản khởi tạo `label_rules` v1)

| Nhóm hàng (`perishability`) | Ví dụ danh mục | **Xanh** (`green`) | **Vàng** (`yellow`) | **Đỏ** (`red`) | **Hết hạn** (`expired`) |
|---|---|---|---|---|---|
| `cooked` — Đồ nấu chín, bánh tươi (hạn dưới 2 ngày) | Cơm hộp & chế biến, Bánh mì & bakery, Bánh ngọt & dessert | còn > 12 giờ | 4 giờ ≤ còn ≤ 12 giờ | 0 < còn < 4 giờ | còn ≤ 0 |
| `fresh` — Rau củ, trái cây, thịt cá, sữa tươi (hạn vài ngày) | Rau củ tươi, Trái cây, Thịt & hải sản, Sữa & sản phẩm sữa | còn > 72 giờ | 24 giờ ≤ còn ≤ 72 giờ | 0 < còn < 24 giờ | còn ≤ 0 |
| `packaged` — Đồ đóng gói (hạn dài) | Đồ khô, Đồ uống đóng chai/hộp | còn > 7 ngày | 3 ngày ≤ còn ≤ 7 ngày | 0 < còn < 3 ngày | còn ≤ 0 |

- "Còn" = `effective_deadline − now`, tính tại thời điểm đọc.
- Quy ước biên: đúng ngưỡng trên (12 giờ, 72 giờ, 7 ngày) là **Vàng**; đúng ngưỡng dưới (4 giờ, 24 giờ, 3 ngày) là **Vàng**. Fixture test chứa đủ các biên này.
- Danh mục ánh xạ sang `perishability` trong `food_categories`; ngưỡng **không** cấu hình được lúc chạy: đổi ngưỡng bằng migration có version mới (ADR-005); Admin chỉ xem (US-ADM-12).

### 9.2 Hạn hiệu lực

`effective_deadline = least(expires_at, upper(pickup_window), thời điểm đóng cửa gần nhất của điểm sau thời điểm đăng)` theo `site_hours`/`site_closures`, giờ `Asia/Ho_Chi_Minh` (DATA-MODEL 4.2).

- Nếu cửa hàng chỉ nhập ngày hết hạn → `expires_at` = 23:59 ngày đó (giờ Việt Nam).
- Khung giờ lấy (`pickup_window`) phải nằm trong giờ mở cửa và kết thúc ≤ `effective_deadline` (kiểm tra khi đăng).
- `effective_deadline` do RPC tính và **lưu** khi đăng/sửa lô hoặc khi giờ mở cửa của điểm thay đổi; **nhãn không lưu**, luôn tính lúc đọc (ADR-005).

**Ví dụ chuẩn (từ tài liệu nhóm):** bánh hết hạn lúc 24:00, cửa hàng đóng cửa lúc 21:00 → hạn hiệu lực 21:00 → Đỏ (< 4 giờ) bắt đầu từ **17:00**, không phải 20:00.

### 9.3 Nhãn đi qua những màn nào

| Bước | Màn | Điều xảy ra | F / US |
|---|---|---|---|
| 1 | Cửa hàng → Kho hàng → Thêm SP | Xem trước nhãn + hạn hiệu lực + giờ chuyển Đỏ | F-15, F-16 · US-STO-07, US-STO-09 |
| 2 | Hệ thống (pg_cron 5 phút) | Phát sự kiện chuyển Đỏ; đóng lô hết hạn. Nhãn trên UI tự đổi vì tính lúc đọc | F-17 · US-SYS-02 |
| 3 | Cửa hàng → Kho hàng → Chuyển từ thiện | Thông báo tổ chức đủ điều kiện + Admin; lô Đỏ = GẤP | F-19, F-56 · US-STO-11 |
| 4 | Tổ chức → Kho tặng (Donation box) | Ưu tiên Đỏ → Vàng; lô Đỏ chỉ gợi ý khi đến kịp | F-21, F-30 · US-CHA-05–07 |
| 5 | Admin → Lô hàng tồn kho | Xem mọi lô với nhãn + trạng thái, tự làm mới 5 phút, "Cập nhật nhãn ngay" | F-64 · US-ADM-05, US-ADM-06 |
| 6 | Landing → Giải thích nhãn | Bảng ngưỡng đọc từ DB | F-77 · US-PUB-03 |

### 9.4 Hiển thị

| Nhãn | Chữ hiển thị | Icon (lucide) | Ý nghĩa ngắn cho người dùng |
|---|---|---|---|
| Xanh | "Xanh" | `leaf` | Còn thời gian, nhận theo kế hoạch |
| Vàng | "Vàng" | `clock` | Nên nhận sớm, trong ngày |
| Đỏ | "Đỏ" | `alarm-clock` hoặc `flame` (chốt trong DESIGN-SYSTEM) | Cần lấy ngay, chỉ nhận nếu đến kịp |
| Hết hạn | "Hết hạn" | `circle-slash` | Không còn nhận |

Token màu và quy tắc tương phản: `DESIGN-SYSTEM.md` mục Nhãn tươi.

---

## 10. Ma trận thông báo

**Kênh:** **App** = in-app Realtime + trung tâm thông báo · **Push** = Web Push (P5; trước P5 bỏ qua) · **Email** = Resend. **Mức:** GẤP (gửi ngay mọi kênh đã bật, nổi bật đỏ trong trung tâm thông báo, bỏ qua gom nhóm) · Thường · Tóm tắt (gom nhóm/ngày).
"Bắt buộc" = người dùng không tắt được. Mọi thông báo có mã sự kiện đi qua `notification_outbox` (idempotent); email do Supabase Auth gửi thì không.

| # | Sự kiện | Mã sự kiện (`notification_event`) | Người nhận | App | Push | Email | Mức | Loại trong cài đặt | Phase |
|---|---|---|---|---|---|---|---|---|---|
| N-01 | Hồ sơ được gửi duyệt | `org_submitted` | Admin | ✓ | ✓ | — | Thường | — (Admin) | P1 |
| N-02 | Hồ sơ được duyệt / bị từ chối | `org_reviewed` | Owner tổ chức/cửa hàng | ✓ | ✓ | ✓ | Thường · bắt buộc | Tài khoản | P1 |
| N-03 | Lời mời thành viên / TNV | `member_invited` (chỉ email) | Người được mời | — | — | ✓ | Thường · bắt buộc | — | P2/P3 |
| N-04 | Lô mới mở (Xanh/Vàng) | `offer_published` | Owner/manager tổ chức đủ điều kiện (thứ tự công bằng); Admin | ✓ | ✓ | tùy chọn | Thường (Admin: gom 15 phút) | "Lô mới (thường)" | P2 |
| N-05 | Lô mới mở là Đỏ, hoặc lô đang mở chuyển Đỏ mà chưa giữ hết | `offer_published` (urgent), `offer_turned_red` | Tổ chức đủ điều kiện **và đến kịp**; Admin | ✓ | ✓ | ✓ | **GẤP** | "Lô mới (GẤP)" | P2 |
| N-06 | Nhu cầu mới | `need_published` | Owner/manager cửa hàng có điểm trong bán kính, danh mục phù hợp; Admin | ✓ | ✓ | tùy chọn | Thường; GẤP nếu `needed_by` ≤ 4 giờ | "Nhu cầu mới gần bạn" | P3 |
| N-07 | Yêu cầu nhận lô mới | `allocation_requested` | Owner/manager/staff của điểm cửa hàng | ✓ | ✓ | tùy chọn | Thường; GẤP nếu lô Đỏ | "Yêu cầu nhận lô mới" | P2 |
| N-08 | Yêu cầu được chấp nhận (thủ công/tự động) | `allocation_confirmed` | Tổ chức yêu cầu | ✓ | ✓ | — | Thường | Vận hành | P2 |
| N-09 | Yêu cầu bị từ chối / hết hạn giữ chỗ | `allocation_rejected`, `allocation_expired` | Tổ chức yêu cầu | ✓ | ✓ | — | Thường | Vận hành | P2 |
| N-10 | Phương án ghép đã sẵn sàng / có phương án bổ sung phần thiếu | `bundle_options_ready`, `bundle_shortfall` | Tổ chức | ✓ | ✓ | — | Thường | Vận hành | P3 |
| N-11 | Bundle xác nhận đủ | `bundle_confirmed` | Tổ chức | ✓ | — | — | Thường | Vận hành | P3 |
| N-12 | Cửa hàng đáp ứng nhu cầu | `need_responded` | Tổ chức | ✓ | ✓ | — | Thường | Vận hành | P3 |
| N-13 | Đã đóng gói | `allocation_packed` | Tổ chức; TNV của chuyến | ✓ | — | — | Thường | Vận hành | P2 |
| N-14 | Được giao chuyến | `pickup_assigned` | TNV | ✓ | ✓ | ✓ (dự phòng iOS) | Thường; GẤP nếu có lô Đỏ | — (TNV mặc định bật) | P3 |
| N-15 | TNV nhận chuyến / từ chối chuyến | `volunteer_accepted`, `volunteer_declined` | Điều phối viên tổ chức | ✓ | ✓ | — | Thường | "Tình nguyện viên xác nhận" | P3 |
| N-16 | TNV check-in tại điểm dừng | `volunteer_checked_in` | Cửa hàng của điểm đó | ✓ | ✓ | — | Thường | "TNV sắp tới" | P3 |
| N-17 | Bàn giao pickup hoàn tất | `pickup_handover_done` | Tổ chức | ✓ | — | — | Thường | Vận hành | P2 |
| N-18 | Dropoff hoàn tất (hàng tới tổ chức) | `delivery_completed` | Cửa hàng liên quan | ✓ | — | — | Thường | Vận hành | P2 |
| N-19 | Cửa hàng hủy sau xác nhận | `allocation_cancelled` (cửa hàng hủy) | Tổ chức; TNV (nếu đã phân công); Admin | ✓ | ✓ | ✓ | **GẤP** nếu chuyến đang chạy, ngược lại Thường | Vận hành · bắt buộc | P3 |
| N-20 | Tổ chức hủy trước khi lấy | `allocation_cancelled` (tổ chức hủy), `pickup_cancelled` | Cửa hàng; TNV | ✓ | ✓ | — | Thường | Vận hành | P3 |
| N-21 | TNV không đến / sự cố trong chuyến | `pickup_cancelled`, `incident_opened` | Điều phối viên tổ chức; cửa hàng | ✓ | ✓ | — | **GẤP** | Vận hành · bắt buộc | P3 |
| N-22 | Lô hết hạn chưa được nhận hết | `offer_expired` | Cửa hàng | ✓ | — | — | Thường | Vận hành | P2 |
| N-23 | Nhu cầu đóng một phần / hết hạn | `need_closed` | Tổ chức | ✓ | — | ✓ | Thường | Vận hành | P3 |
| N-24 | Minh chứng sắp đến hạn (còn 12 giờ) | `proof_due_soon` | Tổ chức | ✓ | ✓ | ✓ | Thường | Nhắc minh chứng | P4 |
| N-25 | Minh chứng quá hạn | `proof_overdue` | Tổ chức; Admin | ✓ | ✓ | ✓ | Thường · bắt buộc | Nhắc minh chứng | P4 |
| N-26 | Minh chứng được gửi | `proof_submitted` | Admin | ✓ | — | — | Thường | — | P4 |
| N-27 | Minh chứng được duyệt | `proof_reviewed` (approved) | Tổ chức; cửa hàng liên quan | ✓ | ✓ | — | Thường | "Minh chứng mới" (cửa hàng) | P4 |
| N-28 | Minh chứng cần sửa / bị từ chối | `proof_reviewed` (needs_changes/rejected) | Tổ chức | ✓ | ✓ | ✓ | Thường | Vận hành | P4 |
| N-29 | Lời cảm ơn từ cửa hàng | `thank_you_received` | Tổ chức | ✓ | ✓ | — | Thường | "Lời cảm ơn" | P4 |
| N-30 | Báo cáo tháng sẵn sàng | `monthly_report_ready` | Owner cửa hàng/tổ chức; (tùy chọn) nhà tài trợ | ✓ | — | ✓ | Tóm tắt | "Báo cáo tháng" | P4 |
| N-31 | Phản ánh mới | `incident_opened` | Admin; bên bị phản ánh | ✓ | ✓ | ✓ (Admin) | Thường | Vận hành · bắt buộc | P4 |
| N-32 | Tổ chức bị tạm khóa / mở khóa | `org_suspended`, `org_reinstated` | Owner tổ chức | ✓ | — | ✓ | Thường · bắt buộc | Tài khoản | P4 |
| N-33 | Đăng nhập trên thiết bị mới / đổi mật khẩu / đổi MFA | Supabase Auth email — không qua outbox | Chủ tài khoản | — | — | ✓ | Bắt buộc | Bảo mật | P1 |

Ghi chú:
- Cột "Mã sự kiện" khớp enum `notification_event` (DATA-MODEL §1, người nhận ở §12.2); hai tài liệu phải đổi cùng nhau. Mọi sự kiện có mã đi qua `notification_outbox`. N-03 chỉ gửi email tới địa chỉ được mời (chưa chắc có tài khoản). N-33 và email xác minh/OTP/đặt lại mật khẩu (F-01) là **Supabase Auth email — không qua outbox** (template ở Supabase Auth, gửi qua SMTP Resend).
- "Tổ chức đủ điều kiện" = có điểm nhận chứa cửa hàng trong `radius_km`, nhận danh mục, không tạm ngưng, trong giờ nhận và khả thi thời gian (F-30), sắp theo chỉ số công bằng (F-28).
- Zalo OA/ZNS và SMS cho mức GẤP: sau giải (F-60).

---

## 11. Bảng truy vết

Ký hiệu nguồn: **CN** = "FoodSave_Chucnangdachinhsua" (chức năng đã chỉnh sửa theo vai trò); **ĐH** = "DINH_HUONG_FoodSave" (4 hướng + bảng ESG, 25/09/2026); **BG** = "BAN_GIAO_FoodSave" (bàn giao bản cũ, lỗi L/B); **PL** = plan đã duyệt.

### 11.1 Tài liệu chức năng (CN)

| Mục CN | Yêu cầu | Cách đáp ứng trong v2 | F | US |
|---|---|---|---|---|
| Tổng quan · Partner | Kho hàng, Đơn hàng cần xử lý, Tặng thực phẩm – Kết nối từ thiện, Cài đặt hệ thống | 4 khu vực cổng cửa hàng với cùng tên | F-18, F-42, F-27, F-10 | US-STO-10, -15, -20, -27 |
| Tổng quan · Charity | Donation box, Bản đồ & tuyến, Cài đặt tổ chức, Gallery ảnh | Kho tặng, Bản đồ & tuyến, Cài đặt tổ chức, Minh chứng & Gallery | F-21, F-36, F-11, F-48 | US-CHA-05, -19, -31, -27 |
| Tổng quan · Admin | Lô hàng tồn kho, Đơn hàng, Nhật ký hoạt động | Cùng tên trong `/admin` | F-64, F-65, F-63 | US-ADM-05, -07, -11 |
| Tổng quan · Dùng chung | Nhãn Xanh/Vàng/Đỏ tự động theo thời gian còn lại | Nhãn tính lúc đọc + cron | F-16, F-17 | US-SYS-01, -02 |
| Đăng ký Partner/Charity | Cập nhật bản đồ định vị vị trí tổ chức và cửa hàng | LocationPicker trong wizard | F-03, F-04, F-05 | US-STO-02, US-CHA-02 |
| Đăng ký Charity | Chọn bán kính phục vụ để biết cửa hàng trong phạm vi | Thanh bán kính + vòng tròn + đếm cửa hàng; dùng cho kho tặng, ghép đơn, thông báo | F-04 | US-CHA-02 |
| 1.1 Kho hàng · Thêm SP | Hoàn thiện đưa sản phẩm lên hệ thống | Form đăng lô đầy đủ + AI tự điền | F-15, F-14, F-81 | US-STO-07, -08 |
| 1.1 Kho hàng · Chuyển từ thiện | Bấm nút → đẩy thông báo đến các tổ chức | Công bố lô `draft → open` + outbox | F-19, F-56 | US-STO-11 |
| 1.1 Kho hàng · Nhãn hạn dùng | Gắn tự động khi đăng | Xem trước nhãn + hạn hiệu lực | F-16 | US-STO-09 |
| 1.2 Đơn hàng cần xử lý | Hiển thị đơn đã được tổ chức nhận, đang chuẩn bị giao nhận | Danh sách phân bổ đang chạy | F-42 | US-STO-15 |
| 1.2 · "người mua (hướng phát triển sau này)" | Đơn của người mua | **Ngoài phạm vi** (B2C) | — | mục 4.2 |
| 1.2 · Theo dõi tiến trình | Tổ chức nhận khi nào, TNV nào, đã đóng gói chưa, TNV đã đến chưa | Dòng thời gian + nút "Đã đóng gói" + check-in + ETA | F-42, F-37, F-35 | US-STO-15, -16, -22, US-VOL-06 |
| 1.2 · Lưu ý QR | Tổ chức nhận đơn → hệ thống tạo QR; TNV đưa QR để cửa hàng quét rồi mới lấy | Token bàn giao một lần + màn bàn giao + QR trên PWA | F-39, F-40, F-73 | US-STO-17, -18, US-VOL-07, -08 |
| 1.3 Tặng thực phẩm – Kết nối · Yêu cầu của tổ chức đang cần | Hiển thị nhu cầu của các tổ chức | Tab "Nhu cầu gần bạn" (bản đồ + danh sách) + phản hồi | F-27 | US-STO-20, -21 |
| 1.3 · Tổ chức muốn nhận lô đã đăng | Hiển thị các yêu cầu nhận lô | Tab "Yêu cầu nhận lô" + duyệt/tự động | F-23, F-27 | US-STO-13, -14 |
| 1.4 Cài đặt hệ thống | Partner hoàn thiện thông tin cửa hàng | `/store/settings` | F-10, F-08, F-09 | US-STO-27, -05, -06, -28 |
| 2.1 Donation box · Hiển thị sản phẩm đã đăng | Kho tặng | Split view bản đồ + danh sách | F-21 | US-CHA-05 |
| 2.1 · Chọn sản phẩm + gửi thông báo về cửa hàng | Yêu cầu nhận → cửa hàng chuẩn bị | Yêu cầu nhận + đặt chỗ nguyên tử + thông báo N-07 | F-22 | US-CHA-08 |
| 2.1 · Ưu tiên lô Đỏ và Vàng | Sắp xếp/lọc | Mặc định Đỏ → Vàng → Xanh; bộ lọc | F-21 | US-CHA-06 |
| 2.2 Bản đồ & tuyến | Bản đồ + khoảng cách + thời gian di chuyển ước tính từ tổ chức và từ TNV đến cửa hàng | `/charity/map` + Distance Matrix | F-36, F-31 | US-CHA-19 |
| 2.3(1) Hồ sơ tổ chức | Tên, loại hình, email, SĐT, địa chỉ, ngày thành lập, mã số tổ chức, đánh giá; nút "Sửa" mỗi mục | Mục Hồ sơ; "đánh giá" = điểm uy tín chỉ đọc | F-11, F-12 | US-CHA-31 |
| 2.3(1) Nhà tài trợ liên kết | Danh sách + email + "Thêm nhà tài trợ" | Bảng `sponsors` | F-11 | US-CHA-32 |
| 2.3(1) Cài đặt thông báo | 5 loại: donation mới GẤP (kèm SMS), donation mới thường, TNV xác nhận, báo cáo tháng, lời cảm ơn | 5 loại × kênh; SMS sau giải | F-59, F-60 | US-CHA-33 |
| 2.3(1) Nhãn · GẤP cho lô Đỏ | "Donation mới (GẤP)" dùng cho lô Đỏ | N-05 | F-56 | US-STO-11 AC3, US-CHA-33 |
| 2.3(2) Giờ hoạt động & nhận hàng | Khung giờ theo ngày + "Lưu giờ hoạt động" | `site_hours` + `site_closures` | F-11, F-08 | US-CHA-34 |
| 2.3(2) Loại thực phẩm chấp nhận | Bật/tắt nhóm (bánh mì, cơm hộp, rau củ, sữa, thịt & hải sản, bánh ngọt, đồ uống, đồ khô…) | `sites.accepted_categories` | F-11 | US-CHA-35 |
| 2.3(2) Thiết bị & tích hợp | Tablet quản lý, máy in biên bản, GPS điều phối, email báo cáo tự động, nút "Cấu hình" | Chỉ các mục có thật: PWA + tài khoản staff; in biên bản; đồng ý vị trí; email báo cáo tháng | F-11, F-74, F-43, F-38, F-52 | US-CHA-36 |
| 2.3(2) Tạm ngưng nhận donation / Đăng xuất tổ chức | Hai nút cuối trang | Tạm ngưng có thời hạn; đăng xuất/chuyển tổ chức | F-11 | US-CHA-37 |
| 2.4 Gallery ảnh | Tổ chức chụp ảnh gửi cửa hàng và Admin xem; chứng minh dùng đúng mục đích | Minh chứng + gallery + Admin duyệt + cửa hàng xem | F-44–F-48 | US-CHA-24–28, US-STO-23, US-ADM-09 |
| 3.1 Lô hàng tồn kho | Số lượng, **giá**, hạn dùng, nhãn, trạng thái | Bảng lô (bỏ cột giá — thay bằng kg) | F-64 | US-ADM-05 |
| 3.1 · Tự cập nhật 5 phút + "Cập nhật nhãn ngay" | | Làm mới 5 phút + Realtime + nút chạy tác vụ ngay | F-64, F-17 | US-ADM-05, -06 |
| 3.2 Đơn hàng | Tổ chức đã đặt sản phẩm từ cửa hàng nào | Bảng phân bổ | F-65 | US-ADM-07 |
| 3.3 Nhật ký hoạt động | Ghi lại toàn bộ hoạt động | `audit_logs` | F-63 | US-ADM-11 |
| 4.1 Quy tắc gắn nhãn | Bảng ngưỡng 3 nhóm | `label_rules` v1 | F-16 | mục 9, US-SYS-01 |
| 4.1 · Tác vụ định kỳ Xanh → Vàng → Đỏ | | Nhãn tính lúc đọc (luôn đúng) + cron phát sự kiện chuyển Đỏ | F-16, F-17 | US-SYS-02 |
| 4.1 · Mốc đến trước: hết hạn hoặc đóng cửa (ví dụ 24h/21h → Đỏ từ 17h) | | `effective_deadline` | F-16 | US-STO-09 AC1, mục 9.2 |
| 4.2 Nhãn qua các màn (5 bước) | | Bảng 9.3 | F-15, F-17, F-19, F-21, F-64 | mục 9.3 |
| Gợi ý · Ngưỡng Đỏ phải đủ thời gian đi lấy; chỉ gợi ý lô Đỏ cho tổ chức đến kịp | | Kiểm tra khả thi | F-30 | US-CHA-07 |
| Gợi ý · Thống nhất tên nhãn Xanh/Vàng/Đỏ ở cả ba giao diện | | Nguyên tắc 1.6.3; một component `FreshnessBadge` | F-16 | US-ADM-05 AC4 |
| 5 · Admin và Partner xem minh chứng | | Admin duyệt; cửa hàng liên quan xem đã duyệt | F-47, F-48 | US-ADM-09, US-STO-23 |
| 5 · Hoàn thiện chi tiết mục 1, 2, 3, 4 | | Toàn bộ bảng này | — | — |

### 11.2 Tài liệu định hướng (ĐH)

| Mục ĐH | Yêu cầu | F | US |
|---|---|---|---|
| 1 · Cửa hàng đăng → thông báo Admin + tổ chức gần | Thông báo hai chiều theo bán kính | F-19, F-56 | US-STO-11, US-SYS-04, US-ADM-17 |
| 1 · Tổ chức đăng nhu cầu → thông báo Admin + cửa hàng gần | | F-24, F-56 | US-CHA-09, US-SYS-04, US-ADM-17 |
| 1 · Không đủ số lượng → tự ghép thêm từ cửa hàng khác | Engine ghép + ghép lại phần thiếu | F-25, F-26 | US-CHA-10, -11, -12, US-SYS-05 |
| 1 · Tổ chức phân công TNV đến từng cửa hàng | Chuyến + phân công | F-33 | US-CHA-16 |
| 1 · Ví dụ 50 bánh (20 + 18 + 12; TNV1 lấy 2 cửa hàng, TNV2 lấy 1) | Kịch bản gate P3 | F-25, F-33 | US-CHA-10 AC1, US-CHA-16 AC1, US-SYS-05 AC2 |
| 1 · Ghi rõ số lượng + đơn vị và loại món | Bắt buộc trong form lô và nhu cầu | F-15, F-24 | US-STO-07, US-CHA-09 |
| 1 · Ưu tiên hàng sắp hết hạn và cửa hàng gần | Trọng số 0,4 độ gấp + 0,3 gần | F-25 | US-CHA-10 |
| 1 · Lấy hàng xong, cửa hàng và người lấy cùng xác nhận | Xác nhận hai phía | F-40, F-73 | US-STO-18 AC4, US-VOL-08 |
| 2 · Minh chứng: hình ảnh (phát, chế biến, nấu ăn) | | F-44 | US-CHA-24 |
| 2 · Văn bản mô tả ngắn (phát cho ai, bao nhiêu suất) | | F-44 | US-CHA-24 AC2 |
| 2 · Địa chỉ từ định vị máy, cho sửa tay | Mini-map | F-44 | US-CHA-24 AC2 |
| 2 · Tự gửi về cửa hàng đã quyên góp lô đó + Admin | Sau khi Admin duyệt | F-47, F-48 | US-ADM-09, US-STO-23 |
| 2 · Admin xác nhận hợp lệ | | F-47 | US-ADM-09 |
| 2 · Nhắc tổ chức nếu quá hạn | | F-46 | US-CHA-26 |
| 2 · Tránh chụp rõ mặt, nhất là trẻ em | Làm mờ trên máy | F-45 | US-CHA-25 |
| 2 · Ảnh chỉ cửa hàng liên quan và Admin xem | RLS + signed URL | F-47, F-48 | US-STO-23 AC2, AC4 |
| 3 · Vị trí tổ chức, cửa hàng, TNV trên bản đồ | 9 màn bản đồ | F-31–F-38 | mục 6.2 |
| 3 · Ghép cửa hàng gần tổ chức nhất | | F-25 | US-CHA-10 |
| 3 · Gợi ý TNV gần cửa hàng nhất | | F-33 | US-CHA-16 AC2 |
| 3 · Chỉ đường đi lấy hàng | | F-33, F-72 | US-CHA-17, US-VOL-05 |
| 3 · TNV bổ sung vị trí, chỉ chia sẻ khi đồng ý | `base_area` gần đúng + consent | F-32, F-38 | US-VOL-01, -02, -12 |
| 4 · Mỗi cổng hiện chỉ số riêng; Admin xem tổng + xuất báo cáo tháng | | F-50, F-51, F-52 | US-STO-24, US-CHA-29, US-ADM-14 |
| 4 · Backend cũ `eco_impact_events` | Thay bằng `impact_ledger` + `esg_monthly` | F-49 | US-SYS-07, -14 |
| Thứ tự gợi ý: kết nối + ghép → định vị → minh chứng → ESG | P2–P3 → P3 → P4 → P4 | — | ROADMAP |

**Bảng chỉ số ESG (ĐH mục 4) → nơi tính và hiển thị.** Công thức chi tiết và nguồn: `ESG-METHODOLOGY.md`.

| Nhóm | Chỉ số | Cách đo (ĐH) | Nguồn dữ liệu v2 | Hiển thị |
|---|---|---|---|---|
| E | Thực phẩm được cứu (kg) | Tổng kg các lô đã giao thành công | `impact_ledger` (kg) | Cửa hàng, Tổ chức, Admin, Công khai |
| E | CO₂ tránh được (kg CO₂e) | kg × 2,0 (FAO 2013: 3,3 Gt CO₂e ÷ 1,6 Gt; thay 2,5 của code cũ — ADR-009) | ledger × `impact_factors` | Cả 4 |
| E | Nước tiết kiệm (lít) — nhãn UI "Nước tưới tránh lãng phí (ước tính)" | kg × 150 L/kg (chỉ nước xanh lam, FAO 2013: 250 km³ ÷ 1,6 Gt; 890 L/kg cũ bị loại vì không có nguồn — ADR-009) | ledger × `impact_factors` | Cả 4 |
| E | Tỷ lệ hàng hết hạn chưa được nhận (%) | Lô hết hạn chưa ai nhận ÷ tổng lô đã đăng | `offers` | Cửa hàng, Admin |
| S | Số suất ăn tương đương | kg ÷ 0,42 kg/suất (WRAP, thay 0,35 kg của code cũ — ADR-009) | ledger × `impact_factors` | Cả 4 |
| S | Số người được hỗ trợ | Tổng số người trong minh chứng | `proofs.people_served` (đã duyệt) | Tổ chức, Cửa hàng (liên quan), Admin, Công khai |
| S | Tỷ lệ nhu cầu được đáp ứng đủ (%) | Nhu cầu nhận đủ ÷ tổng nhu cầu | `needs` | Tổ chức, Admin |
| S | Số cửa hàng, tổ chức hoạt động | Số bên có ≥ 1 lần tặng/nhận trong tháng | ledger | Admin, Công khai |
| S | Số chuyến lấy hàng của TNV | Đếm lần lấy hàng đã xác nhận | `pickups`/`handovers` | Tổ chức, Admin |
| G | Tỷ lệ lô có minh chứng hợp lệ (%) | Lô có minh chứng được duyệt ÷ lô đã giao | `proofs`, `proof_allocations` | Cả 3 cổng |
| G | Thời gian đăng minh chứng (giờ) | TB từ nhận hàng đến đăng minh chứng | `handovers`, `proofs` | Tổ chức, Admin |
| G | Thời gian duyệt hồ sơ (ngày) | TB từ đăng ký đến Admin duyệt | `organizations` | Admin, Công khai |
| G | Phản ánh / vi phạm đã xử lý (%) | Đã xử lý ÷ tổng phản ánh | `incidents` | Admin |

### 11.3 Plan mục 1–2 (tóm tắt các mục chưa xuất hiện ở trên)

| Mục PL | F | US |
|---|---|---|
| Khách: landing kể chuyện, bộ đếm thật, bản đồ ẩn danh 500 m, giải thích nhãn, Điều khoản/Bảo mật, trang KPI công khai | F-76–F-80, F-07 | US-PUB-01–06 |
| Cửa hàng: auto-accept; ESG + báo cáo tháng; Bảng xếp hạng Xanh; chi nhánh/giờ/ngày nghỉ/nhân viên | F-23, F-50, F-52, F-53, F-08, F-09 | US-STO-14, -24, -25, -26, -05, -06 |
| Tổ chức: điểm nhận với bán kính/loại nhận/giờ; tối đa 3 phương án; TNV (email, phương tiện, sức chở, khu vực); chuyến (phân công, tuyến, check-in) | F-04, F-25, F-32, F-33, F-37 | US-CHA-02, -10, -14–18 |
| TNV: cài PWA, chuyến hôm nay, chỉ đường, QR/mã 6 số, xác nhận số lượng, check-in + vị trí khi app mở, Web Push | F-71–F-74, F-37, F-38, F-58 | US-VOL-03–12 |
| Admin: hàng đợi duyệt (signed URL, lý do, người duyệt), giám sát lô, phân bổ/chuyến, duyệt minh chứng, phản ánh, audit, xem ngưỡng/hệ số (chỉ đọc), ESG hệ thống, KPI, reset demo, MFA (DB) | F-61–F-70 | US-ADM-01–20 |
| An toàn thực phẩm: cam kết khi đăng, từ chối từng dòng, miễn trừ bên tặng | F-15, F-40, F-41, F-07 | US-STO-07 AC4, US-STO-18 AC2, US-CHA-21 AC2, US-PUB-06 |
| eKYC trung thực (QR CCCD tùy chọn, AI giấy tờ, xóa 30 ngày, không quét mặt giả) | F-13, F-82, F-06 | US-STO-03, US-CHA-04, US-SYS-10 |
| AI có feature flag | F-81–F-84, F-68 | US-STO-08, US-ADM-09 AC4, US-ADM-20 |

### 11.4 Lỗi & vấn đề bản cũ (BG) → biện pháp trong v2

Chi tiết biện pháp kỹ thuật và test hồi quy: `SECURITY-PRIVACY.md` (bảng truy vết L/B). Bảng dưới ở mức sản phẩm.

| Mã | Vấn đề bản cũ (tóm tắt) | Biện pháp v2 | F / NFR | US / test |
|---|---|---|---|---|
| L1 | Nút "Đăng nhập doanh nghiệp" trỏ link cũ → 404 | Một trang `/login` duy nhất; kiểm tra link hỏng trong CI | F-01, F-80 | US-PUB-08, US-PUB-09 AC1 |
| L2 | Nhận diện trang theo tên file → màn đăng nhập mẫu vào thẳng cổng | Guard phía server theo phiên + membership, không theo URL/tên file | F-02 | US-PUB-08 AC2 |
| L3 | Nút "Mã QR"/OTP mẫu vào thẳng cổng không đăng nhập | Không có màn mẫu; mọi route cổng yêu cầu phiên hợp lệ | F-02, nguyên tắc 1.6.1 | US-PUB-08 AC2 |
| L4 | Cửa hàng đăng nhập không kiểm tra trạng thái/vai trò | Guard + RLS chỉ cho tổ chức `approved` vào cổng | F-02 | US-PUB-08 AC2 |
| L5 | Đăng ký tạo 2 dòng cửa hàng | Một tổ chức nháp/chủ/loại (unique); wizard upsert | F-03 | US-STO-01 AC2 |
| L6 | Đăng sản phẩm dùng bảng `products` không tồn tại | Mô hình `offers` mới qua migration | F-15 | US-STO-07 |
| L7 | API chọn cột không tồn tại → Donation inbox trống | Type DB sinh tự động + typecheck trong CI | NFR-MAINT | US-CHA-05 |
| L8 | Backend chọn cột đã xóa | Như L7; không có backend Express riêng | NFR-MAINT | — |
| L9 | Admin không có nút đăng nhập; hồ sơ chờ duyệt (`submitted`) không hiện | `/admin` yêu cầu đăng nhập + MFA trước khi hiển thị gì | F-62, F-61 | US-ADM-01, -02 |
| L10 | Chữ lỗi mã hóa | UTF-8 toàn bộ; lint; review chất lượng tiếng Việt (agent `ux-reviewer`) | NFR-I18N | — |
| L11 | Admin gọi bảng/vai trò B2C đã xóa | Không có B2C | mục 4.2 | US-PUB-01 AC4 |
| L12 | Thiếu trang chính sách/điều khoản, ảnh OG | Trang pháp lý + OG | F-07, F-80 | US-PUB-06, -09 |
| L13 | Gọi API bán hàng cũ → 404 mỗi lần tải | Không có code B2C; theo dõi lỗi bằng Sentry | mục 4.2, NFR-OBS | — |
| L14 | Thiếu `charset`, `title`, `viewport` | Metadata Next bắt buộc | F-80 | US-PUB-09 AC2 |
| L15 | README lỗi thời | README + docs là nguồn sự thật; ROADMAP cập nhật mỗi gate | — | `phase-gate` skill |
| L16 | Kết nối Postgres trực tiếp, Socket.io trên serverless | Supabase client + Realtime | NFR-MAINT, ADR-001, ADR-002 | — |
| B1 | Ai cũng tự đăng ký thành admin qua metadata | Vai trò không bao giờ từ metadata; admin chỉ cấp qua `grant_platform_admin` (service role hoặc admin aal2, có audit); pgTAP hồi quy | F-02, F-62 | US-PUB-07 AC3, US-ADM-01 AC3 |
| B2 | Trigger chống tự đổi quyền bị tắt | Revoke UPDATE cả bảng, grant UPDATE cho danh sách cột được phép (DATA-MODEL §9.4) — cột trạng thái/vai trò không có trong danh sách; chuyển trạng thái chỉ qua RPC | F-02, ADR-004 | US-SYS-06, US-STO-27 AC5 |
| B3 | CCCD, mã số thuế, SĐT đọc công khai | Tách `org_sensitive`; view công khai chỉ cột cần; không dump "dữ liệu gốc" | F-06 | US-STO-03 AC2, US-ADM-03 AC3 |
| B4 | Bucket giấy tờ public | Bucket `kyc` private + signed URL 60 s | F-06 | US-STO-03, US-ADM-03 |
| B5 | Key trong code và lịch sử Git | Secret chỉ ở env server; chặn `.env*`; quét secret CI; repo mới không mang lịch sử cũ | NFR-SEC | — |
| B6 | Chủ hồ sơ tự sửa cột uy tín/xác minh | `trust_score`, `status`, `reviewed_*` không cập nhật được bởi chủ hồ sơ | F-12, F-02 | US-STO-27 AC5, US-CHA-31 AC3 |
| B7 | Backend chạy chế độ development, CORS lỏng, ghép chuỗi vào bộ lọc | Prod env tách biệt; không ghép chuỗi vào filter; tham số hóa RPC; CSP | NFR-SEC | — |
| B8 | Tổ chức chưa duyệt xem được donation qua API | RLS yêu cầu tổ chức `approved` và không tạm ngưng | F-02, F-21 | US-CHA-05 AC4 |

---

## 12. Giả định, phụ thuộc, rủi ro sản phẩm

### 12.1 Giả định

- Cửa hàng và tổ chức pilot ở TP.HCM, có smartphone và email; tình nguyện viên chủ yếu dùng Android.
- Goong free tier đủ cho demo và pilot (geocode cache, chỉ gọi Directions cho phương án được chọn) — kiểm chứng ở spike P0.
- Supabase free/Pro đủ cho pilot; nâng Pro vào tháng 11 nếu vượt giới hạn 2 project.
- Claude API khả dụng cho AI ảnh → tự điền; tắt bằng flag nếu chi phí/độ trễ không đạt.

### 12.2 Phụ thuộc

| Phụ thuộc | Cần trước | Ai |
|---|---|---|
| Tài khoản Vercel, Supabase (staging + prod), domain + Resend | P0 | Minh |
| Key Goong | Spike P0 | Minh |
| Key Anthropic (tùy chọn), Sentry | P2 / P5 | Minh |
| Hệ số nước và khối lượng suất ăn có nguồn | P0 — **xong 08/10/2026** (ADR-009 Accepted) | Minh (ESG-METHODOLOGY) |
| LOI 2 cửa hàng + 1 tổ chức thật; pilot ≥ 10 bàn giao | 08/11; 15–28/11 | Khanh hỗ trợ liên hệ |

### 12.3 Rủi ro sản phẩm

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Không đủ người dùng thật cho pilot | Mất điểm "Khả thi & tác động" | Bắt đầu liên hệ từ P1; seed demo vẫn đẹp; KPI tách demo/thật |
| Goong lỗi/giới hạn khi demo | Bản đồ trống | Adapter + OpenFreeMap + tuyến demo tính sẵn |
| Làm mờ mặt sót trên máy yếu | Lộ mặt trẻ em | Cọ thủ công + Admin duyệt + AI kiểm (tùy chọn) + không cho cửa hàng xem trước duyệt |
| iOS không nhận push | TNV lỡ chuyến | Email + in-app dự phòng; điều phối viên gọi điện |
| Phạm vi lớn so với 7 tuần | Trễ gate | Danh sách cắt 7 mục; quy tắc trễ > 2 ngày thì cắt |
| Tranh chấp an toàn thực phẩm | Uy tín | Cam kết an toàn, từ chối từng dòng, miễn trừ bên tặng, phản ánh có xử lý |

---

## 13. Câu hỏi mở (có phase chốt)

| # | Câu hỏi | Phương án mặc định trong PRD | Chốt ở |
|---|---|---|---|
| Q-1 | Hệ số nước (890 L/kg cũ không có nguồn) | **Đã chốt** (08/10/2026, `adr/ADR-009-esg-factors.md` Accepted): 150 L/kg nước xanh lam (FAO 2013: 250 km³ ÷ 1,6 Gt ≈ 156, làm tròn xuống); chỉ số nước **được hiển thị** với nhãn "Nước tưới tránh lãng phí (ước tính)". Cùng mẫu số, CO₂e đổi từ 2,5 thành 2,0 kg/kg | — |
| Q-2 | Khối lượng 1 suất ăn: 0,35 kg (code cũ) hay 0,42 kg (WRAP) | **Đã chốt** WRAP 0,42 kg (2.381 suất/tấn; ADR-009 Accepted 08/10/2026) | — |
| Q-3 | Thời gian giữ chỗ `reserved_until` mặc định | `least(now + request_ttl_minutes, effective_deadline)`, `request_ttl_minutes = 120` (DATA-MODEL); cân nhắc rút ngắn cho lô Đỏ sau UAT | P2 |
| Q-4 | Cách lưu liên kết "lô tạo để đáp ứng nhu cầu" (US-STO-21) | Trường gợi ý nhu cầu trên lô hoặc phân bổ tạo sẵn; tự chấp nhận yêu cầu từ tổ chức đó | P3 (DATA-MODEL) |
| Q-5 | Gửi thông báo theo đợt công bằng | `fairness_wave_count = 3`, `fairness_wave_minutes = 5` (DATA-MODEL); lô Đỏ có nên bỏ chia đợt không | P3 |
| Q-6 | Bảng điểm cộng/trừ uy tín | **Đã chốt** v1 trong DATA-MODEL `trust_events` (hằng số cố định, đổi bằng migration có version); điều chỉnh giá trị sau pilot nếu cần | P3 (xem lại) |
| Q-7 | Hạn minh chứng | 48 giờ sau dropoff (`app_settings`) | P4 |
| Q-8 | Icon nhãn Đỏ (`alarm-clock` hay `flame`) | `alarm-clock` | P0 (DESIGN-SYSTEM) |
| Q-9 | Có cần "giá trị quy đổi (VNĐ)" cho báo cáo CSR không | Không trong release này (tránh hiểu nhầm là bán) | P4 (sau phản hồi LOI) |
| Q-10 | BTC có yêu cầu nộp deck/video trước chung kết không | — | 18/10 (Track B) |
| Q-11 | Route đăng ký | **Đã chốt** `/register` ở mọi tài liệu (07/10/2026) | — |
| Q-12 | Chỗ lưu "Đã đóng gói" (US-STO-16), "Lời cảm ơn" (US-STO-23), nhu cầu nhiều danh mục (US-CHA-09), sự kiện N-13, N-15, N-16, N-29 | **Đã bổ sung** vào DATA-MODEL (07/10/2026): `allocations.packed_at` + `mark_allocation_packed`, bảng `thank_you_notes`, `needs.category_codes` (1–3), `notification_event` (mục 10 ghi chú) | — |

---

## 14. Nhật ký thay đổi

| Ngày | Phiên bản | Thay đổi | Người |
|---|---|---|---|
| 07/10/2026 | 1.0 | Bản đầu tiên từ plan đã duyệt + 3 tài liệu nhóm | Minh + Claude Code |
| 07/10/2026 | 1.1 | Đồng bộ liên tài liệu: trạng thái tổ chức theo DATA-MODEL; sửa trường pháp lý qua `org_change_requests` (không dừng hoạt động); `/register`; `MAPS_PROVIDER`; bỏ cấp quận; ngưỡng nhãn/hệ số chỉ đọc; ADR-009; giám khảo không có tài khoản admin | Claude Code |
| 08/10/2026 | 1.2 | ADR-009 Accepted, hệ số ESG v1: CO₂e 2,0 kg/kg (thay 2,5), nước 150 L/kg nước xanh lam (hiển thị, nhãn "Nước tưới tránh lãng phí (ước tính)"), suất ăn 0,42 kg; đóng Q-1, Q-2 | Claude Code |







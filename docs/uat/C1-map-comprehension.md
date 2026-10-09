# UAT C1 — Bản đồ dễ hiểu (phép thử "người mới hiểu trong 10 giây")

> **Mục tiêu:** kiểm giả thuyết "bản đồ chưa hiểu được" (Minh: *"hiện tại tôi chưa hiểu lắm"*) đã được giải quyết sau đợt C1 — bộ marker minh họa, dòng chú thích, chú giải, nền bản đồ bớt nhiễu (DESIGN-SYSTEM §13).
>
> **Cổng C1 (kiểu "Earn the investment"):** **Khanh + 3 người chưa từng dùng FoodSave** trả lời đúng **≥ 4/5 câu**, **mỗi câu ≤ 10 giây**, ở **mỗi màn bản đồ chính** (A–E bên dưới). Minh xem trên **điện thoại thật**. Đạt cổng thì mới làm C2 ("Xem chuyến 3D").
>
> **Môi trường:** staging hoặc local có dữ liệu demo · **Thời lượng:** khoảng 15 phút/người · **Cần:** 📱 điện thoại thật (ưu tiên), 💻 máy tính, đồng hồ bấm giờ (điện thoại).

**Người điều phối:** ______ · **Ngày:** ___/___ · **Bản (commit):** ______

---

## 1. Chuẩn bị (Minh làm trước)

1. Có dữ liệu cho cả 5 màn. Cách nhanh nhất là chạy kịch bản ảnh chụp trên máy local (tự dựng tổ chức, cửa hàng, lô, nhu cầu, chuyến với tên hư cấu):
   ```bash
   MAP_C1_SHOTS=after node scripts/with-test-lock.mjs pnpm test:e2e tests/e2e/visual/map-c1-screenshots.spec.ts --project=desktop
   ```
   Ảnh "trước/sau" nằm ở `docs/uat/screenshots/map-c1/before/` và `.../after/` (desktop 1440 × 900 và điện thoại 390 × 844; `*-ban-do-desktop.png` = cuộn tới bản đồ khi bản đồ nằm dưới nửa màn hình đầu; `chu-quyen-*` = nhãn Hoàng Sa/Trường Sa). Bản "trước" thiếu `kho-tang-chon-mobile` và `admin-vi-tri-diem-*` (lần chụp trước C1 lỗi kịch bản; bản đồ cũ của hai màn này giống `kho-tang-mobile` và một chấm tròn). Nếu không mở được app thật cho người thử, **dùng ảnh "after"** trên điện thoại (phóng to được), ghi rõ "dùng ảnh" trong bảng kết quả.
   Xem nhanh mọi ký hiệu và 5 bản đồ với dữ liệu minh họa (không cần đăng nhập, chỉ local/staging): `/dev/map-kit`, `/dev/map-kit/screens`.
2. Trên staging/prod (dữ liệu demo): đăng nhập sẵn `[GK-TC]` (Kho tặng, Phương án ghép, Điều phối chuyến), `[GK-CH]` (Nhu cầu gần bạn), `[GK-TNV]` (Chuyến của TNV). Chọn sẵn màn, **không** mở chú giải hay thẻ nào trước.
3. Xóa bộ nhớ trình duyệt (hoặc dùng cửa sổ ẩn danh) để **chú giải ở trạng thái mặc định (mở)**.

## 2. Cách chạy với mỗi người thử

1. Nói đúng một câu: *"Đây là một màn hình của ứng dụng FoodSave — ứng dụng giúp cửa hàng tặng thực phẩm dư cho các tổ chức từ thiện. Tôi sẽ hỏi vài câu, bạn trả lời bằng cách chỉ tay hoặc nói."* **Không** giải thích ký hiệu, màu, hay chú giải.
2. Đọc từng câu hỏi; **bấm giờ** từ lúc đọc xong tới lúc người thử trả lời. Người thử được tự chạm, phóng to, mở/đóng chú giải.
3. Ghi **Đ** (đúng) / **S** (sai) và số giây. Trả lời đúng nhưng > 10 giây ⇒ ghi **Đ>10** (không tính đạt).
4. Không sửa câu trả lời sai; hỏi thêm *"Bạn dựa vào đâu để trả lời?"* và ghi lại nguyên văn ở cột ghi chú — đây là dữ liệu quan trọng nhất để sửa.
5. Thứ tự màn: A → B → C → D → E (người thử không dùng lại kiến thức từ màn trước quá nhiều vì mỗi màn có ký hiệu riêng).

## 3. Câu hỏi và đáp án

### A. Kho tặng (tổ chức) — `/charity/donations` · ảnh `kho-tang-*.png`, `kho-tang-chon-mobile.png`

| # | Câu hỏi | Đáp án đúng (dựa vào) |
|---|---|---|
| A1 | Cửa hàng nào có lô **sắp hết hạn nhất**, cần lấy trước? | Cửa hàng có **vòng đỏ** (quầng đỏ, icon đồng hồ báo thức); chú giải "Lô Đỏ — lấy trước"; dòng chú thích ghi "n có lô Đỏ (lấy trước)" |
| A2 | **Màu đỏ / vàng / xanh** quanh cửa hàng nghĩa là gì? | Nhãn tươi gấp nhất của lô ở cửa hàng: Đỏ gấp nhất, rồi Vàng, Xanh còn lâu (chú giải + dòng chú thích "vòng màu = nhãn gấp nhất") |
| A3 | **Điểm nhận của bạn** ở đâu? | Ghim đen có mái nhà + chữ "Điểm nhận của bạn" |
| A4 | Cửa hàng [chỉ một cửa hàng có số nhỏ] có **mấy lô**? | Số trong chấm đen góc trên phải (chú giải "Số lô ở cửa hàng") |
| A5 | Vòng tròn **có số lớn ở giữa** là gì? Muốn xem từng cửa hàng thì làm gì? | Cụm nhiều cửa hàng gần nhau — chạm để phóng to (chú giải) |

### B. Phương án ghép "50 ổ = 20 + 18 + 12" (tổ chức) — `/charity/needs/[id]` · ảnh `phuong-an-ghep-*.png`, `phuong-an-da-chon-*.png`

| # | Câu hỏi | Đáp án đúng (dựa vào) |
|---|---|---|
| B1 | Tuyến đi qua **mấy cửa hàng, theo thứ tự nào**? | 3 cửa hàng, theo **số 1 → 2 → 3** (huy hiệu xanh dương trên từng cửa hàng, mũi tên trên tuyến, dòng chú thích) |
| B2 | Lấy **bao nhiêu** ở mỗi cửa hàng? **Có đủ 50 không?** | 20, 18, 12 (chữ dưới từng cửa hàng); đủ 50 (dòng chú thích "20 + 18 + 12 = 50 ổ") |
| B3 | Lấy xong cửa hàng cuối thì **đi đâu**? | Về điểm nhận (ghim "Điểm nhận của bạn"; mũi tên tuyến; chú thích "rồi về điểm nhận") |
| B4 | **Đường nét đứt** nghĩa là gì? | Tuyến ước tính (chưa phải đường xe máy thật) hoặc phương án khác (chú giải) |
| B5 | Cửa hàng nào có **lô Đỏ**? | Cửa hàng có vòng đỏ (thường là số 1 vì đi trước) |

### C. Nhu cầu gần bạn (cửa hàng) — `/store/connect` · ảnh `nhu-cau-gan-ban-*.png`

| # | Câu hỏi | Đáp án đúng (dựa vào) |
|---|---|---|
| C1 | Tổ chức nào đang cần thực phẩm, **cần bao nhiêu**? | Mái nhà có tim + chữ "Cần 50 ổ" |
| C2 | **Cửa hàng của bạn** ở đâu? | Ghim có hình tiệm + chữ "Cửa hàng của bạn" |
| C3 | **Vùng mờ có viền nét đứt** nghĩa là gì? | Vị trí gần đúng (tổ chức không công khai địa chỉ chính xác) — chú giải |
| C4 | Có nhu cầu nào **không hiện trên bản đồ** không? Xem ở đâu? | Chú giải ghi "n nhu cầu ẩn vị trí — xem trong danh sách" (nếu có; nếu không có thì đáp "không") |
| C5 | Muốn xem **chi tiết** một nhu cầu thì làm gì? | Chạm vào mái nhà có tim ⇒ thẻ nhu cầu (mobile) / thẻ trong danh sách được làm nổi (desktop) |

### D. Điều phối chuyến (tổ chức, có vị trí TNV) — `/charity/pickups/[id]` · ảnh `dieu-phoi-chuyen-*.png`

| # | Câu hỏi | Đáp án đúng (dựa vào) |
|---|---|---|
| D1 | **Tình nguyện viên đang ở đâu, cập nhật lúc nào?** | Người đi xe máy (đĩa cam) + chữ "Tên · cập nhật x phút trước"; vị trí cũ thì xám + biểu tượng cảnh báo |
| D2 | Tuyến đi qua **mấy cửa hàng, theo thứ tự nào**? | Số trên các ghim (1 → 2 → 3), mũi tên tuyến, dòng chú thích |
| D3 | **Điểm giao cuối** là đâu? | Ghim mái nhà có tim + chữ "Giao về" |
| D4 | Điểm nào **đã lấy hàng xong**? | Ghim xanh lá có dấu ✓ (chú giải "Đã lấy hàng") |
| D5 | **Màu đỏ** (ghim đỏ có dấu !) nghĩa là gì? | Điểm đang trễ hơn dự kiến 15 phút (chú giải). *Nếu chuyến không có điểm trễ, hỏi thay: "Ghim màu cam nghĩa là gì?" ⇒ TNV đã đến điểm đó* |

### E. Chuyến của tình nguyện viên (điện thoại) — `/volunteer/trips/[id]` · ảnh `chuyen-tnv-mobile.png`

| # | Câu hỏi | Đáp án đúng (dựa vào) |
|---|---|---|
| E1 | Bạn cần tới **điểm nào tiếp theo**? | Ghim to hơn có chữ "Kế tiếp"; dòng chú thích "kế tiếp: điểm n" |
| E2 | Lấy hết hàng xong thì **giao về đâu**? | Ghim "Giao về" |
| E3 | Phải đi các điểm **theo thứ tự nào**? | Số trên ghim 1 → 2 → …, mũi tên trên tuyến, dòng chú thích "Đi theo số …" |
| E4 | Điểm nào **đã xong**? | Ghim xanh lá có ✓ (nếu chưa xong điểm nào: đáp "chưa có") |
| E5 | **Bạn đang ở đâu?** (bật chia sẻ vị trí trước khi hỏi) | Chấm xanh dương + chữ "Bạn ở đây" |

### Màn phụ (ghi nhận, không tính cổng)

- **Lập chuyến chia 2 tuyến** (`/charity/pickups`, ảnh `chia-tuyen-*.png`): "Mỗi tình nguyện viên đi những cửa hàng nào?" ⇒ ghim **tròn** xanh dương = tuyến 1, ghim **vuông** xanh mòng két = tuyến 2 (chú giải "Chú thích tuyến" ghi tên từng người).
- **Chuyến tự đến lấy** (ảnh `chuyen-tu-lay-*.png`), **Bộ chọn vị trí** (ảnh `chon-vi-tri-*.png`), **Admin — vị trí điểm** (ảnh `admin-vi-tri-diem-*.png`): hỏi "Bản đồ này cho thấy gì?" ⇒ trả lời được nhờ dòng chú thích/ghim có chữ.
- **Chủ quyền** (ảnh `chu-quyen-*.png`): kiểm bằng mắt nhãn "Quần đảo Hoàng Sa", "Quần đảo Trường Sa" (E2E `tests/e2e/map/sovereignty.spec.ts` đã kiểm tự động).

## 4. Bảng kết quả

Ghi mỗi ô: **Đ/S + giây** (ví dụ `Đ 4`, `S 12`, `Đ>10 14`). "Đạt" = **≥ 4 câu "Đ" trong ≤ 10 giây**.

| Màn | Người thử | Câu 1 | Câu 2 | Câu 3 | Câu 4 | Câu 5 | Số câu đạt | Đạt? | Ghi chú (nguyên văn khi sai) |
|---|---|---|---|---|---|---|---|---|---|
| A Kho tặng | Khanh | | | | | | /5 | | |
| A Kho tặng | Người 1: ______ | | | | | | /5 | | |
| A Kho tặng | Người 2: ______ | | | | | | /5 | | |
| A Kho tặng | Người 3: ______ | | | | | | /5 | | |
| B Phương án ghép | Khanh | | | | | | /5 | | |
| B Phương án ghép | Người 1 | | | | | | /5 | | |
| B Phương án ghép | Người 2 | | | | | | /5 | | |
| B Phương án ghép | Người 3 | | | | | | /5 | | |
| C Nhu cầu gần bạn | Khanh | | | | | | /5 | | |
| C Nhu cầu gần bạn | Người 1 | | | | | | /5 | | |
| C Nhu cầu gần bạn | Người 2 | | | | | | /5 | | |
| C Nhu cầu gần bạn | Người 3 | | | | | | /5 | | |
| D Điều phối chuyến | Khanh | | | | | | /5 | | |
| D Điều phối chuyến | Người 1 | | | | | | /5 | | |
| D Điều phối chuyến | Người 2 | | | | | | /5 | | |
| D Điều phối chuyến | Người 3 | | | | | | /5 | | |
| E Chuyến TNV | Khanh | | | | | | /5 | | |
| E Chuyến TNV | Người 1 | | | | | | /5 | | |
| E Chuyến TNV | Người 2 | | | | | | /5 | | |
| E Chuyến TNV | Người 3 | | | | | | /5 | | |

**Thông tin người thử** (không ghi họ tên đầy đủ, chỉ tên gọi/biệt danh): tuổi khoảng ___, có dùng Google Maps hằng ngày không ___, thiết bị ___.

## 5. Kết luận cổng C1

| Tiêu chí | Kết quả |
|---|---|
| Mọi màn A–E: cả 4 người đạt ≥ 4/5 câu trong ≤ 10 giây | ☐ Đạt ☐ Chưa đạt |
| Minh xem trên điện thoại thật: chữ đọc được, chạm trúng marker, chú giải không che marker | ☐ Đạt ☐ Chưa đạt |
| Nhãn Hoàng Sa, Trường Sa hiện đúng (ảnh `chu-quyen-*`) | ☐ Đạt ☐ Chưa đạt |
| **Quyết định** | ☐ Qua cổng C1 → được làm C2 · ☐ Sửa theo ghi chú rồi thử lại (người thử mới) |

**Câu sai nhiều nhất và đề xuất sửa:** ______________________________________________

**Người ký:** Khanh ______ · Minh ______

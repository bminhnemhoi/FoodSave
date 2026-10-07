# ADR-005: Nhãn tính lúc đọc

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh
- **Liên quan:** [DATA-MODEL.md §2.2, §4.2, §8.1](../DATA-MODEL.md), ADR-004, `src/core/labels`

## Bối cảnh

- Tài liệu chức năng yêu cầu nhãn Xanh/Vàng/Đỏ theo thời gian còn lại, ngưỡng khác nhau theo nhóm hàng (nấu chín > 12 h / 4–12 h / < 4 h; tươi > 72 h / 24–72 h / < 24 h; đóng gói > 7 ngày / 3–7 ngày / < 3 ngày), tính tới **mốc đến trước** giữa giờ hết hạn và giờ cửa hàng đóng cửa (ví dụ: hết hạn 24:00, đóng 21:00 ⇒ Đỏ từ 17:00).
- Bản cũ lưu `urgency` thành cột và cập nhật bằng tác vụ định kỳ mỗi 5 phút, có nút "Cập nhật nhãn ngay" khi demo ⇒ nhãn sai giữa hai lần chạy, phụ thuộc cron, và tên nhãn không thống nhất giữa các màn.
- Nhãn hiển thị ở mọi cổng, trên bản đồ, trong đếm ngược phía client; đồng thời dùng trong SQL (lọc, sắp xếp, thông báo "chuyển Đỏ", ghép đơn).

## Quyết định

1. **Không lưu nhãn.** Lưu `effective_deadline` (RPC `publish_offer` tính một lần theo `Asia/Ho_Chi_Minh`: `least(expires_at, upper(pickup_window), site_close_at(site, …))`; hạn chỉ có ngày = 23:59 giờ VN).
2. Nhãn = hàm thuần `freshness_label(deadline timestamptz, perishability, at timestamptz)`:
   - SQL: `immutable`, `parallel safe`, trả `green | yellow | red | expired` (DATA-MODEL §8.1);
   - TS: `src/core/labels/freshnessLabel.ts` cùng chữ ký;
   - **một file fixture dùng chung** `src/core/labels/fixtures.json` (gồm các biên: đúng 12 h ⇒ Vàng, đúng 4 h ⇒ Vàng, 3 h 59 ⇒ Đỏ, đúng hạn ⇒ `expired`, ví dụ 21:00/24:00, đóng qua nửa đêm) chạy ở cả Vitest và pgTAP.
3. Ngưỡng được **mã hóa cứng theo version** trong hàm (version 1 = bảng trên) và ghi lại trong bảng `label_rules`. Đổi ngưỡng = migration mới: thêm dòng `label_rules` version mới, `create or replace` hàm, cập nhật fixture — trong cùng PR. Màn Admin "Ngưỡng nhãn" hiển thị version hiện hành (chỉ đọc).
4. Client tính lại nhãn và đếm ngược mỗi 30 s bằng hàm TS (không gọi server).
5. Cron chỉ làm **2 việc** liên quan nhãn: phát sự kiện "chuyển Đỏ" một lần cho mỗi lô (`red_notified_at`) và đóng lô quá hạn hiệu lực. Tính đúng của hệ thống không phụ thuộc cron: RPC luôn so `effective_deadline` với thời điểm hiện tại.

## Hệ quả

**Tích cực**
- Nhãn luôn đúng tới từng giây ở mọi nơi; bỏ được nút "Cập nhật nhãn ngay".
- SQL và TS không thể lệch nhau mà test không phát hiện (fixture chung).
- `immutable` cho phép dùng trong biểu thức index/sắp xếp và planner tối ưu tốt.

**Tiêu cực**
- Admin **không** đổi ngưỡng tại runtime như plan mô tả ("cấu hình ngưỡng nhãn") — phải qua migration. Đánh đổi có chủ đích để giữ hàm `immutable` và SQL/TS khớp nhau; giá trị nghiệp vụ của việc đổi ngưỡng thường xuyên là thấp.
- Truy vấn lọc theo nhãn phải tính hàm trên mỗi dòng; chấp nhận được với vài nghìn lô mở (có index `effective_deadline`).

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Lưu cột `label`, cron cập nhật (bản cũ) | Sai giữa hai lần chạy; phụ thuộc cron; cần nút cập nhật tay |
| Cột generated | Không được dùng `now()` trong cột generated |
| Hàm `stable` đọc ngưỡng từ bảng `label_rules` | Admin đổi được ngưỡng, nhưng không `immutable`, và TS phải tải ngưỡng từ DB ⇒ dễ lệch, khó test bằng fixture tĩnh; có thể nâng cấp sau nếu thật sự cần |
| Chỉ tính ở client | SQL cần nhãn để lọc, thông báo, ghép đơn |

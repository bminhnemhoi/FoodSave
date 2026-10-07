# ADR-009: Hệ số quy đổi ESG v1 (CO₂e, nước, suất ăn)

- **Trạng thái:** Proposed — chốt tại P0 (task P0-20 trong [ROADMAP](../ROADMAP.md), hạn 11/10/2026)
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh
- **Liên quan:** [ESG-METHODOLOGY.md §3, §7](../ESG-METHODOLOGY.md), [DATA-MODEL.md §2.5 `impact_factors`, `impact_ledger`](../DATA-MODEL.md), [PRD.md](../PRD.md) F-49, Q-1, Q-2

## Bối cảnh

- Tài liệu định hướng yêu cầu các chỉ số E/S quy đổi từ kg thực phẩm được cứu: CO₂e tránh được, nước tiết kiệm, suất ăn tương đương. Số liệu này xuất hiện trên landing, `/impact`, dashboard ESG và báo cáo tháng CSR, nên sẽ bị giám khảo và đối tác hỏi "nguồn ở đâu".
- Bản cũ dùng ba hệ số: 2,5 kg CO₂e/kg (có thể truy về FAO 2013), **890 L/kg nước (không có nguồn)** và **0,35 kg/suất (không có nguồn)**.
- Hệ số phải có version: đổi hệ số không được viết lại lịch sử ledger (ESG-METHODOLOGY nguyên tắc 3).

## Quyết định

1. **CO₂e: 2,5 kg CO₂e/kg thực phẩm.** Nguồn: FAO (2013), *Food wastage footprint: Impacts on natural resources — Summary report*. Dẫn xuất: khoảng 3,3 Gt CO₂e ÷ 1,3 Gt thực phẩm lãng phí/năm ≈ 2,54, làm tròn xuống 2,5 (bảo thủ).
2. **Nước: ứng viên ≈ 190 L/kg nước xanh lam (blue water).** Nguồn: cùng báo cáo FAO (2013): dấu chân nước xanh lam của lãng phí thực phẩm khoảng 250 km³/năm ÷ 1,3 Gt ≈ 192 L/kg, làm tròn xuống 190. Nhãn UI: "Nước tưới tiết kiệm (ước tính)".
   - Hệ số **890 L/kg cũ bị loại** vì không truy được nguồn.
   - **Chỉ số nước bị ẩn** trên mọi giao diện và báo cáo cho tới khi ADR này chuyển `Accepted` với số trang đã kiểm chứng; khi đó mới seed dòng `water_l_per_kg`. Version chưa có dòng nước ⇒ ledger ghi `water_l = null`.
3. **Suất ăn: 0,42 kg/suất (WRAP)**, thay 0,35 kg của bản cũ. Nguồn: WRAP, *Reporting amounts of food surplus redistributed: weight and meal equivalents* (1 suất = 420 g). Bảo thủ hơn (100 kg ⇒ 238 suất thay vì 285) và so sánh được với các tổ chức phân phối lại thực phẩm khác.
4. **Version hóa:** hệ số lưu ở bảng bất biến `impact_factors`, **mỗi dòng = một version × một metric** (`co2e_kg_per_kg`, `water_l_per_kg`, `kg_per_meal`), kèm `source_title`, `source_url`, `source_page`, `derivation`, `valid_from`, `approved_adr = 'docs/adr/ADR-009-esg-factors.md'`. Version hiện hành nằm ở `app_settings.impact_factor_version` (v1). Mỗi dòng ledger lưu `factor_version` và giá trị đã tính sẵn.
5. **Không cấu hình lúc chạy:** Admin chỉ xem hệ số (chỉ đọc). Đổi hệ số = ADR mới + migration seed version mới (không UPDATE version cũ) + kích hoạt bằng `activate_impact_factors` (admin aal2, có audit).
6. Việc còn lại trước khi `Accepted` (P0-20): kiểm chứng số trang chứa 1,3 Gt, 3,3 Gt và 250 km³ trong PDF FAO, con số 420 g trên trang WRAP; điền `source_page`.

## Hệ quả

**Tích cực**
- Mọi con số E/S trên giao diện đều có nguồn công khai, dẫn xuất kiểm lại được bằng tay, và version ghi rõ trên báo cáo.
- CO₂e và nước cùng một nguồn (FAO 2013) nên phương pháp nhất quán; cả ba hệ số đều nghiêng về phía bảo thủ.
- Đổi hệ số sau này không làm thay đổi số liệu đã công bố.

**Tiêu cực**
- Con số nước (190 L/kg) nhỏ hơn nhiều so với các con số "hàng nghìn lít" người nghe thường gặp, vì chỉ tính nước tưới; cần giải thích (ESG-METHODOLOGY §11, Q11).
- Hệ số trung bình toàn cầu, không phân theo nhóm thực phẩm hay riêng Việt Nam.
- Trước khi ADR được chấp nhận, dashboard thiếu chỉ số nước.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Giữ 890 L/kg nước và 0,35 kg/suất của bản cũ | Không có nguồn; không bảo vệ được trước phản biện |
| Dấu chân nước tổng (xanh lục + xanh lam + xám) theo nhóm thực phẩm (Water Footprint Network) | Phải gán nguồn riêng cho từng danh mục; nước mưa không "tiết kiệm" được nên dễ bị phản biện; tốn công trong 7 tuần. Giữ làm hướng mở rộng sau giải (version mới) |
| Hệ số CO₂e theo nhóm thực phẩm | Chính xác hơn nhưng cần bảng nguồn riêng cho từng danh mục; để sau giải |
| Cho Admin sửa hệ số trên giao diện | Phá tính bất biến và khả năng kiểm toán; trái nguyên tắc version hóa |

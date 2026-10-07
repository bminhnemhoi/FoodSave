# ADR-009: Hệ số quy đổi ESG v1 (CO₂e, nước, suất ăn)

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-08 (đề xuất 2026-10-07, đã kiểm chứng nguồn gốc)
- **Người quyết định:** Minh
- **Liên quan:** [ESG-METHODOLOGY.md §3, §7](../ESG-METHODOLOGY.md), [DATA-MODEL.md §2.5 `impact_factors`, `impact_ledger`](../DATA-MODEL.md), [PRD.md](../PRD.md) F-49, Q-1, Q-2

## Bối cảnh

- Tài liệu định hướng yêu cầu các chỉ số E/S quy đổi từ kg thực phẩm được cứu: CO₂e tránh được, nước tiết kiệm, suất ăn tương đương.
- Các số này xuất hiện trên landing, `/impact`, dashboard ESG và báo cáo CSR hằng tháng, nên chắc chắn sẽ bị giám khảo và đối tác hỏi "nguồn ở đâu".
- Bản cũ dùng 2,5 kg CO₂e/kg, **890 L/kg nước (không có nguồn)** và **0,35 kg/suất (không có nguồn)**.
- Hệ số phải có version: đổi hệ số không được viết lại lịch sử ledger.

## Kiểm chứng nguồn (08/10/2026)

**FAO (2013), *Food wastage footprint: Impacts on natural resources — Summary report*** (https://www.fao.org/4/i3347e/i3347e.pdf):
- **Trang 6 (Executive summary):**
  - "The global volume of food wastage is estimated to be **1.6 Gtonnes** of 'primary product equivalents', while the total wastage for the edible part of food is **1.3 Gtonnes**"
  - "the carbon footprint of food produced and not eaten is estimated to **3.3 Gtonnes of CO₂ equivalent**"
  - "the **blue water footprint** … of food wastage is about **250 km³**"
- **Trang 11 (Method):** "food wastage volumes for '**edible + non-edible parts**' were used in the footprint calculations". Nghĩa là dấu chân của FAO được tính trên **1,6 Gt**, không phải 1,3 Gt.

**WRAP (2020), *Reporting on the amounts of food surplus redistributed — weight and meal equivalents*:**
- WRAP khuyến nghị **420 g** là khối lượng một suất ăn "trung bình", tương đương **2.381 suất/tấn**.
- Con số này được chốt sau khi tham vấn Courtauld 2025 Redistribution Working Group và Public Health England.
- Nguồn: https://wrap.ngo/system/files/2020-09/WRAP-Expressing%20redistributed%20food%20surplus%20as%20meal%20equivalents%20%28WRAP%20guidance%29.pdf

## Quyết định (impact factors v1)

| Metric | Giá trị v1 | Dẫn xuất | Ghi chú |
|---|---|---|---|
| `co2e_kg_per_kg` | **2,0** | 3,3 Gt CO₂e ÷ **1,6 Gt** = 2,06, làm tròn **xuống** 2,0 | Cùng mẫu số FAO dùng để tính dấu chân (tr. 11). Bản cũ dùng 3,3 ÷ 1,3 = 2,5, tức tính cả dấu chân phần không ăn được vào phần ăn được, làm số tác động bị phóng đại khoảng 25% |
| `water_l_per_kg` | **150** | 250 km³ = 250 × 10¹² L ÷ 1,6 × 10¹² kg = 156, làm tròn **xuống** 150 | Chỉ **nước xanh lam** (nước mặt + nước ngầm dùng để tưới), không gồm nước mưa. Nhãn giao diện: "Nước tưới tránh lãng phí (ước tính)" |
| `kg_per_meal` | **0,42** | WRAP: 420 g/suất | 100 kg ⇒ 238 suất (bản cũ 0,35 kg cho 285 suất) |

- **Nguyên tắc:** cả 3 hệ số đều chọn hướng **bảo thủ** (làm tròn xuống, dùng mẫu số lớn) để mọi con số FoodSave công bố đều *không phóng đại*. Đây là lợi thế khi bị phản biện.
- **Version hóa:**
  - Bảng `impact_factors` bất biến; mỗi dòng là một cặp (version, metric), kèm `source_title`, `source_url`, `source_page`, `derivation`, `valid_from`, `approved_adr = 'docs/adr/ADR-009-esg-factors.md'`.
  - Version hiện hành: `app_settings.impact_factor_version = 'v1'`.
  - Mỗi dòng ledger lưu `factor_version` cùng giá trị đã tính.
- **Không cấu hình lúc chạy:** Admin chỉ xem. Đổi hệ số cần ADR mới, migration seed version mới, rồi kích hoạt bằng `activate_impact_factors` (admin aal2, có audit).
- **Chỉ số nước được hiển thị** từ v1, vì đã có nguồn và trang kiểm chứng.

## Hệ quả

**Tích cực**
- Mọi con số E/S đều có nguồn công khai và số trang; ai cũng kiểm tra lại bằng máy tính bỏ túi được.
- CO₂e và nước dùng cùng nguồn và cùng mẫu số nên nhất quán. Số liệu bảo thủ, khó bị bác.
- Đổi hệ số sau này không làm thay đổi số liệu đã công bố.

**Tiêu cực**
- Số CO₂e thấp hơn bản cũ (2,0 so với 2,5). Phải giải thích rằng đây là lựa chọn có chủ đích (ESG-METHODOLOGY, câu hỏi phản biện).
- Số nước (150 L/kg) nhỏ hơn nhiều so với các con số "hàng nghìn lít" người nghe thường gặp, vì chỉ tính nước tưới.
- Hệ số là trung bình toàn cầu, không phân theo nhóm thực phẩm hay riêng Việt Nam. Đây là hướng mở rộng cho version 2 sau giải.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| 2,5 kg CO₂e/kg và 192 L/kg (mẫu số 1,3 Gt) | Lệch mẫu số so với phương pháp FAO (tr. 11), phóng đại khoảng 25% |
| Giữ 890 L/kg nước và 0,35 kg/suất của bản cũ | Không có nguồn |
| Dấu chân nước tổng theo nhóm thực phẩm (Water Footprint Network) | Phải gán nguồn cho từng danh mục; nước mưa không "tiết kiệm" được nên dễ bị phản biện. Để dành cho v2 |
| Cho Admin sửa hệ số trên giao diện | Phá tính bất biến và khả năng kiểm toán |

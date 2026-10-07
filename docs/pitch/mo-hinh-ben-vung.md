# Mô hình thiện nguyện bền vững

> Phục vụ tiêu chí **Mô hình thiện nguyện bền vững (5đ)**:
> - bền vững tài chính sau khi ra mắt;
> - khả năng nhân rộng;
> - cân bằng giữa tác động xã hội và nguồn lực.
>
> Mọi con số tài chính là **ước tính có ghi giả định** tại 07/10/2026. Phải kiểm chứng bằng phỏng vấn ≥ 3 chuỗi bán lẻ/F&B (T4 trong [kế hoạch 6 tháng](ke-hoach-6-thang.md)) trước khi trình bày như cam kết.

## 1. Nguyên tắc

1. **Thực phẩm luôn miễn phí cho người nhận.** Không thu hoa hồng hay phí giao dịch trên thực phẩm, không bán lại.
2. **Lõi điều phối miễn phí** cho tổ chức từ thiện, tình nguyện viên và cửa hàng nhỏ.
3. **Người trả tiền là bên được lợi về thương hiệu và báo cáo**: chuỗi bán lẻ cần số liệu ESG/CSR, và doanh nghiệp muốn tài trợ có minh chứng.
4. **Không bán dữ liệu cá nhân, không quảng cáo** trên giao diện của người nhận.
5. **Chi phí cấu trúc gần 0:** serverless, free tier, AI-assisted engineering; mỗi lần bàn giao thêm gần như không làm tăng chi phí hạ tầng.

## 2. Ai được gì, ai trả gì

| Bên | Nhận được | Trả |
|---|---|---|
| Tổ chức từ thiện | Kho tặng theo bán kính, ghép đơn, điều phối TNV, minh chứng để báo cáo cho nhà tài trợ của chính họ | **0 đ** |
| Tình nguyện viên | PWA chuyến, chỉ đường; hỗ trợ xăng, bảo hiểm (khi có tài trợ) | **0 đ** |
| Cửa hàng nhỏ (≤ 2 điểm) | Đăng lô bằng AI, bàn giao có biên nhận, báo cáo ESG cơ bản hằng tháng | **0 đ** |
| Chuỗi bán lẻ/F&B (≥ 3 điểm) | **Gói FoodSave ESG**: báo cáo hợp nhất toàn chuỗi, quản trị nhiều điểm và nhân viên, xuất dữ liệu cho báo cáo phát triển bền vững, logo trên trang tác động | **Phí thuê bao** (giả định 1,5–3 triệu đ/tháng/chuỗi ≤ 20 điểm) |
| Doanh nghiệp tài trợ | **Tài trợ tuyến/cụm phường**: tên trên ứng dụng TNV và báo cáo tác động riêng của cụm | **Tài trợ** (giả định khoảng 5 triệu đ/tháng/cụm) |
| Quỹ, giải thưởng, chương trình CSR | Dự án có số liệu tác động đo tự động, minh bạch | **Tài trợ dự án** |

## 3. Các dòng doanh thu

| # | Dòng | Mô tả | Giả định giá | Thời điểm | Mức tin cậy |
|---|---|---|---|---|---|
| R1 | **Gói báo cáo ESG/CSR** | Báo cáo tháng/quý hợp nhất theo chuỗi; phương pháp và hệ số có nguồn, có phiên bản (ESG-METHODOLOGY); xuất CSV/PDF; dữ liệu có thể đưa vào báo cáo phát triển bền vững của doanh nghiệp (mức tương thích với các khung báo cáo như GRI **cần chuyên gia xác nhận**) | 1,5–3 triệu đ/tháng | Chào bán từ T4 | Thấp → cần phỏng vấn 3 chuỗi |
| R2 | **Nhà tài trợ tuyến/cụm (sponsor-a-route)** | Doanh nghiệp tài trợ chi phí vận hành TNV (xăng, bảo hiểm, túi giữ nhiệt) của một cụm phường | khoảng 5 triệu đ/tháng/cụm | Từ T4–T5 | Trung bình (mô hình tài trợ quen thuộc với doanh nghiệp) |
| R3 | **Tài trợ, giải thưởng, quỹ CSR** | TISPA 2026; các quỹ, chương trình về thực phẩm, khí hậu, đổi mới xã hội | Theo đợt | Liên tục | Trung bình |
| R4 | **Triển khai cho tổ chức lớn** (tương lai) | Cấu hình FoodSave cho ngân hàng thực phẩm/tổ chức cứu thực phẩm muốn có công cụ điều phối riêng: phí triển khai và hỗ trợ, không thu phí giao dịch | Theo hợp đồng | Sau 12 tháng | Thấp |
| R5 | **Tích hợp POS/API** (tương lai) | Cửa hàng tự đẩy hàng sắp hết hạn từ phần mềm bán hàng sang FoodSave; thu phí tích hợp cho nhà cung cấp POS hoặc chuỗi | Theo hợp đồng | Sau 12 tháng | Thấp |

## 4. Cơ cấu chi phí vận hành

Quy mô sau 6 tháng: 1 cụm phường, khoảng 160 lần bàn giao/tháng.

| Khoản | Ước tính/tháng | Giả định |
|---|---|---|
| Hạ tầng (Supabase Pro, hosting, AWS sau tín dụng, tên miền) | 2.200.000 đ | khoảng 75 USD + tên miền |
| Thông báo (ZNS, SMS dự phòng) | 1.000.000 đ | khoảng 3.000 tin/tháng |
| Hỗ trợ TNV (xăng) | 3.000.000 đ | 150 chuyến × 20.000 đ |
| Vận hành cộng đồng (in ấn, gặp mặt nhỏ) | 1.000.000 đ | — |
| **Tổng tối thiểu (đội tình nguyện, không phụ cấp)** | **7.200.000 đ** | |
| Phụ cấp bán thời gian cho 2 điều phối viên (khi có nguồn thu) | 6.000.000 đ | 2 × 3.000.000 đ |
| **Tổng có phụ cấp** | **13.200.000 đ** | |

So sánh: trong giai đoạn cuộc thi, chi phí gần **0 đ/tháng** (chỉ có tên miền khoảng 250–500 nghìn đ/năm), vì dùng free tier của Vercel, Supabase, Goong và Resend.

## 5. Điểm hòa vốn

| Kịch bản | Chi phí/tháng | Nguồn bù | Thu/tháng | Kết quả |
|---|---|---|---|---|
| Tối thiểu | 7.200.000 đ | 1 nhà tài trợ cụm (5 triệu) + 1 gói ESG (2,5 triệu) | 7.500.000 đ | **Hòa vốn** |
| Có phụ cấp | 13.200.000 đ | 2 nhà tài trợ cụm (10 triệu) + 2 gói ESG (5 triệu) | 15.000.000 đ | **Dư 1,8 triệu** để tái đầu tư |
| Mở 3 cụm (năm 2) | khoảng 24.000.000 đ (hạ tầng tăng ít, TNV tăng theo cụm) | 3 nhà tài trợ cụm + 4 gói ESG | 25.000.000 đ | Hòa vốn, mỗi cụm tự nuôi phần TNV của mình |

**Mục tiêu KPI bền vững trong 6 tháng:** ký **≥ 1** hợp đồng R1 hoặc R2 trước T6 (xem [ke-hoach-6-thang.md §4](ke-hoach-6-thang.md)).

## 6. Unit economics (ước tính)

**Giả định:**
- 8 kg/lần bàn giao (hiệu chỉnh bằng số pilot tháng 11);
- 0,42 kg/suất ăn (WRAP), tức khoảng 19 suất/lần bàn giao;
- 2,0 kg CO₂e/kg (FAO 2013, ADR-009), tức 16 kg CO₂e/lần bàn giao;
- 1 chuyến TNV xử lý trung bình 1,0 lần bàn giao ở quy mô pilot và 1,4 lần khi ghép đơn hiệu quả ở quy mô lớn;
- xăng 20.000 đ/chuyến.

| Chỉ số | Quy mô pilot (160 bàn giao/tháng) | Quy mô 5 cụm (1.000 bàn giao/tháng) |
|---|---|---|
| Chi phí hạ tầng + thông báo/tháng | 3.200.000 đ | khoảng 6.000.000 đ |
| → trên mỗi lần bàn giao | 20.000 đ | 6.000 đ |
| Xăng trên mỗi lần bàn giao | 20.000 đ | khoảng 14.300 đ (20.000 ÷ 1,4) |
| **Tổng chi phí biến đổi/lần bàn giao** | **khoảng 40.000 đ** | **khoảng 20.300 đ** |
| **Chi phí/kg cứu được** | **khoảng 5.000 đ** | **khoảng 2.500 đ** |
| **Chi phí/suất ăn tương đương** | **khoảng 2.100 đ** | **khoảng 1.070 đ** |
| Chi phí/kg CO₂e tránh được | khoảng 2.500 đ | khoảng 1.270 đ |

**Đọc bảng thế nào:**
- Chi phí mỗi suất **giảm khoảng một nửa** khi mở rộng, vì hạ tầng gần như cố định và ghép đơn giúp ít chuyến hơn.
- **Không so trực tiếp** với chi phí "1 bữa = 25.000 đ" của tổ chức nấu bữa ăn từ thực phẩm cứu (như VietHarvest). Họ có thêm chi phí chế biến, bếp, nhân sự; FoodSave chỉ điều phối thực phẩm sẵn có.
- Chưa gồm chi phí nhân sự (đội tình nguyện) và chi phí cơ hội của cửa hàng.

## 7. Cân bằng tác động và nguồn lực

| Căng thẳng | Cách FoodSave cân bằng |
|---|---|
| Doanh nghiệp trả tiền có thể đòi ưu tiên | Thuật toán ghép đơn và thứ tự thông báo **không phụ thuộc** gói trả phí. Công bằng tính theo kg đã nhận/số người phục vụ của tổ chức. Ghi điều này trong điều khoản gói ESG. |
| Báo cáo ESG có thể bị coi là "tô vẽ xanh" | Chỉ ghi nhận khi **hai bên xác nhận** bàn giao bằng QR; ledger chỉ ghi thêm; hệ số có nguồn và phiên bản; báo cáo ghi rõ "ước tính, chưa kiểm toán độc lập, không phải tín chỉ carbon". |
| Tăng trưởng nhanh làm giảm an toàn | Mở cụm mới chỉ khi cụm cũ đạt: tỷ lệ minh chứng hợp lệ ≥ 80%, 0 sự cố ATTP nghiêm trọng, có nhà tài trợ cụm. |
| Phụ thuộc free tier | Kiến trúc adapter cho phép đổi nhà cung cấp; ngân sách đã tính giá trả phí (A1–A3). |

## 8. Lộ trình nhân rộng

| Giai đoạn | Thời gian | Phạm vi | Điều kiện để mở | Cần thêm gì |
|---|---|---|---|---|
| 1 | 12/2026 – 05/2027 | 1 cụm 3–5 phường, TP.HCM | Giải thưởng + LOI | Kế hoạch 6 tháng |
| 2 | 06 – 12/2027 | 3–5 cụm ở TP.HCM | Cụm 1 đạt KPI; mỗi cụm mới có 1 nhà tài trợ cụm + 1 điều phối viên cộng đồng (TNV trưởng) | Cấu hình khu vực trong Admin (không cần code mới); tài liệu "bộ khởi động cụm" |
| 3 | 2028 | Thành phố thứ 2 (Hà Nội hoặc Đà Nẵng) qua đối tác địa phương | Có ≥ 3 gói ESG trả phí; pháp nhân rõ ràng | Đối tác vận hành địa phương; bản đồ Goong phủ toàn quốc |
| 4 | 2028+ | Tích hợp POS/API; triển khai cho tổ chức lớn | Nhu cầu từ chuỗi/tổ chức | API công khai có xác thực, tài liệu tích hợp |

**Vì sao nhân rộng được về kỹ thuật:**
- Một cơ sở dữ liệu, phân vùng theo khu vực bằng cấu hình.
- Truy vấn không gian PostGIS có index.
- Thông báo qua outbox idempotent.
- Hạ tầng serverless tự co giãn.
- Lộ trình AWS đã có sẵn ([AWS-MIGRATION](../AWS-MIGRATION.md)).

**Vì sao nhân rộng được về vận hành:** mô hình "cụm" tự chứa (cửa hàng, tổ chức, TNV trong bán kính xe máy), nên mỗi cụm là một đơn vị nhân bản.

## 9. Rủi ro của mô hình

| Rủi ro | Khả năng | Ứng phó |
|---|---|---|
| Chuỗi bán lẻ không trả tiền cho báo cáo ESG | Trung bình–Cao | Kiểm chứng sớm (T4); nếu thất bại, chuyển trọng tâm sang R2 (tài trợ cụm) và R3; giữ báo cáo ESG miễn phí như công cụ thu hút |
| Nhà cung cấp free tier đổi chính sách | Trung bình | Adapter, ngân sách đã tính giá trả phí, AWS Budgets |
| Phụ thuộc 2 thành viên | Trung bình | Tài liệu vận hành, harness kỹ thuật, tuyển điều phối viên cộng đồng theo cụm |
| Chưa có pháp nhân để ký hợp đồng | Cao (hiện tại) | Hoạt động dưới bảo trợ của một pháp nhân ở T1; doanh nghiệp xã hội khi có nguồn thu ([ke-hoach-6-thang.md §11](ke-hoach-6-thang.md)) |
| Lệch sứ mệnh vì doanh thu | Thấp | Nguyên tắc ở mục 1 ghi vào điều khoản; trang tác động công khai |

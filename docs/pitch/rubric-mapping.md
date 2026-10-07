# Ánh xạ tiêu chí chấm → bằng chứng → slide

> Bảng chấm TISPA 2026: **37 điểm, 7 tiêu chí**. 25/37 điểm (Đội ngũ, Cấp thiết, Khả thi, Bền vững, Trình bày) **không phụ thuộc code**. Vì vậy Track B chạy song song từ ngày đầu (xem [ROADMAP §6](../ROADMAP.md)).
>
> File này là "hợp đồng" giữa sản phẩm và deck. Skill `pitch-sync` đọc nó để đồng bộ slide với tính năng đã xong. Agent `judge` dùng nó làm barem khi chấm thử.

## 0. Tổng quan và mục tiêu tự chấm

| # | Tiêu chí | Điểm tối đa | Mục tiêu tự chấm | Bằng chứng mạnh nhất | Điểm yếu lớn nhất |
|---|---|---|---|---|---|
| 1 | Đội ngũ | 6 | **4,5** | Quy trình kỹ thuật có gate/test/CI, làm được sản phẩm thật trong 8 tuần | Chỉ 2 thành viên; thiếu chuyên môn ATTP/pháp lý |
| 2 | Giải pháp & ứng dụng công nghệ | 8 | **7** | Ghép đơn nhiều cửa hàng trên bản đồ, chuỗi QR, làm mờ mặt trên máy, ESG có nguồn | Bị so với Too Good To Go / VietHarvest / Food Bank |
| 3 | Mức độ cấp thiết | 4 | **3,5** | Số UNEP/FAO có nguồn + khảo sát sơ cấp 20 cửa hàng | Số Việt Nam phần lớn là ước tính mô hình |
| 4 | Tính khả thi & tác động | 5 | **4** | Pilot thật ≥ 10 bàn giao + 3 LOI + kế hoạch 6 tháng có ngân sách | Pilot ngắn (2 tuần), quy mô nhỏ |
| 5 | Mô hình thiện nguyện bền vững | 5 | **3,5** | Chi phí hạ tầng gần 0; gói báo cáo ESG/CSR cho chuỗi bán lẻ | Chưa có khách trả tiền thật |
| 6 | Sản phẩm mẫu / prototype | 4 | **4** | Prod thật, demo 2 thiết bị, tài khoản giám khảo | Rủi ro mạng/thiết bị khi demo |
| 7 | Trình bày & phản biện | 5 | **4** | Kịch bản bấm giờ, bộ ≥ 40 câu phản biện, 3 lần tập dượt | Cả đội phải trả lời, không chỉ Minh |
| | **Tổng** | **37** | **30,5** | | |

Ngưỡng tự đặt: agent `judge` chấm **≥ 28/37 ở deck v2 (22/11)** và **≥ 30/37 ở lần tập dượt cuối**.

## 1. Cấu trúc deck chuẩn (14 slide)

Thời lượng giả định: khoảng 7 phút thuyết trình + 5 phút demo + phản biện. **Chờ BTC xác nhận (B-02).** Nếu tổng thời gian ngắn hơn, dùng bản rút gọn ở cột cuối.

| Slide | Tiêu đề | Nội dung chính | Tiêu chí phục vụ | Bản rút gọn? |
|---|---|---|---|---|
| S1 | FoodSave | Một câu: *"Điều phối thực phẩm dư thừa, minh bạch đến từng suất ăn."* Ảnh: tiệm bánh 21h với khay bánh còn lại | 7 | Giữ |
| S2 | Vấn đề | 3 con số: 72 kg/người/năm (hộ gia đình, UNEP FWI 2024); bán lẻ + ăn uống ngoài nhà còn thêm khoảng 84 kg/người; 10,7% dân số mất ANLT vừa/nặng (FAO) | 3 | Giữ |
| S3 | Vì sao chưa ai nối được | Hiện trạng: nhóm Zalo/Facebook, gọi điện; ngân hàng thực phẩm cần kho tập trung, không kịp với hàng hỏng trong vài giờ; cửa hàng ngại rủi ro ATTP và tốn công; nhà tài trợ không thấy thực phẩm đi đâu. Kèm **kết quả khảo sát sơ cấp** | 3, 2 | Gộp với S2 |
| S4 | Giải pháp | Vòng lặp 5 bước: Đăng (AI tự điền) → Ghép (nhiều cửa hàng) → Lấy (tuyến xe máy) → Bàn giao (QR) → Minh chứng + ESG | 2 | Giữ |
| S5 | **Demo trực tiếp** | Theo [demo-script.md](demo-script.md) | 6, 2 | Giữ (rút còn 3 phút) |
| S6 | Khác biệt | Bảng so sánh với kênh hiện có (mục 2.2 bên dưới) | 2 | Giữ |
| S7 | Công nghệ phù hợp | Sơ đồ kiến trúc: Next.js PWA · Supabase/PostGIS/RLS · Goong + MapLibre · Claude AI · sẵn sàng AWS qua adapter. Bảo mật: RLS 100%, MFA admin, bucket private, pgTAP | 2, 1 | Gộp với S6 |
| S8 | Minh bạch & ESG | Chuỗi QR 2 sự kiện + đối soát từng dòng; ảnh làm mờ mặt trên máy; ledger append-only; báo cáo tháng có trích nguồn hệ số | 2, 5 | Giữ |
| S9 | Bằng chứng thật | Số liệu pilot (≥ 10 bàn giao, kg, suất ăn, thời gian từ đăng tới nhận) lấy trực tiếp từ trang KPI công khai; 3 LOI; 2 câu trích lời đối tác | 4, 3 | Giữ |
| S10 | Tác động 6 tháng | KPI và chỉ tiêu (xem [ke-hoach-6-thang.md](ke-hoach-6-thang.md)) | 4 | Gộp với S12 |
| S11 | Mô hình bền vững | Lõi miễn phí; gói ESG/CSR cho chuỗi; nhà tài trợ tuyến; quỹ/CSR; chi phí gần 0 (xem [mo-hinh-ben-vung.md](mo-hinh-ben-vung.md)) | 5 | Giữ |
| S12 | Kế hoạch 6 tháng + 75 triệu | Mốc theo tháng + biểu đồ ngân sách; 25 triệu tại chung kết dùng vào đâu | 4, 5 | Giữ |
| S13 | Đội ngũ | Vai trò, thời gian cam kết, quy trình AI-assisted engineering có kiểm soát; cố vấn | 1 | Giữ |
| S14 | Lời mời | "Mỗi tối, X kg bánh ở khu này có thể thành Y suất ăn. Chúng tôi đã chứng minh được với 10 lần bàn giao; 6 tháng tới là 1 cụm phường." + QR mở trang tác động | 7 | Giữ |

---

## 2. Chi tiết từng tiêu chí

### Tiêu chí 1 — Đội ngũ (6 điểm)

**Giám khảo tìm:**
- kinh nghiệm và kỹ năng phù hợp với dự án;
- cam kết thời gian;
- các thành viên có mặt khi thuyết trình.

**Bằng chứng của FoodSave:**

| Bằng chứng | Ở đâu | Slide |
|---|---|---|
| Phân vai rõ: Minh (sản phẩm và kỹ thuật, trưởng nhóm), Khanh (chất lượng, UAT, quan hệ đối tác, vận hành pilot) | S13 | S13 |
| **Quy trình kỹ thuật chuyên nghiệp:** 7 phase, 7 gate đo được, CI (lint, typecheck, unit, pgTAP, E2E), Khanh ký UAT từng gate, tag phiên bản | [ROADMAP](../ROADMAP.md), `docs/phase-reports/` | S13 (1 hình: dòng thời gian gate) |
| **AI-assisted engineering có kiểm soát:** Claude Code viết code, con người duyệt và kiểm thử; hook chặn thao tác nguy hiểm; agent review bảo mật | `CLAUDE.md`, `.claude/` | S13 |
| Đã sửa và có test hồi quy cho 16 lỗi chức năng và 8 lỗi bảo mật của bản cũ (L1–L16, B1–B8). Đây là bằng chứng nhóm biết tự đánh giá và học | [SECURITY-PRIVACY](../SECURITY-PRIVACY.md) | S7/S13 |
| Cam kết: thời gian mỗi tuần sau giải; ai vận hành pilot | [ke-hoach-6-thang.md §Nhân sự](ke-hoach-6-thang.md) | S12/S13 |

**Điểm yếu và cách tăng điểm:**
- **Chỉ 2 thành viên chính.**
  - Xác nhận với BTC số thành viên đã đăng ký (tối đa 4, ≤ 25 tuổi). Nếu còn suất, cân nhắc bổ sung 1 thành viên phụ trách truyền thông/cộng đồng **trước khi BTC chốt danh sách** (câu hỏi mở).
  - Mời **2–3 cố vấn** (ATTP/dinh dưỡng, pháp lý phi lợi nhuận, CSR doanh nghiệp) và ghi tên trên S13 khi có đồng ý.
- **"Mọi thành viên có mặt và cùng trả lời":** phân vai trả lời theo tiêu chí. Khanh trả lời mảng Khả thi, Pilot, Đối tác, ATTP, UAT. Minh trả lời mảng Công nghệ, Bảo mật, Bền vững, Ngân sách. Cả hai đều phải trả lời được ≥ 10 câu trong [qa-phan-bien.md](qa-phan-bien.md).

### Tiêu chí 2 — Giải pháp và ứng dụng công nghệ (8 điểm)

**Giám khảo tìm:**
- tính mới so với giải pháp hiện có;
- công nghệ phù hợp, giải đúng vấn đề cộng đồng;
- giá trị đề xuất rõ ràng, thuyết phục.

**Giá trị đề xuất theo từng bên:**

| Bên | Đau ở đâu | FoodSave cho gì |
|---|---|---|
| Cửa hàng | Hàng dư cuối ngày phải hủy; muốn cho nhưng sợ rủi ro, tốn công liên hệ | Đăng trong 60 giây (AI tự điền), hệ thống tự tìm người nhận đến kịp, bàn giao có biên nhận QR, **báo cáo ESG/CSR** |
| Tổ chức từ thiện | Không biết ở đâu có đồ, đến nơi thì hết, thiếu người chở | Kho tặng trên bản đồ theo bán kính, **ghép đủ số lượng từ nhiều cửa hàng**, tuyến tối ưu cho tình nguyện viên |
| Tình nguyện viên | Không rõ đi đâu, mấy điểm | PWA: chuyến hôm nay, chỉ đường từng chặng, QR |
| Nhà tài trợ/xã hội | Không thấy thực phẩm đi đâu | Minh chứng đã duyệt, ảnh làm mờ mặt, trang tác động công khai |

**7 điểm khác biệt và bằng chứng:**

| # | Khác biệt | Bằng chứng trong demo/sản phẩm | Doc |
|---|---|---|---|
| 1 | Ghép đơn hai chiều, nhiều cửa hàng (tối ưu chính xác ≤ 3 cửa hàng, công bằng giữa tổ chức) | Beat "50 bánh = 20 + 18 + 12" trên bản đồ | DATA-MODEL, PRD |
| 2 | Nhãn tươi Xanh/Vàng/Đỏ theo nhóm hàng + giờ đóng cửa + kiểm tra khả thi | Đếm ngược, lô Đỏ chỉ gợi ý cho tổ chức đến kịp | ESG-METHODOLOGY/PRD |
| 3 | Bản đồ và điều phối thật: PostGIS, Goong (nhãn tiếng Việt, đúng chủ quyền), tuyến xe máy | Tuyến xe máy, deep link Google Maps | ARCHITECTURE |
| 4 | Chuỗi bàn giao QR: token một lần, chỉ lưu hash, đối soát từng dòng | Quét QR giữa 2 thiết bị | SECURITY-PRIVACY |
| 5 | Minh chứng tôn trọng quyền riêng tư: làm mờ mặt **trên máy**, xóa EXIF/GPS | Ảnh trước/sau | SECURITY-PRIVACY |
| 6 | ESG tự động: ledger append-only, hệ số có version và nguồn, báo cáo tháng in được | Báo cáo tháng | ESG-METHODOLOGY |
| 7 | AI (Claude → Bedrock): ảnh → tự điền lô; kiểm minh chứng; nhận xét ESG | Chụp ảnh khay bánh → form tự điền | ARCHITECTURE |

**Bảng so sánh cho S6** (định vị: **hạ tầng bổ trợ**, không cạnh tranh):

| Tiêu chí | Nhóm Zalo/Facebook | Ngân hàng thực phẩm (kho tập trung) | Tổ chức cứu thực phẩm (VietHarvest) | App bán đồ dư giảm giá (kiểu Too Good To Go, chưa có ở VN) | **FoodSave** |
|---|---|---|---|---|---|
| Người nhận | Ai nhanh tay | Tổ chức thành viên | Tổ chức đối tác | Người tiêu dùng (trả tiền) | Tổ chức đã xác minh |
| Hàng dễ hỏng trong vài giờ | Khó | Khó (qua kho) | Có (đội riêng) | Có | **Có, theo nhãn + khả thi** |
| Ghép nhiều cửa hàng cho 1 nhu cầu | Không | Thủ công | Thủ công | Không | **Tự động** |
| Biên nhận, đối soát | Không | Có (nội bộ) | Có (nội bộ) | Giao dịch bán | **QR 2 sự kiện, từng dòng** |
| Minh chứng sử dụng | Không | Báo cáo | Báo cáo | Không | **Ảnh làm mờ, admin duyệt** |
| Báo cáo ESG cho cửa hàng | Không | Có thể | Có thể | Không | **Tự động, có nguồn** |
| Chi phí cho tổ chức | 0 | 0 | 0 | — | **0** |

Câu chốt: *"FoodSave không thay thế ngân hàng thực phẩm hay VietHarvest. Đó là lớp phần mềm điều phối mà chính họ cũng có thể dùng, cho phần hàng dễ hỏng mà kho tập trung không kịp xử lý."*

**Điểm yếu và cách tăng điểm:**
- Bị hỏi "AI có thật sự cần không?" → AI chỉ ở chỗ giảm ma sát (đăng lô < 60 giây), luôn có người xác nhận, tắt được bằng flag.
- Bị hỏi về bản quyền thuật toán, tính mới → nhấn **tổ hợp** tính năng (nhãn + khả thi + ghép + QR + minh chứng + ESG) trên một luồng dữ liệu thống nhất, không phải một thuật toán đơn lẻ.
- Demo phải cho thấy **bản đồ thật, tuyến thật**, không phải ảnh tĩnh.

### Tiêu chí 3 — Mức độ cấp thiết (4 điểm)

**Giám khảo tìm:**
- vấn đề cộng đồng có thật và cấp thiết;
- quy mô và tác động có dữ liệu;
- có bằng chứng.

**Bằng chứng** (chi tiết và nguồn: [so-lieu-cap-thiet.md](so-lieu-cap-thiet.md)):
- UNEP FWI 2024: 1,05 tỷ tấn lãng phí năm 2022; hơn 1 tỷ bữa/ngày; 8–10% phát thải khí nhà kính.
- Việt Nam (2022): 72 kg/người/năm ở hộ gia đình; ước tính thêm khoảng 84 kg/người ở bán lẻ và ăn uống ngoài nhà.
- FAO: 10,7% dân số Việt Nam mất an ninh lương thực vừa/nặng; **tăng từ 6,5% năm 2019**.
- Hệ sinh thái: mạng lưới ngân hàng thực phẩm phục vụ 3,1 triệu người và 862 tổ chức (2025). Nhu cầu là thật, nguồn cung chưa đủ.
- **Số liệu sơ cấp:** khảo sát 20 cửa hàng + 5–10 tổ chức tại khu vực pilot (B-03).

**Slide:** S2, S3 (và S9 cho bằng chứng thật).

**Điểm yếu và cách tăng điểm:**
- Số Việt Nam là ước tính mô hình → nói "theo ước tính của UNEP", và bù bằng **khảo sát tự làm** + số pilot.
- Không dùng các số "8 triệu tấn, 3,9 tỷ USD" như sự thật (chưa rõ nguồn gốc).
- Kể **1 câu chuyện thật** từ khảo sát (ví dụ một tiệm bánh hủy bao nhiêu bánh mỗi tối), có đồng ý của chủ tiệm.

### Tiêu chí 4 — Tính khả thi và tác động (5 điểm)

**Giám khảo tìm:**
- nguồn lực triển khai thực tế (công nghệ, vận hành);
- kế hoạch 6 tháng cụ thể (mốc, nguồn lực, đối tác);
- phạm vi tác động xã hội có chỉ số.

**Bằng chứng:**

| Bằng chứng | Doc | Slide |
|---|---|---|
| Sản phẩm đã chạy thật trên prod; chi phí hạ tầng hiện gần 0 | DEPLOYMENT | S7 |
| **Pilot thật 15–28/11: ≥ 10 lần bàn giao**, số đo tự động từ hệ thống | Trang KPI công khai | S9 |
| 3 LOI (2 cửa hàng + 1 tổ chức) | Track B B-04 | S9 |
| Kế hoạch 6 tháng có mốc tháng, KPI, ngân sách 75 triệu từng dòng | [ke-hoach-6-thang.md](ke-hoach-6-thang.md) | S10, S12 |
| Quản trị rủi ro ATTP: cam kết khi đăng, quyền từ chối từng dòng, điều khoản miễn trừ, chỉ nhận nhóm hàng an toàn ở giai đoạn đầu | SECURITY-PRIVACY, PRD | S8 / phản biện |
| Lộ trình AWS và Zalo OA/ZNS | AWS-MIGRATION | S12 |

**Điểm yếu và cách tăng điểm:**
- Pilot ngắn → trình bày trung thực "2 tuần, N bàn giao", kèm **tỷ lệ chuyển đổi** từ khảo sát → LOI → pilot.
- Kế hoạch phải nêu **tên đối tác thật** (đã có LOI) và người chịu trách nhiệm từng mốc.

### Tiêu chí 5 — Mô hình thiện nguyện bền vững (5 điểm)

**Giám khảo tìm:**
- bền vững tài chính sau khi ra mắt;
- khả năng nhân rộng;
- cân bằng giữa tác động xã hội và nguồn lực.

**Bằng chứng** (chi tiết: [mo-hinh-ben-vung.md](mo-hinh-ben-vung.md)):
- Chi phí vận hành cấu trúc thấp: hạ tầng serverless/free tier; chi phí biên mỗi lần bàn giao rất nhỏ.
- Nguồn thu không đánh vào người nhận:
  - gói báo cáo ESG/CSR cho chuỗi bán lẻ;
  - nhà tài trợ tuyến (sponsor-a-route);
  - quỹ và tài trợ CSR.
- Nhân rộng: thêm cụm phường → thành phố khác chỉ cần cấu hình, không cần viết lại; API cho POS sau này.

**Slide:** S11 (+ S12).

**Điểm yếu và cách tăng điểm:**
- Chưa có khách trả tiền → xin **1 thư quan tâm** từ 1 chuỗi bán lẻ/thương hiệu về gói báo cáo ESG (stretch goal của B-04).
- Đưa **bảng unit economics** (ước tính có ghi giả định) và điểm hòa vốn cụ thể.

### Tiêu chí 6 — Sản phẩm mẫu / prototype (4 điểm)

**Giám khảo tìm:** demo, hoặc tối thiểu hình ảnh/mô phỏng sản phẩm.

**Bằng chứng:**
- **Demo trực tiếp trên prod**, 2 thiết bị: laptop (cửa hàng/Admin) + điện thoại (tổ chức/TNV, PWA). Xem [demo-script.md](demo-script.md).
- Tài khoản giám khảo theo vai trò (cửa hàng, tổ chức, TNV; không có admin) để tự thử sau buổi thi.
- Video dự phòng (M1, M2, M3).
- E2E xanh, Lighthouse ≥ 90.

**Slide:** S5 (+ QR ở S14 mở trang tác động công khai).

**Điểm yếu và cách tăng điểm:** rủi ro mạng → mỗi beat có phương án dự phòng (mã 6 số, trạng thái seed sẵn, video).

### Tiêu chí 7 — Trình bày và phản biện (5 điểm)

**Giám khảo tìm:**
- trình bày rõ ràng, logic;
- khả năng trả lời câu hỏi;
- tất cả thành viên cùng trả lời.

**Bằng chứng / chuẩn bị:**
- Mạch kể: một tiệm bánh lúc 21h → con số → khoảng trống → demo → bằng chứng → bền vững → lời mời.
- [qa-phan-bien.md](qa-phan-bien.md): ≥ 40 câu, mỗi câu trả lời ≤ 30 giây.
- 3 lần tập dượt (25/11, 27/11, 29/11), agent `judge` chấm sau mỗi lần.
- Phân vai trả lời (xem tiêu chí 1).

**Điểm yếu và cách tăng điểm:**
- Tránh thuật ngữ kỹ thuật dày đặc. Mỗi thuật ngữ đi kèm lợi ích (ví dụ "RLS" → "tổ chức khác không thể xem giấy tờ của bạn").
- Câu trả lời theo cấu trúc **Kết luận → 1 bằng chứng → 1 con số**.

---

## 3. Khoảnh khắc demo → tiêu chí

| Khoảnh khắc | Tiêu chí | Câu nói kèm |
|---|---|---|
| Chụp ảnh khay bánh → form tự điền | 2, 6 | "Cửa hàng chỉ mất chưa tới 1 phút để cho đi." |
| Nhãn Đỏ đếm ngược, chỉ hiện cho tổ chức đến kịp | 2, 3 | "Không gợi ý thứ mà người nhận không kịp lấy." |
| 50 bánh = 20 + 18 + 12 trên bản đồ, 2 tuyến | 2, 6 | "Một cửa hàng không đủ thì hệ thống tự ghép thêm." |
| Quét QR giữa 2 thiết bị, đối soát từng dòng | 2, 4 | "Mỗi chiếc bánh có biên nhận." |
| Ảnh minh chứng: mặt trẻ em bị làm mờ ngay trên điện thoại | 2, 4 | "Minh bạch nhưng không đánh đổi quyền riêng tư." |
| Báo cáo ESG tháng có trích nguồn | 5, 4 | "Đây là thứ doanh nghiệp sẵn lòng trả tiền, và nó nuôi phần miễn phí." |
| Trang tác động công khai với số pilot thật | 4, 3 | "Mọi con số bạn thấy đều đo từ hệ thống." |

## 4. Lịch rà soát

| Ngày | Việc | Người |
|---|---|---|
| 08/11 | `judge` chấm deck v1 theo file này → ghi điểm vào bảng §0 | Minh |
| 15/11 | Cập nhật tiêu chí 4, 5 theo kế hoạch 6 tháng và mô hình bền vững chốt | Minh |
| 22/11 | `pitch-sync` đối chiếu deck v2 với tính năng đã freeze; `judge` chấm ≥ 28 | Minh + Khanh |
| 29/11 | Chấm sau tập dượt #3, mục tiêu ≥ 30 | Cả đội |

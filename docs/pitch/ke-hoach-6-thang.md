# Kế hoạch triển khai 6 tháng sau giải (12/2026 – 06/2027)

> Phục vụ tiêu chí **Tính khả thi & tác động (5đ)** và **Mô hình bền vững (5đ)**. Hạn chốt: **15/11/2026** (B-06 trong [ROADMAP](../ROADMAP.md)).
> Ngân sách giải: **25 triệu đồng tại chung kết** + **75 triệu đồng triển khai trong 6 tháng**.
> Mọi đơn giá dịch vụ là **ước tính** tại 07/10/2026, tỷ giá giả định **1 USD = 26.000 đ**. Cần lấy báo giá thật trước khi giải ngân (cột "Trạng thái giá").

## 1. Mục tiêu 6 tháng (một câu)

**Biến FoodSave từ prototype thành dịch vụ vận hành thật ở một cụm 3–5 phường liền kề tại TP.HCM: 30 cửa hàng và 10 tổ chức hoạt động đều đặn, ≥ 600 lần bàn giao, ≥ 5 tấn thực phẩm được cứu, và có ít nhất 1 nguồn thu hoặc tài trợ định kỳ để tự duy trì sau tháng thứ 6.**

## 2. Thiết kế pilot

| Hạng mục | Thiết kế |
|---|---|
| **Khu vực** | Một **cụm 3–5 phường liền kề** ở khu trung tâm TP.HCM, có mật độ tiệm bánh, cửa hàng tiện lợi, quán ăn cao và có ≥ 3 mái ấm/bếp ăn từ thiện trong bán kính 3 km. Chọn dứt điểm sau khảo sát B-03 (25/10/2026). Từ 01/7/2025 TP.HCM không còn cấp quận, nên dùng đơn vị "cụm phường" thay cho "1 quận". |
| **Vì sao một cụm nhỏ** | Bán kính giao bằng xe máy ≤ 5 km nên thời gian tới < 20 phút, đủ cho lô nhãn Đỏ; mật độ đủ để ghép đơn nhiều cửa hàng thật sự xảy ra; đội 2 người hỗ trợ trực tiếp được. |
| **Cửa hàng mục tiêu** | 30 cửa hàng hoạt động ở T6: tiệm bánh/lò bánh (40%), cửa hàng tiện lợi/minimart (30%), quán cơm/bếp nấu sẵn (20%), siêu thị nhỏ (10%); trong đó **≥ 1 chuỗi có ≥ 3 điểm** (ứng viên gói ESG). |
| **Tổ chức mục tiêu** | 10 tổ chức hoạt động: mái ấm, bếp ăn từ thiện, nhà mở, nhóm phát cơm, ký túc xá sinh viên khó khăn (đã xác minh giấy tờ). |
| **Tình nguyện viên** | 40 TNV đăng ký, ≥ 20 hoạt động mỗi tháng; nguồn: CLB tình nguyện sinh viên, TNV sẵn có của tổ chức. |
| **Nhóm hàng cho phép** | T1–T2: bánh, đồ đóng gói, rau củ quả, đồ uống. **Từ T3** mở thêm đồ nấu chín đóng hộp, với điều kiện thời gian từ lúc nấu tới lúc giao ≤ 4 giờ (nhãn Đỏ + kiểm tra khả thi). Không nhận thịt cá tươi sống trong pilot. |
| **Quy trình ATTP** | Cửa hàng tick cam kết khi đăng; bên nhận kiểm tra và có quyền từ chối từng dòng; túi giữ nhiệt cho TNV; điều khoản miễn trừ đã được luật sư rà soát (F1); sự cố được ghi `incidents`, xử lý trong 72 giờ. |
| **Đánh giá** | So sánh **trước/sau** cho 10 cửa hàng đầu tiên: lượng hủy tự báo cáo trước pilot (khảo sát B-03) và lượng tặng đo bằng hệ thống; khảo sát hài lòng cuối kỳ (F3). |

## 3. Mốc theo tháng

| Tháng | Chủ đề | Mốc chính (đầu ra kiểm chứng được) | Chỉ tiêu tích lũy cuối tháng | Người chịu trách nhiệm |
|---|---|---|---|---|
| **T1 — 12/2026** | Khởi động | Nhận giải; chuyển 3 LOI thành biên bản hợp tác; tuyển và tập huấn 10 cửa hàng + 4 tổ chức đầu tiên (E1); đặt standee QR (C1); nâng Supabase Pro; đăng ký Zalo OA; nộp hồ sơ tín dụng AWS cho startup/phi lợi nhuận (nếu đủ điều kiện, **cần kiểm chứng**); chọn hình thức pháp lý | 10 cửa hàng · 4 tổ chức · 15 TNV · 40 bàn giao | Khanh (đối tác), Minh (hạ tầng) |
| **T2 — 01/2027** | Ổn định vận hành | Sự kiện ra mắt pilot (E2); bật **email qua AWS SES** và thử **Amazon Location** song song Goong qua adapter; mẫu ZNS được duyệt; báo cáo ESG tháng đầu gửi cửa hàng | 15 cửa hàng · 6 tổ chức · 25 TNV · 110 bàn giao | Minh |
| **T3 — 02/2027** (Tết Đinh Mùi, mùng 1 ngày 06/02/2027) | Cao điểm Tết | Chiến dịch "Tết không lãng phí" (hàng dư trước Tết nhiều, nhiều cửa hàng nghỉ sau Tết); **ZNS live** cho thông báo GẤP; chuyển AI sang **Amazon Bedrock**; mở nhóm hàng nấu chín có điều kiện | 18 cửa hàng · 7 tổ chức · 30 TNV · 200 bàn giao | Khanh (chiến dịch), Minh (Bedrock) |
| **T4 — 03/2027** | Mở rộng trong cụm | Tập huấn đợt 2 (E1); tiếp cận 3 chuỗi bán lẻ/F&B để chào **gói báo cáo ESG**; **Rekognition Face Liveness** cho người đại diện (thay quét QR CCCD tùy chọn); kiểm thử bảo mật giữa kỳ | 22 cửa hàng · 8 tổ chức · 35 TNV · 320 bàn giao | Minh (kỹ thuật), Khanh (bán hàng) |
| **T5 — 04/2027** | Chuyển hạ tầng & doanh thu | **Chuyển hosting sang AWS Amplify** (giữ đường lui về Vercel 30 ngày); EventBridge + Lambda cho job; ký **≥ 1 hợp đồng gói ESG hoặc 1 nhà tài trợ tuyến**; khảo sát tác động (F3) | 26 cửa hàng · 9 tổ chức · 38 TNV · 460 bàn giao | Minh, Khanh |
| **T6 — 05/2027** | Tổng kết & nhân rộng | Sự kiện tổng kết (E2); **báo cáo tác động 6 tháng** công khai (số liệu từ ledger); kế hoạch mở cụm phường thứ 2 với nhà tài trợ tuyến; rà soát chi phí AWS, quyết định giữ hay chuyển DB | **30 cửa hàng · 10 tổ chức · 40 TNV · ≥ 620 bàn giao** | Cả đội |
| **06/2027** | Báo cáo với BTC/Quỹ | Nộp báo cáo quyết toán 75 triệu + báo cáo tác động; bàn giao tài liệu vận hành | — | Minh |

Bàn giao theo tháng: 40 → 70 → 90 → 120 → 140 → 160 (tổng **620**). Giả định trung bình **8 kg/lần bàn giao**, nên tổng khoảng **4,96 tấn**. Giả định này phải được hiệu chỉnh bằng số pilot 15–28/11/2026.

## 4. KPI và chỉ tiêu

Mọi KPI được **đo tự động** từ hệ thống (ESG-METHODOLOGY) và hiển thị trên trang tác động công khai.

| Nhóm | KPI | Cách đo (nguồn dữ liệu) | Chỉ tiêu T6 | Mức vươn |
|---|---|---|---|---|
| E | Thực phẩm được cứu | Σ kg ở các dòng bàn giao dropoff (`impact_ledger`) | **≥ 5 tấn** | 8 tấn |
| E | CO₂e tránh được | kg × 2,5 (FAO 2013) | ≥ 12,5 tấn CO₂e | 20 tấn |
| E | Tỷ lệ lô hết hạn chưa được nhận | Lô `expired` chưa có phân bổ ÷ tổng lô đã đăng | **≤ 20%** | ≤ 10% |
| S | Suất ăn tương đương | kg ÷ 0,42 (WRAP) | **≥ 11.900 suất** | 19.000 |
| S | Người được hỗ trợ | Σ `people_served` ở minh chứng đã duyệt | ≥ 8.000 lượt | 12.000 |
| S | Tỷ lệ nhu cầu được đáp ứng đủ | Nhu cầu `fulfilled` ÷ tổng nhu cầu | ≥ 60% | 75% |
| S | Bên hoạt động/tháng | Cửa hàng/tổ chức có ≥ 1 lần tặng/nhận trong tháng | 30 cửa hàng · 10 tổ chức | 40 · 15 |
| S | Chuyến TNV | Chuyến đã hoàn tất | ≥ 450 | 650 |
| G | Tỷ lệ lô có minh chứng hợp lệ | Lô có minh chứng được duyệt ÷ lô đã giao | **≥ 80%** | 90% |
| G | Thời gian đăng minh chứng | TB từ dropoff tới gửi minh chứng | ≤ 48 giờ | ≤ 24 giờ |
| G | Thời gian duyệt hồ sơ | TB từ gửi duyệt tới quyết định | ≤ 2 ngày | ≤ 1 ngày |
| G | Phản ánh đã xử lý | Đã xử lý ÷ tổng phản ánh | 100% trong 72 giờ | — |
| Vận hành | Thời gian trung vị từ đăng lô tới được xác nhận | `confirmed_at − published_at` | ≤ 30 phút | ≤ 15 phút |
| Vận hành | Giữ chân cửa hàng | Cửa hàng hoạt động tháng này cũng hoạt động tháng trước | ≥ 70% | 85% |
| An toàn | Sự cố ATTP nghiêm trọng | `incidents` mức nghiêm trọng | **0** | 0 |
| Kỹ thuật | Uptime prod | Uptime monitor | ≥ 99,5% | 99,9% |
| Bền vững | Nguồn thu/tài trợ định kỳ đã ký | Hợp đồng | **≥ 1** | 3 |

## 5. Nhân sự và nguồn lực

| Người | Vai trò trong 6 tháng | Thời gian cam kết |
|---|---|---|
| Minh | Trưởng nhóm; sản phẩm, kỹ thuật, chuyển AWS, báo cáo tài chính | khoảng 15 giờ/tuần |
| Khanh | Vận hành pilot: tuyển và tập huấn đối tác, hỗ trợ tổ chức, QA, xử lý sự cố | khoảng 15 giờ/tuần |
| Thành viên/cộng tác viên cộng đồng (1–2 người, nếu quy định cho phép) | Điều phối TNV, truyền thông, chụp ảnh sự kiện | khoảng 8 giờ/tuần |
| Cố vấn (mục tiêu 2–3 người) | ATTP/dinh dưỡng; pháp lý phi lợi nhuận và BVDLCN; CSR/ESG doanh nghiệp | 1–2 giờ/tháng |
| Claude Code (AI-assisted engineering) | Viết code theo harness, con người review; giữ chi phí phát triển gần 0 | — |

**Không trả lương** từ ngân sách 75 triệu. Toàn bộ tiền giải dùng cho vận hành và người hưởng lợi. Nếu sau T6 có nguồn thu, ưu tiên phụ cấp cho điều phối viên cộng đồng (xem [mo-hinh-ben-vung.md](mo-hinh-ben-vung.md)).

## 6. Đối tác

| Nhóm | Vai trò | Trạng thái |
|---|---|---|
| 2 cửa hàng + 1 tổ chức đã ký LOI | Hạt nhân pilot | Mục tiêu 08/11/2026 (B-04) |
| IEC – ĐHQG TP.HCM, Quỹ Khởi Sự Từ Tâm | Cố vấn, kết nối, giám sát giải ngân | Sau giải |
| CLB tình nguyện sinh viên | Nguồn TNV | Liên hệ ở T1 |
| Ngân hàng thực phẩm / tổ chức cứu thực phẩm (mạng lưới GFN, VietHarvest…) | Đối tác bổ trợ: chuyển hàng dư vượt sức nhận của tổ chức nhỏ; thử FoodSave như công cụ điều phối | **Chưa liên hệ**, chỉ là đối tác mục tiêu |
| 1 chuỗi bán lẻ/F&B | Khách hàng đầu tiên của gói ESG | Tiếp cận ở T4 |
| Doanh nghiệp tài trợ tuyến | Tài trợ chi phí TNV một cụm phường | Tiếp cận ở T4–T5 |

## 7. Lộ trình chuyển AWS (chi tiết kỹ thuật: [AWS-MIGRATION.md](../AWS-MIGRATION.md))

Kiến trúc đã tách provider qua adapter (`maps`, `ai`, `notify`). Mỗi bước là **đổi biến môi trường, có đường lui**, không viết lại.

| Tháng | Bước | Dịch vụ AWS | Thay cho | Tiêu chí xong |
|---|---|---|---|---|
| T1 | Tài khoản, IAM tối thiểu quyền, AWS Budgets cảnh báo chi phí, region `ap-southeast-1`; đánh giá chuyển dữ liệu ra nước ngoài theo Luật BVDLCN (SECURITY-PRIVACY) | — | — | Có cảnh báo khi vượt 30 USD/tháng |
| T2 | Email giao dịch | **SES** | Resend | Tỷ lệ vào inbox ≥ Resend sau 2 tuần chạy song song |
| T2 | Bản đồ, tuyến (thử song song) | **Amazon Location** (MapLibre, chỉ đổi style URL) | Goong | So sánh sai lệch geocode trên 20 địa chỉ spike P0; quyết định giữ Goong cho geocode tiếng Việt nếu tốt hơn |
| T3 | AI ảnh → tự điền, kiểm minh chứng | **Bedrock** (Claude) | Anthropic API | Cùng bộ test 10 ảnh đạt ≥ 8/10 |
| T4 | Xác minh người đại diện | **Rekognition Face Liveness**; làm mờ phía server kiểm tra lại | Quét QR CCCD (tùy chọn) | Luồng KYC đạt yêu cầu bảo mật |
| T5 | Hosting + jobs | **Amplify Hosting**; **EventBridge + Lambda** cho dispatcher; **SNS** cho SMS | Vercel; pg_cron → pg_net | E2E xanh trên Amplify; giữ Vercel 30 ngày làm đường lui |
| T6 | Rà soát | Cost Explorer | — | Báo cáo chi phí, quyết định DB (giữ Supabase hoặc chuyển RDS/Aurora) |

## 8. Zalo OA / ZNS

| Tháng | Việc |
|---|---|
| T1 | Đăng ký Zalo Official Account. Yêu cầu xác thực có thể cần pháp nhân: **dùng pháp nhân bảo trợ hoặc pháp nhân mới (mục 10)**. |
| T2 | Soạn và xin duyệt mẫu ZNS: "Lô GẤP gần bạn", "Yêu cầu đã được xác nhận", "Nhắc minh chứng", "Báo cáo tháng". Liên kết tài khoản người dùng với Zalo có **consent**. |
| T3 | Bật ZNS cho thông báo GẤP; SMS (SNS) chỉ làm dự phòng khi ZNS lỗi. Đo tỷ lệ phản hồi lô Đỏ trước và sau khi bật ZNS. |
| T4–T6 | Mini App Zalo cho TNV **chỉ nếu** số liệu cho thấy PWA bị bỏ qua; mặc định giữ PWA. |

## 9. Ngân sách 75.000.000 đồng

| Mã | Hạng mục | Diễn giải (đơn giá × số lượng) | Thành tiền (đ) | Trạng thái giá |
|---|---|---|---|---|
| **A** | **Hạ tầng kỹ thuật** | | **13.000.000** | |
| A1 | Supabase Pro (DB, Auth, Storage, Realtime) | 25 USD × 6 tháng | 3.900.000 | Bảng giá công khai, cần kiểm tra lại |
| A2 | Hosting: Vercel Pro (T1–T4) → AWS Amplify (T5–T6) | khoảng 20 USD × 6 tháng | 3.120.000 | Ước tính |
| A3 | AWS sau khi trừ tín dụng: Location, Bedrock, Rekognition, SES | khoảng 30 USD × 6 tháng | 4.680.000 | Ước tính, phụ thuộc lưu lượng |
| A4 | Gia hạn tên miền + hạn mức trả phí dự phòng (Goong/AI) | trọn gói | 1.300.000 | Ước tính |
| **B** | **Thông báo** | | **8.000.000** | |
| B1 | Xác thực Zalo OA | trọn gói | 2.000.000 | **Chờ báo giá** |
| B2 | Tin ZNS | 15.000 tin × 300 đ | 4.500.000 | **Chờ báo giá** |
| B3 | SMS dự phòng cho lô GẤP | 1.500 tin × 1.000 đ | 1.500.000 | Ước tính |
| **C** | **Vật phẩm tại điểm** | | **6.000.000** | |
| C1 | Standee mica có QR + decal "Điểm FoodSave" | 40 bộ × 120.000 đ | 4.800.000 | Ước tính, lấy 2 báo giá in |
| C2 | Tờ hướng dẫn, nhãn dán túi lô hàng | trọn gói | 1.200.000 | Ước tính |
| **D** | **Hỗ trợ tình nguyện viên** | | **21.500.000** | |
| D1 | Hỗ trợ xăng | 650 chuyến × 20.000 đ | 13.000.000 | Định mức nội bộ |
| D2 | Bảo hiểm tai nạn TNV | 30 người × 150.000 đ | 4.500.000 | **Chờ báo giá** |
| D3 | Túi giữ nhiệt/thùng giao | 20 cái × 200.000 đ | 4.000.000 | Ước tính |
| **E** | **Sự kiện & đào tạo** | | **12.000.000** | |
| E1 | Tập huấn (cửa hàng, tổ chức, TNV) | 3 buổi × 2.000.000 đ | 6.000.000 | Ước tính |
| E2 | Sự kiện ra mắt pilot + tổng kết | 2 sự kiện × 3.000.000 đ | 6.000.000 | Ước tính |
| **F** | **Thiết kế, pháp lý, đánh giá** | | **7.000.000** | |
| F1 | Rà soát pháp lý: điều khoản, miễn trừ cho bên tặng, ATTP, BVDLCN, mẫu hợp đồng gói ESG | trọn gói | 4.000.000 | **Chờ báo giá** |
| F2 | Thiết kế truyền thông (nhận diện điểm, video ngắn) | trọn gói | 2.000.000 | Ước tính |
| F3 | Khảo sát đánh giá tác động cuối kỳ (in phiếu, quà cảm ơn người trả lời) | trọn gói | 1.000.000 | Ước tính |
| **G** | **Dự phòng (10%)** | Cho chênh lệch tỷ giá, giá dịch vụ, phát sinh an toàn | **7.500.000** | — |
| | **TỔNG** | | **75.000.000** | |

Cơ cấu: hỗ trợ trực tiếp người tham gia (D + E) **44,7%** · hạ tầng và thông báo (A + B) **28,0%** · vật phẩm, pháp lý, đánh giá (C + F) **17,3%** · dự phòng **10,0%**.

**Giải ngân dự kiến theo tháng** (không gồm dự phòng):

| T1 | T2 | T3 | T4 | T5 | T6 | Dự phòng | Tổng |
|---|---|---|---|---|---|---|---|
| 14.500.000 | 11.000.000 | 10.000.000 | 12.000.000 | 12.000.000 | 8.000.000 | 7.500.000 | **75.000.000** |

T1 cao vì phải in standee, tập huấn đợt 1 và mua túi giữ nhiệt; T6 thấp vì hạ tầng đã ổn định.

**Nguyên tắc quản lý:**
- Mọi khoản chi có chứng từ.
- Ghi sổ chi tiêu công khai trên trang tác động (theo hạng mục).
- Chuyển giữa các hạng mục > 10% phải báo Quỹ/BTC.
- Nếu nhận được tín dụng AWS, phần A3 tiết kiệm được chuyển sang D1 (thêm chuyến).

## 10. Sử dụng 25.000.000 đồng nhận tại chung kết

Khoản này phục vụ **giai đoạn cầu nối** (12/2026, trước và trong lúc chờ giải ngân 75 triệu), để pilot không bị gián đoạn sau chung kết.

| Hạng mục | Diễn giải | Thành tiền (đ) |
|---|---|---|
| Thiết bị kiểm thử và vận hành | 1 điện thoại Android tầm trung + 1 iPhone đã qua sử dụng để kiểm thử PWA/Web Push trên iOS và làm máy quét tại điểm | 8.000.000 |
| Hạ tầng trả trước | Supabase Pro tháng 12 + tên miền 2 năm | 3.000.000 |
| Gói khởi động pilot | Standee QR cho 10 cửa hàng đầu + tài liệu hướng dẫn | 2.000.000 |
| Đi lại, khảo sát mở rộng | Gặp 20 cửa hàng mới, 5 tổ chức, 3 chuỗi | 3.000.000 |
| Tư vấn pháp lý ban đầu | Chuyển LOI thành biên bản hợp tác; tư vấn hình thức pháp lý | 3.000.000 |
| Ghi nhận TNV và đối tác pilot | Giấy chứng nhận, quà cảm ơn | 2.000.000 |
| Dự phòng | — | 4.000.000 |
| **Tổng** | | **25.000.000** |

## 11. Hình thức pháp lý (câu hỏi mở cần chốt ở T1)

Để ký hợp đồng gói ESG, xác thực Zalo OA và nhận tài trợ, FoodSave cần một pháp nhân. Phương án:
1. Hoạt động **dưới sự bảo trợ** của một tổ chức có pháp nhân (trường, Đoàn – Hội, quỹ). Nhanh, chi phí thấp.
2. Thành lập **doanh nghiệp xã hội** khi đã có nguồn thu (sau T6).

Quyết định cùng cố vấn pháp lý (F1, và khoản tư vấn trong 25 triệu).

## 12. Rủi ro triển khai

| Rủi ro | Giảm thiểu |
|---|---|
| Cửa hàng ngừng tham gia sau vài tuần | Đo giữ chân hằng tháng; gọi điện hỗ trợ khi 2 tuần không đăng; báo cáo ESG tháng làm "phần thưởng" định kỳ |
| Thiếu TNV vào giờ tối | Ưu tiên tổ chức có người tự đến lấy; chuyến gom nhiều điểm; hỗ trợ xăng |
| Sự cố ATTP | Giới hạn nhóm hàng (mục 2), quyền từ chối, truy vết bằng chuỗi QR, xử lý trong 72 giờ, tạm ngưng cửa hàng vi phạm |
| Chi phí dịch vụ vượt dự toán | AWS Budgets; giữ provider rẻ hơn qua adapter; dùng quỹ dự phòng G |
| Tết làm gián đoạn | Chiến dịch trước Tết; tạm giảm chỉ tiêu tuần sau Tết |

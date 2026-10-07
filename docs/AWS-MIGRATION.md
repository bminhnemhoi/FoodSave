# FoodSave v2 — Kế hoạch chuyển sang AWS (sau giải)

> **Trạng thái:** kế hoạch (07/10/2026). Thực hiện trong **6 tháng triển khai sau giải** (dự kiến 12/2026 → 05/2027), khi đã có tài khoản AWS.
> **Không** làm trong giai đoạn thi. Hiện tại FoodSave chạy Vercel + Supabase, nhưng được thiết kế để chuyển với chi phí thấp.
> **Quy ước:** "(cần kiểm chứng)" là tính năng, vùng (region) hoặc giá của AWS cần xác nhận lại trên tài liệu chính thức và **AWS Pricing Calculator** trước khi cam kết. Mọi con số chi phí là **ước tính**.
> **Liên quan:** `ARCHITECTURE.md` (adapter `src/server/providers/`), `DEPLOYMENT.md`, `SECURITY-PRIVACY.md`, `docs/pitch/ke-hoach-6-thang.md`.

---

## Mục lục

1. [Vì sao kiến trúc "AWS-ready"](#1-vì-sao-kiến-trúc-aws-ready)
2. [Bản đồ chuyển đổi](#2-bản-đồ-chuyển-đổi)
3. [Thứ tự chuyển, rủi ro, rollback](#3-thứ-tự-chuyển-rủi-ro-rollback)
4. [Chi tiết từng hạng mục](#4-chi-tiết-từng-hạng-mục)
5. [IAM tối thiểu quyền](#5-iam-tối-thiểu-quyền)
6. [Ước tính chi phí và cảnh báo ngân sách](#6-ước-tính-chi-phí-và-cảnh-báo-ngân-sách)
7. [Supabase ở lại hay chuyển Aurora?](#7-supabase-ở-lại-hay-chuyển-aurora)
8. [Trình bày với giám khảo](#8-trình-bày-với-giám-khảo)

---

## 1. Vì sao kiến trúc "AWS-ready"

Ngay từ P0, mọi phụ thuộc bên ngoài đi qua **adapter** trong `src/server/providers/`, chọn bằng biến môi trường. Code nghiệp vụ không biết bên dưới là Goong hay AWS:

| Adapter | Biến chọn | Hiện tại (thi) | Sau giải (AWS) |
|---|---|---|---|
| `MapsProvider` | `MAPS_PROVIDER` | `goong` (dự phòng `ors`) | `aws` |
| Tile bản đồ | style URL | Goong (dự phòng OpenFreeMap) | Amazon Location Maps, hoặc giữ Goong (mục 4.6) |
| `AiProvider` | `AI_PROVIDER` | `anthropic` | `bedrock` |
| `NotifyProvider` | `NOTIFY_PROVIDER` | `resend` + `web-push` | `ses` + `web-push` (+ `sns` SMS) |
| Job dispatch | — | pg_cron → pg_net → `/api/jobs/dispatch` | EventBridge Scheduler → Lambda |
| Làm mờ mặt | — | Trên máy (MediaPipe) + Admin duyệt | Thêm Rekognition `DetectFaces` phía server |
| eKYC | — | QR CCCD (tùy chọn) + Admin duyệt | Thêm Rekognition **Face Liveness** |
| Hosting | — | Vercel | **AWS Amplify Hosting** (Next.js SSR) |

**Điểm mấu chốt:**
- **MapLibre GL JS** là renderer mà Amazon Location dùng, nên đổi bản đồ chủ yếu là đổi style URL.
- `@anthropic-ai/bedrock-sdk` có **cùng dạng API** với `@anthropic-ai/sdk`.
- **Supabase đã chạy trên AWS `ap-southeast-1` (Singapore)**: dữ liệu FoodSave nằm trên hạ tầng AWS ngay từ hôm nay.

---

## 2. Bản đồ chuyển đổi

| Thành phần | Hiện tại | Đích AWS | Ghi chú cần kiểm chứng |
|---|---|---|---|
| Hosting Next.js | Vercel | **AWS Amplify Hosting** (SSR compute) | Phiên bản Next.js Amplify hỗ trợ (App Router, Server Actions, middleware, ISR); IAM compute role cho SSR |
| Bản đồ: tile | Goong | **Amazon Location Service — Maps** (API key, style MapLibre) | Cách thể hiện **Hoàng Sa, Trường Sa** (tham số political view); nhãn tiếng Việt |
| Bản đồ: tìm địa chỉ | Goong Places/Geocode | **Amazon Location — Places (API v2)**: Autocomplete, Geocode, ReverseGeocode, SearchText | **Độ phủ địa chỉ Việt Nam** (số nhà, hẻm, phường sau sáp nhập): chạy lại bộ 20 địa chỉ của spike P0 |
| Bản đồ: chỉ đường | Goong Directions (`bike`), Distance Matrix | **Amazon Location — Routes (API v2)**: CalculateRoutes (travel mode **Scooter** cho xe máy), CalculateRouteMatrix, OptimizeWaypoints | Chất lượng tuyến xe máy ở TP.HCM; OptimizeWaypoints có thể thay hoán vị khi > 5 điểm |
| AI | Anthropic API | **Amazon Bedrock**: Claude qua `@anthropic-ai/bedrock-sdk` | Model Claude có sẵn ở `ap-southeast-1` hay phải dùng cross-region inference profile (APAC); model ID khác bản Anthropic API |
| Email | Resend (SMTP cho Supabase Auth + API cho app) | **Amazon SES** (API cho app; **SMTP interface** cho Supabase Auth) | Ra khỏi sandbox (production access); Easy DKIM; custom MAIL FROM |
| Web Push | `web-push` (VAPID) | **Giữ nguyên** (chuẩn web, không phụ thuộc nhà cung cấp) | — |
| SMS | Chưa có | **Amazon SNS SMS** (cho thông báo GẤP) | Đăng ký **brandname / sender ID** cho Việt Nam; giá SMS về VN; cân nhắc **Zalo ZNS** (rẻ hơn, phổ biến hơn) |
| Job HTTP | pg_cron → pg_net → `/api/jobs/dispatch` | **EventBridge Scheduler → Lambda** `dispatch-outbox` | Job **thuần SQL** (đóng lô hết hạn, refresh MV) **giữ ở pg_cron** |
| Làm mờ mặt | Trên máy + Admin duyệt | Thêm **Rekognition DetectFaces** chạy server (lớp 2); ảnh có mặt chưa mờ thì tự chuyển `needs_changes` | Ngưỡng confidence; ảnh gửi dạng bytes (≤ 5 MB) nên không cần S3 |
| eKYC | QR CCCD + Admin | **Rekognition Face Liveness** cho người đại diện | Có ở `ap-southeast-1` không; **dữ liệu sinh trắc là dữ liệu nhạy cảm**: cần DPIA, đồng ý riêng, không lưu ảnh tham chiếu |
| Lưu file | Supabase Storage | **Giữ Supabase Storage** (mặc định). S3 là tùy chọn | Chỉ chuyển S3 nếu cần lifecycle hoặc Object Lock cho bằng chứng |
| Secrets | Vercel env | **AWS Secrets Manager** (runtime) + biến Amplify (không bí mật) | — |
| Giám sát | Sentry, Vercel Analytics, UptimeRobot | **CloudWatch** (log, metric, alarm) + giữ Sentry | CloudWatch Synthetics là tùy chọn, thay uptime monitor |
| Database, Auth, Realtime | Supabase (trên AWS Singapore) | **Giữ Supabase** (mục 7) | — |

---

## 3. Thứ tự chuyển, rủi ro, rollback

Nguyên tắc:
1. **Một thay đổi mỗi lần.**
2. **Chạy song song** khi có thể.
3. Có **công tắc quay lại** bằng biến môi trường hoặc DNS.
4. Đo trước và sau: độ trễ, tỷ lệ lỗi, chi phí.

| Bước | Tháng (dự kiến) | Việc | Rủi ro | Cách giảm rủi ro | Rollback |
|---|---|---|---|---|---|
| **0. Nền móng** | T1 | Tạo AWS Organization (`foodsave-staging`, `foodsave-prod` hoặc 1 tài khoản có tag); MFA root, không tạo access key root; IAM Identity Center cho Minh, Khanh; CloudTrail; **AWS Budgets** (mục 6.2); tag `Project=FoodSave`, `Env=…` | Phát sinh chi phí ngoài dự kiến | Budgets + Cost Anomaly Detection **trước** khi tạo tài nguyên đầu tiên | — |
| **1. SES** | T1 | Xác minh domain (DKIM), xin production access, configuration set + SNS cho bounce/complaint. App: `NOTIFY_PROVIDER=ses` trên staging, rồi prod. Supabase Auth: đổi SMTP sang SES SMTP | Email vào spam; bị giữ ở sandbox | Chạy song song 1 tuần (email app qua SES, Auth vẫn Resend), theo dõi bounce < 2% | Đổi `NOTIFY_PROVIDER=resend`; đổi SMTP Supabase về Resend (≤ 5 phút) |
| **2. Bedrock** | T1 | Bật quyền dùng model Claude; `AI_PROVIDER=bedrock`; IAM `bedrock:InvokeModel` giới hạn theo ARN model | Model hoặc vùng không có; kết quả khác bản Anthropic API | Chạy bộ eval nhỏ (30 ảnh lô hàng, 20 minh chứng) so sánh với Anthropic API trước khi đổi | `AI_PROVIDER=anthropic` |
| **3. EventBridge + Lambda** | T2 | Lambda `dispatch-outbox` (Node 24, đọc secret từ Secrets Manager), Scheduler 1 phút. Outbox **idempotent** nên chạy song song với pg_net an toàn | Gửi trùng thông báo khi chạy song song | Khóa `FOR UPDATE SKIP LOCKED` + `sent_at` trong outbox (đã có từ thiết kế) | Tắt schedule; bật lại job pg_net |
| **4. Rekognition DetectFaces** | T2 | Sau khi tổ chức gửi minh chứng, server action gửi bytes ảnh đã làm mờ tới `DetectFaces`. Còn mặt rõ (confidence ≥ ngưỡng, kích thước ≥ ngưỡng) thì gắn cờ cho Admin hoặc tự chuyển `needs_changes` | Báo nhầm (bàn tay, poster); chi phí | Giai đoạn đầu **chỉ gắn cờ**, không tự chặn; đo tỷ lệ báo nhầm 2 tuần rồi mới quyết định | Feature flag `app_settings.server_face_check_enabled = false` (thêm key vào DATA-MODEL §2.6 khi triển khai T2) |
| **5. Amplify Hosting** | T3 | Kết nối repo, nhánh `release` → prod, `main` → staging. Compute role (mục 5). Env + Secrets Manager. Domain: tạo bản ghi với **TTL 300 s** từ trước 48 giờ. Chạy song song: `aws.<DOMAIN>` trỏ Amplify, smoke + E2E `@smoke` + Lighthouse | Tính năng Next.js chưa được hỗ trợ đầy đủ (middleware, streaming, image optimization); cold start | Chạy E2E đầy đủ trên `aws.<DOMAIN>` 1 tuần; so sánh Lighthouse | Trỏ DNS về Vercel (TTL 300 s, tức ≤ 5 phút). Giữ project Vercel ít nhất 1 tháng sau khi chuyển |
| **6. Amazon Location** | T4 | `MAPS_PROVIDER=aws` cho Places + Routes trước; tile để sau. Chạy lại **spike P0** (20 địa chỉ TP.HCM, sai lệch < 50 m; tuyến xe máy hợp lý) | **Độ phủ địa chỉ Việt Nam kém hơn Goong**; bản đồ thể hiện chủ quyền không đúng | Nếu spike không đạt: **lai**, giữ Goong cho Places hoặc tile, dùng AWS cho Routes. Quyết định ghi bằng ADR | `MAPS_PROVIDER=goong` |
| **7. Face Liveness** | T5 | Sau khi có **DPIA** và màn đồng ý riêng: thêm bước "xác thực người thật" cho người đại diện tổ chức (tùy chọn hoặc bắt buộc theo loại). Lưu **chỉ** kết quả (đạt/không, confidence, thời điểm); không lưu ảnh | Pháp lý (dữ liệu sinh trắc); trải nghiệm trên máy yếu; tích hợp credential (component FaceLivenessDetector cần thông tin xác thực AWS tạm thời) | Thử với 5 tổ chức pilot; luôn có đường thay thế là Admin gọi video xác minh | Feature flag |
| **8. SMS / ZNS** | T5 | Thông báo GẤP (lô Đỏ) qua SNS SMS **hoặc** Zalo ZNS, chỉ cho người đã bật | Sender ID VN; chi phí | So sánh giá và tỷ lệ đến giữa SNS và ZNS trên 100 tin | Tắt kênh; giữ push + email |
| **9. Rà soát** | T6 | Rà chi phí và hiệu năng; quyết định S3 và Aurora (mục 7) | — | — | — |

---

## 4. Chi tiết từng hạng mục

### 4.1 Amplify Hosting
- **Build:** `amplify.yml` gồm `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`; artifact `.next`. Amplify tự nhận Next.js SSR (cần kiểm chứng phiên bản Next.js được hỗ trợ tại thời điểm chuyển).
- **Biến môi trường:** biến `NEXT_PUBLIC_*` và biến không bí mật đặt trong Amplify. Secret (service role, HMAC, VAPID private) đọc từ **Secrets Manager** lúc runtime bằng compute role, cache trong bộ nhớ 5 phút.
- **Header bảo mật và CSP:** giữ ở `middleware.ts` và `next.config.ts` (không phụ thuộc nền tảng). Thêm `customHttp.yml` nếu cần header tĩnh.
- **Migration DB:** vẫn chạy bằng GitHub Actions như `DEPLOYMENT.md` §6. Amplify chỉ deploy app sau khi `release` được fast-forward.
- **Preview:** Amplify có preview cho PR (cần kiểm chứng giới hạn); hoặc giữ Vercel cho preview trong giai đoạn chuyển.

### 4.2 Bedrock
```ts
// src/server/providers/ai/bedrock.ts (phác thảo — đọc skill claude-api trước khi viết thật)
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
const client = new AnthropicBedrock({ awsRegion: process.env.AWS_REGION }); // credential từ compute role
// client.messages.create({...}) — cùng shape với @anthropic-ai/sdk
```
- Model ID khác Anthropic API; cấu hình qua `AI_MODEL`.
- **Dữ liệu gửi AI** giữ nguyên chính sách: chỉ ảnh thực phẩm, mô tả minh chứng đã lọc, số liệu ESG tổng hợp; không gửi dữ liệu cá nhân.
- Lợi ích: dữ liệu xử lý trong AWS (vùng gần Việt Nam nếu model có sẵn), thanh toán chung hóa đơn AWS, dễ dùng tín dụng AWS.

### 4.3 SES
- Domain gửi `mail.<DOMAIN>`, **Easy DKIM**, custom MAIL FROM `bounce.mail.<DOMAIN>`, DMARC giữ nguyên.
- Configuration set gửi sự kiện bounce/complaint tới SNS rồi Lambda, để đánh dấu `profiles.email_status='bounced'` và ngừng gửi.
- Supabase Auth dùng **SES SMTP credentials** (IAM user riêng, chỉ có quyền `ses:SendRawEmail`). Đây là ngoại lệ duy nhất có access key dài hạn: rotate 90 ngày, lưu trong Supabase SMTP settings.

### 4.4 EventBridge Scheduler + Lambda
- **Lambda `dispatch-outbox`** (Node 24, arm64, 256 MB, timeout 60 s):
  - lấy tối đa 100 dòng `notification_outbox` chưa gửi qua RPC `claim_outbox(batch)` (`FOR UPDATE SKIP LOCKED`);
  - gửi qua SES / Web Push / SNS;
  - gọi `mark_outbox_sent`.
- Gọi Supabase bằng supabase-js với service role lấy từ Secrets Manager.
- **Scheduler:** `rate(1 minute)`, retry 2 lần, DLQ là SQS. CloudWatch alarm khi DLQ > 0.
- Job SQL thuần (đổi nhãn, đóng lô, refresh MV, purge) **ở lại pg_cron**. Không có lý do chuyển chúng ra ngoài DB.

### 4.5 Rekognition
- **DetectFaces** (lớp 2 cho minh chứng):
  - Gửi `Image.Bytes` của ảnh **đã làm mờ** (≤ 5 MB).
  - Nếu còn `FaceDetail` với `Confidence ≥ 90` và kích thước khung ≥ 2% ảnh, đặt `proof_media.server_face_flag=true`.
  - Admin thấy cờ đỏ trên màn duyệt.
  - Không lưu ảnh ở AWS; Rekognition không giữ ảnh của lời gọi `DetectFaces` (cần kiểm chứng chính sách dữ liệu dịch vụ, và tắt tùy chọn dùng dữ liệu cải thiện dịch vụ nếu có, qua AI services opt-out policy của Organizations).
- **Face Liveness:**
  - Server gọi `CreateFaceLivenessSession` (không cấu hình S3 output để không lưu ảnh tham chiếu).
  - Client dùng component `FaceLivenessDetector` (Amplify UI React) với credential tạm thời, cấp qua Cognito Identity Pool hoặc custom credentials provider. Đây là phần tích hợp phức tạp nhất, dự trù 1 tuần.
  - Server gọi `GetFaceLivenessSessionResults` và chỉ lưu `liveness_passed`, `confidence`, `checked_at` vào `org_sensitive`.

### 4.6 Amazon Location
- **API key** cho trình duyệt: chỉ cho phép action Maps (tile, style); giới hạn **referrer** theo domain; có hạn dùng và rotate.
- Places và Routes gọi **từ server**, dùng compute role, không dùng API key.
- **Chủ quyền:** tại Việt Nam, bản đồ phải thể hiện đúng Hoàng Sa và Trường Sa. Nếu style của Amazon Location không đáp ứng (cần kiểm chứng tham số political view), **giữ tile Goong**, chỉ chuyển Places/Routes. Đây là lý do adapter tách riêng tile và API.
- **Test chấp nhận:** spike P0 (20 địa chỉ, sai lệch < 50 m) + 10 tuyến xe máy so sánh với Goong. Kết quả ghi vào ADR.

---

## 5. IAM tối thiểu quyền

**Nguyên tắc:**
- Không dùng tài khoản root. Không có access key dài hạn, trừ SES SMTP (mục 4.3).
- Mỗi thành phần một role. Quyền giới hạn theo **ARN tài nguyên** và **điều kiện**.
- GitHub Actions dùng **OIDC** (`token.actions.githubusercontent.com`), giới hạn theo repo `bminhnemhoi/FoodSave` và tag/nhánh.

| Role | Gắn vào | Quyền (rút gọn) |
|---|---|---|
| `foodsave-<env>-amplify-compute` | Amplify SSR | `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` trên ARN model hoặc inference profile cụ thể · `rekognition:DetectFaces` · `rekognition:CreateFaceLivenessSession`, `rekognition:GetFaceLivenessSessionResults` · `geo-places:Autocomplete`, `geo-places:Geocode`, `geo-places:ReverseGeocode`, `geo-places:SearchText` · `geo-routes:CalculateRoutes`, `geo-routes:CalculateRouteMatrix`, `geo-routes:OptimizeWaypoints` · `ses:SendEmail` với điều kiện `ses:FromAddress = no-reply@mail.<DOMAIN>` · `secretsmanager:GetSecretValue` trên `arn:aws:secretsmanager:ap-southeast-1:<acct>:secret:foodsave/<env>/*` |
| `foodsave-<env>-dispatch-lambda` | Lambda dispatch | `secretsmanager:GetSecretValue` (như trên) · `ses:SendEmail` (điều kiện như trên) · `sns:Publish` (chỉ SMS, nếu bật) · `sqs:SendMessage` tới DLQ · CloudWatch Logs của chính hàm |
| `foodsave-<env>-scheduler` | EventBridge Scheduler | `lambda:InvokeFunction` trên đúng hàm dispatch |
| `foodsave-ses-bounce-lambda` | Lambda xử lý bounce | `secretsmanager:GetSecretValue` · Logs |
| `foodsave-github-deploy` | GitHub Actions (OIDC) | Tối thiểu: `amplify:StartJob` trên app (nếu không dùng auto-build) · không có quyền IAM hay quyền xóa |
| Người: `Admin` (Minh) | Identity Center | AdministratorAccess **kèm MFA**, chỉ dùng khi cần |
| Người: `ReadOnly` (Khanh) | Identity Center | ViewOnlyAccess + Billing read |

- Bật **IAM Access Analyzer** để phát hiện quyền thừa và tài nguyên chia sẻ ra ngoài.
- Bật **CloudTrail** (management events) lưu 90 ngày.

---

## 6. Ước tính chi phí và cảnh báo ngân sách

### 6.1 Ước tính (pilot một cụm 3–5 phường, mỗi tháng)

**Giả định:**
- 60 cửa hàng, 25 tổ chức, 150 tình nguyện viên.
- 3.000 lần bàn giao/tháng; 30.000 lượt xem trang/tháng (khoảng 1/3 có bản đồ).
- 2.000 lượt gọi AI; 1.500 ảnh minh chứng; 50 lượt Face Liveness (tổ chức mới).
- 15.000 email; 500 SMS GẤP.

> ⚠️ **Mọi con số dưới đây là ước tính sơ bộ, chưa kiểm chứng.** Trước khi đưa vào ngân sách 75 triệu đồng, phải tính lại bằng **AWS Pricing Calculator** (https://calculator.aws) cho vùng `ap-southeast-1` và kiểm tra free tier hiện hành.

| Dịch vụ | Cách tính (ước lượng) | USD/tháng (ước tính) |
|---|---|---|
| Amplify Hosting | Khoảng 100 phút build + khoảng 10 GB truyền tải + yêu cầu SSR | 3 – 10 |
| Amazon Location: Maps | Khoảng 10.000 lượt xem bản đồ × khoảng 20 tile | 10 – 30 |
| Amazon Location: Places + Routes | Khoảng 5.000 autocomplete/geocode + khoảng 3.000 tính tuyến/ma trận | 10 – 30 |
| Amazon Bedrock (Claude) | 2.000 lượt × (ảnh + khoảng 1.500 token vào, khoảng 300 token ra); phụ thuộc mạnh vào model chọn | 5 – 40 |
| Rekognition DetectFaces | 1.500 ảnh | 1 – 3 |
| Rekognition Face Liveness | 50 phiên | 1 – 3 |
| SES | 15.000 email | 1 – 3 |
| SNS SMS về Việt Nam | 500 tin (giá theo nhà mạng; cần sender ID) | 15 – 50 (**không chắc**; so với Zalo ZNS) |
| EventBridge Scheduler + Lambda + SQS | Khoảng 43.000 lần gọi/tháng (thường nằm trong free tier) | 0 – 2 |
| Secrets Manager | Khoảng 6 secret | 2 – 4 |
| CloudWatch (log, alarm) | Khoảng 5 GB log | 3 – 8 |
| **Tổng AWS** | | **≈ 50 – 180** |
| Supabase Pro (ngoài AWS, nếu nâng) | Gói cố định | 25 |
| Tên miền, Sentry free | | khoảng 1 |
| **Tổng hạ tầng** | | **≈ 75 – 205 USD/tháng**, khoảng **2 – 5,3 triệu đồng/tháng** (tỷ giá tham khảo khoảng 26.000 đ/USD, cần kiểm tra) |

- **6 tháng:** khoảng 12 – 32 triệu đồng.
- Nằm trong ngân sách 75 triệu nếu phần còn lại dành cho vận hành, pilot và truyền thông. Chi tiết: `docs/pitch/ke-hoach-6-thang.md`.
- **Tín dụng:** tìm hiểu **AWS Activate** (startup) và chương trình dành cho tổ chức phi lợi nhuận hoặc giáo dục của AWS (cần kiểm chứng điều kiện). Nếu được cấp, chi phí AWS năm đầu có thể gần 0.

### 6.2 Cảnh báo ngân sách (thiết lập **trước** mọi tài nguyên khác)
- **AWS Budgets:** ngân sách tháng **100 USD**:
  - cảnh báo email khi **thực chi** đạt 50%, 80%, 100%;
  - cảnh báo khi **dự báo** vượt 100%.
- **Budgets riêng** cho Bedrock (30 USD) và SNS SMS (30 USD), vì đây là hai khoản dễ tăng đột biến.
- **Cost Anomaly Detection** theo dịch vụ, ngưỡng 20 USD.
- **Free Tier usage alerts** bật.
- **Chặn kỹ thuật:**
  - rate limit AI theo tổ chức (`app_settings`, đã có);
  - Lambda reserved concurrency = 2;
  - SNS SMS spend limit tháng (thiết lập trong SNS).
- Tag bắt buộc `Project=FoodSave`, `Env=staging|prod` để tách chi phí theo môi trường.

---

## 7. Supabase ở lại hay chuyển Aurora?

**Khuyến nghị: Supabase ở lại** trong 6 tháng.

| Tiêu chí | Supabase (trên AWS Singapore) | Aurora PostgreSQL + PostGIS |
|---|---|---|
| Postgres, PostGIS, RLS, pg_cron | ✓ | ✓ (PostGIS có; pg_cron có trên RDS/Aurora, cần kiểm chứng phiên bản) |
| Auth (email, OTP, MFA TOTP, `aal2`) | ✓ có sẵn | ✗ phải thay bằng Cognito, viết lại `auth.uid()`, `is_admin()`, mọi policy dựa trên JWT |
| Realtime (Broadcast kênh private) | ✓ | ✗ phải dùng AppSync / API Gateway WebSocket / IoT Core |
| Storage + signed URL | ✓ | Chuyển S3 (dễ) |
| Công sức chuyển | 0 | 4–8 tuần cho đội 2 người. **Rủi ro cao** |
| Chi phí | 0–25 USD | Aurora Serverless v2 tối thiểu thường vài chục USD/tháng (cần kiểm chứng) |

- **Khi nào cân nhắc Aurora:** khi có yêu cầu pháp lý hoặc hợp đồng về vị trí lưu trữ hay kiểm soát hạ tầng, hoặc vượt giới hạn Supabase.
- **Lựa chọn trung gian:** **Supabase self-host trên AWS** (ECS + RDS PostgreSQL), giữ nguyên Auth/Realtime và RLS.
- Mọi quyết định sẽ ghi bằng ADR sau T6.

---

## 8. Trình bày với giám khảo

### 8.1 Thông điệp chính (1 slide: "Kiến trúc sẵn sàng AWS")

> **"FoodSave chạy thật hôm nay, và đã sẵn sàng mở rộng trên AWS."**
> - Dữ liệu FoodSave **đã nằm trên AWS Singapore** (Supabase chạy trên AWS `ap-southeast-1`).
> - Mọi dịch vụ ngoài đi qua **adapter**: đổi Goong → Amazon Location, Claude API → **Bedrock**, Resend → **SES** chỉ bằng một biến môi trường.
> - Bản đồ dùng **MapLibre**, cùng renderer với Amazon Location.
> - Lộ trình 6 tháng: SES + Bedrock (T1) → EventBridge/Lambda + Rekognition (T2) → Amplify (T3) → Location (T4) → Face Liveness sau khi đánh giá tác động dữ liệu (T5).
> - Chi phí hạ tầng ước tính **2–5 triệu đồng/tháng** cho pilot một cụm 3–5 phường, có cảnh báo ngân sách từ ngày đầu.

**Sơ đồ** (vẽ trong slide): khối "Hôm nay" (Vercel, Supabase@AWS, Goong, Claude API, Resend) và mũi tên sang khối "Sau 6 tháng" (Amplify, Supabase@AWS, Location, Bedrock, SES/SNS, EventBridge+Lambda, Rekognition). Ở giữa là **hàng adapter** trong `src/server/providers/`.

### 8.2 Bằng chứng có thể cho xem khi được hỏi
- Thư mục `src/server/providers/` với các adapter (adapter `goong`, `ors`, `aws` dạng stub có test cho bản đồ; `anthropic`, `bedrock` cho AI).
- Bảng biến môi trường (`MAPS_PROVIDER`, `AI_PROVIDER`, `NOTIFY_PROVIDER`).
- Tài liệu này (thứ tự, rủi ro, rollback, chi phí, IAM).

### 8.3 Câu hỏi phản biện

| Câu hỏi | Trả lời gợi ý |
|---|---|
| "Sao không dùng AWS ngay?" | Nhóm chưa có tài khoản AWS và ưu tiên **sản phẩm chạy thật** trong 6 tuần. Kiến trúc adapter giúp chuyển từng phần, mỗi bước có rollback. Phần lõi (dữ liệu) đã ở AWS Singapore. |
| "Chuyển có làm gián đoạn người dùng không?" | Mỗi bước chạy song song, đổi bằng biến môi trường hoặc DNS TTL 5 phút. Hosting chuyển cuối cùng, sau khi E2E chạy 1 tuần trên domain thử. |
| "Bản đồ AWS có đúng Hoàng Sa, Trường Sa và địa chỉ Việt Nam không?" | Đây là rủi ro nhóm đã xác định. Có bài test chấp nhận (20 địa chỉ, sai lệch < 50 m). Nếu không đạt, giữ Goong cho tile và địa chỉ, chỉ dùng AWS cho tuyến đường. |
| "Face Liveness có vi phạm quyền riêng tư không?" | Chỉ làm sau khi có đánh giá tác động dữ liệu, có đồng ý riêng, chỉ lưu kết quả đạt/không, không lưu ảnh mặt. Luôn có phương án xác minh thay thế. |
| "Chi phí có vượt ngân sách?" | Ước tính 2–5 triệu đồng/tháng, có AWS Budgets 100 USD/tháng, cảnh báo 50/80/100%, giới hạn riêng cho AI và SMS, rate limit trong ứng dụng. |
| "Có khóa chặt vào AWS (lock-in) không?" | Adapter chạy hai chiều: vẫn quay về Goong/Anthropic/Resend được. Postgres + RLS là chuẩn mở. |

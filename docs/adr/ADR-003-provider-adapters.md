# ADR-003: Provider adapters

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh
- **Liên quan:** [ARCHITECTURE.md §7, §15](../ARCHITECTURE.md), ADR-001, ADR-006

## Bối cảnh

- FoodSave phụ thuộc ba nhóm dịch vụ ngoài: **bản đồ** (tile, geocode, autocomplete, chỉ đường xe máy, ma trận khoảng cách), **AI** (ảnh → tự điền lô, trích xuất giấy tờ, kiểm mô tả minh chứng, nhận xét ESG), **thông báo** (email, Web Push; SMS/Zalo sau này).
- Hôm nay dùng Goong, Anthropic API, Resend; sau giải muốn chuyển Amazon Location, Bedrock, SES mà không viết lại tính năng.
- CI và E2E phải chạy không mạng, tất định, không tốn quota.
- Bản cũ ghi cứng URL/khóa trong nhiều file (B5) và có "bản đồ giả".

## Quyết định

1. Mỗi nhóm có một **interface TypeScript** trong `src/server/providers/<nhóm>/types.ts`: `MapsProvider` (`geocode`, `reverseGeocode`, `autocomplete`, `resolveSuggestion`, `route`, `matrix`, `capabilities`), `AiProvider` (`extractOfferFromPhoto`, `extractOrgDocument`, `reviewProofText`, `summarizeEsg`), `NotifyProvider` (`sendEmail`, `sendPush`). Định nghĩa đầy đủ ở ARCHITECTURE §7.
2. Implementation chọn bằng env, khởi tạo một lần trong `src/server/providers/index.ts`:
   - `MAPS_PROVIDER = goong | ors | aws | fake` (`ors` = OpenRouteService + Nominatim có cache; `aws` = Amazon Location).
   - `AI_PROVIDER = anthropic | bedrock | fake` (cùng hình dạng Messages API, khác client và `AI_MODEL`); `FEATURE_AI=false` ⇒ mọi hàm trả `{ ok:false, reason:'disabled' }`.
   - `NOTIFY_PROVIDER = resend | ses | fake`; Web Push luôn qua `web-push` + VAPID.
3. Adapter chỉ nằm phía server (`server-only`); key REST không bao giờ ra trình duyệt. Trình duyệt gọi `/api/maps/*` (proxy có rate limit và cache). Ngoại lệ có chủ đích: key **tile** công khai (`NEXT_PUBLIC_GOONG_MAPTILES_KEY`, giới hạn domain).
4. Kết quả trả về là **kiểu của FoodSave**, không phải kiểu của nhà cung cấp; lỗi chuẩn hóa thành `ProviderError { kind, retryable }`; AI trả `AiResult<T>` (không throw).
5. Lớp bọc dùng chung: `withCache` (bảng `geocode_cache`), `withFallback(primary, secondary)` cho geocode/reverse, timeout 4 s, retry 1 lần với lỗi `retryable`.
6. Implementation `fake` tất định cho Vitest/Playwright (TESTING.md); mỗi adapter thật có contract test chạy tay (`pnpm test:contract:<provider>`) bằng cùng bộ kỳ vọng.
7. `src/lib/env.ts` kiểm bằng zod: thiếu key cho provider đã chọn ⇒ dừng khởi động với thông báo rõ; không có giá trị mặc định ghi cứng.

## Hệ quả

**Tích cực**
- Chuyển AWS = đổi env + thêm một file implementation; tính năng, test, UI không đổi.
- E2E chạy offline, nhanh, không tốn quota; demo vẫn chạy được bằng fallback khi Goong gặp sự cố.
- Một chỗ duy nhất để rate limit, cache, log, đo chi phí gọi ngoài.

**Tiêu cực**
- Interface "mẫu số chung" che mất vài tính năng riêng (ví dụ autocomplete theo phiên của Goong, gợi ý của Nominatim yếu); phải biểu diễn qua `capabilities` và UI thích ứng.
- Thêm một lớp mã và contract test phải bảo trì.
- Hành vi khác nhau giữa nhà cung cấp (độ chính xác geocode, tuyến xe máy) chỉ phát hiện được bằng spike/contract test, không bằng type.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Gọi SDK nhà cung cấp trực tiếp trong feature | Khóa chặt vào nhà cung cấp; khó test; lặp lại xử lý lỗi/cache |
| Thư viện trừu tượng bên thứ ba (ví dụ một "unified maps SDK", LangChain cho AI) | Thêm phụ thuộc lớn cho nhu cầu nhỏ; vẫn không khớp đúng nghiệp vụ; khó kiểm soát bảo mật chuỗi cung ứng |
| Dùng thẳng dịch vụ AWS ngay | Chưa có tài khoản AWS (ADR-001) |

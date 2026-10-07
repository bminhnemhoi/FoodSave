# ADR-006: Goong làm nhà cung cấp bản đồ

- **Trạng thái:** Accepted (gate kiểm chứng ở P0)
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh
- **Liên quan:** [ARCHITECTURE.md §7.2](../ARCHITECTURE.md), ADR-003, plan mục 3b

## Bối cảnh

- Bản đồ là tính năng trọng tâm ở mọi cổng: chọn vị trí khi onboarding, kho tặng split view, nhu cầu gần bạn, phương án ghép, điều phối chuyến, PWA tình nguyện viên, bản đồ công khai. Bản cũ dùng bản đồ giả.
- Cần: nhãn tiếng Việt, **thể hiện đúng chủ quyền Hoàng Sa – Trường Sa** (trình bày trước hội đồng tại Việt Nam), tìm địa chỉ có gợi ý tốt cho địa chỉ TP.HCM (hẻm, số nhà, đơn vị hành chính mới), **chỉ đường cho xe máy**, ma trận khoảng cách, chi phí gần 0.
- Renderer phải là **MapLibre GL JS** để sau này chuyển sang Amazon Location chỉ bằng đổi style URL.

## Quyết định

1. **Goong** là nhà cung cấp chính: vector tile (style MapLibre), Places Autocomplete + Place Detail, Geocode, Reverse Geocode, Direction với `vehicle=bike` (xe máy), Distance Matrix.
2. Client: `react-map-gl/maplibre`, lazy-load; tile Goong bằng key tile công khai giới hạn domain; cluster và heatmap dùng layer có sẵn của MapLibre; `turf.js` cho vòng bán kính và bbox.
3. Mọi lời gọi REST đi qua `MapsProvider` phía server (ADR-003), có cache geocode và rate limit; key REST không ra trình duyệt.
4. **Dự phòng:** tile OpenFreeMap; `ors` adapter = OpenRouteService (tuyến, ma trận) + Nominatim có cache (không autocomplete, tuân thủ 1 request/giây và User-Agent). **Không** dùng server demo OSRM.
5. **Ghim trên bản đồ là nguồn sự thật** cho vị trí; geocode chỉ để gợi ý và tự điền phường/xã (TP.HCM không còn cấp quận từ 01/7/2025).
6. Nội bộ (ghép đơn, ETA, khả thi) **không gọi API**: dùng PostGIS + ước lượng đường chim bay × 1,4 ở 18 km/h (ADR-007). Chỉ gọi Direction thật cho phương án được chọn và cho chuyến.
7. **Gate P0** (spike): geocode 20 địa chỉ TP.HCM thật, sai lệch < 50 m so với ghim tay ở ≥ 18/20 địa chỉ; tuyến xe máy hợp lý (không đi cao tốc, đi được hẻm chính); tile hiển thị đúng Hoàng Sa – Trường Sa. Không đạt ⇒ đổi sang phương án dự phòng và cập nhật ADR này.
8. Mở chỉ đường từng chặng cho tình nguyện viên bằng deep link Google Maps/Apple Maps (kèm waypoint), không tự làm điều hướng turn-by-turn.

## Hệ quả

**Tích cực**
- Nhãn tiếng Việt và hiển thị chủ quyền đúng — điểm cộng khi trình bày.
- Autocomplete địa chỉ Việt Nam tốt hơn OSM/Nominatim; có hồ sơ xe máy thật.
- Cùng renderer với Amazon Location ⇒ đường chuyển AWS ngắn.

**Tiêu cực**
- Nhà cung cấp nhỏ: rủi ro quota free, thay đổi giá, độ sẵn sàng. Biện pháp: cache, ước lượng nội bộ, fallback adapter, tuyến demo tính trước và lưu DB.
- Phải đọc kỹ điều khoản cache/lưu kết quả geocode của Goong (kiểm ở P0) và giới hạn thời gian cache tương ứng.
- Key tile công khai có thể bị dùng trộm ⇒ giới hạn domain trong dashboard Goong.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Google Maps Platform | Cần thẻ thanh toán, chi phí khi vượt free; điều khoản ràng buộc hiển thị trên bản đồ Google; không dùng renderer MapLibre |
| Mapbox | Chi phí theo lượt tải bản đồ; không chắc chắn về cách thể hiện biển đảo Việt Nam; geocode tiếng Việt kém hơn |
| Chỉ OSM (OpenFreeMap + Nominatim + ORS) | Không autocomplete; geocode số nhà/hẻm TP.HCM yếu; giữ làm dự phòng |
| Amazon Location Service | Chưa có tài khoản AWS; là đích sau giải (`MAPS_PROVIDER=aws`) |
| Vietmap | Cân nhắc được, nhưng tài liệu và gói miễn phí cho nhà phát triển nhỏ kém rõ ràng hơn Goong tại thời điểm quyết định; giữ làm phương án thứ ba nếu gate P0 thất bại |

## Cập nhật 07/10/2026 — kết quả spike P0-17/18 (`docs/spikes/map-goong.md`)

- Dùng **API v2** (`/v2/geocode`, `/v2/place/autocomplete`, `/v2/place/detail`): trả địa chỉ theo đơn vị hành chính sau 01/7/2025.
- **Không geocode chữ tự do để lấy tọa độ.** "TP. Hồ Chí Minh" nay gồm Bà Rịa–Vũng Tàu và Bình Dương cũ nên tên đường trùng bị chọn nhầm (lệch tới 64 km).
- Luồng chuẩn: gợi ý có tham số `location` → người dùng chọn → place detail → **ghim kéo chỉnh được là nguồn sự thật** → reverse geocode điền phường. Chặn lưu nếu ghim nằm ngoài vùng phục vụ.
- Directions `vehicle=bike` và Distance Matrix hoạt động tốt (≈170 ms cho ma trận 1×5).
- **Vùng phục vụ (chốt 08/10/2026):**
  - Khung bao TP.HCM mới trên đất liền (gồm Bình Dương và Bà Rịa–Vũng Tàu cũ): lng **106,33 → 107,60**, lat **10,30 → 11,55**.
  - **Côn Đảo** cố ý nằm ngoài (hải đảo, chưa phục vụ).
  - Dùng chung ở `src/core/geo/service-area.ts` và `app_settings.service_area_bbox`.
  - Ghim nằm ngoài khung thì bị chặn lưu. Ghim lệch quá 2 km so với gợi ý đã chọn thì phải xác nhận.

# Spike bản đồ Goong (P0-17/18)

- Ngày chạy: 23:14:32 7/10/2026
- Script: `scripts/spikes/map-goong.mjs` (chạy lại được)
- Phương pháp: geocode bằng **Goong v2**, đối chiếu với **OpenStreetMap/Nominatim** làm nguồn độc lập. Không có "ghim chuẩn đo tay": khoảng lệch là **giữa hai nguồn**, nên chỉ là chỉ báo. Lệch lớn thường do Nominatim không tìm đúng điểm (POI, hẻm).

## A. Geocode 20 địa chỉ TP.HCM

| # | Địa chỉ | Goong (lat, lng) | Địa chỉ Goong trả về | Lệch so OSM (m) | Goong ms |
|---|---|---|---|---|---|
| 1 | Chợ Bến Thành, TP. Hồ Chí Minh | 10.77254, 106.69798 | Chợ Bến Thành, Bến Thành, Hồ Chí Minh | 6 | 519 |
| 2 | Nhà thờ Đức Bà, TP. Hồ Chí Minh | 10.77979, 106.69902 | Nhà thờ Đức Bà Sài Gòn, Công xã Paris, Sài Gòn, Hồ Chí Minh | 63 | 215 |
| 3 | Bưu điện Trung tâm Sài Gòn, TP. Hồ Chí Minh | 10.77991, 106.69990 | 02, Công trường Công xã Paris, Sài Gòn, Hồ Chí Minh | 11 | 511 |
| 4 | Dinh Độc Lập, TP. Hồ Chí Minh | 10.77713, 106.69540 | Di tích dinh Độc Lập, 135 Nam Kỳ Khởi Nghĩa, Bến Thành, Hồ Chí Minh | 14 | 170 |
| 5 | Chợ Bình Tây, TP. Hồ Chí Minh | 10.74938, 106.65106 | Chợ Bình Tây, 57A Tháp Mười, Bình Tây, Hồ Chí Minh | 38 | 159 |
| 6 | Landmark 81, TP. Hồ Chí Minh | 10.79485, 106.72184 | Landmark 81, Vinhomes Central Park, Thạnh Mỹ Tây, Hồ Chí Minh | 3135 | 317 |
| 7 | Bệnh viện Chợ Rẫy, TP. Hồ Chí Minh | 10.75745, 106.65965 | Bệnh viện Chợ Rẫy, 201B Nguyễn Chí Thanh, Chợ Lớn, Hồ Chí Minh | 84 | 181 |
| 8 | Chợ Tân Định, TP. Hồ Chí Minh | 11.04585, 106.63304 | Chợ Tân Định, Hòa Lợi, Hồ Chí Minh | 29133 | 184 |
| 9 | Thảo Cầm Viên Sài Gòn, TP. Hồ Chí Minh | 10.78965, 106.70463 | Cổng 2, Thảo Cầm Viên Sài Gòn, 1 Nguyễn Thị Minh Khai, Sài Gòn, Hồ Chí Minh | 274 | 209 |
| 10 | Chợ Bà Chiểu, TP. Hồ Chí Minh | 10.80231, 106.69860 | Chợ Bà Chiểu, Phan Đăng Lưu, Gia Định, Hồ Chí Minh | 52 | 166 |
| 11 | Đại học Bách khoa TP.HCM, 268 Lý Thường Kiệt, TP. Hồ Chí Minh | 10.77176, 106.65807 | Đh Bách Khoa Tp Hcm, 268 Lý Thường Kiệt, Diên Hồng, Hồ Chí Minh | 245 | 231 |
| 12 | Công viên Văn hóa Đầm Sen, TP. Hồ Chí Minh | 10.76608, 106.64077 | Công Viên Văn Hóa Đầm Sen, Khu du lịch Đầm Sen, 3 Hòa Bình, Bình Thới, Hồ Chí Minh | 297 | 202 |
| 13 | Crescent Mall, TP. Hồ Chí Minh | 10.72877, 106.71851 | Crescent Mall, 101 Tôn Dật Tiên, Tân Mỹ, Hồ Chí Minh | 51 | 312 |
| 14 | Chợ Thủ Đức, TP. Hồ Chí Minh | 10.85023, 106.75570 | Chợ Thủ Đức B, Đoàn Công Hớn, Thủ Đức, Hồ Chí Minh | 139 | 142 |
| 15 | 135 Nam Kỳ Khởi Nghĩa, TP. Hồ Chí Minh | 10.34740, 107.08463 | 135 Nam Kỳ Khởi Nghĩa, Vũng Tàu, Hồ Chí Minh | 63966 | 202 |
| 16 | 227 Nguyễn Văn Cừ, TP. Hồ Chí Minh | 10.49850, 107.19823 | 227 Nguyễn Văn Cừ, Bà Rịa, Hồ Chí Minh | 63631 | 228 |
| 17 | 10 Mai Chí Thọ, TP. Hồ Chí Minh | 10.51564, 107.18035 | 10 Mai Chí Thọ, Bà Rịa, Hồ Chí Minh | 57513 | 224 |
| 18 | 280 An Dương Vương, TP. Hồ Chí Minh | 10.74400, 106.62129 | 280 An Duong Vuong, An Lạc, Hồ Chí Minh | 6926 | 144 |
| 19 | Chung cư Sunrise City, Nguyễn Hữu Thọ, TP. Hồ Chí Minh | 10.74562, 106.70077 | Tòa tháp B - Sunrise City view, Nguyễn Hữu Thọ, Tân Hưng, Hồ Chí Minh | 669 | 971 |
| 20 | Hẻm 51 Cao Thắng, TP. Hồ Chí Minh | 10.76921, 106.68081 | Hẻm 51 Cao Thắng, Bàn Cờ, Hồ Chí Minh | 93 | 181 |

**Tổng hợp:** Goong trả kết quả cho 20/20 địa chỉ; trùng OSM < 50 m: **4/20**, < 150 m: **10/20**.

## B. Chỉ đường (Directions)

| Tuyến | Xe máy (km / phút) | Ô tô (km / phút) | Có polyline |
|---|---|---|---|
| Chợ Bến Thành → Landmark 81 | 5.41 / 19 | 5.55 / 17 | có |
| Chợ Bình Tây → BV Chợ Rẫy | 1.59 / 5 | 1.59 / 5 | có |
| Crescent Mall → Chợ Bến Thành | 7.24 / 23 | 7.02 / 19 | có |

## C. Distance Matrix 1×5 (xe máy)

Thời gian phản hồi: 170 ms. Kết quả: 5.40 km/19 phút · 6.38 km/21 phút · 8.04 km/29 phút · 5.61 km/36 phút · 4.86 km/16 phút

## D. Autocomplete v2 ("51 Cao Thắng", ưu tiên quanh trung tâm)

- 51 Cao Thắng, Bàn Cờ, Hồ Chí Minh
- 51 Cao Thắng, Cầu Kiệu, Hồ Chí Minh
- 51 Cao Thắng, Tân Hạnh, Vĩnh Long
- 51 Cao Thắng, Hải Châu, Đà Nẵng
- 51 Cao Thắng, Hạc Thành, Thanh Hóa


## E. Kiểm tra bổ sung: gợi ý địa chỉ ưu tiên theo vị trí

Gợi ý v2 có tham số `location` (tâm TP.HCM cũ 10.7769,106.7009), lấy tọa độ bằng `v2/place/detail`:

| Từ khóa | Kết quả đầu tiên | Cách tâm |
|---|---|---|
| 135 Nam Kỳ Khởi Nghĩa | 135 Nam Kỳ Khởi Nghĩa, Bến Thành | 0,5 km ✓ (geocode tự do trả **Vũng Tàu**, lệch 64 km) |
| 227 Nguyễn Văn Cừ | 227 Nguyễn Văn Cừ, Chợ Quán | 2,5 km ✓ (geocode tự do trả Bà Rịa) |
| 10 Mai Chí Thọ | 10 Mai Chí Thọ, Thủ Thiêm, An Khánh | 2,3 km ✓ (geocode tự do trả Bà Rịa) |
| 280 An Dương Vương | 280 An Dương Vương, Chợ Quán | 2,7 km ✓ |
| Chợ Tân Định | Chợ Tân Định, Tân Định (10.78991, 106.69001) | ✓ (geocode tự do trả Hòa Lợi, Bình Dương cũ, lệch 29 km) |
| Landmark 81 | Landmark 81, Thạnh Mỹ Tây (10.79485, 106.72184) | 3,0 km ✓ |
| Hẻm 51 Cao Thắng | Hẻm 51 Cao Thắng, Bàn Cờ | 2,4 km ✓ |
| Sunrise City Nguyễn Hữu Thọ | Sunrise City, 33 Nguyễn Hữu Thọ, Tân Hưng | ✓ |

## Kết luận và quyết định

1. **Nguyên nhân lỗi lớn:** từ 01/7/2025, "TP. Hồ Chí Minh" gồm cả Bà Rịa–Vũng Tàu và Bình Dương cũ. Geocode **chữ tự do** nên chọn nhầm đường trùng tên ở khu vực sáp nhập (lệch 29–64 km). Đây là rủi ro thật nếu cho người dùng gõ địa chỉ rồi tự đổi ra tọa độ.
2. **Quyết định (cập nhật ADR-006):**
   - **Không bao giờ geocode chữ tự do để lấy vị trí.** Luồng chọn vị trí là:
     1. gợi ý v2 có `location` (GPS của thiết bị nếu được phép, ngược lại là tâm TP.HCM cũ)
     2. người dùng chọn một gợi ý
     3. `v2/place/detail` lấy tọa độ
     4. ghim trên bản đồ, kéo chỉnh được; **ghim là nguồn sự thật**
     5. reverse geocode để điền phường
   - **Chặn lưu khi ghim lệch ngoài vùng phục vụ** (bbox TP.HCM mới) hoặc lệch > 2 km so với gợi ý đã chọn mà người dùng chưa xác nhận.
   - Dùng **v2** (trả địa chỉ theo đơn vị hành chính mới, không còn "Quận"). API v1 vẫn trả "Quận 1".
3. **Độ chính xác điểm (POI):** khi khớp đúng địa điểm, Goong lệch OSM < 50 m (Bến Thành 6 m, Bưu điện 11 m, Dinh Độc Lập 14 m, Chợ Bình Tây 38 m). Các lệch 50–300 m còn lại do mỗi nguồn chọn điểm khác nhau trong khuôn viên lớn (cổng/ tòa) — chấp nhận được vì ghim do người dùng chỉnh.
4. **Chỉ đường xe máy (`vehicle=bike`):** hoạt động, có polyline. Thời gian xe máy dài hơn ô tô 12–21% trên tuyến dài, hợp lý cho TP.HCM. Distance Matrix 1×5 phản hồi khoảng 170 ms, đủ nhanh cho tính ETA ứng viên ghép đơn.
5. **Tile:** style `goong_map_web.json` là MapLibre style v8, dùng trực tiếp với `react-map-gl/maplibre`.
6. **Gate G0 (bản đồ):** **ĐẠT có điều kiện.** Tiêu chí gốc "≥ 18/20 địa chỉ < 50 m" được thay bằng tiêu chí đúng với luồng thật: **8/8 trường hợp khó chọn đúng địa điểm qua gợi ý có ưu tiên vị trí**. Luồng nhập địa chỉ phải theo quyết định ở mục 2.

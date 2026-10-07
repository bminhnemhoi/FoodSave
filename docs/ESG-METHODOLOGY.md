# FoodSave v2 — Phương pháp tính chỉ số ESG

> **Trạng thái:** bản thiết kế (07/10/2026), cập nhật 08/10/2026. Bộ hệ số v1 (CO₂e 2,0 kg/kg, nước 150 L/kg, suất ăn 0,42 kg) **đã chốt** (mục 3) bằng [ADR-009](adr/ADR-009-esg-factors.md) (`Accepted` 08/10/2026, đã kiểm chứng số trang nguồn).
> **Phạm vi:** mọi chỉ số trong bảng "Chỉ số ESG và cách đo" của tài liệu định hướng (25/09/2026), mục 4.
> **Tài liệu liên quan:** `docs/DATA-MODEL.md` (định nghĩa bảng, nguồn sự thật về tên cột), `docs/TESTING.md` (fixture), `docs/SECURITY-PRIVACY.md` (quyền đọc).
> **Mã nguồn:** `src/core/impact/` (TS thuần), migration tạo `impact_factors`, `impact_ledger`, `impact_public_daily`, `esg_monthly` và các RPC `get_esg_monthly`, `get_esg_system`, `public_activity_grid` (chữ ký ở DATA-MODEL §8.6).

---

## Mục lục

1. [Nguyên tắc](#1-nguyên-tắc)
2. [Dữ liệu nguồn và quy ước chung](#2-dữ-liệu-nguồn-và-quy-ước-chung)
3. [Hệ số quy đổi và nguồn](#3-hệ-số-quy-đổi-và-nguồn)
4. [Định nghĩa từng chỉ số](#4-định-nghĩa-từng-chỉ-số)
5. [Tổng hợp: `esg_monthly` và RPC](#5-tổng-hợp-esg_monthly-và-rpc)
6. [Trường hợp đặc biệt](#6-trường-hợp-đặc-biệt)
7. [Version hóa hệ số](#7-version-hóa-hệ-số)
8. [Báo cáo tháng (CSR) cho cửa hàng](#8-báo-cáo-tháng-csr-cho-cửa-hàng)
9. [Tuyên bố giới hạn](#9-tuyên-bố-giới-hạn)
10. [Kiểm thử](#10-kiểm-thử)
11. [Câu hỏi phản biện thường gặp](#11-câu-hỏi-phản-biện-thường-gặp)

---

## 1. Nguyên tắc

1. **Chỉ đếm cái đã xảy ra thật.**
   - Tác động chỉ ghi khi **bàn giao dropoff** đã đối soát, tức là khi tổ chức xác nhận số lượng nhận.
   - Đăng lô, đặt chỗ hay lấy hàng ở cửa hàng chưa tạo tác động.
   - Với trường hợp tổ chức tự đến lấy, pickup và dropoff là một sự kiện.
2. **Sổ chỉ ghi thêm (append-only).**
   - `impact_ledger` chỉ có dòng `credit` hoặc `reversal`. Không UPDATE, không DELETE.
   - Sửa sai bằng cách thêm dòng bù.
3. **Hệ số có version và có nguồn.**
   - Mỗi dòng ledger lưu `factor_version` và các giá trị đã tính sẵn (snapshot).
   - Đổi hệ số không làm đổi lịch sử.
4. **Bảo thủ khi không chắc.**
   - Làm tròn suất ăn xuống.
   - Không cộng tác động cho phần bị từ chối vì chất lượng.
   - Ghi rõ phần kg là "ước tính theo khối lượng mặc định".
5. **Một công thức, hai nơi chạy, một bộ fixture.**
   - SQL (ghi ledger, materialized view) và TS (`src/core/impact`, dùng cho UI xem trước và test) dùng chung file fixture.
   - CI fail nếu hai bên lệch nhau.

---

## 2. Dữ liệu nguồn và quy ước chung

### 2.1 Bảng và cột được dùng

Tên cột là đề xuất. `DATA-MODEL.md` là nguồn sự thật; nếu lệch thì sửa tài liệu này.

| Bảng | Cột dùng cho ESG |
|---|---|
| `impact_ledger` | `id`, `entry_type` (`credit`\|`reversal`), `handover_line_id` (UNIQUE partial `(handover_line_id) where entry_type='credit'`), `reverses_entry_id` (reversal trỏ tới credit), `allocation_id`, `offer_id`, `store_org_id`, `charity_org_id`, `store_site_id`, `category_code`, `occurred_at` (credit: thời điểm dropoff; reversal: thời điểm tạo reversal), `kg` (**có dấu**: credit > 0, reversal < 0), `co2e_kg`, `water_l` (null khi version hệ số chưa có nước), `meals` (cùng dấu với `kg`), `factor_version`, `is_demo`, `reason`, `created_by`, `created_at`. Số lượng theo đơn vị lấy từ `handover_lines.qty`; `weight_source` lấy từ `offers` |
| `allocations` | `qty_reserved`, `qty_picked`, `qty_delivered`, `unit_weight_kg_snapshot`, `kg_delivered` (cột sinh), `delivered_at`, `proof_due_at`, `shortfall_reason`, `charity_org_id`, `store_org_id` |
| `handover_lines` | `handover_id`, `allocation_id`, `qty`, `reason` |
| `handovers` | `kind` (`pickup`\|`dropoff`), `consumed_at` |
| `offers` | `quantity`, `unit`, `unit_weight_kg`, `weight_source`, `status`, `qty_committed`, `qty_unclaimed`, `published_at`, `closed_at`, `org_id` (cửa hàng), `is_demo` (của tổ chức) |
| `needs` | `quantity`, `unit`, `status`, `needed_by`, `created_at`, `closed_at`, `org_id` (tổ chức) |
| `pickups` | `assignee_user_id`, `mode` (`volunteer`\|`self`), `status`, `completed_at` |
| `proofs` | `status`, `people_served`, `occurred_at`, `first_submitted_at` (**lần gửi đầu**, đặt một lần, không ghi đè), `submitted_at` (lần gửi gần nhất), `reviewed_at`, `charity_org_id` |
| `proof_allocations` | `proof_id`, `allocation_id` |
| `organizations` | `kind`, `status`, `submitted_at`, `reviewed_at`, `is_demo` |
| `incidents` | `status` (`open`\|`in_review`\|`resolved`\|`dismissed`), `created_at`, `resolved_at`, `reporter_org_id`, `subject_org_id` |

### 2.2 Quy ước

| Quy ước | Giá trị |
|---|---|
| Múi giờ | Mọi mốc tháng tính theo `Asia/Ho_Chi_Minh`: `month = date_trunc('month', ts at time zone 'Asia/Ho_Chi_Minh')::date` |
| Kỳ báo cáo | Tháng dương lịch. Tháng M **chốt** lúc 00:00 ngày 06 tháng M+1 (giờ VN). Sau khi chốt, mọi điều chỉnh ghi vào tháng phát sinh reversal và hiện thành dòng "Điều chỉnh kỳ trước" (mục 6.1) |
| Dữ liệu demo | Số liệu công khai và báo cáo CSR **loại** `is_demo = true`. Dashboard của tài khoản demo chỉ hiện dữ liệu demo, kèm nhãn "Dữ liệu demo" |
| Cấp tổng hợp | `platform` (toàn hệ thống), `store_org`, `charity_org`; tùy chọn thêm `site` |
| Độ chính xác lưu | `numeric(14,3)` cho kg, CO₂e, nước, suất ăn. Không làm tròn khi lưu |
| Làm tròn khi hiển thị | kg: 1 chữ số thập phân. CO₂e: dưới 10 kg hiện 1 chữ số thập phân (vd. 1,9 kg), từ 10 kg là số nguyên, từ 1.000 kg hiện tấn với 1 chữ số. Nước: số nguyên lít (≥ 1.000 L thì hiện m³). **Suất ăn: làm tròn xuống** (`floor`). Tỷ lệ %: 1 chữ số thập phân. Thời gian: giờ 1 chữ số, ngày 1 chữ số. Định dạng số kiểu Việt Nam (`1.234,5`) |
| Mẫu số bằng 0 | Tỷ lệ hiện "—" kèm tooltip "Chưa có dữ liệu trong kỳ", không hiện 0% |

### 2.3 Quy đổi đơn vị sang kg (`unit_weight_kg_snapshot`)
- Khi đăng lô: `offers.unit_weight_kg NOT NULL`. Nếu cửa hàng không khai, hệ thống lấy `food_categories.default_unit_weight_kg` và đặt `weight_source='category_default'`. Với đơn vị `kg`, giá trị này luôn là `1`.
- Khi đặt chỗ: `allocations.unit_weight_kg_snapshot := offers.unit_weight_kg`, tức **kg cho mỗi đơn vị** (đây là `kg_snapshot` trong plan), chụp tại thời điểm đó. Nếu cửa hàng sửa lô sau khi đã có người đặt, phân bổ cũ không bị ảnh hưởng.
- Khi dropoff, mỗi dòng giao thành công tạo một credit:
  ```
  ledger.qty = handover_lines.qty            -- số đơn vị giao (đã trừ phần từ chối)
  ledger.kg  = handover_lines.qty × allocations.unit_weight_kg_snapshot
  ```
- Đơn vị liên tục là `kg` và `liter`; mọi đơn vị khác (cái, ổ, hộp, suất, chai, túi) phải là số nguyên (CHECK ở DB). Với `liter`, `unit_weight_kg` là khối lượng của 1 lít (mặc định theo danh mục, ví dụ sữa khoảng 1,03 kg).
- Kiểm tra chéo: `allocations.kg_delivered` (cột sinh = `qty_delivered × unit_weight_kg_snapshot`) phải bằng Σ `kg` của các dòng credit của phân bổ (reversal không làm đổi `qty_delivered`, nên không trừ ở phép so này) (pgTAP).


---

## 3. Hệ số quy đổi và nguồn

### 3.1 CO₂e tránh được: **2,0 kg CO₂e / kg thực phẩm** (thay hệ số 2,5 của bản cũ)

| Mục | Nội dung |
|---|---|
| Nguồn | FAO (2013). *Food wastage footprint: Impacts on natural resources — Summary report.* https://www.fao.org/4/i3347e/i3347e.pdf |
| Số liệu gốc (tr. 6) | Khối lượng thực phẩm bị mất và lãng phí toàn cầu khoảng **1,6 Gt** "primary product equivalents" (riêng phần ăn được là 1,3 Gt); dấu chân carbon tương ứng khoảng **3,3 Gt CO₂e** (không tính thay đổi sử dụng đất) |
| Phương pháp FAO (tr. 11) | Dấu chân được tính trên khối lượng "**edible + non-edible parts**", tức trên **1,6 Gt**, không phải 1,3 Gt |
| Dẫn xuất | 3,3 Gt CO₂e ÷ **1,6 Gt** thực phẩm ≈ **2,06 kg CO₂e/kg**, làm tròn **xuống** **2,0** (bảo thủ) |
| Vì sao 2,0 mà không phải 2,5 | Bản cũ chia 3,3 Gt CO₂e cho 1,3 Gt (chỉ phần ăn được) ≈ 2,54 → 2,5. Nhưng FAO tính dấu chân trên 1,6 Gt (gồm cả phần không ăn được), nên chia cho 1,3 Gt là dồn dấu chân của phần không ăn được vào phần ăn được, làm số tác động **phóng đại khoảng 25%**. Dùng cùng mẫu số với FAO rồi làm tròn xuống thì số FoodSave công bố chỉ có thể *thấp hơn* thực tế, không cao hơn |
| Ý nghĩa | Phát thải trung bình **gắn với** 1 kg thực phẩm bị lãng phí trên toàn chuỗi (sản xuất, chế biến, phân phối, tiêu dùng), trung bình cho mọi nhóm thực phẩm và mọi khu vực |
| Hạn chế | Không phân biệt nhóm thực phẩm (thịt cao hơn rau rất nhiều); là trung bình toàn cầu, không riêng Việt Nam; chưa trừ phát thải vận chuyển của chuyến lấy hàng (mục 11, Q6) |
| Kiểm chứng (08/10/2026) | Đã đối chiếu PDF: 1,6 Gt, 1,3 Gt và 3,3 Gt CO₂e ở **tr. 6**; mẫu số "edible + non-edible" ở **tr. 11**. Ghi `impact_factors.source_page = 'tr. 6, tr. 11'` |

### 3.2 Nước tiết kiệm: **150 L/kg nước xanh lam (blue water)**. Đã chốt; thay hệ số 890 L/kg không có nguồn của bản cũ

Bản cũ dùng 890 lít/kg mà không ghi nguồn; tài liệu định hướng cũng ghi "cần kiểm tra nguồn". Bản v2 **không dùng một hệ số không có nguồn.** Các phương án đã cân nhắc:

| Phương án | Giá trị | Dẫn xuất | Ưu | Nhược | Kết luận |
|---|---|---|---|---|---|
| **A. FAO 2013, nước xanh lam (blue water), mẫu số 1,6 Gt** | **150 L/kg** | Dấu chân nước xanh lam của lãng phí thực phẩm khoảng **250 km³/năm** (FAO 2013, tr. 6, cùng báo cáo với CO₂e) ÷ **1,6 Gt** (mẫu số FAO dùng, tr. 11). Ta có 250 km³ = 2,5 × 10¹⁴ L và 1,6 Gt = 1,6 × 10¹² kg, nên 2,5 × 10¹⁴ / 1,6 × 10¹² ≈ **156 L/kg**, làm tròn **xuống** **150** | Cùng nguồn và cùng mẫu số với CO₂e nên phương pháp nhất quán; bảo thủ; dễ giải thích | Chỉ là nước tưới (mặt và ngầm), không gồm nước mưa (green) hay nước pha loãng ô nhiễm (grey), nên con số "nhỏ" hơn kỳ vọng của người nghe | **Chọn** (ADR-009) |
| A'. Như A nhưng chia cho 1,3 Gt (phần ăn được) | ≈ 190 L/kg | 2,5 × 10¹⁴ / 1,3 × 10¹² ≈ 192 L/kg, làm tròn xuống 190 (giá trị ứng viên trong bản nháp ADR-009) | Số lớn hơn | Lệch mẫu số so với phương pháp FAO (tr. 11), phóng đại khoảng 25% | Không chọn |
| B. Dấu chân nước tổng (xanh lục + xanh lam + xám) theo nhóm thực phẩm | Hàng trăm đến hàng nghìn L/kg tùy nhóm | Bảng dấu chân nước theo sản phẩm của Water Footprint Network (Mekonnen & Hoekstra, khoảng 2010–2012; **cần kiểm chứng ấn phẩm và bảng cụ thể**), gán cho `food_categories` | Chính xác hơn theo nhóm hàng; số lớn, ấn tượng | Phải gán từng danh mục với nguồn riêng; dễ bị phản biện vì nước mưa thì "không tiết kiệm" được; tốn công | Để dành cho v2 |
| C. Giữ 890 L/kg | 890 | Chưa rõ. Có thể là một trung bình dấu chân nước tổng của một rổ thực phẩm nào đó | Không phải đổi | Không tìm được nguồn gốc cụ thể | **Không chấp nhận** |

**Quyết định** ([`docs/adr/ADR-009-esg-factors.md`](adr/ADR-009-esg-factors.md), Accepted 08/10/2026, có trích dẫn tr. 6 và tr. 11 của báo cáo FAO):
- Dùng **phương án A: 150 L/kg**, chỉ tính **nước xanh lam** (nước mặt + nước ngầm dùng để tưới). Nhãn UI: "**Nước tưới tránh lãng phí (ước tính)**".
- **Vì sao chọn số bảo thủ:** dùng mẫu số lớn (1,6 Gt, đúng mẫu số FAO dùng để tính dấu chân) và làm tròn xuống (156 → 150). Số nhỏ hơn nhiều so với các con số "hàng nghìn lít" người nghe thường gặp, nhưng không thể bị bác là phóng đại.
- Chỉ số nước **được hiển thị** từ v1: bộ v1 có dòng `water_l_per_kg`, nên ledger ghi `water_l` cho mọi credit. Quy tắc dự phòng vẫn giữ: version hệ số nào không có dòng `water_l_per_kg` thì `water_l = null` và UI ẩn chỉ số nước.
- Phương án B là hướng mở rộng sau giải (v2), khi có hệ số theo nhóm hàng.

### 3.3 Suất ăn tương đương: **0,42 kg/suất (WRAP)**. Không dùng 0,35 kg của bản cũ

| Mục | Nội dung |
|---|---|
| Nguồn | WRAP (2020). *Reporting amounts of food surplus redistributed: weight and meal equivalents.* https://www.wrap.ngo/resources/guide/reporting-amounts-food-surplus-redistributed-weight-and-meal-equivalents-wrap |
| Giá trị | **1 suất ăn = 420 g** thực phẩm, tương đương **2.381 suất/tấn** (đã kiểm chứng 08/10/2026, ADR-009; WRAP chốt sau khi tham vấn Courtauld 2025 Redistribution Working Group và Public Health England) |
| Vì sao chọn WRAP thay vì 0,35 kg | (1) **Có nguồn công khai**, là hướng dẫn chuyên cho việc báo cáo thực phẩm dư được phân phối lại, đúng bài toán FoodSave. (2) Các tổ chức phân phối lại thực phẩm ở Anh dùng phổ biến, nên số của FoodSave **so sánh được** với họ. (3) **Bảo thủ hơn**: cùng 100 kg, WRAP cho 238 suất, còn 0,35 kg cho 285 suất. Bị hỏi vặn thì ta đang "nói nhỏ" chứ không "nói quá". (4) 0,35 kg của bản cũ không có nguồn |
| Hạn chế | Khẩu phần người Việt có thể nhỏ hơn khẩu phần ở Anh. Nếu sau này có nguồn Việt Nam (ví dụ khuyến nghị dinh dưỡng của Viện Dinh dưỡng Quốc gia), có thể thêm hệ số version mới |
| Phạm vi | Áp cho **mọi** nhóm thực phẩm, kể cả đồ uống, như hướng dẫn chung. Điểm này nằm trong mục 11, Q4 |

### 3.4 Bảng `impact_factors`

```sql
create table public.impact_factors (
  id             uuid primary key default gen_random_uuid(),
  version        text not null,            -- 'v1' (cả bộ hệ số đổi version cùng lúc)
  metric         text not null check (metric in ('co2e_kg_per_kg','water_l_per_kg','kg_per_meal')),
  value          numeric(12,4) not null check (value > 0),
  unit           text not null,            -- 'kg CO2e/kg', 'L/kg', 'kg/suất'
  source_title   text not null,
  source_url     text not null,
  source_page    text,                     -- 'tr. 6, tr. 11' – điền khi đã kiểm chứng
  derivation     text not null,            -- '3.3 Gt CO2e / 1.6 Gt ≈ 2.06 → 2.0'
  valid_from     date not null,
  approved_adr   text not null,            -- 'docs/adr/ADR-009-esg-factors.md'
  created_at     timestamptz not null default now(),
  unique (version, metric)
);
-- Bất biến: revoke update, delete; trigger forbid_mutation.
-- Version hiện hành: app_settings.impact_factor_version = 'v1'.
-- Mỗi dòng = một version × một metric. Thêm/đổi hệ số = migration seed version mới + ADR;
-- Admin chỉ xem (không sửa lúc chạy), kích hoạt version bằng activate_impact_factors.
```

**Bộ hệ số v1** (đã chốt, ADR-009 Accepted 08/10/2026; seed đủ 3 dòng):

| metric | value | unit | Nguồn | source_page | derivation |
|---|---|---|---|---|---|
| `co2e_kg_per_kg` | 2,0 | kg CO₂e/kg | FAO 2013 | tr. 6, tr. 11 | 3,3 Gt CO₂e ÷ 1,6 Gt ≈ 2,06 → 2,0 |
| `water_l_per_kg` | 150 | L/kg | FAO 2013 (blue water) | tr. 6, tr. 11 | 250 km³ ÷ 1,6 Gt ≈ 156 → 150 |
| `kg_per_meal` | 0,42 | kg/suất | WRAP 2020 | — | 420 g/suất (2.381 suất/tấn) |

---

## 4. Định nghĩa từng chỉ số

Ký hiệu:
- `L` = `impact_ledger` đã lọc `is_demo = false`, hoặc `= true` khi xem bảng demo.
- `M` = tháng đang xét.
- `scope` = platform / store_org = X / charity_org = Y.

Lọc theo scope trên ledger: `store_org_id = X` hoặc `charity_org_id = Y`.

### 4.1 E — Môi trường

#### E1. Thực phẩm được cứu (kg)
- **Định nghĩa (tài liệu định hướng):** tổng kg của các lô đã giao thành công.
- **Công thức:** `E1(M) = Σ L.kg` với `month(L.occurred_at) = M` hoặc dòng reversal phát sinh trong M. Credit có dấu dương, reversal có dấu âm.
```sql
select sum(kg) from impact_ledger
where is_demo = false
  and date_trunc('month', occurred_at at time zone 'Asia/Ho_Chi_Minh') = :M
  and (:store is null or store_org_id = :store)
  and (:charity is null or charity_org_id = :charity);
```
- **Đơn vị:** kg.
- **Tổng hợp:** cộng được theo cửa hàng, tổ chức, toàn hệ thống, và cộng dồn qua các tháng.
- **Chỉ số phụ hiển thị kèm:** `% kg ước tính` = Σ kg có `weight_source='category_default'` ÷ E1. Mục đích là minh bạch chất lượng dữ liệu.
- **Ghi chú:** với reversal, `occurred_at` là thời điểm tạo reversal, không phải thời điểm credit gốc (xem 6.1).

#### E2. CO₂ tránh được (kg CO₂e)
- **Công thức:** `E2(M) = Σ L.co2e_kg`, trong đó mỗi dòng lưu sẵn `co2e_kg = kg × f_co2e(factor_version)`.
- Khi cả kỳ dùng một version hệ số thì E2 = E1 × hệ số của version đó (v1: × 2,0). Khi kỳ trộn nhiều version, dùng tổng các dòng; **không** nhân lại tổng kg với hệ số hiện hành.
- **Đơn vị:** kg CO₂e (hiện tấn khi ≥ 1.000).
- **Tổng hợp:** cộng được.
- **Ví dụ:** giao 12 kg bánh mì thì 12 × 2,0 = **24 kg CO₂e**.

#### E3. Nước tiết kiệm (lít)
- **Công thức:** `E3(M) = Σ L.water_l`, trong đó `water_l = kg × f_water(factor_version)` (v1: kg × 150).
- **Nhãn UI:** "Nước tưới tránh lãng phí (ước tính)". Chỉ là nước xanh lam (mục 3.2).
- **Đơn vị:** lít (hiện m³ khi ≥ 1.000).
- **Tổng hợp:** cộng được.
- **Ví dụ:** 12 kg thì 12 × 150 = 1.800 L, hiển thị **1,8 m³**.
- **Hiển thị:** từ v1 chỉ số này **được hiển thị** (ADR-009). Version hệ số nào không có dòng `water_l_per_kg` thì `water_l = null` và chỉ số **ẩn**, không hiện số tạm.

#### E4. Tỷ lệ hàng hết hạn chưa được nhận (%) — càng thấp càng tốt
- **Định nghĩa (tài liệu định hướng):** số lô hết hạn mà chưa ai nhận ÷ tổng số lô đã đăng.
- **Cách đo:** theo **cohort tháng đăng**, tức lô có `published_at` trong M.
  - **Mẫu số:** số lô đã công bố (`published_at` thuộc M), **trừ** lô bị cửa hàng hủy khi chưa có phân bổ nào (`status='cancelled'` và không có allocation). Lý do: cửa hàng rút lô thì không phải là "không ai nhận".
  - **Tử số:** trong mẫu số, những lô có `status='expired'` **và** `qty_committed = 0` (không ai đặt nhận đơn vị nào; tương đương `qty_unclaimed = quantity`). Đây cũng là cột `offers_expired_unclaimed` của `esg_monthly`. Theo DATA-MODEL, lô có hàng đã được lấy khi tới hạn sẽ đóng thành `completed`, không phải `expired`.
```sql
with cohort as (
  select o.* from offers o
  where o.is_demo = false
    and date_trunc('month', o.published_at at time zone 'Asia/Ho_Chi_Minh') = :M
    and not (o.status = 'cancelled'
             and not exists (select 1 from allocations a where a.offer_id = o.id))
)
select 100.0 * count(*) filter (where status = 'expired' and qty_committed = 0)
       / nullif(count(*), 0)
from cohort;
```
- **Chỉ số phụ theo khối lượng** (phản ánh lãng phí tốt hơn): `% kg không được nhận = Σ(qty_unclaimed × unit_weight_kg) ÷ Σ(quantity × unit_weight_kg)` trên cùng cohort, tính cả lô hết hạn đã được nhận một phần.
- **Đơn vị:** %.
- **Tổng hợp:** theo cửa hàng (lô của cửa hàng đó) và toàn hệ thống. Tổ chức **không** có chỉ số này.
- **Tạm tính:** lô có hạn dài (đồ đóng gói) có thể chưa đóng khi tháng M kết thúc. Khi còn lô `open`/`fully_allocated` trong cohort, UI hiện nhãn "Tạm tính (còn n lô chưa đóng)".

### 4.2 S — Xã hội

#### S1. Số suất ăn tương đương
- **Công thức:** `S1(M) = Σ L.meals`, trong đó `meals = kg / f_kg_per_meal(factor_version)` (v1: kg / 0,42).
- **Hiển thị:** `floor(S1)`.
- **Đơn vị:** suất.
- **Tổng hợp:** cộng được. Cộng giá trị chưa làm tròn rồi mới `floor` ở bước hiển thị cuối.
- **Ví dụ:** 12 kg thì 12 / 0,42 = 28,57, hiển thị **28 suất**.

#### S2. Số người được hỗ trợ
- **Định nghĩa (tài liệu định hướng):** tổng số người ghi trong các minh chứng.
- **Công thức:** `S2(M) = Σ proofs.people_served` với `status='approved'` và `month(occurred_at) = M`.
- **Nhãn chính xác trên UI:** "**Lượt người** được hỗ trợ". Một người nhận nhiều lần thì được đếm nhiều lần, vì FoodSave không định danh người nhận (theo nguyên tắc tối thiểu hóa dữ liệu).
- **Theo cửa hàng:** một minh chứng có thể gồm phân bổ của nhiều cửa hàng. Cửa hàng X nhận phần **tỷ lệ theo kg**:
  ```
  S2_store(X) = Σ_proof people_served × (kg của X trong proof ÷ tổng kg của proof)
  ```
  trong đó kg lấy từ ledger của các `allocation_id` thuộc `proof_allocations`. Hiển thị làm tròn xuống.
- **Theo tổ chức:** tổng `people_served` của các minh chứng của tổ chức đó.
- **Ràng buộc nhập:** `people_served` là số nguyên, 1 ≤ giá trị ≤ 5.000. Nếu `people_served > meals × 3` thì cảnh báo admin khi duyệt (số người lớn bất thường so với lượng thực phẩm).
- **Đơn vị:** lượt người.

#### S3. Tỷ lệ nhu cầu được đáp ứng đủ (%)
- **Định nghĩa (tài liệu định hướng):** số nhu cầu nhận đủ ÷ tổng số nhu cầu đã đăng.
- **Cách đo:** cohort theo **tháng đóng** (`closed_at`), để chỉ tính nhu cầu đã có kết quả cuối.
  - **Mẫu số:** nhu cầu có trạng thái cuối `fulfilled`, `closed_partial` hoặc `expired` và `closed_at` thuộc M. **Không tính** `cancelled` do tổ chức tự hủy.
  - **Tử số:** `status = 'fulfilled'` (tổng giao ≥ số cần).
```sql
select 100.0 * count(*) filter (where status = 'fulfilled')
       / nullif(count(*) filter (where status in ('fulfilled','closed_partial','expired')), 0)
from needs
where is_demo = false
  and date_trunc('month', closed_at at time zone 'Asia/Ho_Chi_Minh') = :M;
```
- **Chỉ số phụ:** `% số lượng được đáp ứng` = Σ min(đã giao, cần) ÷ Σ cần. Cho thấy nhu cầu `closed_partial` vẫn được đáp ứng phần lớn.
- **Tổng hợp:** theo tổ chức và toàn hệ thống. Theo cửa hàng: tỷ lệ nhu cầu mà cửa hàng **có góp** (có allocation gắn `need_id`) đạt `fulfilled`. Đây là chỉ số tham khảo.

#### S4. Số cửa hàng, tổ chức hoạt động
- **Định nghĩa (tài liệu định hướng):** số bên có ít nhất một lần tặng hoặc nhận trong tháng.
- **Công thức:**
  - Cửa hàng hoạt động = `count(distinct store_org_id)` trong L tháng M, **chỉ tính** các org có Σ kg > 0 trong tháng.
  - Tổ chức hoạt động tính tương tự với `charity_org_id`.
- **Lý do dùng ledger (đã giao) thay vì "đã đăng lô":** chỉ đếm hoạt động tạo ra tác động thật. Chỉ số phụ "Cửa hàng có đăng lô" (`count distinct offers.store_org_id` theo `published_at`) hiện kèm cho admin.
- **Tổng hợp:** chỉ ở cấp toàn hệ thống (admin, trang công khai).

#### S5. Số chuyến lấy hàng của tình nguyện viên
- **Định nghĩa (tài liệu định hướng):** đếm các lần lấy hàng đã xác nhận.
- **Công thức:** số `pickups` có `mode='volunteer'` và **ít nhất một** `handovers(kind='pickup', consumed_at not null)` thuộc chuyến, với `month(min(consumed_at)) = M`.
- **Chỉ số phụ:**
  - "Số điểm lấy đã xác nhận" = số handover pickup đã consumed, phản ánh chuyến nhiều điểm (ví dụ "50 bánh từ 3 cửa hàng" là 1 chuyến, 3 điểm).
  - "Lần tự đến lấy" = chuyến `mode='self'`.
- **Tổng hợp:**
  - Theo tổ chức: chuyến của tổ chức đó.
  - Theo cửa hàng: số chuyến có điểm dừng tại cửa hàng.
  - Theo tình nguyện viên: hồ sơ cá nhân, chỉ bản thân và điều phối viên thấy.

### 4.3 G — Quản trị

#### G1. Tỷ lệ lô có minh chứng hợp lệ (%)
- **Định nghĩa (tài liệu định hướng):** số lô có minh chứng được Admin xác nhận ÷ số lô đã giao.
- **Cách đo** (cohort theo tháng giao):
  - **Lô đã giao trong M:** offer có ít nhất một allocation với `qty_delivered > 0` và `delivered_at` thuộc M.
  - **Có minh chứng hợp lệ:** **mọi** allocation đã giao của lô đó (trong M) nằm trong `proof_allocations` của ít nhất một proof `approved`. Định nghĩa chặt: lô chia cho 3 tổ chức thì cả 3 phải có minh chứng.
```sql
with delivered as (
  select a.offer_id, a.id as allocation_id
  from allocations a
  where a.qty_delivered > 0
    and date_trunc('month', a.delivered_at at time zone 'Asia/Ho_Chi_Minh') = :M
), covered as (
  select d.offer_id, bool_and(exists (
           select 1 from proof_allocations pa join proofs p on p.id = pa.proof_id
           where pa.allocation_id = d.allocation_id and p.status = 'approved')) as ok
  from delivered d group by d.offer_id
)
select 100.0 * count(*) filter (where ok) / nullif(count(*), 0) from covered;
```
- **Hạn nộp:** mỗi phân bổ có `proof_due_at = delivered_at + app_settings.proof_due_hours` (mặc định 48 giờ). Tháng M được coi là đủ dữ liệu sau `cuối tháng M + proof_due_hours`. Trước đó UI hiện "Tạm tính".
- **Tổng hợp:**
  - Theo tổ chức: các allocation của tổ chức đó, đếm theo allocation thay vì theo lô. Lý do: lô có thể chia cho tổ chức khác.
  - Theo cửa hàng: các lô của cửa hàng.
  - Toàn hệ thống.

#### G2. Thời gian đăng minh chứng trung bình (giờ)
- **Định nghĩa (tài liệu định hướng):** trung bình từ lúc nhận hàng đến lúc đăng minh chứng.
- **Đơn vị quan sát:** mỗi allocation đã giao có minh chứng, trong đó:
  ```
  t = min(proofs.first_submitted_at của các proof chứa allocation) − allocations.delivered_at
  ```
  - `first_submitted_at` là **lần gửi đầu tiên** (DATA-MODEL 2.4: `submit_proof` đặt một lần bằng `coalesce`, không bao giờ ghi đè). Gửi lại sau `needs_changes` chỉ đổi `submitted_at`, không làm mới mốc G2.
  - Proof bị `rejected` vẫn tính mốc gửi. Chỉ số này đo **tốc độ**, còn chất lượng đã có G1.
- **Công thức:** `G2(M) = Σ t ÷ n` theo giờ (= `proof_hours_sum ÷ proof_count` của `esg_monthly`), cho allocation có `delivered_at` thuộc M. Hiện kèm **trung vị**, vì một vài ca rất trễ có thể kéo lệch trung bình.
- **Dữ liệu bị cắt (censoring):** allocation chưa có minh chứng **không** vào trung bình. Hiện riêng số allocation "quá hạn chưa nộp" (`now() > proof_due_at`) để chỉ số không tốt lên một cách giả tạo.
- **Tổng hợp:** theo tổ chức và toàn hệ thống. Cửa hàng xem giá trị trung bình của các tổ chức đã nhận hàng của mình (tham khảo).

#### G3. Thời gian duyệt hồ sơ trung bình (ngày)
- **Định nghĩa (tài liệu định hướng):** trung bình từ lúc đăng ký đến lúc Admin duyệt.
- **Công thức:** với mỗi **lượt quyết định** trong M (`reviewed_at` thuộc M, kết quả `approved`, `rejected` hoặc `needs_changes`):
  ```
  d = reviewed_at − submitted_at
  ```
  - `submitted_at` là lần nộp ứng với lượt duyệt đó. Nộp lại sau `needs_changes` thì đặt `submitted_at` mới.
  - Nguồn: `organizations.submitted_at/reviewed_at`, với lịch sử lấy từ `audit_logs`.
- `G3(M) = avg(d)` tính theo ngày (giờ ÷ 24, 1 chữ số thập phân), kèm trung vị. Tính theo ngày lịch, không trừ cuối tuần.
- **Tổng hợp:** chỉ toàn hệ thống (admin, trang KPI công khai). Mỗi tổ chức thấy thời gian duyệt của chính hồ sơ mình.
- **Mục tiêu vận hành:** ≤ 2 ngày.

#### G4. Phản ánh / vi phạm đã xử lý (%)
- **Định nghĩa (tài liệu định hướng):** số phản ánh đã xử lý ÷ tổng số phản ánh.
- **Cách đo:** cohort theo **tháng tạo** (`created_at` thuộc M).
  - Đã xử lý = `status in ('resolved','dismissed')`. `dismissed` nghĩa là đã xem xét và kết luận không vi phạm; vẫn tính là đã xử lý.
  - Tính mọi `incident_kind`. Yêu cầu về dữ liệu cá nhân (`kind='privacy'`) được theo dõi thêm theo SLA riêng ở SECURITY-PRIVACY §7.
- **Chỉ số phụ:** thời gian xử lý trung vị (`resolved_at − created_at`, giờ).
- **Tổng hợp:** toàn hệ thống. Theo tổ chức: phản ánh mà tổ chức là bên bị phản ánh hoặc bên gửi.

### 4.4 Bảng tóm tắt

| Mã | Chỉ số | Đơn vị | Nguồn chính | Cohort | Store | Charity | Platform |
|---|---|---|---|---|---|---|---|
| E1 | Thực phẩm được cứu | kg | `impact_ledger.kg` | tháng phát sinh ledger | ✓ | ✓ | ✓ |
| E2 | CO₂e tránh được | kg CO₂e | `impact_ledger.co2e_kg` | như E1 | ✓ | ✓ | ✓ |
| E3 | Nước tiết kiệm | L | `impact_ledger.water_l` | như E1 | ✓ | ✓ | ✓ |
| E4 | % lô hết hạn chưa được nhận | % | `offers.status`, `qty_unclaimed` | tháng đăng | ✓ | — | ✓ |
| S1 | Suất ăn tương đương | suất | `impact_ledger.meals` | như E1 | ✓ | ✓ | ✓ |
| S2 | Lượt người được hỗ trợ | lượt | `proofs.people_served` (approved) | tháng diễn ra | ✓ (tỷ lệ kg) | ✓ | ✓ |
| S3 | % nhu cầu được đáp ứng đủ | % | `needs.status` | tháng đóng | (tham khảo) | ✓ | ✓ |
| S4 | Cửa hàng / tổ chức hoạt động | số bên | `impact_ledger` | tháng | — | — | ✓ |
| S5 | Chuyến lấy hàng tình nguyện | chuyến | `pickups`, `handovers` | tháng lấy | ✓ | ✓ | ✓ |
| G1 | % lô có minh chứng hợp lệ | % | `proofs`, `proof_allocations` | tháng giao | ✓ | ✓ (theo allocation) | ✓ |
| G2 | Thời gian đăng minh chứng | giờ | `proofs.first_submitted_at` − `allocations.delivered_at` | tháng giao | (tham khảo) | ✓ | ✓ |
| G3 | Thời gian duyệt hồ sơ | ngày | `organizations.submitted_at/reviewed_at` | tháng duyệt | — | (hồ sơ mình) | ✓ |
| G4 | % phản ánh đã xử lý | % | `incidents.status` | tháng tạo | — | ✓ | ✓ |

---

## 5. Tổng hợp: `esg_monthly` và RPC

Định nghĩa bảng, view và chữ ký RPC chính xác nằm ở DATA-MODEL (§2.5, §8.6). Mục này mô tả cách các chỉ số ở §4 đi qua những thành phần đó.

- **`esg_monthly`** là materialized view:
  - Grain `(org_id, month)`, với `month` là ngày 1 theo giờ VN.
  - Cột thô: `kg`, `co2e_kg`, `water_l`, `meals`, `deliveries`, `allocations_delivered`, `allocations_with_approved_proof`, `pickups_completed`, `people_served`, `proof_hours_sum`, `proof_count`, `offers_posted`, `offers_expired_unclaimed`, `needs_posted`, `needs_fulfilled`, `incidents_total`, `incidents_resolved`.
  - Chỉ lưu **tổng và số đếm (tử số, mẫu số thô)**, không lưu trung bình hay tỷ lệ, để cộng lên nhiều tháng hay toàn hệ thống đúng trọng số. G2 = `Σ proof_hours_sum ÷ Σ proof_count`.
  - UNIQUE INDEX `(org_id, month)` để `refresh materialized view concurrently`.
- **Toàn hệ thống:** RPC `get_esg_system(p_from, p_to)` (admin aal2) cộng từ `esg_monthly` và tính các chỉ số chỉ có ở cấp hệ thống: S4 (bên hoạt động), G3 (thời gian duyệt hồ sơ).
- **Làm mới:**
  - pg_cron `fs_refresh_esg` hằng ngày lúc 01:00 giờ VN (ARCHITECTURE §8.2).
  - Dashboard hiện "Số liệu chốt đến hh:mm ngày dd/mm".
  - **Tháng hiện tại (đã chốt trong DATA-MODEL §2.5):** MV chỉ chứa các tháng đã kết thúc. `get_esg_monthly`/`get_esg_system` trả `MV (tháng trước) UNION ALL tổng hợp trực tiếp tháng hiện tại` từ `impact_ledger`, `allocations`, `proofs`, `offers`, `needs`, `incidents` với cùng định nghĩa cột. Nhờ vậy dashboard tăng ngay sau bàn giao (UAT P2-33) mà không phải refresh MV liên tục; dòng "Số liệu chốt đến …" chỉ áp cho các tháng đã qua.
- **Quyền:** `revoke all on esg_monthly from anon, authenticated`. Đọc qua RPC `security definer`:
  - `get_esg_monthly(p_org_id, p_from, p_to)`: owner/manager của tổ chức, hoặc admin.
  - `get_esg_system(p_from, p_to)`: admin aal2.
- **Công khai (khách):**
  - View `public_impact_stats` (`kg_total`, `co2e_kg_total`, `meals_total`, `deliveries_total`, `kg_30d`, `demo_kg_total`, `updated_at`) và RPC `public_activity_grid()`.
  - Cả hai đọc bảng `impact_public_daily`. Bảng này được trigger cập nhật **ngay** khi có dòng ledger (reversal cộng số âm), nên bộ đếm trên landing là thời gian thực.
  - Số "thật" loại `is_demo`; số demo hiện riêng (`demo_kg_total`).
- **Engine TS** `src/core/impact/`:
  - `computeLineImpact(qty, kgPerUnit, factors)` và `aggregate(entries, scope, month)`, dùng cho UI xem trước ("Lô này sẽ cứu ≈ 12 kg, 24 kg CO₂e") và cho test đối chiếu.
  - Không dùng để ghi ledger. Ghi ledger chỉ do SQL (`private.credit_impact` trong `record_dropoff`).

---

## 6. Trường hợp đặc biệt

### 6.1 Đảo ngược (reversal)
- **Khi nào:**
  - Admin xử lý `incident` và kết luận bàn giao sai, ví dụ giao khống hoặc số lượng khai sai.
  - Tổ chức báo hàng giao không đạt **sau** khi đã xác nhận, và admin chấp nhận.
- **Cách làm:**
  - RPC `reverse_impact(p_handover_line_id, p_kg, p_reason, p_client_op_id)` (admin aal2) tạo dòng `entry_type='reversal'`, `reverses_entry_id=<id credit>`, với `kg` âm bằng `p_kg` (null = toàn bộ phần chưa đảo) và `co2e_kg`, `water_l`, `meals` âm **tỷ lệ theo kg** của dòng credit; lý do bắt buộc.
  - Dùng **cùng `factor_version`** với dòng gốc.
  - `occurred_at = now()`.
- **Ràng buộc:** UNIQUE partial `(handover_line_id) where entry_type='credit'` ⇒ mỗi dòng bàn giao có đúng **một** credit. Được đảo **từng phần, nhiều lần**: mỗi reversal trỏ `reverses_entry_id` về credit; `reverse_impact` khóa dòng credit rồi kiểm `Σ |kg| reversal ≤ kg credit` (vượt ⇒ từ chối). Ví dụ credit 18 kg: reversal 5 kg (hàng hỏng), sau đó reversal 13 kg (giao khống phát hiện muộn) — hợp lệ; reversal thêm 0,1 kg — bị từ chối.
- **Báo cáo:** tháng đã chốt **không** bị sửa. Reversal xuất hiện ở tháng phát sinh, thành dòng "Điều chỉnh kỳ trước: −x kg". Tổng cộng dồn vẫn đúng.

### 6.2 Giao một phần
- Mỗi `handover_line` của dropoff tạo một credit theo `qty` thực giao. Ví dụ đặt 20, lấy 18, giao 18: credit 18 × kg/đơn vị.
- Phần thiếu ghi `allocations.shortfall_reason`:
  - `store_short` (cửa hàng thiếu hàng): không tác động. Số lượng **không** trả về lô.
  - `quality_reject` (từ chối vì chất lượng): **không** tạo tác động.
  - `capacity` hoặc `no_show`: trả số lượng về lô nếu còn trước hạn hiệu lực. Không tạo tác động.
- Nhu cầu (`needs`) cập nhật trạng thái từ tổng đã giao, không phụ thuộc ledger.

### 6.3 Tự đến lấy
- `pickups.mode='self'`: một handover vừa là pickup vừa là dropoff. Ledger ghi ngay khi consume.
- Không tính vào S5 (chuyến tình nguyện), nhưng hiện trong "Lần tự đến lấy".

### 6.4 Khối lượng mặc định theo danh mục
- `weight_source='category_default'` được truyền xuống ledger.
- Dashboard cửa hàng hiện "x% khối lượng là ước tính theo mức mặc định của danh mục. Khai khối lượng thực để số liệu chính xác hơn."
- Admin có cảnh báo khi `unit_weight_kg` khai báo lệch > 3 lần mức mặc định của danh mục (có thể nhập nhầm g/kg).

### 6.5 Đổi hệ số giữa kỳ
- Ledger giữ `factor_version` của từng dòng. Báo cáo tháng liệt kê các version đã dùng.
- Không "tính lại lịch sử" mặc định. Nếu cần so sánh, báo cáo có thể hiện **thêm** cột "tính lại theo v2" (đề xuất: tham số tùy chọn của `get_esg_system`, tính lại từ `kg` với hệ số v2). Cột này chỉ để so sánh, không thay số chính thức.

### 6.6 Dữ liệu demo và giám khảo
- `is_demo` truyền từ `organizations` xuống `offers`, `allocations`, `impact_ledger`.
- Seed lịch sử 90 ngày được sinh **bằng RPC thật**, nên công thức được kiểm tra trên chính dữ liệu demo.
- Số trên trang công khai luôn loại demo. Nếu prod chưa có dữ liệu thật, trang hiện "Chưa có dữ liệu thật — xem bảng demo" thay vì số 0 gây hiểu lầm.

### 6.7 Đơn vị đếm nhưng số lẻ
- Bị chặn ở DB (CHECK `offers_integer_qty`: đơn vị khác `kg`/`liter` thì số lượng phải nguyên). Không cần xử lý trong ESG.

---

## 7. Version hóa hệ số

0. Hệ số **không** cấu hình được lúc chạy: Admin chỉ xem (`/admin/settings/factors`, chỉ đọc). Bộ v1 do [ADR-009](adr/ADR-009-esg-factors.md) quyết định.
1. Đề xuất hệ số mới bằng một ADR mới (`docs/adr/ADR-NNN-esg-factors-vN.md`) gồm: lý do, nguồn, trang, dẫn xuất, so sánh tác động với version cũ trên dữ liệu 3 tháng gần nhất.
2. Migration **insert** bộ hệ số `vN` (không update `v(N-1)`) và đổi `app_settings.impact_factor_version`.
3. Từ thời điểm deploy, ledger mới dùng `vN`. Ledger cũ giữ nguyên.
4. Trang "Phương pháp" công khai (`/impact/methodology`) hiện mọi version, có ngày hiệu lực và nguồn.
5. Test: fixture của `vN` được thêm, **fixture cũ giữ nguyên** và vẫn pass.

---

## 8. Báo cáo tháng (CSR) cho cửa hàng

**Route:** `/store/esg/report/[month]`. In bằng print CSS (A4 dọc), có nút "Tải PDF" qua hộp thoại in của trình duyệt. react-pdf là tùy chọn, nằm trong danh sách cắt.

| Phần | Nội dung |
|---|---|
| 1. Bìa | Logo FoodSave, tên cửa hàng (và chi nhánh nếu lọc), kỳ báo cáo, **Mã báo cáo** (`RPT-YYYYMM-<8 ký tự>`), ngày tạo, version hệ số, trạng thái "Chính thức" (sau ngày chốt) hoặc "Tạm tính" |
| 2. Tóm tắt | 4 thẻ lớn: kg cứu, kg CO₂e, suất ăn, lượt người được hỗ trợ. So sánh với tháng trước (%) |
| 3. Môi trường | E1–E4: bảng và biểu đồ cột theo tuần. Kg theo danh mục. % kg ước tính |
| 4. Xã hội | S1, S2 (phân bổ theo kg), S3 (tham khảo), S5. Danh sách tổ chức đã nhận (tên tổ chức; điểm có `visibility='hidden'` chỉ hiện tên tổ chức, không địa chỉ) |
| 5. Quản trị và minh bạch | G1, G2 (tham khảo). Tối đa 6 ảnh minh chứng **đã duyệt**, đã làm mờ, có chú thích ngày và số người |
| 6. Chi tiết bàn giao | Bảng: ngày, mã lô, danh mục, số lượng + đơn vị, kg, tổ chức nhận, trạng thái minh chứng |
| 7. Điều chỉnh | Các reversal phát sinh trong kỳ (nếu có) |
| 8. Phương pháp | Công thức tóm tắt, bảng hệ số kèm nguồn (FAO 2013, WRAP), tuyên bố giới hạn (mục 9) |
| 9. Xác thực | Mã QR trỏ tới `/impact/verify/<report_code>`, trang công khai hiện các tổng số của mã báo cáo, để bên thứ ba đối chiếu số trên bản in không bị sửa. Lưu `report_snapshots(report_code, scope, month, totals jsonb, sha256, created_at)` |

**Tham chiếu khung báo cáo:** doanh nghiệp có thể dẫn số liệu này khi báo cáo về chất thải được chuyển hướng khỏi tiêu hủy (họ chuẩn GRI 306) và đóng góp vào SDG 12.3 / SDG 2. Mức độ phù hợp với từng chuẩn **cần doanh nghiệp tự đánh giá**. FoodSave không tuyên bố báo cáo đạt chuẩn GRI.

---

## 9. Tuyên bố giới hạn

In trên mọi dashboard ESG (tooltip "ⓘ"), trong báo cáo tháng và trên `/impact/methodology`:

> Các chỉ số môi trường và xã hội của FoodSave là **ước tính** dựa trên khối lượng thực phẩm được bàn giao và đối soát trên nền tảng, nhân với hệ số trung bình từ các nguồn công khai (FAO 2013; WRAP). Chỉ số nước chỉ gồm nước tưới (nước xanh lam), không gồm nước mưa. Đây **không phải** kết quả kiểm kê khí nhà kính hay kiểm toán độc lập, và **không** được chứng nhận theo bất kỳ tiêu chuẩn nào. Khối lượng có thể là ước tính theo mức mặc định của danh mục khi cửa hàng không khai báo. "Lượt người được hỗ trợ" do tổ chức nhận khai báo và được quản trị viên duyệt, có thể đếm trùng một người nhiều lần. Phương pháp và hệ số có version, xem tại /impact/methodology.

---

## 10. Kiểm thử

| Loại | Vị trí | Nội dung |
|---|---|---|
| Fixture dùng chung | `tests/fixtures/esg-cases.json` | Các ca có tên (xem dưới); mỗi ca gồm input (offers, allocations, handover lines, proofs, needs, incidents, orgs) và output kỳ vọng cho từng chỉ số và scope |
| Unit TS | `src/core/impact/impact.test.ts` | `computeLineImpact`, `aggregate`, quy tắc làm tròn và định dạng `vi-VN`, mẫu số 0 hiện "—" |
| Property (fast-check) | `src/core/impact/impact.property.test.ts` | (1) E2 = Σ(kg × f) với mọi tổ hợp version. (2) Tổng credit + reversal ≥ 0 với mọi chuỗi reversal hợp lệ. (3) Cộng theo store đúng bằng tổng platform (tính chất cộng). (4) `floor` suất ăn không vượt giá trị thực. (5) S2 phân bổ tỷ lệ: tổng các store ≤ `people_served` |
| pgTAP | `supabase/tests/esg/*.test.sql` | Nạp `supabase/tests/fixtures/esg_cases.sql` (sinh từ JSON bằng `pnpm gen:fixtures`), refresh MV, so `get_esg_monthly` / `get_esg_system` với kỳ vọng. Ledger: UPDATE/DELETE bị từ chối; nhiều reversal từng phần cho cùng credit được chấp nhận khi Σ ≤ credit, reversal làm Σ vượt credit bị từ chối; credit thứ hai cho cùng `handover_line_id` bị từ chối; `allocations.kg_delivered` khớp Σ ledger |
| Đối chiếu SQL ↔ TS | CI job `db` | Chạy cùng fixture ở hai phía; lệch quá 0,001 thì fail |
| E2E | `tests/e2e/esg.spec.ts` | Sau kịch bản giao 12 kg bánh mì (đơn vị kg), dashboard cửa hàng hiện 12,0 kg / 24 kg CO₂e / 1,8 m³ nước tưới / 28 suất; báo cáo tháng render, in không vỡ trang |
| UAT | `docs/uat/P4-proof-esg.md` | Khanh tính tay bằng bảng mẫu và đối chiếu |

**Các ca fixture bắt buộc:**
1. `single_full_delivery`: 1 lô, 1 tổ chức, giao đủ.
2. `unit_to_kg_declared` / `unit_to_kg_default`: 50 cái × 0,08 kg, khai báo và dùng mặc định.
3. `partial_quality_reject`: đặt 20, lấy 20, giao 17, từ chối 3 vì chất lượng.
4. `multi_store_bundle_50_banh`: 20 + 18 + 12 từ 3 cửa hàng, 1 chuyến, 3 điểm. Kiểm tra S5 = 1 chuyến, 3 điểm.
5. `reversal_next_month`: credit tháng 10, reversal tháng 11 (tháng 10 đã chốt).
5b. `partial_reversals`: credit 18 kg; reversal 5 kg rồi 13 kg được chấp nhận; reversal thêm 0,1 kg bị từ chối; E1 cộng dồn = 0.
6. `factor_version_change_mid_month`.
7. `expired_unclaimed_vs_partially_claimed` (E4).
8. `cancelled_by_store_before_claim`: bị loại khỏi mẫu E4.
9. `need_fulfilled_vs_closed_partial_vs_cancelled` (S3).
10. `proof_multi_store_people_split` (S2 tỷ lệ kg).
11. `proof_resubmitted_after_needs_changes` (G2 dùng `first_submitted_at`, không đổi khi nộp lại).
11b. `current_month_live`: bàn giao trong tháng hiện tại hiện ngay trong `get_esg_monthly` khi MV chưa refresh.
12. `lot_split_two_charities_one_missing_proof` (G1 = không đạt).
13. `org_review_cycle_needs_changes` (G3 hai lượt).
14. `incidents_resolved_dismissed_open` (G4).
15. `timezone_boundary`: dropoff lúc 23:30 ngày 31/10 giờ VN (16:30 UTC) phải tính vào **tháng 10**.
16. `demo_excluded_from_public`.

---

## 11. Câu hỏi phản biện thường gặp

**Q1. "Dùng một hệ số 2,0 cho mọi loại thực phẩm có quá đơn giản không? Thịt bò khác rau muống."**
Đúng, đây là trung bình. Bọn em chọn cách này có chủ ý:
- Thứ nhất, FoodSave chủ yếu xử lý bánh mì, cơm hộp, rau củ, đồ đóng gói. Với rổ hàng này, trung bình toàn cầu là ước tính hợp lý và **không phóng đại**, vì nhóm có hệ số cao nhất là thịt đỏ, mà thịt đỏ ít xuất hiện.
- Thứ hai, hệ số có version. Kiến trúc đã sẵn sàng thêm hệ số theo danh mục (`food_categories`) khi có nguồn đáng tin; đó là việc trong kế hoạch 6 tháng.

**Q2. "Thực phẩm này nếu không cho thì cửa hàng cũng có thể bán giảm giá hoặc nhân viên mang về. Sao gọi là 'tránh được'?"** (tính bổ sung, additionality)
- Bọn em chỉ ghi tác động cho thực phẩm **cửa hàng chủ động đăng là dư thừa** và đã **giao thành công**. Lô hết hạn không ai nhận không được tính.
- Giả định đối chứng là nếu không có FoodSave thì lô này bị bỏ. Giả định này hợp lý với hàng sát giờ đóng cửa, và FoodSave đo được độ sát qua nhãn Đỏ/Vàng lúc giao.
- Báo cáo ghi rõ là ước tính "gắn với" lượng thực phẩm, không phải kiểm kê phát thải.

**Q3. "Doanh nghiệp đã tự báo cáo giảm chất thải, FoodSave cũng cộng, vậy có đếm trùng không?"**
- Số của FoodSave **là** dữ liệu để doanh nghiệp dùng trong báo cáo của họ, không phải một khoản giảm phát thải riêng để cộng thêm.
- Trang tác động toàn hệ thống là tổng của các bên, không cộng thêm tầng nào. FoodSave không bán tín chỉ carbon.

**Q4. "Vì sao 420 g/suất của Anh mà không phải khẩu phần Việt Nam?"**
- 420 g có **nguồn công khai** và là chuẩn của chính bài toán "báo cáo thực phẩm dư được phân phối lại".
- Con số này lớn hơn 350 g của bản cũ, nên số suất ăn **thấp hơn**, tức là bảo thủ.
- Nếu tìm được nguồn khẩu phần Việt Nam có trích dẫn, bọn em sẽ thêm version mới và công bố cả hai.

**Q5. "Làm sao biết 12 kg là thật?"**
- Có 4 lớp kiểm tra:
  - (1) Số lượng do **bên nhận** xác nhận ở từng dòng khi quét QR.
  - (2) khối lượng/đơn vị (`unit_weight_kg_snapshot`) cố định lúc đặt chỗ; khối lượng ước tính được gắn nhãn.
  - (3) Cảnh báo bất thường khi khối lượng/đơn vị lệch so với danh mục.
  - (4) Minh chứng được admin duyệt.
- Nếu phát hiện sai, sổ có dòng bù (reversal), không sửa lén.

**Q6. "Xe máy đi lấy hàng cũng thải CO₂, sao không trừ?"**
- Câu hỏi đúng. Phát thải một chuyến xe máy vài km nhỏ hơn nhiều so với 2,0 kg CO₂e cho mỗi kg thực phẩm cứu được (một chuyến thường chở 5–20 kg, tức 10–40 kg CO₂e).
- Bản v2 lưu tổng km của tuyến (`pickups`). Khi chốt được hệ số phát thải xe máy có nguồn, sẽ hiện thêm chỉ số "CO₂e ròng". Hiện đây là mục mở rộng, không có trong số chính thức.

**Q7. "Số 'người được hỗ trợ' có bị tổ chức khai khống?"**
- Có thể. Vì vậy chỉ số này:
  - (1) chỉ tính từ minh chứng **đã được admin duyệt**;
  - (2) có cảnh báo khi số người vượt mức hợp lý so với lượng thực phẩm;
  - (3) được gọi trung thực là "lượt người" (có thể trùng);
  - (4) gắn với trust score của tổ chức.

**Q8. "Số trên demo là thật hay bịa?"**
- Dữ liệu demo được sinh bằng chính các RPC của hệ thống, gắn nhãn "Dữ liệu demo" và **không** cộng vào số công khai.
- Số pilot thật (≥ 10 lần bàn giao, 15–28/11) hiện riêng.

**Q9. "Có được chứng nhận hay kiểm toán không?"**
- Chưa. Bọn em ghi rõ tuyên bố giới hạn (mục 9).
- Hướng đi: mời một đơn vị học thuật (ví dụ khoa môi trường) rà phương pháp trong 6 tháng triển khai.

**Q10. "Sửa hệ số thì số cũ có đổi không?"**
- Không. Mỗi dòng sổ lưu version và giá trị đã tính.
- Nếu cần so sánh, báo cáo hiện thêm cột "tính lại theo hệ số mới", không ghi đè số đã công bố.

**Q11. "Vì sao nước chỉ 150 L/kg, trong khi nhiều nơi nói hàng nghìn lít?"**
- Các con số hàng nghìn lít thường là dấu chân nước **tổng**, gồm cả nước mưa tự nhiên. Lượng nước mưa đó không thể "tiết kiệm" theo nghĩa thông thường.
- Bọn em chỉ dùng phần nước **tưới** (blue water) từ cùng báo cáo FAO với hệ số CO₂e: 250 km³ (tr. 6) ÷ 1,6 Gt (tr. 11) ≈ 156 L/kg, làm tròn xuống 150. Vì thế nhãn trên giao diện là "Nước tưới tránh lãng phí (ước tính)".
- Con số nhỏ hơn nhưng ai cũng kiểm tra lại được bằng máy tính bỏ túi, và bảo vệ được khi bị hỏi.

**Q12. "Bản cũ ghi 2,5 kg CO₂e/kg, nhiều tài liệu cũng chia 3,3 Gt cho 1,3 Gt. Sao giờ chỉ còn 2,0?"**
- FAO tính dấu chân 3,3 Gt CO₂e trên khối lượng lãng phí **gồm cả phần không ăn được**, tức 1,6 Gt (tr. 11). Chia cho 1,3 Gt (chỉ phần ăn được) là gán dấu chân của vỏ, xương… vào phần ăn được, làm số phóng đại khoảng 25%.
- Bọn em dùng đúng mẫu số của FAO: 3,3 ÷ 1,6 ≈ 2,06, làm tròn xuống 2,0. Cả CO₂e và nước dùng chung mẫu số này nên nhất quán.
- Nguyên tắc chung: khi không chắc thì chọn số **thấp hơn**. Bị hỏi vặn thì FoodSave đang "nói nhỏ" chứ không "nói quá".

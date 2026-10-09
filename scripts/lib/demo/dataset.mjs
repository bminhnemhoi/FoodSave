// Bộ dữ liệu demo hư cấu (DATA-MODEL §17, skill seed-demo, SECURITY-PRIVACY C20, docs/pitch/demo-script.md).
// - Tên cửa hàng/tổ chức/người đều hư cấu, không dùng thương hiệu thật. Tọa độ là điểm công cộng trong
//   khu trung tâm TP.HCM (trong service_area_bbox), địa chỉ chỉ ghi tên đường + mốc công cộng.
// - Mã số thuế/số đăng ký là giá trị giả rõ ràng (đầu 000…, "DEMO-…"), không có số điện thoại, không
//   có CCCD. Email dùng TLD dành riêng `.test` (RFC 6761) nên không bao giờ tới hộp thư thật.
// - Mọi mốc thời gian của lô là TƯƠNG ĐỐI so với lúc seed (giờ, ngày), không có ngày cố định.

import { daily } from "./hours.mjs";

export const DEFAULT_EMAIL_DOMAIN = "foodsave.test";

/**
 * Tài khoản demo. `group`:
 * - `judge`: giao cho giám khảo (mật khẩu chung, đưa riêng ngoài kênh) — không có tài khoản admin.
 * - `team`: tài khoản trình diễn của nhóm (kịch bản demo), mật khẩu riêng.
 * - `internal`: chủ của các tổ chức nền, không ai đăng nhập (mật khẩu ngẫu nhiên, không in ra).
 */
export const ACCOUNTS = [
  { key: "judge_store", local: "giamkhao.cuahang", fullName: "Giám khảo · Cửa hàng", group: "judge" },
  { key: "judge_charity", local: "giamkhao.tochuc", fullName: "Giám khảo · Tổ chức", group: "judge" },
  { key: "judge_volunteer", local: "giamkhao.tnv", fullName: "Giám khảo · Tình nguyện viên", group: "judge" },
  { key: "team_store", local: "demo.store", fullName: "Trần Thu Mây", group: "team" },
  { key: "team_charity", local: "demo.charity", fullName: "Phạm Thị Hạnh", group: "team" },
  { key: "team_charity2", local: "demo.charity2", fullName: "Ngô Thanh Bình", group: "team" },
  { key: "team_volunteer", local: "demo.volunteer", fullName: "Nguyễn Thị Lan", group: "team" },
  { key: "team_volunteer2", local: "demo.volunteer2", fullName: "Trần Văn Hùng", group: "team" },
  { key: "ops_store", local: "noibo.cuahang", fullName: "Vận hành cửa hàng demo", group: "internal" },
  { key: "ops_charity", local: "noibo.tochuc", fullName: "Vận hành tổ chức demo", group: "internal" },
  {
    key: "reviewer",
    local: "noibo.kiemduyet",
    fullName: "Kiểm duyệt dữ liệu demo (không phải Admin)",
    group: "internal",
  },
];

/** Người duyệt hồ sơ demo (demo_approve_organization): hồ sơ demo thường, KHÔNG phải admin. */
export const REVIEWER = "reviewer";

const CENTER_NOTE = "Tổ chức hư cấu dùng để trình diễn FoodSave (Dữ liệu demo).";

/**
 * 8 cửa hàng + 4 tổ chức. `hours: []` = mở 24/7. `owner` = khóa trong ACCOUNTS.
 * Cửa hàng 24/7 giữ được lô nhiều ngày ⇒ luôn có đủ nhãn Xanh/Vàng/Đỏ bất kể giờ seed.
 */
export const ORGS = [
  // ---- cửa hàng ----
  {
    key: "judge_store",
    kind: "store",
    subtype: "convenience",
    name: "Cửa hàng tiện lợi Phố Xanh",
    owner: "judge_store",
    description: `Cửa hàng tiện lợi mở 24/7 gần chợ Bến Thành. ${CENTER_NOTE}`,
    legalName: "Hộ kinh doanh Cửa hàng tiện lợi Phố Xanh (hư cấu)",
    representativeTitle: "Chủ hộ kinh doanh",
    site: {
      name: "Cửa hàng Phố Xanh – Bến Thành",
      address_line: "Đường Lê Thánh Tôn, gần chợ Bến Thành",
      ward: "Phường Bến Thành",
      lat: 10.7736,
      lng: 106.6993,
      visibility: "public",
      radius_km: 5,
      accepted_categories: ["bread", "cooked_meal", "pastry", "dairy", "beverage", "dry_goods"],
      auto_accept_mode: "off",
    },
    hours: [],
  },
  {
    key: "may",
    kind: "store",
    subtype: "bakery",
    name: "Tiệm bánh Mây",
    owner: "team_store",
    description: `Tiệm bánh mì và bánh ngọt nhỏ, đóng cửa 21:30. ${CENTER_NOTE}`,
    legalName: "Hộ kinh doanh Tiệm bánh Mây (hư cấu)",
    representativeTitle: "Chủ hộ kinh doanh",
    site: {
      name: "Tiệm bánh Mây – Tân Định",
      address_line: "Đường Hai Bà Trưng, gần chợ Tân Định",
      ward: "Phường Tân Định",
      lat: 10.7896,
      lng: 106.6911,
      visibility: "public",
      radius_km: 5,
      accepted_categories: ["bread", "pastry"],
      auto_accept_mode: "off",
    },
    hours: daily("06:30", "21:30"),
  },
  {
    key: "bep_xanh",
    kind: "store",
    subtype: "restaurant",
    name: "Bếp Xanh",
    owner: "ops_store",
    description: `Quán cơm văn phòng, tự động chấp nhận yêu cầu nhận. ${CENTER_NOTE}`,
    legalName: "Công ty TNHH Bếp Xanh (hư cấu)",
    representativeTitle: "Giám đốc",
    site: {
      name: "Bếp Xanh – Bàn Cờ",
      address_line: "Đường Nguyễn Đình Chiểu, gần chợ Bàn Cờ",
      ward: "Phường Bàn Cờ",
      lat: 10.7712,
      lng: 106.6826,
      visibility: "public",
      radius_km: 5,
      accepted_categories: ["bread", "cooked_meal"],
      auto_accept_mode: "all",
    },
    hours: daily("10:00", "00:30", true),
  },
  {
    key: "som_mai",
    kind: "store",
    subtype: "bakery",
    name: "Lò bánh Sớm Mai",
    owner: "ops_store",
    description: `Lò bánh mì mở từ 5 giờ sáng, tự động chấp nhận yêu cầu nhận. ${CENTER_NOTE}`,
    legalName: "Hộ kinh doanh Lò bánh Sớm Mai (hư cấu)",
    representativeTitle: "Chủ hộ kinh doanh",
    site: {
      name: "Lò bánh Sớm Mai – Xuân Hòa",
      address_line: "Đường Lý Chính Thắng, gần hồ Con Rùa",
      ward: "Phường Xuân Hòa",
      lat: 10.7836,
      lng: 106.6862,
      visibility: "public",
      radius_km: 5,
      accepted_categories: ["bread", "pastry"],
      auto_accept_mode: "all",
    },
    hours: daily("05:00", "20:00"),
  },
  {
    key: "nha_lanh",
    kind: "store",
    subtype: "restaurant",
    name: "Bếp Cơm Nhà Lành",
    owner: "ops_store",
    description: `Bếp cơm gia đình, tự chấp nhận yêu cầu của tổ chức có điểm uy tín từ 60. ${CENTER_NOTE}`,
    legalName: "Hộ kinh doanh Bếp Cơm Nhà Lành (hư cấu)",
    representativeTitle: "Chủ hộ kinh doanh",
    site: {
      name: "Bếp Cơm Nhà Lành – Gia Định",
      address_line: "Đường Bạch Đằng, gần chợ Bà Chiểu",
      ward: "Phường Gia Định",
      lat: 10.8012,
      lng: 106.7004,
      visibility: "public",
      radius_km: 6,
      accepted_categories: ["cooked_meal"],
      auto_accept_mode: "trusted",
      auto_accept_min_trust: 60,
    },
    hours: [1, 2, 3, 4, 5, 6]
      .map((dow) => ({ dow, opens: "09:00", closes: "21:00", closes_next_day: false }))
      .concat([{ dow: 0, opens: "10:00", closes: "20:00", closes_next_day: false }]),
  },
  {
    key: "la_chuoi",
    kind: "store",
    subtype: "supermarket",
    name: "Siêu thị mini Lá Chuối",
    owner: "ops_store",
    description: `Siêu thị mini mở 24/7: rau củ, trái cây, sữa, thịt, đồ khô. ${CENTER_NOTE}`,
    legalName: "Công ty TNHH Thương mại Lá Chuối (hư cấu)",
    representativeTitle: "Giám đốc",
    site: {
      name: "Siêu thị mini Lá Chuối – Cầu Kiệu",
      address_line: "Đường Phan Đình Phùng, Phú Nhuận",
      ward: "Phường Cầu Kiệu",
      lat: 10.795,
      lng: 106.681,
      visibility: "public",
      radius_km: 6,
      accepted_categories: ["vegetables", "fruit", "dairy", "meat_seafood", "beverage", "dry_goods"],
      auto_accept_mode: "off",
    },
    hours: [],
  },
  {
    key: "an_nhien",
    kind: "store",
    subtype: "restaurant",
    name: "Quán chay An Nhiên",
    owner: "ops_store",
    description: `Quán cơm chay bình dân. ${CENTER_NOTE}`,
    legalName: "Hộ kinh doanh Quán chay An Nhiên (hư cấu)",
    representativeTitle: "Chủ hộ kinh doanh",
    site: {
      name: "Quán chay An Nhiên – Xóm Chiếu",
      address_line: "Đường Tôn Đản, gần chợ Xóm Chiếu",
      ward: "Phường Xóm Chiếu",
      lat: 10.7577,
      lng: 106.7062,
      visibility: "public",
      radius_km: 5,
      accepted_categories: ["cooked_meal", "vegetables"],
      auto_accept_mode: "off",
    },
    hours: daily("07:00", "21:00"),
  },
  {
    key: "vuon_nha",
    kind: "store",
    subtype: "other",
    name: "Cửa hàng rau sạch Vườn Nhà",
    owner: "ops_store",
    description: `Cửa hàng rau củ và trái cây. ${CENTER_NOTE}`,
    legalName: "Hộ kinh doanh Rau sạch Vườn Nhà (hư cấu)",
    representativeTitle: "Chủ hộ kinh doanh",
    site: {
      name: "Rau sạch Vườn Nhà – Nhiêu Lộc",
      address_line: "Đường Kỳ Đồng, Quận 3 cũ",
      ward: "Phường Nhiêu Lộc",
      lat: 10.7835,
      lng: 106.6812,
      visibility: "public",
      radius_km: 5,
      accepted_categories: ["vegetables", "fruit"],
      auto_accept_mode: "off",
    },
    hours: daily("06:00", "19:00"),
  },
  // ---- tổ chức (điểm nhận) ----
  {
    key: "judge_charity",
    kind: "charity",
    subtype: "children_home",
    name: "Mái ấm Hướng Dương",
    owner: "judge_charity",
    description: `Mái ấm nuôi dưỡng trẻ em, nhận thực phẩm cả ngày. ${CENTER_NOTE}`,
    legalName: "Mái ấm Hướng Dương (hư cấu)",
    representativeTitle: "Người phụ trách",
    beneficiaries: 60,
    foundedOn: "2012-06-01",
    site: {
      name: "Mái ấm Hướng Dương – điểm nhận",
      address_line: "Đường Ba Tháng Hai, Quận 10 cũ",
      ward: "Phường Vườn Lài",
      lat: 10.7675,
      lng: 106.6745,
      visibility: "approximate",
      radius_km: 10,
      capacity_kg: 80,
    },
    hours: [],
  },
  {
    key: "anh_duong",
    kind: "charity",
    subtype: "children_home",
    name: "Mái ấm Ánh Dương",
    owner: "team_charity",
    description: `Mái ấm cho trẻ em có hoàn cảnh khó khăn. ${CENTER_NOTE}`,
    legalName: "Mái ấm Ánh Dương (hư cấu)",
    representativeTitle: "Người phụ trách",
    beneficiaries: 45,
    foundedOn: "2015-03-15",
    site: {
      name: "Mái ấm Ánh Dương – điểm nhận",
      address_line: "Đường Cô Giang, Quận 1 cũ",
      ward: "Phường Cầu Ông Lãnh",
      lat: 10.7632,
      lng: 106.695,
      visibility: "approximate",
      radius_km: 8,
      capacity_kg: 60,
    },
    hours: [],
  },
  {
    key: "binh_minh",
    kind: "charity",
    subtype: "shelter",
    name: "Mái ấm Bình Minh",
    owner: "team_charity2",
    description: `Nơi tạm lánh — vị trí được ẩn hoàn toàn. ${CENTER_NOTE}`,
    legalName: "Mái ấm Bình Minh (hư cấu)",
    representativeTitle: "Người phụ trách",
    beneficiaries: 30,
    foundedOn: "2018-09-01",
    site: {
      name: "Mái ấm Bình Minh – điểm nhận",
      address_line: "Đường Trần Bình Trọng, Quận 5 cũ",
      ward: "Phường Chợ Quán",
      lat: 10.7567,
      lng: 106.6825,
      visibility: "hidden",
      radius_km: 8,
      capacity_kg: 40,
    },
    hours: [],
  },
  {
    key: "an_khang",
    kind: "charity",
    subtype: "elderly_home",
    name: "Viện dưỡng lão An Khang",
    owner: "ops_charity",
    description: `Viện dưỡng lão, nhận thực phẩm 06:00–21:00, không nhận thịt sống. ${CENTER_NOTE}`,
    legalName: "Viện dưỡng lão An Khang (hư cấu)",
    representativeTitle: "Giám đốc",
    beneficiaries: 40,
    foundedOn: "2010-01-10",
    site: {
      name: "Viện dưỡng lão An Khang",
      address_line: "Đường Nơ Trang Long, Bình Thạnh",
      ward: "Phường Bình Thạnh",
      lat: 10.809,
      lng: 106.699,
      visibility: "public",
      radius_km: 6,
      capacity_kg: 50,
      accepted_categories: [
        "bread",
        "cooked_meal",
        "pastry",
        "vegetables",
        "fruit",
        "dairy",
        "beverage",
        "dry_goods",
      ],
    },
    hours: daily("06:00", "21:00"),
  },
];

/** Tình nguyện viên: mời bằng invite_member (chủ tổ chức) rồi accept_invite (chính TNV). */
export const VOLUNTEERS = [
  { org: "judge_charity", account: "judge_volunteer" },
  { org: "anh_duong", account: "team_volunteer" },
  { org: "anh_duong", account: "team_volunteer2" },
];

/**
 * Lô "hôm nay". `expiresH` tính từ mốc khung lấy (lúc seed nếu cửa hàng đang mở, nếu không thì lần mở
 * cửa kế tiếp); `expiry: "end_of_day"` = chỉ có ngày (23:59 giờ VN). Hạn hiệu lực = min(hạn dùng, giờ đóng
 * cửa, cuối khung lấy) do publish_offer tính. Ở cửa hàng 24/7, khung lấy kéo tới hạn dùng ⇒ nhãn Xanh/Vàng/Đỏ
 * đúng như ghi chú.
 */
export const OFFERS = [
  // Cửa hàng tiện lợi Phố Xanh (giám khảo, 24/7)
  {
    key: "j_com_ga",
    store: "judge_store",
    category: "cooked_meal",
    title: "Cơm gà xối mỡ (hộp)",
    quantity: 12,
    expiresH: 3,
    note: "Đỏ",
    description: "Giữ mát, hâm nóng trước khi dùng.",
  },
  {
    key: "j_com_chien",
    store: "judge_store",
    category: "cooked_meal",
    title: "Cơm chiên dương châu",
    quantity: 8,
    expiresH: 1.5,
    note: "Đỏ, đếm ngược",
    description: "Nấu trong ngày.",
  },
  {
    key: "j_banh_mi",
    store: "judge_store",
    category: "bread",
    title: "Bánh mì sandwich trứng",
    quantity: 15,
    expiresH: 8,
    note: "Vàng",
    description: "Bánh mì gói sẵn, để nơi khô ráo.",
  },
  {
    key: "j_sua_chua",
    store: "judge_store",
    category: "dairy",
    title: "Sữa chua uống (chai)",
    quantity: 20,
    expiresH: 48,
    note: "Vàng",
    description: "Bảo quản lạnh 2–8 °C.",
  },
  {
    key: "j_sua_tuoi",
    store: "judge_store",
    category: "dairy",
    title: "Sữa tươi tiệt trùng hộp 180 ml",
    unit: "box",
    unitWeightKg: 0.19,
    quantity: 24,
    expiresH: 96,
    note: "Xanh",
    description: "Thùng còn nguyên, hộp không móp.",
  },
  {
    key: "j_mi_goi",
    store: "judge_store",
    category: "dry_goods",
    title: "Mì gói (thùng 30 gói)",
    unit: "box",
    unitWeightKg: 2.5,
    quantity: 4,
    expiresH: 60,
    note: "Đỏ (đóng gói < 3 ngày)",
    description: "Sắp hết hạn in trên bao bì.",
  },
  {
    key: "j_nuoc_suoi",
    store: "judge_store",
    category: "beverage",
    title: "Nước suối 500 ml",
    quantity: 48,
    expiresH: 240,
    note: "Xanh",
    description: "Lốc 24 chai.",
  },
  {
    key: "j_banh_quy",
    store: "judge_store",
    category: "dry_goods",
    title: "Bánh quy bơ (gói 200 g)",
    unitWeightKg: 0.2,
    quantity: 30,
    expiresH: 480,
    note: "Xanh",
    description: "Hàng đổi bao bì, còn hạn dài.",
  },
  // Bếp Xanh (tự chấp nhận)
  {
    key: "bx_banh_mi",
    store: "bep_xanh",
    category: "bread",
    title: "Bánh mì ổ",
    quantity: 18,
    expiry: "end_of_day",
    description: "Bánh mì nướng trong ngày.",
  },
  {
    key: "bx_com_rau",
    store: "bep_xanh",
    category: "cooked_meal",
    title: "Cơm phần rau củ xào",
    quantity: 10,
    expiresH: 4,
    description: "Phần cơm văn phòng còn dư.",
  },
  // Lò bánh Sớm Mai (tự chấp nhận)
  {
    key: "sm_banh_mi",
    store: "som_mai",
    category: "bread",
    title: "Bánh mì ổ",
    quantity: 12,
    expiry: "end_of_day",
    description: "Mẻ bánh buổi chiều.",
  },
  {
    key: "sm_bong_lan",
    store: "som_mai",
    category: "pastry",
    title: "Bánh bông lan cuộn",
    quantity: 20,
    expiresH: 10,
    description: "Để nơi thoáng mát.",
  },
  // Bếp Cơm Nhà Lành
  {
    key: "nl_com_suon",
    store: "nha_lanh",
    category: "cooked_meal",
    title: "Cơm sườn nướng",
    quantity: 15,
    expiresH: 5,
    description: "Đóng hộp giấy.",
  },
  {
    key: "nl_canh_chua",
    store: "nha_lanh",
    category: "cooked_meal",
    title: "Canh chua cá (phần)",
    quantity: 10,
    expiresH: 3,
    description: "Mang theo hộp giữ nhiệt nếu có.",
  },
  // Siêu thị mini Lá Chuối (24/7)
  {
    key: "lc_rau",
    store: "la_chuoi",
    category: "vegetables",
    title: "Rau cải ngọt",
    unit: "kg",
    quantity: 6.5,
    expiresH: 30,
    note: "Vàng",
    description: "Rau đã nhặt, còn tươi.",
  },
  {
    key: "lc_chuoi",
    store: "la_chuoi",
    category: "fruit",
    title: "Chuối già",
    unit: "kg",
    quantity: 8,
    expiresH: 80,
    note: "Xanh",
    description: "Chín vừa.",
  },
  {
    key: "lc_thit",
    store: "la_chuoi",
    category: "meat_seafood",
    title: "Thịt heo xay",
    unit: "kg",
    quantity: 3,
    expiresH: 18,
    note: "Đỏ",
    description: "Giữ lạnh, dùng trong ngày.",
  },
  {
    key: "lc_sua_dau",
    store: "la_chuoi",
    category: "dairy",
    title: "Sữa đậu nành (chai)",
    quantity: 12,
    expiresH: 20,
    note: "Đỏ",
    description: "Bảo quản lạnh.",
  },
  {
    key: "lc_gao",
    store: "la_chuoi",
    category: "dry_goods",
    title: "Gạo tẻ (túi 5 kg)",
    unitWeightKg: 5,
    quantity: 10,
    expiresH: 720,
    note: "Xanh",
    description: "Túi rách nhẹ bao ngoài, gạo còn nguyên.",
  },
  // Quán chay An Nhiên
  {
    key: "an_com_chay",
    store: "an_nhien",
    category: "cooked_meal",
    title: "Cơm chay thập cẩm",
    quantity: 12,
    expiresH: 3,
    description: "Nấu trong ngày.",
  },
  {
    key: "an_rau_muong",
    store: "an_nhien",
    category: "vegetables",
    title: "Rau muống",
    unit: "kg",
    quantity: 4,
    expiresH: 26,
    description: "Rau sơ chế.",
  },
  // Cửa hàng rau sạch Vườn Nhà
  {
    key: "vn_ca_chua",
    store: "vuon_nha",
    category: "vegetables",
    title: "Cà chua",
    unit: "kg",
    quantity: 5,
    expiresH: 70,
    description: "Chín đỏ, dùng trong 2–3 ngày.",
  },
  {
    key: "vn_xoai",
    store: "vuon_nha",
    category: "fruit",
    title: "Xoài cát",
    unit: "kg",
    quantity: 6,
    expiresH: 96,
    description: "Xoài chín cây.",
  },
];

/** Lô dành riêng cho các bàn giao hoàn tất hôm nay (luồng thật → ledger). */
export const HANDOVER_OFFERS = [
  {
    key: "h_banh_bao",
    store: "judge_store",
    charity: "anh_duong",
    category: "pastry",
    title: "Bánh bao nhân thịt",
    quantity: 10,
    expiresH: 6,
    description: "Hấp sáng nay.",
  },
  {
    key: "h_sua_chua_hop",
    store: "judge_store",
    charity: "judge_charity",
    category: "dairy",
    title: "Sữa chua hộp",
    unit: "box",
    unitWeightKg: 0.1,
    quantity: 16,
    expiresH: 48,
    description: "Bảo quản lạnh.",
  },
  {
    key: "h_rau_cu",
    store: "la_chuoi",
    charity: "binh_minh",
    category: "vegetables",
    title: "Rau củ thập cẩm",
    unit: "kg",
    quantity: 5,
    expiresH: 30,
    description: "Cà rốt, su su, bắp cải.",
  },
];

/**
 * Yêu cầu chờ cửa hàng giám khảo duyệt (request_offer, cửa hàng tắt tự chấp nhận). Gửi từ tổ chức nền /
 * dự phòng để không làm rối trạng thái S0 của "Mái ấm Ánh Dương" trong kịch bản demo. Viện dưỡng lão chỉ
 * nhận trong giờ ⇒ ngoài giờ dùng tổ chức dự phòng (24/7).
 */
export const PENDING_REQUESTS = [
  { offer: "j_com_ga", charity: "binh_minh", quantity: 5 },
  { offer: "j_banh_mi", charity: "an_khang", fallbackCharity: "binh_minh", quantity: 6 },
  { offer: "j_sua_tuoi", charity: "an_khang", fallbackCharity: "binh_minh", quantity: 6 },
];

/** Phân bổ đã xác nhận cho tổ chức giám khảo, sẵn sàng tự đến lấy (request_offer + confirm_allocation). */
export const CONFIRMED_FOR_JUDGE = { offer: "j_nuoc_suoi", charity: "judge_charity", quantity: 24 };

/** Chuyến đã giao cho TNV giám khảo (assign_pickup mode volunteer). */
export const VOLUNTEER_TRIP = {
  offer: "j_banh_quy",
  charity: "judge_charity",
  quantity: 10,
  volunteer: "judge_volunteer",
};

/** Yêu cầu tới cửa hàng bật tự chấp nhận ⇒ xác nhận ngay (minh họa auto-accept). */
export const AUTO_ACCEPTED = { offer: "bx_com_rau", charity: "judge_charity", quantity: 3 };

/**
 * Lịch sử: danh mục mỗi cửa hàng (tên mặt hàng, khoảng số lượng). Đơn vị = đơn vị mặc định của danh mục
 * (kg cho rau/trái cây/thịt). Số lượng nguyên trừ khi kg.
 */
export const HISTORY_CATALOG = {
  judge_store: [
    { category: "cooked_meal", title: "Cơm hộp các loại", min: 6, max: 20 },
    { category: "bread", title: "Bánh mì sandwich", min: 8, max: 25 },
    { category: "dairy", title: "Sữa chua uống", min: 10, max: 30 },
    { category: "beverage", title: "Nước suối", min: 12, max: 48 },
  ],
  may: [
    { category: "bread", title: "Bánh mì ổ", min: 10, max: 30 },
    { category: "pastry", title: "Bánh ngọt các loại", min: 8, max: 24 },
  ],
  bep_xanh: [
    { category: "cooked_meal", title: "Cơm phần văn phòng", min: 8, max: 25 },
    { category: "bread", title: "Bánh mì ổ", min: 10, max: 20 },
  ],
  som_mai: [
    { category: "bread", title: "Bánh mì ổ", min: 12, max: 40 },
    { category: "pastry", title: "Bánh bông lan", min: 6, max: 20 },
  ],
  nha_lanh: [{ category: "cooked_meal", title: "Cơm phần gia đình", min: 8, max: 30 }],
  la_chuoi: [
    { category: "vegetables", title: "Rau củ các loại", min: 3, max: 15, kg: true },
    { category: "fruit", title: "Trái cây các loại", min: 3, max: 12, kg: true },
    { category: "dairy", title: "Sữa tươi", min: 6, max: 24 },
    { category: "dry_goods", title: "Đồ khô các loại", min: 5, max: 20 },
  ],
  an_nhien: [
    { category: "cooked_meal", title: "Cơm chay", min: 8, max: 25 },
    { category: "vegetables", title: "Rau sơ chế", min: 2, max: 8, kg: true },
  ],
  vuon_nha: [
    { category: "vegetables", title: "Rau sạch", min: 3, max: 12, kg: true },
    { category: "fruit", title: "Trái cây", min: 3, max: 10, kg: true },
  ],
};

/**
 * P3 — nhu cầu đang mở của tổ chức giám khảo: mở trang Nhu cầu là thấy ngay 3 phương án ghép từ nhiều
 * cửa hàng demo có bánh mì trong bán kính (publish_need thật; giám khảo tự bấm "Chọn phương án này").
 */
export const DEMO_NEED = {
  charity: "judge_charity",
  categories: ["bread"],
  unit: "loaf",
  quantity: 30,
  hoursAhead: 6,
  people: 60,
  note: "Bữa sáng cho các em ở mái ấm (Dữ liệu demo).",
};

/** Hồ sơ tình nguyện viên demo (upsert_volunteer_profile; khu vực gốc làm tròn ~1 km ở DB). */
export const VOLUNTEER_PROFILES = [
  {
    account: "judge_volunteer",
    vehicle: "motorbike",
    capacity_kg: 30,
    lat: 10.77,
    lng: 106.68,
    label: "Quanh chợ Bến Thành",
  },
  {
    account: "team_volunteer",
    vehicle: "motorbike",
    capacity_kg: 25,
    lat: 10.79,
    lng: 106.7,
    label: "Quanh Đa Kao",
  },
  {
    account: "team_volunteer2",
    vehicle: "bicycle",
    capacity_kg: 12,
    lat: 10.76,
    lng: 106.66,
    label: "Quanh Hòa Hưng",
  },
];

import {
  Bike,
  Building2,
  CalendarCheck,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Flag,
  HandHeart,
  Home,
  LayoutDashboard,
  type LucideIcon,
  Package,
  QrCode,
  Route,
  ScrollText,
  Settings,
  ShieldHalf,
  SlidersHorizontal,
  Sprout,
  Store,
  UserRound,
  Users,
} from "lucide-react";

/** Cổng có app shell. Route gốc đặt `data-role` tương ứng (DESIGN-SYSTEM §3.4). */
export type PortalRole = "store" | "charity" | "volunteer" | "admin";

/** Giai đoạn mở tính năng theo ROADMAP. Mục chưa mở hiển thị trang giữ chỗ trung thực. */
export type Phase = "P1" | "P2" | "P3" | "P4" | "P5";

export type NavItem = {
  href: string;
  label: string;
  /** Nhãn ngắn cho bottom tab (≤ 12 ký tự). */
  shortLabel?: string;
  icon: LucideIcon;
  /** Mô tả một dòng cho PageHeader và trang giữ chỗ. */
  description: string;
  /** Có giá trị ⇒ tính năng chưa mở; trang hiện "Tính năng mở ở giai đoạn Px". */
  phase?: Phase;
};

export type PortalNav = {
  role: PortalRole;
  /** Tên cổng hiển thị trong RoleBadge. */
  roleLabel: string;
  roleIcon: LucideIcon;
  home: string;
  items: NavItem[];
  /** Mục hiện trên bottom tab mobile (tối đa 4; mục thứ 5 là "Thêm" nếu còn mục khác). Rỗng = không có bottom tab. */
  mobileTabs: string[];
  /** Trang cài đặt (liên kết trong menu tài khoản). */
  settingsHref?: string;
};

const STORE: PortalNav = {
  role: "store",
  roleLabel: "Cửa hàng",
  roleIcon: Store,
  home: "/store",
  settingsHref: "/store/settings",
  items: [
    {
      href: "/store",
      label: "Tổng quan",
      icon: LayoutDashboard,
      description: "Lô đang mở, yêu cầu chờ duyệt và tác động của cửa hàng trong tháng.",
      phase: "P2",
    },
    {
      href: "/store/inventory",
      label: "Lô tặng",
      icon: Package,
      description: "Đăng lô thực phẩm dư, theo dõi nhãn Xanh/Vàng/Đỏ và số lượng đã được giữ.",
      phase: "P2",
    },
    {
      href: "/store/connect",
      label: "Nhu cầu gần bạn",
      shortLabel: "Nhu cầu",
      icon: HandHeart,
      description: "Bản đồ nhu cầu của các tổ chức có cửa hàng bạn nằm trong bán kính phục vụ.",
      phase: "P3",
    },
    {
      href: "/store/handover",
      label: "Bàn giao",
      icon: QrCode,
      description: "Quét QR hoặc nhập mã 6 số khi tình nguyện viên đến lấy hàng, đối soát từng dòng.",
      phase: "P2",
    },
    {
      href: "/store/proofs",
      label: "Minh chứng",
      icon: Camera,
      description: "Ảnh minh chứng đã được duyệt cho các lô bạn tặng; gửi lời cảm ơn tới tổ chức.",
      phase: "P4",
    },
    {
      href: "/store/esg",
      label: "ESG",
      icon: Sprout,
      description: "Chỉ số E/S/G và báo cáo tháng của cửa hàng, có công thức và nguồn hệ số.",
      phase: "P4",
    },
    {
      href: "/store/settings",
      label: "Cài đặt",
      icon: Settings,
      description: "Hồ sơ cửa hàng, chi nhánh, giờ mở cửa, nhân viên và tùy chọn thông báo.",
      phase: "P2",
    },
  ],
  mobileTabs: ["/store/inventory", "/store/connect", "/store/handover", "/store/proofs"],
};

const CHARITY: PortalNav = {
  role: "charity",
  roleLabel: "Tổ chức",
  roleIcon: Home,
  home: "/charity",
  settingsHref: "/charity/settings",
  items: [
    {
      href: "/charity",
      label: "Tổng quan",
      icon: LayoutDashboard,
      description: "Nhu cầu đang mở, chuyến lấy hàng hôm nay và số suất ăn đã nhận.",
      phase: "P2",
    },
    {
      href: "/charity/donations",
      label: "Kho tặng",
      icon: Package,
      description: "Bản đồ và danh sách lô tặng quanh điểm nhận, ưu tiên lô Đỏ còn đến kịp.",
      phase: "P2",
    },
    {
      href: "/charity/needs",
      label: "Nhu cầu",
      icon: HandHeart,
      description: "Đăng nhu cầu và chọn một trong tối đa 3 phương án ghép từ nhiều cửa hàng.",
      phase: "P3",
    },
    {
      href: "/charity/pickups",
      label: "Chuyến lấy hàng",
      shortLabel: "Chuyến",
      icon: Route,
      description: "Tạo chuyến, phân công tình nguyện viên và theo dõi từng điểm dừng.",
      phase: "P3",
    },
    {
      href: "/charity/volunteers",
      label: "Tình nguyện viên",
      icon: Users,
      description: "Mời tình nguyện viên, quản lý phương tiện, sức chở và trạng thái hoạt động.",
      phase: "P3",
    },
    {
      href: "/charity/proofs",
      label: "Minh chứng",
      icon: Camera,
      description: "Đăng ảnh đã làm mờ khuôn mặt cho mỗi lần nhận hàng và xem lại gallery.",
      phase: "P4",
    },
    {
      href: "/charity/esg",
      label: "ESG",
      icon: Sprout,
      description: "Chỉ số E/S/G và báo cáo tháng gửi nhà tài trợ, có công thức và nguồn hệ số.",
      phase: "P4",
    },
    {
      href: "/charity/settings",
      label: "Cài đặt",
      icon: Settings,
      description: "Hồ sơ tổ chức, giờ nhận hàng, loại thực phẩm nhận và tùy chọn thông báo.",
      phase: "P2",
    },
  ],
  mobileTabs: ["/charity/donations", "/charity/needs", "/charity/pickups", "/charity/proofs"],
};

const ADMIN: PortalNav = {
  role: "admin",
  roleLabel: "Admin",
  roleIcon: ShieldHalf,
  home: "/admin",
  settingsHref: "/admin/settings",
  items: [
    {
      href: "/admin/reviews",
      label: "Hàng đợi duyệt",
      icon: ClipboardCheck,
      description: "Duyệt hồ sơ cửa hàng và tổ chức, xem giấy tờ bằng liên kết có thời hạn.",
      phase: "P1",
    },
    {
      href: "/admin/organizations",
      label: "Tổ chức",
      icon: Building2,
      description: "Tìm kiếm, xem hồ sơ, tạm khóa hoặc mở khóa cửa hàng và tổ chức (có lý do).",
      phase: "P4",
    },
    {
      href: "/admin/offers",
      label: "Lô hàng",
      icon: Package,
      description: "Giám sát mọi lô tặng: số lượng, nhãn tươi, hạn hiệu lực và trạng thái.",
      phase: "P2",
    },
    {
      href: "/admin/allocations",
      label: "Phân bổ",
      icon: ClipboardList,
      description: "Theo dõi phân bổ giữa cửa hàng và tổ chức; can thiệp có lý do và nhật ký.",
      phase: "P2",
    },
    {
      href: "/admin/proofs",
      label: "Minh chứng",
      icon: Camera,
      description: "Duyệt minh chứng: hợp lệ, cần sửa hoặc từ chối kèm nhận xét.",
      phase: "P4",
    },
    {
      href: "/admin/incidents",
      label: "Phản ánh",
      icon: Flag,
      description: "Xử lý phản ánh về chất lượng, không đến lấy, sai số lượng hoặc hành vi.",
      phase: "P4",
    },
    {
      href: "/admin/audit",
      label: "Nhật ký",
      icon: ScrollText,
      description: "Nhật ký hoạt động chỉ đọc: ai làm gì, lúc nào, với lý do gì.",
      phase: "P1",
    },
    {
      href: "/admin/esg",
      label: "ESG",
      icon: Sprout,
      description: "Chỉ số tác động toàn hệ thống theo tháng, phường và loại hình.",
      phase: "P4",
    },
    {
      href: "/admin/settings",
      label: "Cấu hình",
      icon: SlidersHorizontal,
      description: "Ngưỡng nhãn và hệ số tác động (chỉ đọc), tham số vận hành của hệ thống.",
      phase: "P4",
    },
  ],
  // Admin tối ưu desktop; mobile dùng menu dạng sheet (DESIGN-SYSTEM §10.2)
  mobileTabs: [],
};

const VOLUNTEER: PortalNav = {
  role: "volunteer",
  roleLabel: "Tình nguyện viên",
  roleIcon: Bike,
  home: "/volunteer",
  items: [
    {
      href: "/volunteer",
      label: "Hôm nay",
      icon: CalendarCheck,
      description: "Chuyến được giao hôm nay và điểm dừng kế tiếp.",
      phase: "P3",
    },
    {
      href: "/volunteer/trips",
      label: "Chuyến",
      icon: Route,
      description: "Các chuyến bạn đã nhận và chuyến sắp tới.",
      phase: "P3",
    },
    {
      href: "/volunteer/profile",
      label: "Tài khoản",
      icon: UserRound,
      description: "Hồ sơ, phương tiện, sức chở và quyền chia sẻ vị trí trong chuyến.",
      phase: "P3",
    },
  ],
  mobileTabs: ["/volunteer", "/volunteer/trips", "/volunteer/profile"],
};

export const PORTAL_NAV: Record<PortalRole, PortalNav> = {
  store: STORE,
  charity: CHARITY,
  admin: ADMIN,
  volunteer: VOLUNTEER,
};

/** Tìm mục nav theo đường dẫn (trang giữ chỗ dùng để lấy tiêu đề, mô tả, giai đoạn). */
export function findNavItem(role: PortalRole, href: string): NavItem {
  const item = PORTAL_NAV[role].items.find((i) => i.href === href);
  if (!item) throw new Error(`Không có mục nav ${href} trong cổng ${role}`);
  return item;
}

/** Mục đang chọn: khớp chính xác trang gốc của cổng; trang con khớp theo tiền tố. */
export function isNavActive(item: NavItem, pathname: string, home: string): boolean {
  if (item.href === home) return pathname === home;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

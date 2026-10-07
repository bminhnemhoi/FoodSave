/**
 * Hàm định dạng số theo vi-VN (DESIGN-SYSTEM §16.4). Không gọi toLocaleString() rời rạc trong component.
 */

const coordinateFormat = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});
const oneDecimal = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** Toạ độ 6 chữ số thập phân (~0,1 m): 10,772540. */
export function formatCoordinate(value: number): string {
  return coordinateFormat.format(value);
}

/** Khoảng cách: < 1 km dùng mét làm tròn 10 m ("850 m"), từ 1 km dùng km một chữ số ("3,2 km"). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) {
    const rounded = Math.round(meters / 10) * 10;
    // 995 m làm tròn thành 1.000 m ⇒ chuyển sang km
    if (rounded < 1000) return `${integer.format(rounded)} m`;
  }
  return `${oneDecimal.format(meters / 1000)} km`;
}

/** Số km cho nhãn bán kính: "5 km", "2,5 km". */
export function formatKm(km: number): string {
  return `${oneDecimal.format(km)} km`;
}

const VN_TZ = "Asia/Ho_Chi_Minh";
const vnParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Các thành phần ngày giờ theo giờ Việt Nam (server Vercel chạy UTC). */
function vnDateParts(value: Date) {
  const parts = Object.fromEntries(vnParts.formatToParts(value).map((p) => [p.type, p.value]));
  return {
    day: parts.day!,
    month: parts.month!,
    year: parts.year!,
    time: `${parts.hour}:${parts.minute}`,
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function toDate(value: string | Date): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Ngày dd/mm/yyyy theo giờ Việt Nam: "07/10/2026". */
export function formatDate(value: string | Date): string {
  const d = toDate(value);
  if (!d) return "—";
  const p = vnDateParts(d);
  return `${p.day}/${p.month}/${p.year}`;
}

/** Ngày + giờ 24h theo giờ Việt Nam: "07/10/2026 14:32". */
export function formatDateTime(value: string | Date): string {
  const d = toDate(value);
  if (!d) return "—";
  const p = vnDateParts(d);
  return `${p.day}/${p.month}/${p.year} ${p.time}`;
}

/**
 * Thời gian tương đối cho hoạt động (DESIGN-SYSTEM §12.8): "vừa xong", "5 phút trước", "3 giờ trước",
 * "hôm qua lúc 19:20", "4 ngày trước"; quá 7 ngày dùng ngày đầy đủ.
 */
export function formatRelativeTime(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return "vừa xong";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} phút trước`;

  const today = vnDateParts(now).dayKey;
  const that = vnDateParts(d);
  if (that.dayKey === today) return `${Math.floor(minutes / 60)} giờ trước`;
  const yesterday = vnDateParts(new Date(now.getTime() - 86_400_000)).dayKey;
  if (that.dayKey === yesterday) return `hôm qua lúc ${that.time}`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 7) return `${Math.max(days, 2)} ngày trước`;
  return formatDate(d);
}

/** Dung lượng tệp: "850 B", "120 KB", "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${integer.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${integer.format(Math.round(bytes / 1024))} KB`;
  return `${oneDecimal.format(bytes / (1024 * 1024))} MB`;
}

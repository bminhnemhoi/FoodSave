import { cn } from "@/lib/utils";

/**
 * Minh họa nét cho trạng thái rỗng/thành công (DESIGN-SYSTEM §2.6, §12.4): SVG nội tuyến, nét 2,5 theo
 * `currentColor` (mặc định `--role-accent` của cổng), mảng nền `--role-accent-soft`, điểm nhấn chấm nắng
 * `--brand-yellow` và chiếc lá của logo. Thuần trang trí (`aria-hidden`) — ý nghĩa nằm ở tiêu đề bên cạnh.
 */

type IllustrationProps = { className?: string };

const SOFT = { fill: "var(--role-accent-soft)" } as const;
const PAPER = { fill: "var(--surface)" } as const;
const SUN = { fill: "var(--brand-yellow)" } as const;

function Frame({ className, children }: IllustrationProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden
      focusable="false"
      className={cn("h-28 w-auto shrink-0 text-role-accent", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-illustration
    >
      <ellipse cx="80" cy="104" rx="54" ry="6.5" style={SOFT} stroke="none" />
      {children}
    </svg>
  );
}

/** Hai chiếc lá của logo, gốc tại (x, y), cao khoảng `s` × 28. */
function Sprout({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-1.5 0C-0.4-8.2-7.8-14.6-17-14.4c-.2 9.2 7.2 15.8 15.5 14.4Z" style={SOFT} />
      <path d="M1.5 0C12.4 1.8 21-9 20.2-21.8 7.4-20.6-2 -10.5 1.5 0Z" style={PAPER} />
      <path d="M4.2-3.6Q10.5-8.6 14.6-15.6" strokeWidth={2} />
    </g>
  );
}

/** Kho hàng trống: sọt rỗng, mầm lá mọc lên. */
export function EmptyInventoryIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <circle cx="46" cy="30" r="5.5" style={SUN} stroke="none" />
      <Sprout x={80} y={58} s={1.05} />
      <rect x="42" y="58" width="76" height="40" rx="6" style={PAPER} />
      <path d="M42 72h76M42 85h76" opacity={0.45} />
      <rect x="70" y="63" width="20" height="5" rx="2.5" style={SOFT} />
    </Frame>
  );
}

/** Chưa có yêu cầu: bảng kẹp trống, huy hiệu trái tim. */
export function NoRequestsIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <circle cx="40" cy="34" r="5.5" style={SUN} stroke="none" />
      <rect x="52" y="26" width="56" height="72" rx="7" style={PAPER} />
      <rect x="68" y="20" width="24" height="12" rx="4" style={SOFT} />
      <path d="M63 50h34M63 62h26M63 74h18" opacity={0.45} />
      <circle cx="108" cy="86" r="14" style={SOFT} />
      <path
        d="M108 93.5s-7.5-4.6-7.5-9.6a4 4 0 0 1 7.5-1.9 4 4 0 0 1 7.5 1.9c0 5-7.5 9.6-7.5 9.6Z"
        style={PAPER}
      />
    </Frame>
  );
}

/** Chưa có chuyến: tuyến đứt nét giữa hai điểm ghim. */
export function NoTripsIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <circle cx="36" cy="34" r="5.5" style={SUN} stroke="none" />
      <path d="M46 84C66 104 74 50 98 62s18-14 18-14" strokeDasharray="2 7" opacity={0.6} />
      <path d="M46 88s-13-12.5-13-22a13 13 0 0 1 26 0c0 9.5-13 22-13 22Z" style={PAPER} />
      <circle cx="46" cy="66" r="4.5" style={SOFT} />
      <path d="M116 56s-14-13.4-14-23.6a14 14 0 0 1 28 0C130 42.6 116 56 116 56Z" style={SOFT} />
      <Sprout x={116} y={38} s={0.42} />
    </Frame>
  );
}

/** Không có thông báo: chuông yên, mầm lá trên đỉnh. */
export function NoNotificationsIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <circle cx="44" cy="32" r="5.5" style={SUN} stroke="none" />
      <Sprout x={80} y={36} s={0.62} />
      <path d="M58 84V62a22 22 0 0 1 44 0v22l7 8H51Z" style={PAPER} />
      <path d="M72 92.5a8 8 0 0 0 16 0" />
      <path d="M118 48h8l-8 9h8M128 34h6l-6 7h6" strokeWidth={2} opacity={0.5} />
    </Frame>
  );
}

/** Bản đồ chưa có điểm: tấm bản đồ gấp, một ghim. */
export function MapEmptyIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <circle cx="128" cy="24" r="5.5" style={SUN} stroke="none" />
      <path d="M36 46l26-9 36 9 26-9v52l-26 9-36-9-26 9Z" style={PAPER} />
      <path d="M62 37v52M98 46v52" opacity={0.45} />
      <path d="M50 70c10-2 14 8 24 6s14-12 26-8" strokeDasharray="2 6" opacity={0.6} />
      <path d="M80 64s-13-12.6-13-22a13 13 0 0 1 26 0c0 9.4-13 22-13 22Z" style={SOFT} />
      <circle cx="80" cy="42" r="4.5" style={PAPER} />
    </Frame>
  );
}

/** Thành công: bát lá + dấu kiểm. */
export function SuccessIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <circle cx="44" cy="30" r="5.5" style={SUN} stroke="none" />
      <Sprout x={78} y={60} s={1.1} />
      <path d="M46 62h64c0 19-14 34-32 34S46 81 46 62Z" style={PAPER} />
      <path d="M42 62h72" />
      <circle cx="116" cy="40" r="13" fill="currentColor" stroke="none" />
      <path d="m110 40 4.5 4.5L123 36" style={{ stroke: "var(--surface)" }} strokeWidth={3} />
    </Frame>
  );
}

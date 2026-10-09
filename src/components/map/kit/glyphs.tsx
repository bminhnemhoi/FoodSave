import type { SVGProps } from "react";

/**
 * Hình minh họa nhỏ cho marker bản đồ (DESIGN-SYSTEM §13.2): SVG nội tuyến, lưới 24 × 24, nét ≥ 1,8 để rõ ở
 * 1× và 2×; màu lấy từ token (`var(--…)`), luôn `aria-hidden` — ý nghĩa nằm ở `aria-label` của marker và ở
 * chú giải. Không phụ thuộc MapLibre (dùng được cả trong chú giải, danh sách, trang thử).
 */

type GlyphProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Svg({ size = 24, viewBox = "0 0 24 24", ...props }: GlyphProps & { children: React.ReactNode }) {
  return <svg width={size} height={size} viewBox={viewBox} aria-hidden focusable="false" {...props} />;
}

const INK = "var(--ink)";
const SURFACE = "var(--surface)";

/** Tiệm có mái hiên sọc (cửa hàng). Đơn sắc mực/giấy — màu nhãn nằm ở vòng ngoài của marker. */
export function StoreGlyph(props: GlyphProps) {
  const scallop = "a2.125 2.125 0 0 1-4.25 0";
  return (
    <Svg {...props}>
      <path
        d="M5 10.5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"
        fill={SURFACE}
        stroke={INK}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M10 20.5v-4a2 2 0 0 1 4 0v4" fill="none" stroke={INK} strokeWidth={1.8} />
      <path d={`M5 3.5h3.5l-.75 4.5${scallop}Z`} fill={INK} />
      <path d={`M8.5 3.5H12V8${scallop}Z`} fill={SURFACE} />
      <path d={`M12 3.5h3.5l.75 4.5${scallop}Z`} fill={INK} />
      <path d={`M15.5 3.5H19l1.5 4.5${scallop}Z`} fill={SURFACE} />
      <path
        d={`M5 3.5h14l1.5 4.5${scallop}${scallop}${scallop}${scallop}Z`}
        fill="none"
        stroke={INK}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Mái nhà có trái tim (tổ chức từ thiện / điểm nhận). Tim màu `--role-accent-fill` của tổ chức (coral). */
export function HouseHeartGlyph(props: GlyphProps) {
  return (
    <Svg data-role="charity" {...props}>
      <path d="M5.5 10v10h13V10" fill={SURFACE} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <path
        d="M3 11.2 12 3.8l9 7.4"
        fill="none"
        stroke={INK}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 18.4s-3.9-2.3-3.9-5a2.05 2.05 0 0 1 3.9-.95 2.05 2.05 0 0 1 3.9.95c0 2.7-3.9 5-3.9 5Z"
        fill="var(--role-accent-fill)"
        stroke={INK}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Người đi xe máy (tình nguyện viên). */
export function ScooterGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx={11} cy={4.6} r={2.1} fill={INK} />
      <path
        d="M10.7 7.2 10 12.4h3.6l1.7 3.6M10.9 8.6l4.3 2"
        fill="none"
        stroke={INK}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.4 17.2a4 4 0 0 1 4-4h2.8l1.7 3.4h4.6l1.5-6.4h-2.4"
        fill="none"
        stroke={INK}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m17.6 10.6 1.4 6.9" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
      <circle cx={6.4} cy={18.4} r={2.4} fill={SURFACE} stroke={INK} strokeWidth={1.8} />
      <circle cx={18.6} cy={18.4} r={2.4} fill={SURFACE} stroke={INK} strokeWidth={1.8} />
    </Svg>
  );
}

/** Đường bao ghim giọt nước 32 × 42 (đầu tròn tâm 16;16, bán kính 13). */
export const PIN_ROUND = "M16 41c-1.4-2.3-13-15.3-13-24.5a13 13 0 0 1 26 0c0 9.2-11.6 22.2-13 24.5Z";
/** Ghim đầu vuông (tuyến thứ hai — khác hình, không chỉ khác màu). */
export const PIN_SQUARE =
  "M6 3h20a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3h-6.2L16 41l-3.8-12H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z";

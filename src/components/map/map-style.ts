import { clientEnv } from "@/lib/env.client";

/** Style tile Goong (key tile công khai, giới hạn domain); dự phòng OpenFreeMap (ADR-006). */
export function mapStyleUrl(useFallback: boolean): string {
  const key = clientEnv.NEXT_PUBLIC_GOONG_MAPTILES_KEY;
  if (!useFallback && key) return `https://tiles.goong.io/assets/goong_map_web.json?api_key=${key}`;
  return clientEnv.NEXT_PUBLIC_MAP_STYLE_FALLBACK;
}

/** Chuỗi giao diện MapLibre bằng tiếng Việt (DESIGN-SYSTEM §16 — không để lọt chữ tiếng Anh). */
export const MAP_LOCALE: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Bật/tắt thông tin nguồn bản đồ",
  "AttributionControl.MapFeedback": "Góp ý về bản đồ",
  "FullscreenControl.Enter": "Toàn màn hình",
  "FullscreenControl.Exit": "Thoát toàn màn hình",
  "GeolocateControl.FindMyLocation": "Tìm vị trí của tôi",
  "GeolocateControl.LocationNotAvailable": "Không có thông tin vị trí",
  "LogoControl.Title": "Logo MapLibre",
  "Map.Title": "Bản đồ",
  "Marker.Title": "Điểm trên bản đồ",
  "NavigationControl.ResetBearing": "Đặt lại hướng bắc",
  "NavigationControl.ZoomIn": "Phóng to",
  "NavigationControl.ZoomOut": "Thu nhỏ",
  "Popup.Close": "Đóng",
  "CooperativeGesturesHandler.WindowsHelpText": "Giữ Ctrl và cuộn chuột để phóng to/thu nhỏ bản đồ",
  "CooperativeGesturesHandler.MacHelpText": "Giữ ⌘ và cuộn chuột để phóng to/thu nhỏ bản đồ",
  "CooperativeGesturesHandler.MobileHelpText": "Dùng hai ngón tay để di chuyển bản đồ",
};

/** Đọc màu token CSS (MapLibre cần giá trị màu thật, không nhận `var(--x)`). */
export function cssColor(name: `--${string}`, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Người dùng bật giảm chuyển động ⇒ thay flyTo bằng jumpTo (DESIGN-SYSTEM §8). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

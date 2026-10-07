"use server";

import { streetPart } from "@/core/geo/address";
import { isInServiceArea } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { getUser } from "@/server/auth/session";
import { getMapsProvider } from "@/server/providers/maps";
import { HCMC_CENTER } from "@/server/providers/maps/goong";
import type { GeocodeResult } from "@/server/providers/maps/types";
import { ProviderError } from "@/server/providers/types";

import {
  latLngSchema,
  OUTSIDE_SERVICE_AREA_MESSAGE,
  resolvePlaceSchema,
  SEARCH_MIN_CHARS,
  searchPlacesSchema,
  type LocationActionResult,
  type PlaceSuggestion,
  type ResolvedPlace,
} from "./schemas";

/**
 * Server Action bản đồ cho LocationPicker (ADR-006). Key REST của provider không bao giờ ra trình duyệt;
 * chỉ người đã đăng nhập được gọi (chặn tiêu tốn quota). KHÔNG geocode chữ tự do: chỉ gợi ý có ưu tiên
 * vị trí → place detail → ghim → reverse geocode.
 */

const MAX_SUGGESTIONS = 8;

type Op = "search" | "resolve" | "reverse";

function providerErrorMessage(err: unknown, op: Op): string {
  if (err instanceof ProviderError) {
    console.error("[locations] provider error", { op, provider: err.provider, kind: err.kind });
    switch (err.kind) {
      case "timeout":
      case "unavailable":
        return "Dịch vụ bản đồ đang chậm hoặc tạm gián đoạn. Vui lòng thử lại sau ít giây, hoặc ghim trực tiếp trên bản đồ.";
      case "rate_limited":
        return "Bạn tìm hơi nhanh. Vui lòng đợi vài giây rồi thử lại.";
      case "unauthorized":
        return "Dịch vụ tìm địa chỉ tạm thời không khả dụng. Bạn vẫn có thể ghim trực tiếp trên bản đồ và nhập địa chỉ.";
      default:
        return op === "reverse"
          ? "Không xác định được địa chỉ tại điểm này. Bạn có thể nhập địa chỉ thủ công."
          : "Không xử lý được yêu cầu tìm địa chỉ. Vui lòng thử từ khóa khác.";
    }
  }
  console.error("[locations] unexpected error", { op, error: err instanceof Error ? err.name : typeof err });
  return "Đã có lỗi phía FoodSave khi tìm địa chỉ. Vui lòng thử lại.";
}

async function requireSignedIn(): Promise<{ ok: false; error: string } | null> {
  const user = await getUser();
  return user ? null : { ok: false, error: "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại để tìm địa chỉ." };
}

function toResolved(r: GeocodeResult): ResolvedPlace {
  const ward = r.ward?.trim() || null;
  const city = r.city?.trim() || null;
  return {
    lat: r.location.lat,
    lng: r.location.lng,
    label: r.label,
    addressLine: streetPart(r.label, ward, city),
    ward,
    city,
  };
}

/** Gợi ý địa chỉ (debounce phía client). `bias` ngoài vùng phục vụ ⇒ dùng tâm TP.HCM. */
export async function searchPlaces(
  input: string,
  sessionToken: string,
  bias?: LatLng | null,
): Promise<LocationActionResult<PlaceSuggestion[]>> {
  if (typeof input === "string" && input.trim().length < SEARCH_MIN_CHARS) return { ok: true, data: [] };
  const parsed = searchPlacesSchema.safeParse({ input, sessionToken, bias: bias ?? undefined });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Từ khóa tìm kiếm không hợp lệ." };
  }
  const denied = await requireSignedIn();
  if (denied) return denied;

  const { bias: requestedBias } = parsed.data;
  const effectiveBias = requestedBias && isInServiceArea(requestedBias) ? requestedBias : HCMC_CENTER;
  try {
    const list = await getMapsProvider().autocomplete(parsed.data.input, {
      sessionToken: parsed.data.sessionToken,
      bias: effectiveBias,
    });
    return {
      ok: true,
      data: list.slice(0, MAX_SUGGESTIONS).map((s) => ({
        id: s.id,
        mainText: s.mainText,
        secondaryText: s.secondaryText,
        distanceM: s.distanceM,
      })),
    };
  } catch (err) {
    return { ok: false, error: providerErrorMessage(err, "search") };
  }
}

/** Đổi gợi ý đã chọn thành toạ độ (place detail). Cùng `sessionToken` với lượt gợi ý. */
export async function resolvePlace(
  id: string,
  sessionToken: string,
): Promise<LocationActionResult<ResolvedPlace>> {
  const parsed = resolvePlaceSchema.safeParse({ id, sessionToken });
  if (!parsed.success) return { ok: false, error: "Gợi ý địa chỉ không hợp lệ. Vui lòng tìm lại." };
  const denied = await requireSignedIn();
  if (denied) return denied;
  try {
    const r = await getMapsProvider().resolveSuggestion(parsed.data.id, {
      sessionToken: parsed.data.sessionToken,
    });
    return { ok: true, data: toResolved(r) };
  } catch (err) {
    return { ok: false, error: providerErrorMessage(err, "resolve") };
  }
}

/** Reverse geocode điểm ghim để điền phường/xã và địa chỉ. `null` = provider không có kết quả. */
export async function reverseLookup(
  lat: number,
  lng: number,
): Promise<LocationActionResult<ResolvedPlace | null>> {
  const parsed = latLngSchema.safeParse({ lat, lng });
  if (!parsed.success) return { ok: false, error: "Toạ độ không hợp lệ." };
  if (!isInServiceArea(parsed.data)) return { ok: false, error: OUTSIDE_SERVICE_AREA_MESSAGE };
  const denied = await requireSignedIn();
  if (denied) return denied;
  try {
    const r = await getMapsProvider().reverseGeocode(parsed.data);
    // Ghim là nguồn sự thật: giữ toạ độ người dùng chọn, chỉ lấy địa chỉ từ provider
    return { ok: true, data: r ? { ...toResolved(r), lat: parsed.data.lat, lng: parsed.data.lng } : null };
  } catch (err) {
    return { ok: false, error: providerErrorMessage(err, "reverse") };
  }
}

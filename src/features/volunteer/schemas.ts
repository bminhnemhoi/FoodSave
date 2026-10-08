import { z } from "zod";

import { SERVICE_AREA_BBOX } from "@/core/geo/service-area";

/**
 * Schema zod dùng chung client/server cho Server Action của tình nguyện viên (DATA-MODEL §8.2, §8.5).
 * Giới hạn độ dài khớp RPC: lý do từ chối/bỏ qua ≤ 300, lý do check-in ≤ 200, mô tả sự cố 10–2000.
 */

const uuid = z.uuid();
const reason = (max: number) =>
  z.string().trim().min(1, "Vui lòng chọn hoặc ghi lý do.").max(max, `Lý do tối đa ${max} ký tự.`);

export const respondSchema = z.discriminatedUnion("accept", [
  z.object({ pickupId: uuid, accept: z.literal(true), clientOpId: uuid }),
  z.object({ pickupId: uuid, accept: z.literal(false), reason: reason(300), clientOpId: uuid }),
]);

export const startSchema = z.object({ pickupId: uuid, clientOpId: uuid });

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const checkInSchema = z.object({
  pickupId: uuid,
  stopId: uuid,
  /** Không có toạ độ ⇒ check-in thủ công `no_location`. */
  position: z.object({ lat, lng }).nullable(),
  reason: reason(200).nullable(),
  clientOpId: uuid,
});

export const skipSchema = z.object({ pickupId: uuid, stopId: uuid, reason: reason(300), clientOpId: uuid });

export const incidentSchema = z.object({
  pickupId: uuid,
  kind: z.enum(["quantity_dispute", "quality", "food_safety", "no_show", "conduct", "privacy", "other"]),
  description: z
    .string()
    .trim()
    .min(10, "Mô tả ít nhất 10 ký tự để điều phối viên hiểu chuyện gì xảy ra.")
    .max(2000, "Mô tả tối đa 2.000 ký tự."),
  /** Sự cố tại một điểm lấy hàng: gắn phân bổ đầu tiên của điểm để biết cửa hàng liên quan. */
  allocationId: uuid.nullable(),
  /** "Cửa hàng không giao được" ⇒ bỏ qua điểm này luôn (US-VOL-13 AC1). */
  skipStopId: uuid.nullable(),
  clientOpId: uuid,
  /** `client_op_id` riêng cho `skip_stop` đi kèm (một ý định, hai RPC). */
  skipOpId: uuid.nullable(),
});

export const consentSchema = z.object({ source: z.enum(["web", "pwa"]) });

const PHONE_RE = /^\+?[0-9]{9,15}$/;

/** Form hồ sơ (chuỗi thô từ ô nhập) — chuẩn hóa ở `toProfilePayload`. */
export const profileFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Vui lòng nhập tên hiển thị (ít nhất 2 ký tự).")
    .max(120, "Tên tối đa 120 ký tự."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .refine((v) => v === "" || PHONE_RE.test(v), "Số điện thoại gồm 9–15 chữ số, ví dụ 0901 234 567."),
  vehicle: z.enum(["motorbike", "bicycle", "car", "on_foot"], { error: "Vui lòng chọn phương tiện." }),
  capacityKg: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập sức chở.")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((n) => Number.isFinite(n) && n >= 1 && n <= 500, "Sức chở từ 1 đến 500 kg."),
  area: z
    .object({ lat, lng })
    .nullable()
    .refine(
      (p) =>
        !p ||
        (p.lng >= SERVICE_AREA_BBOX.minLng &&
          p.lng <= SERVICE_AREA_BBOX.maxLng &&
          p.lat >= SERVICE_AREA_BBOX.minLat &&
          p.lat <= SERVICE_AREA_BBOX.maxLat),
      "Khu vực nằm ngoài vùng FoodSave đang hoạt động (TP.HCM).",
    ),
  areaLabel: z.string().trim().max(120, "Tên khu vực tối đa 120 ký tự."),
  availabilityNote: z.string().trim().max(300, "Ghi chú tối đa 300 ký tự."),
});

export type ProfileFormInput = z.input<typeof profileFormSchema>;
export type ProfileFormValues = z.output<typeof profileFormSchema>;

/** Làm tròn khu vực về ô 0,01° (~1,1 km) ngay trên máy — DB cũng làm tròn lại bằng trigger. */
export function snapArea(p: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

/** `p_payload` của `upsert_volunteer_profile` (khóa đủ ⇒ ghi đè, khu vực rỗng ⇒ xóa). */
export function toProfilePayload(v: ProfileFormValues) {
  const area = v.area ? snapArea(v.area) : null;
  return {
    vehicle: v.vehicle,
    capacity_kg: Math.round(v.capacityKg * 10) / 10,
    lat: area?.lat ?? null,
    lng: area?.lng ?? null,
    base_area_label: v.areaLabel === "" ? null : v.areaLabel,
    availability_note: v.availabilityNote === "" ? null : v.availabilityNote,
  };
}

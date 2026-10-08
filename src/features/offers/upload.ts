"use client";

import { newUuid } from "@/lib/hash";
import { reencodeImage } from "@/lib/image/reencode";
import { classifyUpload, extForMime, MB, UPLOAD_MESSAGES } from "@/lib/image/resize";
import { createClient } from "@/lib/supabase/client";

/**
 * Ảnh lô tặng (bucket `media` public — DATA-MODEL §10, policy `media_insert` = `private.can_write_media`:
 * owner/manager/staff của cửa hàng đã duyệt, đường dẫn `org/{org_id}/offer/{uuid}.{ext}`).
 * Ảnh LUÔN được mã hóa lại qua canvas trước khi rời máy (xóa EXIF/GPS — SECURITY-PRIVACY C13).
 */

export const OFFER_PHOTO_MAX_BYTES = 5 * MB;
export const OFFER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export type PreparedPhoto = { blob: Blob; previewUrl: string };
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** Kiểm loại/dung lượng rồi mã hóa lại ≤ 1600 px để tải lên. */
export async function preparePhoto(file: File): Promise<Outcome<PreparedPhoto>> {
  const cls = classifyUpload(file, OFFER_PHOTO_MAX_BYTES);
  if (!cls.ok) return cls;
  if (cls.kind !== "image") return { ok: false, error: "Ảnh lô cần là JPG, PNG hoặc WebP." };
  let blob: Blob;
  try {
    blob = await reencodeImage(file, { maxEdge: 1600 });
  } catch {
    return { ok: false, error: UPLOAD_MESSAGES.decode };
  }
  if (blob.size > OFFER_PHOTO_MAX_BYTES)
    return { ok: false, error: "Ảnh lớn hơn 5 MB sau khi nén. Vui lòng chọn ảnh khác." };
  return { ok: true, value: { blob, previewUrl: URL.createObjectURL(blob) } };
}

/** Bản nhỏ (≤ 1024 px, base64) gửi cho AI — cũng đã xóa EXIF/GPS. */
export async function photoForAi(
  file: Blob,
): Promise<Outcome<{ mediaType: "image/webp" | "image/jpeg"; base64: string }>> {
  try {
    const small = await reencodeImage(file, { maxEdge: 1024, quality: 0.8 });
    const bytes = new Uint8Array(await small.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const mediaType = small.type === "image/webp" ? "image/webp" : "image/jpeg";
    return { ok: true, value: { mediaType, base64: btoa(binary) } };
  } catch {
    return { ok: false, error: UPLOAD_MESSAGES.decode };
  }
}

function storageMessage(err: { message?: string; statusCode?: string | number } | null): string {
  const msg = (err?.message ?? "").toLowerCase();
  const status = String(err?.statusCode ?? "");
  if (msg.includes("row-level security") || status === "403" || msg.includes("unauthorized"))
    return "FoodSave chưa nhận ảnh này: tài khoản của bạn chưa có quyền đăng lô cho cửa hàng. Hãy tải lại trang.";
  if (msg.includes("maximum") || msg.includes("too large") || status === "413")
    return "Ảnh lớn hơn 5 MB. Vui lòng chọn ảnh nhỏ hơn.";
  if (msg.includes("mime") || status === "415") return "Ảnh lô cần là JPG, PNG hoặc WebP.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.";
  return "Chưa tải được ảnh lên. Vui lòng thử lại.";
}

/** Tải ảnh đã mã hóa lại lên `media`; trả đường dẫn để ghi vào `offers.photo_paths`. */
export async function uploadOfferPhoto(orgId: string, blob: Blob): Promise<Outcome<string>> {
  const ext = extForMime(blob.type === "image/webp" ? "image/webp" : "image/jpeg");
  const path = `org/${orgId}/offer/${newUuid()}.${ext}`;
  const up = await createClient()
    .storage.from("media")
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (up.error)
    return { ok: false, error: storageMessage(up.error as { message?: string; statusCode?: string }) };
  return { ok: true, value: path };
}

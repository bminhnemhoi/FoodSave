/**
 * Phần thuần của bước mã hóa lại ảnh/kiểm tệp tải lên (SECURITY-PRIVACY C7, C13) — không DOM, có unit test.
 * Phần dùng canvas nằm ở `reencode.ts`.
 */

/** Cạnh dài tối đa sau khi mã hóa lại (giấy tờ vẫn đọc rõ, file nhỏ). */
export const IMAGE_MAX_EDGE = 2000;
export const IMAGE_QUALITY = 0.85;

export const MB = 1024 * 1024;
/** Trần của bucket `kyc` (DATA-MODEL §10). */
export const KYC_MAX_BYTES = 10 * MB;
/** Ảnh gốc từ điện thoại có thể lớn; chỉ nhận tới mức này trước khi nén. */
export const IMAGE_INPUT_MAX_BYTES = 30 * MB;

export const KYC_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const KYC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export const UPLOAD_MESSAGES = {
  type: "Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF.",
  tooLarge: "Tệp lớn hơn 10 MB. Vui lòng chọn tệp nhỏ hơn.",
  imageTooLarge: "Ảnh quá lớn (trên 30 MB). Vui lòng chụp lại hoặc chọn ảnh nhỏ hơn.",
  empty: "Tệp rỗng. Vui lòng chọn tệp khác.",
  notPdf: "Tệp không phải PDF hợp lệ. Vui lòng xuất lại PDF hoặc chụp ảnh giấy tờ.",
  decode: "Không đọc được ảnh này. Vui lòng chọn ảnh JPG hoặc PNG khác.",
} as const;

/** Thu nhỏ (không phóng to) để cạnh dài ≤ maxEdge, giữ tỷ lệ, kích thước nguyên ≥ 1. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = IMAGE_MAX_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new RangeError("Kích thước ảnh không hợp lệ");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** MIME khai báo, hoặc suy từ đuôi tệp khi trình duyệt để trống. */
export function detectMime(file: { type: string; name: string }): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "";
}

export type UploadKind = "image" | "pdf";

/** Kiểm loại và dung lượng trước khi xử lý. */
export function classifyUpload(
  file: { type: string; name: string; size: number },
  maxBytes = KYC_MAX_BYTES,
): { ok: true; kind: UploadKind; mime: string } | { ok: false; error: string } {
  const mime = detectMime(file);
  if (file.size <= 0) return { ok: false, error: UPLOAD_MESSAGES.empty };
  if (mime === "application/pdf") {
    return file.size <= maxBytes
      ? { ok: true, kind: "pdf", mime }
      : { ok: false, error: UPLOAD_MESSAGES.tooLarge };
  }
  if ((KYC_IMAGE_TYPES as readonly string[]).includes(mime)) {
    return file.size <= IMAGE_INPUT_MAX_BYTES
      ? { ok: true, kind: "image", mime }
      : { ok: false, error: UPLOAD_MESSAGES.imageTooLarge };
  }
  return { ok: false, error: UPLOAD_MESSAGES.type };
}

/** PDF thật bắt đầu bằng "%PDF-" (chặn tệp đổi đuôi). */
export function isPdfSignature(bytes: Uint8Array): boolean {
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
}

/** Đuôi tệp lưu trữ theo MIME (tên tệp luôn là UUID — không lộ tên gốc). */
export function extForMime(mime: string): "pdf" | "jpg" | "png" | "webp" {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      throw new Error(`MIME không hỗ trợ: ${mime}`);
  }
}

/** "1,2 MB" · "245 KB". */
export function formatFileSize(bytes: number): string {
  const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${nf.format(Math.round(bytes / 1024))} KB`;
  return `${nf.format(bytes / MB)} MB`;
}

import { fitWithin, IMAGE_MAX_EDGE, IMAGE_QUALITY } from "./resize";

/**
 * Mã hóa lại ảnh qua canvas để xóa EXIF/GPS/XMP (SECURITY-PRIVACY C13): `createImageBitmap` (xoay đúng
 * theo EXIF) → vẽ lên canvas ≤ 2000 px → WebP 0,85 (trình duyệt không xuất được WebP ⇒ JPEG 0,85, nền trắng).
 * Chỉ chạy trên trình duyệt. Ảnh đầu ra chỉ còn điểm ảnh, không còn metadata.
 */

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(width, height);
    return {
      ctx: c.getContext("2d") as Canvas2D | null,
      toBlob: (type: string, quality: number) => c.convertToBlob({ type, quality }),
    };
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return {
    ctx: c.getContext("2d") as Canvas2D | null,
    toBlob: (type: string, quality: number) =>
      new Promise<Blob>((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob trả về null"))), type, quality),
      ),
  };
}

async function draw(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob> {
  const { ctx, toBlob } = makeCanvas(width, height);
  if (!ctx) throw new Error("Không tạo được canvas 2D");
  if (type === "image/jpeg") {
    // JPEG không có kênh trong suốt: phủ nền trắng để vùng trong suốt không thành màu đen
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  return toBlob(type, quality);
}

export async function reencodeImage(
  file: Blob,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<Blob> {
  const maxEdge = opts.maxEdge ?? IMAGE_MAX_EDGE;
  const quality = opts.quality ?? IMAGE_QUALITY;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const webp = await draw(bitmap, width, height, "image/webp", quality);
    // Safari cũ không mã hóa được WebP và trả PNG ⇒ dùng JPEG
    if (webp.type === "image/webp") return webp;
    return await draw(bitmap, width, height, "image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}

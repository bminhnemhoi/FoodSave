"use client";

import { sha256Hex, newUuid } from "@/lib/hash";
import { reencodeImage } from "@/lib/image/reencode";
import {
  classifyUpload,
  extForMime,
  isPdfSignature,
  KYC_MAX_BYTES,
  MB,
  UPLOAD_MESSAGES,
} from "@/lib/image/resize";
import { createClient } from "@/lib/supabase/client";

import { kycObjectPath, logoObjectPath, uploadedFileName } from "./documents";
import { mapDbError, mapStorageError } from "./errors";
import type { DocType } from "./options";
import type { WizardDocument } from "./queries";

/**
 * Tải giấy tờ KYC từ TRÌNH DUYỆT bằng client của người dùng (ARCHITECTURE §5: tránh giới hạn body của
 * Server Action; policy `kyc_insert` kiểm owner/manager, trạng thái, tên UUID, 20 tệp/giờ):
 * ảnh ⇒ mã hóa lại qua canvas (xóa EXIF/GPS, ≤ 2000 px, WebP/JPEG 0,85); PDF ⇒ kiểm chữ ký "%PDF-" và ≤ 10 MB;
 * rồi ghi metadata vào `org_documents` (grant cột §9.4). Ghi metadata lỗi ⇒ xóa tệp vừa tải.
 */

export type UploadOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

async function prepare(
  file: File,
  imageMaxEdge?: number,
): Promise<UploadOutcome<{ blob: Blob; mime: string }>> {
  const cls = classifyUpload(file);
  if (!cls.ok) return { ok: false, error: cls.error };
  if (cls.kind === "pdf") {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (!isPdfSignature(head)) return { ok: false, error: UPLOAD_MESSAGES.notPdf };
    return { ok: true, value: { blob: file, mime: "application/pdf" } };
  }
  let blob: Blob;
  try {
    blob = await reencodeImage(file, imageMaxEdge ? { maxEdge: imageMaxEdge } : {});
  } catch {
    return { ok: false, error: UPLOAD_MESSAGES.decode };
  }
  if (blob.size > KYC_MAX_BYTES) return { ok: false, error: UPLOAD_MESSAGES.tooLarge };
  return { ok: true, value: { blob, mime: blob.type } };
}

export async function uploadKycDocument(opts: {
  orgId: string;
  docType: DocType;
  file: File;
}): Promise<UploadOutcome<WizardDocument>> {
  const prepared = await prepare(opts.file);
  if (!prepared.ok) return prepared;
  const { blob, mime } = prepared.value;

  const sha256 = await sha256Hex(await blob.arrayBuffer());
  const path = kycObjectPath(opts.orgId, opts.docType, newUuid(), extForMime(mime));
  const supabase = createClient();

  const up = await supabase.storage.from("kyc").upload(path, blob, { contentType: mime, upsert: false });
  if (up.error)
    return { ok: false, error: mapStorageError(up.error as { message?: string; statusCode?: string }) };

  const ins = await supabase
    .from("org_documents")
    .insert({
      org_id: opts.orgId,
      doc_type: opts.docType,
      storage_path: path,
      mime_type: mime,
      size_bytes: blob.size,
      sha256,
    })
    .select("id, doc_type, mime_type, size_bytes, uploaded_at, storage_path")
    .single();
  if (ins.error) {
    await supabase.storage.from("kyc").remove([path]);
    return { ok: false, error: mapDbError(ins.error).message };
  }
  return {
    ok: true,
    value: {
      id: ins.data.id,
      docType: ins.data.doc_type,
      mimeType: ins.data.mime_type,
      sizeBytes: ins.data.size_bytes,
      uploadedAt: ins.data.uploaded_at,
      storagePath: ins.data.storage_path,
      fileName: uploadedFileName(opts.file.name),
    },
  };
}

/** Logo công khai (bucket `media`, policy `media_insert`): luôn là ảnh, mã hóa lại ≤ 512 px. */
export async function uploadLogo(opts: { orgId: string; file: File }): Promise<UploadOutcome<string>> {
  const cls = classifyUpload(opts.file, 5 * MB);
  if (!cls.ok) return cls;
  if (cls.kind !== "image") return { ok: false, error: "Logo cần là ảnh JPG, PNG hoặc WebP." };
  const prepared = await prepare(opts.file, 512);
  if (!prepared.ok) return prepared;
  const { blob, mime } = prepared.value;
  const ext = extForMime(mime);
  if (ext === "pdf") return { ok: false, error: UPLOAD_MESSAGES.type };
  const path = logoObjectPath(opts.orgId, newUuid(), ext);
  const up = await createClient()
    .storage.from("media")
    .upload(path, blob, { contentType: mime, upsert: false });
  if (up.error)
    return { ok: false, error: mapStorageError(up.error as { message?: string; statusCode?: string }) };
  return { ok: true, value: path };
}

export function publicMediaUrl(path: string): string {
  return createClient().storage.from("media").getPublicUrl(path).data.publicUrl;
}

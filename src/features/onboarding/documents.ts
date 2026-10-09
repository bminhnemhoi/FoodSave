import type { DocType } from "./options";

/**
 * Quy ước đường dẫn Storage (DATA-MODEL §10) — thuần, có unit test.
 * - `kyc` (private): `{org_id}/{doc_type}/{uuid}.{ext}`
 * - `media` (public): `org/{org_id}/logo/{uuid}.{ext}`
 * Tên tệp luôn là UUID mới (không lộ tên gốc).
 */

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function kycObjectPath(orgId: string, docType: DocType, fileId: string, ext: string): string {
  return `${orgId}/${docType}/${fileId}.${ext}`;
}

export function logoObjectPath(orgId: string, fileId: string, ext: "webp" | "jpg" | "png"): string {
  return `org/${orgId}/logo/${fileId}.${ext}`;
}

/** Logo thuộc đúng thư mục của tổ chức (server kiểm trước khi ghi `organizations.logo_path`). */
export function isOrgLogoPath(orgId: string, path: string): boolean {
  return new RegExp(`^org/${orgId}/logo/${UUID_RE}\\.(webp|jpg|png)$`, "i").test(path);
}

/**
 * Tên tệp người dùng vừa chọn, để hiện ngay sau khi tải lên (UAT 09/10 m1). Chỉ giữ trong bộ nhớ trình duyệt:
 * DB và Storage không lưu tên gốc (DATA-MODEL §10). Bỏ ký tự điều khiển và phần đường dẫn, tối đa 200 ký tự.
 */
export function uploadedFileName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, 200) : null;
}

/**
 * Nhãn của tệp đã lưu khi không còn tên gốc (mở lại wizard): "Tệp 3f2a1b7c.pdf" — 8 ký tự đầu của UUID
 * trong đường dẫn `{org_id}/{doc_type}/{uuid}.{ext}`, không lộ thư mục hay mã tổ chức.
 */
export function storedFileLabel(path: string): string {
  const m = /([0-9a-f]{8})[0-9a-f-]*\.([a-z0-9]{2,5})$/i.exec(path);
  return m ? `Tệp ${m[1]!.toLowerCase()}.${m[2]!.toLowerCase()}` : "Tệp đã tải lên";
}

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

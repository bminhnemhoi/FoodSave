import { DOC_SLOTS, type DocType, type OrgKind } from "./options";
import {
  basicsFields,
  EMPTY_BASICS,
  EMPTY_LEGAL,
  isComplete,
  legalFields,
  type BasicsForm,
  type LegalForm,
} from "./schemas";

/**
 * Các bước wizard và tiến độ (thuần, có unit test). Bước mở lại khi quay về = bước đầu tiên chưa xong
 * (US-STO-01 AC1: đóng trình duyệt ở bước 2 ⇒ mở lại đúng bước 2).
 */

export const STEP_KEYS = ["basics", "location", "legal", "documents", "review"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export function isStepKey(v: unknown): v is StepKey {
  return typeof v === "string" && (STEP_KEYS as readonly string[]).includes(v);
}

const STEP_TITLES: Record<OrgKind, Record<StepKey, string>> = {
  store: {
    basics: "Thông tin cơ bản",
    location: "Địa điểm & giờ mở cửa",
    legal: "Pháp lý & người đại diện",
    documents: "Giấy tờ",
    review: "Cam kết & gửi duyệt",
  },
  charity: {
    basics: "Thông tin cơ bản",
    location: "Điểm nhận hàng",
    legal: "Pháp lý & người đại diện",
    documents: "Giấy tờ",
    review: "Cam kết & gửi duyệt",
  },
};

export function stepTitle(kind: OrgKind, step: StepKey): string {
  return STEP_TITLES[kind][step];
}

export function stepIndex(step: StepKey): number {
  return STEP_KEYS.indexOf(step);
}

export function nextStep(step: StepKey): StepKey | null {
  return STEP_KEYS[stepIndex(step) + 1] ?? null;
}

export function prevStep(step: StepKey): StepKey | null {
  const i = stepIndex(step);
  return i > 0 ? STEP_KEYS[i - 1]! : null;
}

/** Ảnh chụp dữ liệu đã lưu (từ server) đủ để tính tiến độ. */
export type ProgressSnapshot = {
  hasOrg: boolean;
  /** Giá trị bước 1 dạng form (chuỗi). */
  basics: Record<string, unknown>;
  /** Giá trị bước 3 dạng form (chuỗi). */
  legal: Record<string, unknown>;
  hasSite: boolean;
  documentTypes: readonly DocType[];
};

/** Ảnh chụp tiến độ từ dữ liệu wizard (server hoặc client). */
export function snapshotOf(data: {
  org: { basics: BasicsForm; legal: LegalForm } | null;
  site: unknown;
  documents: readonly { docType: DocType }[];
}): ProgressSnapshot {
  return {
    hasOrg: data.org !== null,
    basics: data.org?.basics ?? EMPTY_BASICS,
    legal: data.org?.legal ?? EMPTY_LEGAL,
    hasSite: data.site !== null,
    documentTypes: data.documents.map((d) => d.docType),
  };
}

/** Giấy tờ bắt buộc đã đủ chưa (khớp điều kiện của `submit_organization`). */
export function documentsComplete(kind: OrgKind, types: readonly DocType[]): boolean {
  const slots = DOC_SLOTS[kind];
  const required = slots.filter((s) => s.requirement === "required");
  const oneOf = slots.filter((s) => s.requirement === "one_of");
  return (
    required.every((s) => types.includes(s.type)) &&
    (oneOf.length === 0 || oneOf.some((s) => types.includes(s.type)))
  );
}

export function stepComplete(kind: OrgKind, step: StepKey, s: ProgressSnapshot): boolean {
  if (!s.hasOrg) return false;
  switch (step) {
    case "basics":
      return isComplete(basicsFields(kind), s.basics);
    case "location":
      return s.hasSite;
    case "legal":
      return isComplete(legalFields(kind), s.legal);
    case "documents":
      return documentsComplete(kind, s.documentTypes);
    case "review":
      return false;
  }
}

export type StepState = { key: StepKey; title: string; complete: boolean };

export function computeProgress(kind: OrgKind, s: ProgressSnapshot): StepState[] {
  return STEP_KEYS.map((key) => ({ key, title: stepTitle(kind, key), complete: stepComplete(kind, key, s) }));
}

/** Bước đầu tiên chưa xong; xong hết ⇒ bước gửi duyệt. */
export function resumeStep(kind: OrgKind, s: ProgressSnapshot): StepKey {
  return STEP_KEYS.find((k) => k !== "review" && !stepComplete(kind, k, s)) ?? "review";
}

/** Các bước còn thiếu trước khi gửi duyệt (bước xem lại hiển thị kèm liên kết "Sửa"). */
export function missingSteps(kind: OrgKind, s: ProgressSnapshot): StepState[] {
  return computeProgress(kind, s).filter((st) => st.key !== "review" && !st.complete);
}

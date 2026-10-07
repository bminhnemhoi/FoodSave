"use client";

import { createContext, useContext } from "react";

import type { OrgKind } from "../options";
import type { StepKey } from "../progress";
import type { WizardData } from "../queries";

export type WizardContextValue = {
  kind: OrgKind;
  step: StepKey;
  data: WizardData;
  /** Email tài khoản (điền sẵn email liên hệ khi tạo nháp). */
  accountEmail: string | null;
  /** Id tổ chức nháp — có ngay sau lần lưu đầu tiên ở bước 1. */
  orgId: string | null;
  setOrgId: (id: string) => void;
  /** Bước hiện tại đăng ký hàm kiểm tra chạy khi bấm "Tiếp tục" (trả `false` để ở lại). */
  setValidator: (fn: (() => Promise<boolean> | boolean) | null) => void;
  /** Bước hiện tại báo đã đủ thông tin bắt buộc (cập nhật thanh tiến độ). */
  reportComplete: (complete: boolean) => void;
  /** Lưu hết rồi chuyển tới đường dẫn (bước khác, trang trạng thái…). */
  navigate: (href: string) => Promise<void>;
};

export const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard phải nằm trong WizardShell");
  return ctx;
}

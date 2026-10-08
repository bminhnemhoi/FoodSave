import type { Metadata } from "next";

import { OrgSettingsPage } from "@/features/org-settings/components/settings-page";
import { parseSettingsTab } from "@/features/org-settings/schemas";

export const metadata: Metadata = { title: "Cài đặt — Cửa hàng" };

/** Cài đặt cửa hàng (P1-06, F-10): hồ sơ, chi nhánh & giờ, nhân viên, tạm ngưng — tab theo `?tab=`. */
export default async function StoreSettingsPage(props: PageProps<"/store/settings">) {
  const { tab } = await props.searchParams;
  return <OrgSettingsPage kind="store" tab={parseSettingsTab(tab)} />;
}

import type { Metadata } from "next";

import { OrgSettingsPage } from "@/features/org-settings/components/settings-page";
import { parseSettingsTab } from "@/features/org-settings/schemas";

export const metadata: Metadata = { title: "Cài đặt — Tổ chức" };

/** Cài đặt tổ chức (P1-06, F-11): hồ sơ, điểm nhận & giờ, thành viên, tạm ngưng — tab theo `?tab=`. */
export default async function CharitySettingsPage(props: PageProps<"/charity/settings">) {
  const { tab } = await props.searchParams;
  return <OrgSettingsPage kind="charity" tab={parseSettingsTab(tab)} />;
}

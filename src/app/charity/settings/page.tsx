import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Cài đặt — Tổ chức" };

export default async function CharitySettingsPage() {
  await requirePortal("charity");
  return <PhasePlaceholder role="charity" href="/charity/settings" />;
}

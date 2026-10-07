import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Cấu hình — Admin" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/settings" />;
}

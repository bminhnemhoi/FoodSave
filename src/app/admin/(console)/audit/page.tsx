import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Nhật ký — Admin" };

export default async function AdminAuditPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/audit" />;
}

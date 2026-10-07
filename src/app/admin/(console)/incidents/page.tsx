import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Phản ánh — Admin" };

export default async function AdminIncidentsPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/incidents" />;
}

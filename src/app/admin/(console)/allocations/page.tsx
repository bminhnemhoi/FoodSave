import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Phân bổ — Admin" };

export default async function AdminAllocationsPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/allocations" />;
}

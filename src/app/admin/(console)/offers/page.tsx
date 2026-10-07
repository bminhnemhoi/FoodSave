import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Lô hàng — Admin" };

export default async function AdminOffersPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/offers" />;
}

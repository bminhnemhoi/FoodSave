import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Hàng đợi duyệt — Admin" };

export default async function AdminReviewsPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/reviews" />;
}

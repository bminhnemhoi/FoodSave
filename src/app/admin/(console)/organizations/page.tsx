import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tổ chức — Admin" };

export default async function AdminOrganizationsPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/organizations" />;
}

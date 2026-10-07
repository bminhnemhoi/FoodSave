import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Minh chứng — Admin" };

export default async function AdminProofsPage() {
  await requireAdmin();
  return <PhasePlaceholder role="admin" href="/admin/proofs" />;
}

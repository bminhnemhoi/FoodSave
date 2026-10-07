import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Minh chứng — Tổ chức" };

export default async function CharityProofsPage() {
  await requirePortal("charity");
  return <PhasePlaceholder role="charity" href="/charity/proofs" />;
}

import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "ESG — Tổ chức" };

export default async function CharityEsgPage() {
  await requirePortal("charity");
  return <PhasePlaceholder role="charity" href="/charity/esg" />;
}

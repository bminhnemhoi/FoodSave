import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tình nguyện viên — Tổ chức" };

export default async function CharityVolunteersPage() {
  await requirePortal("charity");
  return <PhasePlaceholder role="charity" href="/charity/volunteers" />;
}

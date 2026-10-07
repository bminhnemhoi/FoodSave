import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Chuyến lấy hàng — Tổ chức" };

export default async function CharityPickupsPage() {
  await requirePortal("charity");
  return <PhasePlaceholder role="charity" href="/charity/pickups" />;
}

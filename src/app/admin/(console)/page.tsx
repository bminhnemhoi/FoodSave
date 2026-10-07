import type { Metadata } from "next";

import { PortalHome } from "@/components/layout/portal-home";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tổng quan — Admin" };

export default async function AdminHomePage() {
  const { profile } = await requireAdmin();
  return <PortalHome role="admin" userName={profile.fullName} />;
}

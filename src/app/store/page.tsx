import type { Metadata } from "next";

import { PortalHome } from "@/components/layout/portal-home";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tổng quan — Cửa hàng" };

export default async function StoreHomePage() {
  const { profile, membership } = await requirePortal("store");
  return <PortalHome role="store" userName={profile.fullName} orgName={membership.org.name} />;
}

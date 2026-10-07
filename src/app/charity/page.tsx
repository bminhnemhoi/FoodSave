import type { Metadata } from "next";

import { PortalHome } from "@/components/layout/portal-home";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tổng quan — Tổ chức" };

export default async function CharityHomePage() {
  const { profile, membership } = await requirePortal("charity");
  return <PortalHome role="charity" userName={profile.fullName} orgName={membership.org.name} />;
}

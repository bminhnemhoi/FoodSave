import type { Metadata } from "next";

import { PortalHome } from "@/components/layout/portal-home";
import { requireVolunteer } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Hôm nay — Tình nguyện viên" };

export default async function VolunteerTodayPage() {
  const { profile, membership } = await requireVolunteer();
  return <PortalHome role="volunteer" userName={profile.fullName} orgName={membership.org.name} />;
}

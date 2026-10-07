import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireVolunteer } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Chuyến — Tình nguyện viên" };

export default async function VolunteerTripsPage() {
  await requireVolunteer();
  return <PhasePlaceholder role="volunteer" href="/volunteer/trips" />;
}

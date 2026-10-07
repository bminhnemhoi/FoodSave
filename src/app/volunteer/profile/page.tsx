import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requireVolunteer } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tài khoản — Tình nguyện viên" };

export default async function VolunteerProfilePage() {
  await requireVolunteer();
  return <PhasePlaceholder role="volunteer" href="/volunteer/profile" />;
}

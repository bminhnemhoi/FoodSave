import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TripScreen } from "@/features/volunteer/components/trip-screen";
import { loadLocationConsent, loadVolunteerTrip, requestNow } from "@/features/volunteer/queries";
import { requireVolunteer } from "@/server/auth/guards";

/**
 * Chuyến của tình nguyện viên (ROADMAP P3-10; PRD US-VOL-04…09, 12, 13). Trang hiện mã bàn giao dùng một lần ⇒
 * không index, không gửi Referer khi rời trang (SECURITY-PRIVACY C10).
 */
export const metadata: Metadata = {
  title: "Chuyến — Tình nguyện viên",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VolunteerTripPage(props: PageProps<"/volunteer/trips/[pickupId]">) {
  const { profile } = await requireVolunteer();
  const { pickupId } = await props.params;
  if (!UUID_RE.test(pickupId)) notFound();

  const [trip, consent] = await Promise.all([
    loadVolunteerTrip(profile.id, pickupId),
    loadLocationConsent(profile.id),
  ]);
  if (!trip) notFound();

  return <TripScreen trip={trip} consent={consent} serverNow={requestNow()} />;
}

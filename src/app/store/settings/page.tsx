import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Cài đặt — Cửa hàng" };

export default async function StoreSettingsPage() {
  await requirePortal("store");
  return <PhasePlaceholder role="store" href="/store/settings" />;
}

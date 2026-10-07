import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Bàn giao — Cửa hàng" };

export default async function StoreHandoverPage() {
  await requirePortal("store");
  return <PhasePlaceholder role="store" href="/store/handover" />;
}

import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Minh chứng — Cửa hàng" };

export default async function StoreProofsPage() {
  await requirePortal("store");
  return <PhasePlaceholder role="store" href="/store/proofs" />;
}

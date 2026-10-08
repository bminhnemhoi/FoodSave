import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { StoreHandover } from "@/features/handover/components/store-handover";
import { getStoreHandoverBoard } from "@/features/handover/queries";
import { requirePortal } from "@/server/auth/guards";

/** Màn quét mã bàn giao: không index, không gửi Referer (SECURITY-PRIVACY C10). */
export const metadata: Metadata = {
  title: "Bàn giao — Cửa hàng",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function StoreHandoverPage() {
  const { membership } = await requirePortal("store");
  const board = await getStoreHandoverBoard(membership.orgId);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Bàn giao"
        description="Quét QR trên điện thoại người đến nhận, hoặc nhập mã 6 số. Đối soát từng dòng trước khi xác nhận."
      />
      <StoreHandover
        pending={board.pending}
        recent={board.recent}
        siteCount={board.siteCount}
        serverNow={board.serverNow}
      />
    </div>
  );
}

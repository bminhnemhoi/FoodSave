import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { loadCharityContext } from "@/features/charity-allocations/context";
import { ReceiveDropoff } from "@/features/handover/components/receive-dropoff";
import { getReceiveBoard } from "@/features/handover/receive-queries";

export const metadata: Metadata = { title: "Nhận hàng — Tổ chức" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nhận hàng (PRD US-CHA-21; DATA-MODEL §6.6 `record_dropoff`): owner/manager/staff tại điểm nhận quét QR giao về
 * trên điện thoại tình nguyện viên hoặc nhập mã 6 số, đối soát từng dòng đã lấy rồi xác nhận ⇒ sổ tác động.
 */
export default async function CharityReceivePage({ searchParams }: PageProps<"/charity/receive">) {
  const ctx = await loadCharityContext();
  const params = await searchParams;
  const trip = typeof params.trip === "string" && UUID_RE.test(params.trip) ? params.trip : null;
  const board = await getReceiveBoard(ctx.orgId);

  return (
    <>
      <PageHeader
        title="Nhận hàng"
        description="Xác nhận hàng tình nguyện viên mang về: quét QR hoặc nhập mã 6 số, kiểm từng dòng rồi ghi nhận."
        breadcrumb={[
          { label: "Tổng quan", href: "/charity" },
          { label: "Chuyến lấy hàng", href: "/charity/pickups" },
          { label: "Nhận hàng" },
        ]}
      />
      <ReceiveDropoff
        pending={board.pending}
        recent={board.recent}
        serverNow={board.serverNow}
        focusTripId={trip}
      />
    </>
  );
}

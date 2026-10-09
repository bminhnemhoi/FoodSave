"use client";

import { MapPinned } from "lucide-react";
import dynamic from "next/dynamic";

import {
  ClusterBubble,
  HomePin,
  NeedMarker,
  StopPin,
  StoreMarker,
  VolunteerMarker,
  YouAreHereMarker,
} from "@/components/map/kit/markers";

const DemoMap = dynamic(() => import("./demo-map").then((m) => m.DemoMap), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="grid size-full place-items-center rounded-xl border bg-bg-sunken text-ink-muted"
    >
      <span className="flex flex-col items-center gap-2 text-sm">
        <MapPinned aria-hidden className="size-8 animate-pulse" strokeWidth={1.75} />
        Đang tải bản đồ…
      </span>
    </div>
  ),
});

const noop = () => undefined;

/** Bảng marker (ngoài bản đồ, để rà nét ở 1×/2×) + bản đồ minh họa đủ loại điểm. */
export function MapKitDemo() {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="kit-markers" className="flex flex-col gap-3">
        <h2 id="kit-markers" className="text-lg font-semibold">
          Marker
        </h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-10 rounded-xl border bg-bg-sunken p-6 pb-10 sm:grid-cols-4 lg:grid-cols-6">
          <Swatch name="Cửa hàng · Đỏ, 3 lô">
            <StoreMarker label="red" count={3} ariaLabel="Cửa hàng có lô Đỏ, 3 lô" onClick={noop} />
          </Swatch>
          <Swatch name="Cửa hàng · Vàng">
            <StoreMarker label="yellow" ariaLabel="Cửa hàng có lô Vàng" onClick={noop} />
          </Swatch>
          <Swatch name="Cửa hàng · Xanh">
            <StoreMarker label="green" ariaLabel="Cửa hàng có lô Xanh" onClick={noop} />
          </Swatch>
          <Swatch name="Hết hạn">
            <StoreMarker label="expired" ariaLabel="Cửa hàng, lô đã hết hạn" />
          </Swatch>
          <Swatch name="Vị trí gần đúng">
            <StoreMarker label="yellow" approximate ariaLabel="Cửa hàng ở vị trí gần đúng" onClick={noop} />
          </Swatch>
          <Swatch name="Đang chọn">
            <StoreMarker label="green" selected ariaLabel="Cửa hàng đang chọn" onClick={noop} />
          </Swatch>
          <Swatch name="Điểm dừng 1 · 20 ổ">
            <StoreMarker label="red" order={1} tag="20 ổ" ariaLabel="Điểm dừng 1, 20 ổ" onClick={noop} />
          </Swatch>
          <Swatch name="Cụm 5 cửa hàng">
            <ClusterBubble count={5} tone="red" ariaLabel="Cụm 5 cửa hàng" onClick={noop} />
          </Swatch>
          <Swatch name="Điểm nhận của bạn">
            <HomePin kind="charity" ariaLabel="Điểm nhận của bạn" />
          </Swatch>
          <Swatch name="Cửa hàng của bạn">
            <HomePin kind="store" ariaLabel="Cửa hàng của bạn" />
          </Swatch>
          <Swatch name="Nhu cầu · Cần 50 ổ">
            <NeedMarker ariaLabel="Nhu cầu cần 50 ổ" tag="Cần 50 ổ" onClick={noop} />
          </Swatch>
          <Swatch name="Bạn ở đây">
            <YouAreHereMarker />
          </Swatch>
          <Swatch name="Điểm dừng chưa tới">
            <StopPin seq={1} status="pending" ariaLabel="Điểm 1 chưa tới" onClick={noop} />
          </Swatch>
          <Swatch name="Đã đến">
            <StopPin seq={2} status="arrived" ariaLabel="Điểm 2 đã đến" onClick={noop} />
          </Swatch>
          <Swatch name="Đã lấy">
            <StopPin seq={3} status="done" ariaLabel="Điểm 3 đã lấy" onClick={noop} />
          </Swatch>
          <Swatch name="Trễ hơn dự kiến">
            <StopPin seq={4} status="late" ariaLabel="Điểm 4 trễ" onClick={noop} />
          </Swatch>
          <Swatch name="Bỏ qua">
            <StopPin seq={5} status="skipped" ariaLabel="Điểm 5 bỏ qua" onClick={noop} />
          </Swatch>
          <Swatch name="Tuyến 2 (ghim vuông)">
            <StopPin seq={1} status="pending" tone={1} ariaLabel="Tuyến 2, điểm 1" onClick={noop} />
          </Swatch>
          <Swatch name="Kế tiếp">
            <StopPin seq={2} status="pending" current ariaLabel="Điểm kế tiếp" />
          </Swatch>
          <Swatch name="Giao về">
            <HomePin kind="charity" ariaLabel="Giao về" onClick={noop} />
          </Swatch>
          <Swatch name="TNV · mới cập nhật">
            <VolunteerMarker ariaLabel="Tình nguyện viên" label="Minh An · 1 phút" />
          </Swatch>
          <Swatch name="TNV · vị trí cũ">
            <VolunteerMarker ariaLabel="Tình nguyện viên, vị trí cũ" label="12 phút trước" stale />
          </Swatch>
        </ul>
      </section>
      <section aria-labelledby="kit-map" className="flex flex-col gap-3">
        <h2 id="kit-map" className="text-lg font-semibold">
          Trên bản đồ
        </h2>
        <div className="h-[70vh] min-h-96">
          <DemoMap />
        </div>
      </section>
    </div>
  );
}

function Swatch({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col items-center gap-3 text-center text-xs text-ink-muted">
      <span className="grid h-14 place-items-end">{children}</span>
      <span className="mt-4">{name}</span>
    </li>
  );
}

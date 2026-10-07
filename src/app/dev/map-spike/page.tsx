import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { FreshnessBadge } from "@/components/labels/freshness-badge";
import { MapViewLazy } from "@/components/map/map-view-lazy";
import type { MapPoint } from "@/components/map/map-view";
import { clientEnv } from "@/lib/env.client";
import { getMapsProvider } from "@/server/providers/maps";

export const metadata: Metadata = { title: "Spike bản đồ", robots: { index: false } };

const STOPS: MapPoint[] = [
  { id: "a", lat: 10.7725, lng: 106.698, title: "Điểm 1 — Chợ Bến Thành (lô Đỏ)", label: "red", order: 1 },
  { id: "b", lat: 10.7575, lng: 106.6597, title: "Điểm 2 — BV Chợ Rẫy (lô Vàng)", label: "yellow", order: 2 },
  {
    id: "c",
    lat: 10.7494,
    lng: 106.6511,
    title: "Điểm 3 — Chợ Bình Tây (lô Xanh)",
    label: "green",
    order: 3,
  },
];

/** P0-18: trang tạm kiểm tra tile Goong + tuyến xe máy nhiều điểm dừng. Không có ở production. */
export default async function MapSpikePage() {
  await connection(); // tính tuyến lúc request, không lúc build
  if (clientEnv.NEXT_PUBLIC_APP_ENV === "production") notFound();

  let summary = "Không gọi được dịch vụ chỉ đường.";
  let route: { type: "LineString"; coordinates: [number, number][] } | undefined;
  try {
    const r = await getMapsProvider().route({ mode: "motorbike", points: STOPS });
    route = r.geometry;
    summary = `${(r.distanceM / 1000).toFixed(1)} km · ${Math.round(r.durationS / 60)} phút xe máy · ${r.legs.length} chặng (${r.provider})`;
  } catch {
    // Hiển thị điểm dừng không có tuyến.
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-bold">Spike bản đồ — tuyến lấy hàng 3 điểm</h1>
      <p className="text-ink-muted">{summary}</p>
      <div className="h-[60vh] min-h-80">
        <MapViewLazy
          points={STOPS}
          route={route}
          ariaLabel={`Bản đồ tuyến lấy hàng qua ${STOPS.length} điểm dừng. ${summary}`}
        />
      </div>
      <ol className="flex flex-col gap-2" aria-label="Danh sách điểm dừng">
        {STOPS.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg border bg-surface p-3">
            <span className="grid size-7 place-items-center rounded-full bg-ink text-sm font-bold text-white tabular-nums">
              {s.order}
            </span>
            <span className="flex-1">{s.title}</span>
            {s.label ? <FreshnessBadge label={s.label} size="sm" /> : null}
          </li>
        ))}
      </ol>
    </main>
  );
}

"use client";

import { useState } from "react";

import type { LngLatTuple } from "@/core/geo/types";
import { OfferMapLazy } from "@/features/marketplace/components/offer-map-lazy";
import { NearbyMapLazy } from "@/features/needs-nearby/components/nearby-map-lazy";
import { PlanMapLazy } from "@/features/needs/components/plan-map-lazy";
import { TripMapLazy } from "@/features/pickups/components/trip-map-lazy";
import { VolunteerTripMapLazy } from "@/features/volunteer/components/volunteer-trip-map-lazy";

const HOME = { lat: 10.838, lng: 106.665 };
const A = { lat: 10.8414, lng: 106.6681 };
const B = { lat: 10.8374, lng: 106.6714 };
const C = { lat: 10.8322, lng: 106.6697 };
const D = { lat: 10.838, lng: 106.6504 };
const line = (...pts: { lat: number; lng: number }[]): LngLatTuple[] => pts.map((p) => [p.lng, p.lat]);

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="h-[30rem]">{children}</div>
    </section>
  );
}

/** Các bản đồ thật của 5 màn chính với dữ liệu minh họa (tên hư cấu). */
export function MapScreensDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const [need, setNeed] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-10">
      <Box title="Kho tặng">
        <OfferMapLazy
          center={HOME}
          siteName="Bếp Nắng Mai"
          radiusKm={3}
          filterKm={null}
          points={[
            {
              siteId: "a",
              ...A,
              approximate: false,
              label: "red",
              count: 2,
              ariaLabel: "Tiệm bánh Hoa Sữa, 2 lô, gấp nhất: Nhãn Đỏ",
            },
            {
              siteId: "b",
              ...B,
              approximate: false,
              label: "yellow",
              count: 1,
              ariaLabel: "Lò bánh Mặt Trời, 1 lô, gấp nhất: Nhãn Vàng",
            },
            {
              siteId: "c",
              ...C,
              approximate: true,
              label: "green",
              count: 1,
              ariaLabel: "Bánh mì Phố Xanh, 1 lô, gấp nhất: Nhãn Xanh, vị trí gần đúng",
            },
            {
              siteId: "d",
              ...D,
              approximate: false,
              label: "green",
              count: 3,
              ariaLabel: "Bánh mì Bình Minh, 3 lô, gấp nhất: Nhãn Xanh",
            },
            {
              siteId: "e",
              lat: 10.8521,
              lng: 106.6622,
              approximate: false,
              label: "red",
              count: 1,
              ariaLabel: "Cơm tấm Cô Ba, 1 lô, gấp nhất: Nhãn Đỏ",
            },
            {
              siteId: "f",
              lat: 10.8526,
              lng: 106.6628,
              approximate: false,
              label: "yellow",
              count: 1,
              ariaLabel: "Bếp cơm Nhà Mơ, 1 lô, gấp nhất: Nhãn Vàng",
            },
          ]}
          selectedSiteId={selected}
          highlightedSiteId={null}
          onSelect={setSelected}
          focusRequest={null}
          ariaLabel="Bản đồ kho tặng (minh họa)"
        />
      </Box>
      <Box title="Phương án ghép">
        <PlanMapLazy
          home={HOME}
          homeName="Bếp Nắng Mai"
          radiusKm={2}
          activeKey="p1"
          ariaLabel="Bản đồ phương án 1 (minh họa)"
          plans={[
            {
              key: "p1",
              rank: 1,
              path: line(HOME, A, B, C, HOME),
              stops: [
                {
                  siteId: "a",
                  seq: 1,
                  location: A,
                  approximate: false,
                  name: "Tiệm bánh Hoa Sữa",
                  label: "red",
                  tag: "20 ổ",
                  ariaLabel: "Phương án 1, Điểm dừng 1: Tiệm bánh Hoa Sữa",
                },
                {
                  siteId: "b",
                  seq: 2,
                  location: B,
                  approximate: false,
                  name: "Lò bánh Mặt Trời",
                  label: "yellow",
                  tag: "18 ổ",
                  ariaLabel: "Phương án 1, Điểm dừng 2: Lò bánh Mặt Trời",
                },
                {
                  siteId: "c",
                  seq: 3,
                  location: C,
                  approximate: true,
                  name: "Bánh mì Phố Xanh",
                  label: "yellow",
                  tag: "12 ổ",
                  ariaLabel: "Phương án 1, Điểm dừng 3: Bánh mì Phố Xanh",
                },
              ],
            },
            { key: "p2", rank: 2, path: line(HOME, D, A, HOME), stops: [] },
          ]}
        />
      </Box>
      <Box title="Nhu cầu gần bạn">
        <NearbyMapLazy
          stores={[{ siteId: "s", name: "Tiệm bánh Hoa Sữa", location: A }]}
          points={[
            {
              needId: "n1",
              location: HOME,
              approximate: true,
              tag: "Cần 50 ổ",
              ariaLabel: "Mái ấm Nắng Mai: cần 50 ổ",
            },
            {
              needId: "n2",
              location: { lat: 10.8452, lng: 106.6801 },
              approximate: false,
              tag: "Cần 20 suất",
              ariaLabel: "Bếp ăn Tình Thương: cần 20 suất",
            },
          ]}
          hiddenCount={1}
          selectedId={need}
          onSelect={setNeed}
          focusRequest={null}
          ariaLabel="Bản đồ nhu cầu gần bạn (minh họa)"
        />
      </Box>
      <Box title="Điều phối chuyến">
        <TripMapLazy
          stops={[
            {
              id: "1",
              seq: 1,
              kind: "pickup",
              done: true,
              skipped: false,
              location: A,
              approximate: false,
              ariaLabel: "Điểm 1: Tiệm bánh Hoa Sữa — Đã lấy hàng",
            },
            {
              id: "2",
              seq: 2,
              kind: "pickup",
              done: false,
              skipped: false,
              arrived: true,
              location: B,
              approximate: false,
              ariaLabel: "Điểm 2: Lò bánh Mặt Trời — Đã đến",
            },
            {
              id: "3",
              seq: 3,
              kind: "pickup",
              done: false,
              skipped: false,
              late: true,
              location: C,
              approximate: false,
              ariaLabel: "Điểm 3: Bánh mì Phố Xanh — Chưa tới",
            },
            {
              id: "4",
              seq: 4,
              kind: "dropoff",
              done: false,
              skipped: false,
              location: HOME,
              approximate: false,
              ariaLabel: "Điểm 4: Giao về Bếp Nắng Mai — Chờ giao về",
            },
          ]}
          routes={[
            {
              id: "r",
              line: { type: "LineString", coordinates: line(A, B, C, HOME) },
              estimated: false,
              tone: 0,
              label: "Tuyến xe máy",
            },
          ]}
          volunteer={{
            location: { lat: 10.8378, lng: 106.6716 },
            label: "Minh An · cập nhật 1 phút trước",
            ariaLabel: "Vị trí gần đúng của Minh An, cập nhật 1 phút trước",
          }}
          activeStopId={null}
          onSelectStop={() => undefined}
          ariaLabel="Bản đồ điều phối (minh họa)"
        />
      </Box>
      <Box title="Chia 2 tuyến">
        <TripMapLazy
          stops={[
            {
              id: "a",
              seq: 1,
              kind: "pickup",
              done: false,
              skipped: false,
              location: A,
              approximate: false,
              tone: 0,
              ariaLabel: "Tuyến 1, điểm 1",
            },
            {
              id: "b",
              seq: 2,
              kind: "pickup",
              done: false,
              skipped: false,
              location: B,
              approximate: false,
              tone: 0,
              ariaLabel: "Tuyến 1, điểm 2",
            },
            {
              id: "c",
              seq: 1,
              kind: "pickup",
              done: false,
              skipped: false,
              location: D,
              approximate: false,
              tone: 1,
              ariaLabel: "Tuyến 2, điểm 1",
            },
            {
              id: "h",
              seq: 0,
              kind: "dropoff",
              done: false,
              skipped: false,
              location: HOME,
              approximate: false,
              ariaLabel: "Giao về",
            },
          ]}
          routes={[
            {
              id: "1",
              line: { type: "LineString", coordinates: line(A, B, HOME) },
              estimated: true,
              tone: 0,
              label: "Tuyến 1 · Khoa (ước tính)",
            },
            {
              id: "2",
              line: { type: "LineString", coordinates: line(D, HOME) },
              estimated: true,
              tone: 1,
              label: "Tuyến 2 · Vy (ước tính)",
            },
          ]}
          activeStopId={null}
          onSelectStop={() => undefined}
          ariaLabel="Bản đồ phương án: 2 tuyến (minh họa)"
        />
      </Box>
      <Box title="Chuyến của tình nguyện viên">
        <VolunteerTripMapLazy
          stops={[
            { id: "1", seq: 1, kind: "pickup", status: "done", location: A, title: "1. Tiệm bánh Hoa Sữa" },
            { id: "2", seq: 2, kind: "pickup", status: "pending", location: B, title: "2. Lò bánh Mặt Trời" },
            {
              id: "3",
              seq: 3,
              kind: "dropoff",
              status: "pending",
              location: HOME,
              title: "3. Giao về Bếp Nắng Mai",
            },
          ]}
          route={{ type: "LineString", coordinates: line(A, B, HOME) }}
          estimated={false}
          currentStopId="2"
          me={{ lat: 10.8398, lng: 106.6702 }}
          ariaLabel="Bản đồ chuyến (minh họa), có vị trí của bạn"
        />
      </Box>
    </div>
  );
}

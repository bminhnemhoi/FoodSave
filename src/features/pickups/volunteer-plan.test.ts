import { describe, expect, it } from "vitest";

import { bestOrder, splitBetweenTwo } from "@/core/routing";

import {
  assignStops,
  firstStoreLocation,
  planVolunteerTrips,
  rankVolunteers,
  type PlanInput,
  type PlanVolunteer,
} from "./volunteer-plan";

const NOW = Date.parse("2026-10-20T03:00:00Z"); // 10:00 giờ VN
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

const CHARITY = { siteId: "c0", location: { lat: 10.7725, lng: 106.698 } };
// Ba cửa hàng: hai ở phía bắc, một ở phía tây nam
const STORES = [
  { siteId: "sA", name: "Tiệm A", location: { lat: 10.79, lng: 106.7 }, approximate: false },
  { siteId: "sB", name: "Tiệm B", location: { lat: 10.795, lng: 106.705 }, approximate: false },
  { siteId: "sC", name: "Tiệm C", location: { lat: 10.755, lng: 106.67 }, approximate: true },
];
const ALLOCS = [
  { id: "a1", storeSiteId: "sA", kg: 4, pickupStart: iso(-10), effectiveDeadline: iso(240) },
  { id: "a2", storeSiteId: "sA", kg: 1.5, pickupStart: iso(-20), effectiveDeadline: iso(180) },
  { id: "b1", storeSiteId: "sB", kg: 3.6, pickupStart: iso(-10), effectiveDeadline: iso(240) },
  { id: "c1", storeSiteId: "sC", kg: 2.4, pickupStart: iso(-10), effectiveDeadline: iso(240) },
];
const KHOA: PlanVolunteer = { userId: "u1", name: "Khoa", base: { lat: 10.8, lng: 106.71 }, capacityKg: 20 };
const VY: PlanVolunteer = { userId: "u2", name: "Vy", base: { lat: 10.75, lng: 106.66 }, capacityKg: 5 };

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  dropoff: CHARITY,
  stores: STORES,
  allocations: ALLOCS,
  volunteers: [KHOA],
  departAt: NOW,
  ...over,
});

describe("planVolunteerTrips — 1 tình nguyện viên", () => {
  it("dùng đúng thứ tự của bestOrder (xuất phát từ khu vực của TNV), ETA tăng dần, gom phân bổ theo cửa hàng", () => {
    const r = planVolunteerTrips(input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const trip = r.plan.trips[0]!;
    const expected = bestOrder({
      stops: STORES.map((s) => ({ id: s.siteId, location: s.location })).map((s) => ({
        ...s,
        readyAt: s.id === "sA" ? iso(-10) : iso(-10),
        deadline: s.id === "sA" ? iso(180) : iso(240),
      })),
      dropoff: { id: "c0", location: CHARITY.location },
      start: { id: "base:u1", location: KHOA.base! },
      departAt: NOW,
      objective: "duration",
    });
    expect(trip.stops.map((s) => s.siteId)).toEqual(expected.order);
    expect(trip.stops.map((s) => s.seq)).toEqual([1, 2, 3]);
    const etas = trip.stops.map((s) => Date.parse(s.arriveAt!));
    expect([...etas].sort((a, b) => a - b)).toEqual(etas);
    expect(Date.parse(trip.dropoffEta!)).toBeGreaterThan(etas[2]!);
    expect(trip.stops.find((s) => s.siteId === "sA")!.allocationIds).toEqual(["a1", "a2"]);
    expect(trip.kg).toBe(11.5);
    expect(trip.overCapacity).toBe(false);
    expect(trip.line).toHaveLength(4);
    expect(trip.line!.at(-1)).toEqual([CHARITY.location.lng, CHARITY.location.lat]);
    expect(r.plan.method).toBe("optimized");
  });

  it("cảnh báo vượt sức chở", () => {
    const r = planVolunteerTrips(input({ volunteers: [VY] }));
    expect(r.ok && r.plan.trips[0]!.overCapacity).toBe(true);
  });

  it("cửa hàng ẩn vị trí ⇒ sắp theo hạn hiệu lực sớm nhất, không ETA, không tuyến", () => {
    const stores = STORES.map((s) => (s.siteId === "sB" ? { ...s, location: null } : s));
    const r = planVolunteerTrips(input({ stores }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.method).toBe("deadline");
    const trip = r.plan.trips[0]!;
    expect(trip.stops[0]!.siteId).toBe("sA"); // hạn 180 phút, sớm nhất
    expect(trip.stops.every((s) => s.arriveAt === null)).toBe(true);
    expect(trip.line).toBeNull();
  });

  it("từ chối khi không có phân bổ / TNV / quá 2 TNV / quá 5 cửa hàng", () => {
    expect(planVolunteerTrips(input({ allocations: [] }))).toEqual({ ok: false, reason: "no_allocations" });
    expect(planVolunteerTrips(input({ volunteers: [] }))).toEqual({ ok: false, reason: "no_volunteer" });
    expect(planVolunteerTrips(input({ volunteers: [KHOA, VY, KHOA] }))).toEqual({
      ok: false,
      reason: "too_many_volunteers",
    });
    const six = Array.from({ length: 6 }, (_, i) => ({
      siteId: `s${i}`,
      name: `S${i}`,
      location: { lat: 10.77 + i * 0.002, lng: 106.69 },
      approximate: false,
    }));
    const allocs = six.map((s, i) => ({
      id: `x${i}`,
      storeSiteId: s.siteId,
      kg: 1,
      pickupStart: null,
      effectiveDeadline: iso(600),
    }));
    expect(planVolunteerTrips(input({ stores: six, allocations: allocs }))).toEqual({
      ok: false,
      reason: "too_many_stops",
    });
  });
});

describe("planVolunteerTrips — 2 tình nguyện viên chia tuyến", () => {
  it("khớp splitBetweenTwo: tuyến 1 cho TNV thứ nhất, tuyến 2 cho TNV thứ hai, phủ đủ phân bổ", () => {
    const r = planVolunteerTrips(input({ volunteers: [KHOA, VY] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const split = splitBetweenTwo({
      stops: [
        { id: "sA", location: STORES[0]!.location, readyAt: iso(-10), deadline: iso(180) },
        { id: "sB", location: STORES[1]!.location, readyAt: iso(-10), deadline: iso(240) },
        { id: "sC", location: STORES[2]!.location, readyAt: iso(-10), deadline: iso(240) },
      ],
      dropoff: { id: "c0", location: CHARITY.location },
      bases: [
        { id: "base:u1", location: KHOA.base! },
        { id: "base:u2", location: VY.base! },
      ],
      departAt: NOW,
      objective: "duration",
    });
    const [t1, t2] = r.plan.trips;
    expect(t1!.volunteer.userId).toBe("u1");
    expect(t2!.volunteer.userId).toBe("u2");
    expect(t1!.stops.map((s) => s.siteId)).toEqual(split.routes[0].order);
    expect(t2!.stops.map((s) => s.siteId)).toEqual(split.routes[1].order);
    // Khoa ở phía bắc lấy A + B, Vy ở phía tây nam lấy C
    expect(t1!.stops.map((s) => s.siteId).sort()).toEqual(["sA", "sB"]);
    expect(t2!.stops.map((s) => s.siteId)).toEqual(["sC"]);
    expect([...t1!.allocationIds, ...t2!.allocationIds].sort()).toEqual(["a1", "a2", "b1", "c1"]);
    expect(r.plan.makespanS).toBe(split.makespanS);
    expect(r.plan.distanceM).toBe(t1!.distanceM! + t2!.distanceM!);
  });

  it("cần ≥ 2 cửa hàng và mọi cửa hàng có toạ độ", () => {
    expect(
      planVolunteerTrips(
        input({ volunteers: [KHOA, VY], allocations: ALLOCS.filter((a) => a.storeSiteId === "sA") }),
      ),
    ).toEqual({ ok: false, reason: "split_needs_two_stores" });
    const stores = STORES.map((s) => (s.siteId === "sC" ? { ...s, location: null } : s));
    expect(planVolunteerTrips(input({ volunteers: [KHOA, VY], stores }))).toEqual({
      ok: false,
      reason: "missing_location",
    });
  });

  it("tất định: hoán vị đầu vào cho cùng kết quả", () => {
    const a = planVolunteerTrips(input({ volunteers: [KHOA, VY] }));
    const b = planVolunteerTrips(
      input({ volunteers: [KHOA, VY], stores: [...STORES].reverse(), allocations: [...ALLOCS].reverse() }),
    );
    expect(a).toEqual(b);
  });
});

describe("assignStops", () => {
  it("điểm lấy theo thứ tự + điểm giao cuối, kèm ETA", () => {
    const r = planVolunteerTrips(input());
    if (!r.ok) throw new Error("plan");
    const stops = assignStops(r.plan.trips[0]!, "c0");
    expect(stops).toHaveLength(4);
    expect(stops.at(-1)).toMatchObject({ site_id: "c0", seq: 4, kind: "dropoff" });
    expect(stops.slice(0, 3).every((s) => s.kind === "pickup" && typeof s.eta === "string")).toBe(true);
  });
});

describe("rankVolunteers (US-CHA-16 AC2)", () => {
  const base = { openTrips: 0, paused: false };
  it("đủ sức chở → rảnh → gần cửa hàng đầu tiên → tên; tạm ngưng xếp cuối và không được gợi ý", () => {
    const list = [
      { ...base, userId: "far", name: "An", base: { lat: 10.9, lng: 106.8 }, capacityKg: 30 },
      { ...base, userId: "near", name: "Bình", base: { lat: 10.79, lng: 106.7 }, capacityKg: 30 },
      { ...base, userId: "small", name: "Chi", base: { lat: 10.79, lng: 106.7 }, capacityKg: 2 },
      {
        ...base,
        userId: "busy",
        name: "Dũng",
        base: { lat: 10.79, lng: 106.7 },
        capacityKg: 30,
        openTrips: 1,
      },
      {
        ...base,
        userId: "paused",
        name: "Em",
        base: { lat: 10.79, lng: 106.7 },
        capacityKg: 30,
        paused: true,
      },
      { ...base, userId: "noarea", name: "Giang", base: null, capacityKg: 30 },
    ];
    const ranked = rankVolunteers(list, { lat: 10.79, lng: 106.7 }, 10);
    expect(ranked.map((v) => v.userId)).toEqual(["near", "far", "noarea", "busy", "small", "paused"]);
    expect(ranked[0]!.suggested).toBe(true);
    expect(ranked.filter((v) => v.suggested)).toHaveLength(1);
    expect(ranked.find((v) => v.userId === "small")!.fitsLoad).toBe(false);
    expect(ranked.find((v) => v.userId === "noarea")!.distanceKm).toBeNull();
  });

  it("chỉ có TNV tạm ngưng ⇒ không gợi ý ai", () => {
    const ranked = rankVolunteers(
      [{ userId: "p", name: "P", base: null, capacityKg: 10, openTrips: 0, paused: true }],
      null,
      1,
    );
    expect(ranked[0]!.suggested).toBe(false);
  });
});

describe("firstStoreLocation", () => {
  it("cửa hàng có hạn sớm nhất", () => {
    expect(firstStoreLocation({ stores: STORES, allocations: ALLOCS })).toEqual(STORES[0]!.location);
  });
});

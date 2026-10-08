import { describe, expect, it } from "vitest";

import {
  applyStopChange,
  isPositionStale,
  isStopLate,
  liveReducer,
  positionAgeLabel,
  stopChangeAnnouncement,
  type LiveStopFields,
} from "./live";

const stop = (id: string, seq: number, over: Partial<LiveStopFields> = {}): LiveStopFields => ({
  id,
  seq,
  kind: "pickup",
  status: "pending",
  eta: "2026-10-20T03:20:00.000Z",
  arrivedAt: null,
  completedAt: null,
  skipReason: null,
  arrivalCheck: null,
  arrivalNote: null,
  ...over,
});

const STOPS = [stop("s1", 1), stop("s2", 2), stop("d", 3, { kind: "dropoff" })];

describe("applyStopChange", () => {
  it("áp trạng thái check-in, ETA và cờ vào đúng điểm dừng", () => {
    const r = applyStopChange(STOPS, "p1", {
      id: "s1",
      pickup_id: "p1",
      status: "arrived",
      arrived_at: "2026-10-20T03:18:00Z",
      arrival_check: "manual",
      arrival_note: "GPS không chính xác",
      eta: "2026-10-20T03:18:00Z",
    });
    expect(r.unknown).toBe(false);
    expect(r.changed?.before.status).toBe("pending");
    expect(r.stops[0]).toMatchObject({
      status: "arrived",
      arrivedAt: "2026-10-20T03:18:00Z",
      arrivalCheck: "manual",
      arrivalNote: "GPS không chính xác",
    });
    expect(r.stops[1]).toBe(STOPS[1]); // điểm khác giữ nguyên tham chiếu
  });

  it("bỏ qua chuyến khác, dòng không đổi gì và giá trị lạ", () => {
    expect(applyStopChange(STOPS, "p1", { id: "s1", pickup_id: "p2", status: "done" }).stops).toBe(STOPS);
    expect(applyStopChange(STOPS, "p1", { id: "s1", pickup_id: "p1", status: "pending" }).changed).toBeNull();
    const weird = applyStopChange(STOPS, "p1", { id: "s1", status: "teleported", arrival_check: "x" });
    expect(weird.changed).toBeNull();
  });

  it("điểm dừng chưa biết (lên lại kế hoạch) ⇒ cần tải lại", () => {
    expect(applyStopChange(STOPS, "p1", { id: "new", pickup_id: "p1", status: "pending" }).unknown).toBe(
      true,
    );
  });

  it("đổi thứ tự (seq) thì sắp lại", () => {
    const r = applyStopChange(STOPS, "p1", { id: "s1", seq: 2 });
    const r2 = applyStopChange(r.stops, "p1", { id: "s2", seq: 1 });
    expect(r2.stops.map((s) => s.id)).toEqual(["s2", "s1", "d"]);
  });
});

describe("liveReducer", () => {
  it("reset thay toàn bộ; change cập nhật; dòng lạ đánh dấu cần tải lại", () => {
    let state = liveReducer(
      { stops: [], changed: null, needsRefresh: false },
      { type: "reset", stops: STOPS },
    );
    expect(state.stops).toBe(STOPS);
    state = liveReducer(state, { type: "change", pickupId: "p1", row: { id: "s2", status: "done" } });
    expect(state.stops[1]!.status).toBe("done");
    expect(state.changed?.after.id).toBe("s2");
    const same = liveReducer(state, { type: "change", pickupId: "p1", row: { id: "s2", status: "done" } });
    expect(same).toBe(state);
    const unknown = liveReducer(state, { type: "change", pickupId: "p1", row: { id: "zzz" } });
    expect(unknown.needsRefresh).toBe(true);
    expect(liveReducer(unknown, { type: "reset", stops: STOPS }).needsRefresh).toBe(false);
  });
});

describe("stopChangeAnnouncement", () => {
  it("chỉ thông báo khi trạng thái đổi, kèm cờ check-in", () => {
    const before = stop("s1", 1);
    expect(stopChangeAnnouncement(before, { ...before, eta: null }, "Tiệm A")).toBeNull();
    expect(
      stopChangeAnnouncement(before, { ...before, status: "arrived", arrivalCheck: "manual" }, "Tiệm A"),
    ).toBe("Điểm 1 · Tiệm A: tình nguyện viên đã đến (check-in thủ công, ngoài 100 m).");
    expect(stopChangeAnnouncement(before, { ...before, status: "done" }, "Tiệm A")).toBe(
      "Điểm 1 · Tiệm A: đã lấy hàng.",
    );
    const d = stop("d", 3, { kind: "dropoff" });
    expect(stopChangeAnnouncement(d, { ...d, status: "done" }, "Bếp")).toBe("Điểm 3 · Bếp: đã giao về.");
  });
});

describe("isStopLate (US-CHA-18 AC3)", () => {
  const eta = Date.parse("2026-10-20T03:20:00Z");
  it("chưa tới và quá ETA + 15 phút", () => {
    expect(isStopLate(stop("s", 1), eta + 15 * 60_000)).toBe(false);
    expect(isStopLate(stop("s", 1), eta + 16 * 60_000)).toBe(true);
    expect(isStopLate(stop("s", 1, { status: "arrived" }), eta + 60 * 60_000)).toBe(false);
    expect(isStopLate(stop("s", 1, { eta: null }), eta + 60 * 60_000)).toBe(false);
  });
});

describe("vị trí tình nguyện viên", () => {
  const now = Date.parse("2026-10-20T03:30:00Z");
  it("nhãn tuổi vị trí", () => {
    expect(positionAgeLabel(null, now)).toBeNull();
    expect(positionAgeLabel("2026-10-20T03:29:40Z", now)).toBe("vừa cập nhật");
    expect(positionAgeLabel("2026-10-20T03:27:00Z", now)).toBe("cập nhật 3 phút trước");
    expect(positionAgeLabel("2026-10-20T01:00:00Z", now)).toBe("cập nhật 2 giờ trước");
  });
  it("cũ hơn 10 phút là không còn theo dõi", () => {
    expect(isPositionStale("2026-10-20T03:25:00Z", now)).toBe(false);
    expect(isPositionStale("2026-10-20T03:15:00Z", now)).toBe(true);
    expect(isPositionStale(null, now)).toBe(true);
  });
});

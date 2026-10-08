import { describe, expect, it } from "vitest";

import { summarize, vehicleLabel, volunteerName, volunteerState } from "./present";
import type { VolunteerRow } from "./queries";

const row = (over: Partial<VolunteerRow> = {}): VolunteerRow => ({
  userId: "u",
  name: "Khoa",
  phoneMasked: "091****678",
  joinedAt: "2026-10-01T00:00:00Z",
  pausedAt: null,
  pausedReason: null,
  hasProfile: true,
  vehicle: "motorbike",
  capacityKg: 20,
  base: null,
  areaLabel: null,
  availabilityNote: null,
  locationConsent: false,
  tripsCompleted: 0,
  tripsThisMonth: 0,
  lastTripAt: null,
  openTrips: 0,
  ...over,
});

describe("volunteers/present", () => {
  it("trạng thái: tạm ngưng > đang có chuyến > sẵn sàng", () => {
    expect(volunteerState(row())).toBe("active");
    expect(volunteerState(row({ openTrips: 2 }))).toBe("on_trip");
    expect(volunteerState(row({ openTrips: 2, pausedAt: "2026-10-02T00:00:00Z" }))).toBe("paused");
  });

  it("tên hiển thị dự phòng", () => {
    expect(volunteerName(row())).toBe("Khoa");
    expect(volunteerName(row({ name: null }))).toBe("Tình nguyện viên 091****678");
    expect(volunteerName(row({ name: null, phoneMasked: null }))).toBe("Tình nguyện viên chưa đặt tên");
  });

  it("phương tiện", () => {
    expect(vehicleLabel("bicycle")).toBe("Xe đạp");
    expect(vehicleLabel(null)).toBe("Chưa khai");
  });

  it("tóm tắt đầu trang", () => {
    expect(
      summarize([
        row({ tripsThisMonth: 3 }),
        row({ openTrips: 1, tripsThisMonth: 1 }),
        row({ pausedAt: "2026-10-02T00:00:00Z" }),
      ]),
    ).toEqual({ active: 2, paused: 1, onTrip: 1, tripsThisMonth: 4 });
  });
});

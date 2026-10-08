import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/lib/hash";
import { POLICY_VERSION } from "@/lib/legal";

import { LOCATION_CONSENT_POINTS, locationConsentText } from "./consent";
import { mapTripError } from "./errors";
import {
  checkInIntentKey,
  checkInReducer,
  geoProblemFromCode,
  INITIAL_CHECK_IN,
  type CheckInEvent,
  type CheckInState,
} from "./geolocation";
import { intentIdFor } from "./intent";
import {
  accuracyForRpc,
  INITIAL_THROTTLE,
  LOCATION_MIN_INTERVAL_MS,
  nextSend,
  retryAfterMs,
  roundCoord,
} from "./location-throttle";
import { profileFormSchema, snapArea, toProfilePayload } from "./schemas";
import {
  contactForStop,
  currentStop,
  directionsFromHere,
  groupTodayTrips,
  pickupProgress,
  stopStatusText,
  tripStartAt,
  vnDayKey,
  volunteerPhase,
  type ModelStop,
  type TripListItem,
} from "./trip-model";

const run = (events: CheckInEvent[], from: CheckInState = INITIAL_CHECK_IN) =>
  events.reduce(checkInReducer, from);
const FIX = { lat: 10.7725, lng: 106.698, accuracyM: 12 };

describe("checkInReducer — máy trạng thái “Tôi đã tới” (US-VOL-06)", () => {
  it("trong geofence: idle → locating → submitting → done", () => {
    let s = run([{ type: "start", supported: true }]);
    expect(s).toEqual({ step: "locating" });
    s = checkInReducer(s, { type: "geo_fix", fix: FIX });
    expect(s).toEqual({ step: "submitting", fix: FIX, reason: null });
    s = checkInReducer(s, {
      type: "server",
      result: { arrived: true, distanceM: 20, check: "geofence", reasonRequired: false },
    });
    expect(s).toEqual({ step: "done", check: "geofence", distanceM: 20 });
  });

  it("ngoài geofence: hỏi lý do, gửi lại ĐÚNG toạ độ cũ kèm lý do (AC2)", () => {
    let s = run([
      { type: "start", supported: true },
      { type: "geo_fix", fix: FIX },
      { type: "server", result: { arrived: false, distanceM: 540, check: null, reasonRequired: true } },
    ]);
    expect(s).toEqual({ step: "needs_reason", cause: "outside_fence", distanceM: 540, fix: FIX });
    expect(checkInReducer(s, { type: "submit_reason", reason: "   " })).toBe(s); // lý do rỗng: giữ nguyên
    s = checkInReducer(s, { type: "submit_reason", reason: " GPS không chính xác " });
    expect(s).toEqual({ step: "submitting", fix: FIX, reason: "GPS không chính xác" });
    s = checkInReducer(s, {
      type: "server",
      result: { arrived: true, distanceM: 540, check: "manual", reasonRequired: false },
    });
    expect(s).toMatchObject({ step: "done", check: "manual" });
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
    [99, "unavailable"],
  ] as const)("lỗi định vị mã %i ⇒ %s ⇒ check-in thủ công không toạ độ (AC3)", (code, problem) => {
    expect(geoProblemFromCode(code)).toBe(problem);
    let s = run([
      { type: "start", supported: true },
      { type: "geo_error", code },
    ]);
    expect(s).toEqual({ step: "needs_reason", cause: "no_location", problem });
    s = checkInReducer(s, { type: "submit_reason", reason: "Điện thoại không bật được định vị" });
    expect(s).toEqual({ step: "submitting", fix: null, reason: "Điện thoại không bật được định vị" });
  });

  it("trình duyệt không hỗ trợ định vị ⇒ hỏi lý do ngay", () => {
    expect(run([{ type: "start", supported: false }])).toEqual({
      step: "needs_reason",
      cause: "no_location",
      problem: "unsupported",
    });
  });

  it("lỗi mạng ⇒ error giữ lượt gửi; thử lại = cùng toạ độ + lý do ⇒ cùng khóa ý định", () => {
    const sending = run([
      { type: "start", supported: true },
      { type: "geo_fix", fix: FIX },
    ]);
    const failed = checkInReducer(sending, { type: "failed", message: "Mất mạng" });
    expect(failed).toEqual({ step: "error", message: "Mất mạng", fix: FIX, reason: null });
    const retry = checkInReducer(failed, { type: "retry" });
    expect(retry).toEqual(sending);
    if (retry.step !== "submitting" || sending.step !== "submitting") throw new Error("unreachable");
    expect(checkInIntentKey("s1", retry)).toBe(checkInIntentKey("s1", sending));
    expect(checkInIntentKey("s1", { fix: FIX, reason: "Khác" })).not.toBe(checkInIntentKey("s1", retry));
    expect(checkInIntentKey("s1", { fix: null, reason: "x" })).toBe("s1|no-location|x");
  });

  it("bấm lại khi đang lấy vị trí/đang gửi bị bỏ qua; sự kiện lạc bước không đổi trạng thái", () => {
    const locating = run([{ type: "start", supported: true }]);
    expect(checkInReducer(locating, { type: "start", supported: true })).toBe(locating);
    expect(checkInReducer(INITIAL_CHECK_IN, { type: "geo_fix", fix: FIX })).toBe(INITIAL_CHECK_IN);
    expect(checkInReducer(INITIAL_CHECK_IN, { type: "retry" })).toBe(INITIAL_CHECK_IN);
    const submitting = checkInReducer(locating, { type: "geo_fix", fix: FIX });
    expect(checkInReducer(submitting, { type: "cancel" })).toBe(submitting);
    expect(checkInReducer(locating, { type: "cancel" })).toEqual(INITIAL_CHECK_IN);
  });

  it("máy chủ trả không đến nơi mà không đòi lý do ⇒ lỗi có thể thử lại", () => {
    const s = run([
      { type: "start", supported: true },
      { type: "geo_fix", fix: FIX },
      { type: "server", result: { arrived: false, distanceM: null, check: null, reasonRequired: false } },
    ]);
    expect(s).toMatchObject({ step: "error", fix: FIX });
  });
});

describe("nhịp gửi vị trí (US-VOL-12, C9)", () => {
  const t0 = 1_000_000;

  it("lần đầu gửi ngay; sau đó tối đa 1 lần / 30 giây", () => {
    expect(nextSend(INITIAL_THROTTLE, t0)).toEqual({ action: "send" });
    const sent = { ...INITIAL_THROTTLE, lastSentAt: t0 };
    expect(nextSend(sent, t0 + 1000)).toEqual({ action: "wait", ms: LOCATION_MIN_INTERVAL_MS - 1000 });
    expect(nextSend(sent, t0 + LOCATION_MIN_INTERVAL_MS)).toEqual({ action: "send" });
  });

  it("không gửi chồng khi lần trước chưa trả lời", () => {
    expect(nextSend({ ...INITIAL_THROTTLE, inFlight: true }, t0)).toEqual({ action: "busy" });
  });

  it("PT429: chờ đúng số giây máy chủ yêu cầu (lấy mốc muộn hơn)", () => {
    const blocked = { lastSentAt: t0, blockedUntil: t0 + 45_000, inFlight: false };
    expect(nextSend(blocked, t0 + 31_000)).toEqual({ action: "wait", ms: 14_000 });
    expect(nextSend(blocked, t0 + 45_000)).toEqual({ action: "send" });
    expect(retryAfterMs("12")).toBe(12_000);
    expect(retryAfterMs("1.2")).toBe(2000);
    expect(retryAfterMs(null)).toBe(LOCATION_MIN_INTERVAL_MS);
    expect(retryAfterMs("abc")).toBe(LOCATION_MIN_INTERVAL_MS);
    expect(retryAfterMs("-3")).toBe(LOCATION_MIN_INTERVAL_MS);
    expect(retryAfterMs("99999")).toBe(600_000);
  });

  it("làm tròn 4 chữ số (~11 m) trước khi gửi; độ chính xác là số nguyên hợp lệ", () => {
    expect(roundCoord(10.77254999)).toBe(10.7725);
    expect(roundCoord(106.69876)).toBe(106.6988);
    expect(accuracyForRpc(12.6)).toBe(13);
    expect(accuracyForRpc(null)).toBeNull();
    expect(accuracyForRpc(Number.NaN)).toBeNull();
    expect(accuracyForRpc(-1)).toBeNull();
    expect(accuracyForRpc(1e9)).toBe(100_000);
  });
});

const stop = (over: Partial<ModelStop> & Pick<ModelStop, "id" | "seq">): ModelStop => ({
  kind: "pickup",
  status: "pending",
  location: { lat: 10.77 + over.seq / 100, lng: 106.69 },
  ...over,
});

describe("mô hình chuyến của TNV", () => {
  it("giai đoạn theo trạng thái + accepted_at", () => {
    expect(volunteerPhase("assigned", null)).toBe("awaiting_response");
    expect(volunteerPhase("assigned", "2026-10-08T01:00:00Z")).toBe("accepted");
    expect(volunteerPhase("in_progress", null)).toBe("in_progress");
    expect(volunteerPhase("completed", "x")).toBe("completed");
    expect(volunteerPhase("cancelled", null)).toBe("cancelled");
    expect(volunteerPhase("planned", null)).toBe("unassigned");
    expect(stopStatusText("pickup", "done")).toBe("Đã lấy hàng");
    expect(stopStatusText("dropoff", "pending")).toBe("Chờ giao về");
  });

  it("điểm kế tiếp: điểm lấy mở có thứ tự nhỏ nhất, rồi mới tới điểm giao", () => {
    const stops = [
      stop({ id: "d", seq: 3, kind: "dropoff" }),
      stop({ id: "b", seq: 2 }),
      stop({ id: "a", seq: 1, status: "done" }),
    ];
    expect(currentStop(stops)?.id).toBe("b");
    expect(currentStop(stops.map((s) => (s.id === "b" ? { ...s, status: "skipped" as const } : s)))?.id).toBe(
      "d",
    );
    expect(currentStop(stops.map((s) => ({ ...s, status: "done" as const })))).toBeNull();
    expect(pickupProgress(stops)).toEqual({ closed: 1, total: 2 });
  });

  it("chỉ đường: qua các điểm lấy còn lại rồi về điểm giao; >3 điểm trung gian thì Google dẫn tới điểm thứ 4", () => {
    const three = [
      stop({ id: "a", seq: 1 }),
      stop({ id: "b", seq: 2 }),
      stop({ id: "d", seq: 3, kind: "dropoff" }),
    ];
    const links = directionsFromHere(three)!;
    expect(links.google).toContain("destination=10.800000%2C106.690000");
    expect(links.google).toContain("waypoints=10.780000%2C106.690000%7C10.790000%2C106.690000");
    expect(links.apple).toContain("waypoint=10.780000%2C106.690000");

    const many = [1, 2, 3, 4, 5].map((n) => stop({ id: `p${n}`, seq: n }));
    const long = directionsFromHere([...many, stop({ id: "d", seq: 6, kind: "dropoff" })])!;
    expect(long.google).toContain("destination=10.810000%2C106.690000"); // điểm lấy thứ 4
    expect(new URL(long.google!).searchParams.get("waypoints")!.split("|")).toHaveLength(3);
    expect(new URL(long.apple!).searchParams.getAll("waypoint")).toHaveLength(5);

    const atDropoff = [stop({ id: "a", seq: 1, status: "done" }), stop({ id: "d", seq: 2, kind: "dropoff" })];
    expect(directionsFromHere(atDropoff)!.google).not.toContain("waypoints");
    // Thiếu toạ độ một điểm còn lại ⇒ chỉ dẫn tới điểm kế tiếp, không dựng tuyến sai
    const hidden = [
      stop({ id: "a", seq: 1 }),
      stop({ id: "b", seq: 2, location: null }),
      stop({ id: "d", seq: 3, kind: "dropoff" }),
    ];
    expect(directionsFromHere(hidden)!.google).toContain("destination=10.780000%2C106.690000");
    expect(directionsFromHere([stop({ id: "a", seq: 1, status: "done" })])).toBeNull();
  });

  it("nhóm “Hôm nay” theo ngày giờ Việt Nam", () => {
    const now = new Date("2026-10-08T15:00:00Z"); // 22:00 ngày 08/10 giờ VN
    const item = (o: Partial<TripListItem> & { id: string }): TripListItem & { id: string } => ({
      status: "assigned",
      acceptedAt: null,
      startAt: "2026-10-08T03:00:00Z",
      completedAt: null,
      cancelledAt: null,
      ...o,
    });
    const g = groupTodayTrips(
      [
        item({ id: "late", startAt: "2026-10-08T16:30:00Z" }), // 23:30 VN hôm nay
        item({ id: "tomorrow", startAt: "2026-10-08T17:30:00Z" }), // 00:30 VN ngày mai
        item({ id: "overdue", startAt: "2026-10-07T03:00:00Z" }),
        item({ id: "run", status: "in_progress" }),
        item({ id: "done", status: "completed", completedAt: "2026-10-08T10:00:00Z" }),
        item({ id: "old", status: "completed", completedAt: "2026-10-06T10:00:00Z" }),
        item({ id: "gone", status: "planned" }),
      ],
      now,
    );
    expect(g.running.map((t) => t.id)).toEqual(["run"]);
    expect(g.today.map((t) => t.id)).toEqual(["overdue", "late"]);
    expect(g.upcoming.map((t) => t.id)).toEqual(["tomorrow"]);
    expect(g.finishedToday.map((t) => t.id)).toEqual(["done"]);
    expect(vnDayKey("2026-10-08T17:30:00Z")).toBe("2026-10-09");
    expect(
      tripStartAt({ plannedStartAt: null, earliestWindowStart: "2026-10-08T02:00:00Z", createdAt: "c" }),
    ).toBe("2026-10-08T02:00:00Z");
    expect(tripStartAt({ plannedStartAt: "p", earliestWindowStart: "w", createdAt: "c" })).toBe("p");
    expect(tripStartAt({ plannedStartAt: null, earliestWindowStart: null, createdAt: "c" })).toBe("c");
  });

  it("liên hệ theo điểm dừng (số đã che), không đoán khi không khớp", () => {
    const contacts = [
      { role: "volunteer", displayName: "An", phoneMasked: "090****111" },
      { role: "charity", displayName: "Bếp", phoneMasked: "091****222" },
      { role: "store", displayName: "Tiệm A — Chi nhánh 1", phoneMasked: "092****333" },
    ];
    expect(
      contactForStop(contacts, { kind: "pickup", orgName: "Tiệm A", siteName: "Chi nhánh 1" })?.phoneMasked,
    ).toBe("092****333");
    expect(contactForStop(contacts, { kind: "dropoff", orgName: "Bếp", siteName: "Bếp chính" })?.role).toBe(
      "charity",
    );
    expect(contactForStop(contacts, { kind: "pickup", orgName: "Tiệm B", siteName: "X" })).toBeNull();
  });
});

describe("client_op_id theo ý định", () => {
  it("cùng khóa ⇒ cùng id; đổi khóa ⇒ id mới", () => {
    let n = 0;
    const gen = () => `id-${++n}`;
    const a = intentIdFor(null, "accept:1", gen);
    expect(intentIdFor(a, "accept:1", gen)).toBe(a);
    const b = intentIdFor(a, "decline:1:Bận", gen);
    expect(b).toEqual({ key: "decline:1:Bận", id: "id-2" });
  });
});

describe("hồ sơ TNV", () => {
  const base = {
    fullName: "  Nguyễn Văn An ",
    phone: "0901 234.567",
    vehicle: "motorbike" as const,
    capacityKg: "25,5",
    area: { lat: 10.776912, lng: 106.700981 },
    areaLabel: " Phường Bến Thành ",
    availabilityNote: "",
  };

  it("chuẩn hóa: SĐT bỏ khoảng trắng/dấu chấm, kg dấu phẩy, khu vực làm tròn 0,01°", () => {
    const v = profileFormSchema.parse(base);
    expect(v.phone).toBe("0901234567");
    expect(v.capacityKg).toBe(25.5);
    expect(toProfilePayload(v)).toEqual({
      vehicle: "motorbike",
      capacity_kg: 25.5,
      lat: 10.78,
      lng: 106.7,
      base_area_label: "Phường Bến Thành",
      availability_note: null,
    });
    expect(snapArea({ lat: 10.7749, lng: 106.6951 })).toEqual({ lat: 10.77, lng: 106.7 });
    expect(toProfilePayload(profileFormSchema.parse({ ...base, area: null }))).toMatchObject({
      lat: null,
      lng: null,
    });
  });

  it("báo lỗi tiếng Việt theo trường", () => {
    const r = profileFormSchema.safeParse({
      ...base,
      fullName: "A",
      phone: "12ab",
      capacityKg: "600",
      area: { lat: 21.02, lng: 105.85 },
    });
    expect(r.success).toBe(false);
    const fields = new Set(r.error!.issues.map((i) => String(i.path[0])));
    expect(fields).toEqual(new Set(["fullName", "phone", "capacityKg", "area"]));
  });
});

describe("đồng ý vị trí", () => {
  it("văn bản gồm phiên bản chính sách và đủ 5 ý (mục đích, chỉ khi mở, làm tròn, ai xem, rút lại)", async () => {
    const text = locationConsentText();
    expect(text).toContain(`phiên bản ${POLICY_VERSION}`);
    expect(LOCATION_CONSENT_POINTS).toHaveLength(5);
    expect(text).toContain("11 m");
    expect(text).toContain("Cửa hàng chỉ thấy giờ dự kiến tới");
    expect(await sha256Hex(text)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("lỗi RPC chuyến → tiếng Việt", () => {
  it("theo thao tác và detail", () => {
    expect(
      mapTripError({ code: "PT409", message: "invalid_state", details: "trip_not_started" }, "check_in")
        .message,
    ).toBe("Hãy bấm “Bắt đầu chuyến” trước khi check-in.");
    expect(
      mapTripError({ code: "PT409", message: "invalid_state", details: "dropoff_stop" }, "skip").message,
    ).toBe("Không thể bỏ qua điểm giao về tổ chức.");
    expect(
      mapTripError({ code: "PT409", message: "invalid_state", details: "already_accepted" }, "respond")
        .message,
    ).toBe("Bạn đã nhận chuyến này rồi.");
    expect(mapTripError({ code: "PT403", message: "not_authorized" }, "start").message).toMatch(
      /không còn được giao/,
    );
    expect(mapTripError({ code: "PT429", message: "rate_limited", hint: "20" }, "incident").message).toMatch(
      /20 giây/,
    );
    const field = mapTripError(
      { code: "PT422", message: "validation_failed", details: '{"capacity_kg":"1-500"}' },
      "profile",
    );
    expect(field.fieldErrors).toEqual({ capacity_kg: "Sức chở từ 1 đến 500 kg." });
    expect(field.message).toBe("Sức chở từ 1 đến 500 kg.");
  });
});

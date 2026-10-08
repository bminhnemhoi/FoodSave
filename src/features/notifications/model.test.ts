import { describe, expect, it } from "vitest";

import {
  badgeText,
  bellLabel,
  groupNotifications,
  iconKind,
  mergeNotifications,
  type NotificationItem,
  safeLinkPath,
  toNotificationItem,
} from "./model";

const item = (id: string, at: string, over: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  event: "allocation_requested",
  title: `Thông báo ${id}`,
  body: "",
  href: "/store/inventory",
  urgent: false,
  read: false,
  at,
  ...over,
});

describe("notifications model", () => {
  it("nhãn chuông và huy hiệu", () => {
    expect(bellLabel(0)).toBe("Thông báo");
    expect(bellLabel(3)).toBe("Thông báo, 3 chưa đọc");
    expect(badgeText(7)).toBe("7");
    expect(badgeText(100)).toBe("99+");
  });

  it("chỉ chấp nhận đường dẫn nội bộ", () => {
    expect(safeLinkPath("/store/inventory?offer=1")).toBe("/store/inventory?offer=1");
    expect(safeLinkPath("/")).toBe("/");
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "/a b",
      "/\\evil",
      "",
      null,
    ]) {
      expect(safeLinkPath(bad)).toBeNull();
    }
    expect(safeLinkPath(`/${"a".repeat(300)}`)).toBeNull();
  });

  it("ánh xạ dòng DB → mục hiển thị (deliver_after là thời điểm, GẤP, đã đọc, link an toàn)", () => {
    const i = toNotificationItem({
      id: "n1",
      event: "offer_turned_red",
      title: "GẤP · Lô Đỏ gần bạn: Bánh mì",
      body: "x",
      link_path: "//evil.example",
      urgency: "urgent",
      read_at: null,
      deliver_after: "2026-10-08T12:00:00Z",
    });
    expect(i).toEqual({
      id: "n1",
      event: "offer_turned_red",
      title: "GẤP · Lô Đỏ gần bạn: Bánh mì",
      body: "x",
      href: null,
      urgent: true,
      read: false,
      at: "2026-10-08T12:00:00Z",
    });
    expect(
      toNotificationItem({
        id: "n2",
        event: "offer_expired",
        title: "t",
        body: "",
        link_path: null,
        urgency: "normal",
        read_at: "2026-10-08T12:00:00Z",
        deliver_after: "2026-10-08T11:00:00Z",
      }).read,
    ).toBe(true);
  });

  it("gộp Realtime: bỏ trùng, mới nhất trước, giới hạn số mục", () => {
    const cur = [item("a", "2026-10-08T10:00:00Z"), item("b", "2026-10-08T09:00:00Z")];
    const merged = mergeNotifications(cur, [
      item("c", "2026-10-08T11:00:00Z"),
      item("a", "2026-10-08T10:00:00Z", { read: true }),
    ]);
    expect(merged.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(merged[1]!.read).toBe(true);
    expect(mergeNotifications(cur, [item("c", "2026-10-08T11:00:00Z")], 2).map((i) => i.id)).toEqual([
      "c",
      "a",
    ]);
  });

  it("nhóm: GẤP chưa đọc lên đầu, rồi Hôm nay / Hôm qua / Trước đó theo giờ Việt Nam", () => {
    // 08/10/2026 08:00 giờ VN
    const now = new Date("2026-10-08T01:00:00Z");
    const groups = groupNotifications(
      [
        item("u", "2026-10-07T20:00:00Z", { urgent: true }), // 03:00 ngày 08/10 VN
        item("ur", "2026-10-08T00:30:00Z", { urgent: true, read: true }),
        item("t", "2026-10-07T17:30:00Z"), // 00:30 ngày 08/10 VN ⇒ hôm nay
        item("y", "2026-10-07T16:30:00Z"), // 23:30 ngày 07/10 VN ⇒ hôm qua
        item("e", "2026-10-01T05:00:00Z"),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["GẤP", ["u"]],
      ["Hôm nay", ["ur", "t"]],
      ["Hôm qua", ["y"]],
      ["Trước đó", ["e"]],
    ]);
    expect(groupNotifications([], now)).toEqual([]);
  });
});

describe("iconKind", () => {
  it("mỗi sự kiện vòng lõi có một nhóm icon; sự kiện chưa dùng rơi về mặc định", () => {
    expect(iconKind("offer_turned_red")).toBe("offer");
    expect(iconKind("allocation_requested")).toBe("request");
    expect(iconKind("allocation_confirmed")).toBe("confirmed");
    expect(iconKind("allocation_rejected")).toBe("rejected");
    expect(iconKind("allocation_expired")).toBe("expired");
    expect(iconKind("pickup_cancelled")).toBe("cancelled");
    expect(iconKind("pickup_assigned")).toBe("trip");
    expect(iconKind("delivery_completed")).toBe("delivered");
    expect(iconKind("bundle_shortfall")).toBe("need");
    expect(iconKind("org_reviewed")).toBe("org");
    expect(iconKind("org_suspended")).toBe("warning");
    expect(iconKind("monthly_report_ready")).toBe("other");
  });
});

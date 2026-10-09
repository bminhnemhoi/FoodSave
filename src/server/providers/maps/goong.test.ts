import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "../types";
import { createGoongProvider, HCMC_CENTER } from "./goong";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Goong adapter (fetch giả lập)", () => {
  it("autocomplete luôn gửi ưu tiên vị trí (mặc định tâm TP.HCM) và dùng API v2", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe("/v2/place/autocomplete");
      expect(u.searchParams.get("location")).toBe(`${HCMC_CENTER.lat},${HCMC_CENTER.lng}`);
      expect(u.searchParams.get("sessiontoken")).toBe("s1");
      return json({
        predictions: [
          {
            place_id: "p1",
            description: "135 Nam Kỳ Khởi Nghĩa, Bến Thành, Hồ Chí Minh",
            structured_formatting: {
              main_text: "135 Nam Kỳ Khởi Nghĩa",
              secondary_text: "Bến Thành, Hồ Chí Minh",
            },
          },
        ],
      });
    });
    const maps = createGoongProvider("k", fetchImpl as typeof fetch);
    const out = await maps.autocomplete("135 Nam Kỳ Khởi Nghĩa", { sessionToken: "s1" });
    expect(out).toEqual([
      {
        id: "p1",
        mainText: "135 Nam Kỳ Khởi Nghĩa",
        secondaryText: "Bến Thành, Hồ Chí Minh",
        distanceM: undefined,
      },
    ]);
  });

  it("route giải mã polyline thành GeoJSON [lng, lat] và cộng dồn các chặng", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) =>
      json({
        routes: [
          {
            overview_polyline: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
            legs: [
              { distance: { value: 1000 }, duration: { value: 200 } },
              { distance: { value: 500 }, duration: { value: 100 } },
            ],
          },
        ],
      }),
    );
    const maps = createGoongProvider("k", fetchImpl as typeof fetch);
    const r = await maps.route({
      mode: "motorbike",
      points: [
        { lat: 10.77, lng: 106.69 },
        { lat: 10.78, lng: 106.7 },
        { lat: 10.79, lng: 106.71 },
      ],
    });
    expect(r.distanceM).toBe(1500);
    expect(r.durationS).toBe(300);
    expect(r.geometry.coordinates[0]).toEqual([-120.2, 38.5]); // điểm đầu của polyline mẫu, đúng thứ tự [lng, lat]
    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get("vehicle")).toBe("bike");
  });

  it("place detail / reverse: phường tự điền có tiền tố đầy đủ (Goong trả tên trần — UAT 09/10 C3)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      const item = (commune: string) => ({
        formatted_address: `227 Nguyễn Văn Cừ, ${commune}, Hồ Chí Minh`,
        geometry: { location: { lat: 10.7626, lng: 106.6822 } },
        compound: { commune, province: "Hồ Chí Minh" },
      });
      return u.pathname === "/v2/place/detail"
        ? json({ result: item("Chợ Quán") })
        : json({ results: [item("Hiệp Phước")] });
    });
    const maps = createGoongProvider("k", fetchImpl as typeof fetch);
    const place = await maps.resolveSuggestion("p1", { sessionToken: "s1" });
    expect(place.ward).toBe("Phường Chợ Quán");
    expect(place.city).toBe("Hồ Chí Minh");
    const rev = await maps.reverseGeocode({ lat: 10.63, lng: 106.76 });
    expect(rev?.ward).toBe("Xã Hiệp Phước");
  });

  it("ánh xạ lỗi HTTP sang ProviderError có cờ retryable", async () => {
    const maps429 = createGoongProvider("k", (async () => json({}, 429)) as typeof fetch);
    await expect(maps429.reverseGeocode({ lat: 1, lng: 1 })).rejects.toMatchObject({
      kind: "rate_limited",
      retryable: true,
    });
    const maps403 = createGoongProvider("k", (async () => json({}, 403)) as typeof fetch);
    await expect(maps403.reverseGeocode({ lat: 1, lng: 1 })).rejects.toBeInstanceOf(ProviderError);
  });

  it("từ chối ma trận quá 625 phần tử mà không gọi mạng", async () => {
    const fetchImpl = vi.fn();
    const maps = createGoongProvider("k", fetchImpl as unknown as typeof fetch);
    const many = Array.from({ length: 26 }, () => ({ lat: 10, lng: 106 }));
    await expect(maps.matrix(many, many, "motorbike")).rejects.toMatchObject({ kind: "bad_request" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe.runIf(process.env.LIVE === "1" && !!process.env.GOONG_API_KEY)("Goong API thật (LIVE=1)", () => {
  const live = () => createGoongProvider(process.env.GOONG_API_KEY ?? "");

  it("135 Nam Kỳ Khởi Nghĩa qua autocomplete + detail nằm ở trung tâm, không phải Vũng Tàu", async () => {
    const maps = live();
    const [first] = await maps.autocomplete("135 Nam Kỳ Khởi Nghĩa", { sessionToken: "live-test" });
    expect(first).toBeDefined();
    const place = await maps.resolveSuggestion(first!.id, { sessionToken: "live-test" });
    expect(Math.abs(place.location.lat - 10.778)).toBeLessThan(0.01);
    expect(Math.abs(place.location.lng - 106.696)).toBeLessThan(0.01);
  });

  it("tuyến xe máy nhiều điểm dừng có geometry và đúng số chặng", async () => {
    const r = await live().route({
      mode: "motorbike",
      points: [
        { lat: 10.7725, lng: 106.698 },
        { lat: 10.7578, lng: 106.6593 },
        { lat: 10.7497, lng: 106.6511 },
      ],
    });
    expect(r.legs).toHaveLength(2);
    expect(r.geometry.coordinates.length).toBeGreaterThan(10);
    expect(r.distanceM).toBeGreaterThan(3000);
  });
});

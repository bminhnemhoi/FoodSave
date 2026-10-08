import { describe, expect, it } from "vitest";

import { boundsOf, googleMapsDirectionsUrl, parseEwkbPoint, parseLineString, straightLine } from "./geo";

/** EWKB little-endian Point SRID 4326 của (lng, lat) — dựng giống PostGIS để kiểm parser. */
function ewkbHex(lng: number, lat: number, srid = true): string {
  const buf = new ArrayBuffer(srid ? 25 : 21);
  const v = new DataView(buf);
  v.setUint8(0, 1);
  v.setUint32(1, srid ? 0x20000001 : 1, true);
  let o = 5;
  if (srid) {
    v.setUint32(5, 4326, true);
    o = 9;
  }
  v.setFloat64(o, lng, true);
  v.setFloat64(o + 8, lat, true);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

describe("parseEwkbPoint", () => {
  it("đọc điểm geography do PostgREST trả về", () => {
    // Giá trị thật của PostGIS: ST_GeogFromText('SRID=4326;POINT(106.698 10.7725)')
    expect(parseEwkbPoint("0101000020E6100000E9263108ACAC5A40EC51B81E858B2540")).toEqual({
      lat: expect.closeTo(10.7725, 9),
      lng: expect.closeTo(106.698, 9),
    });
  });

  it("đọc cả có và không có SRID", () => {
    expect(parseEwkbPoint(ewkbHex(106.7, 10.77))).toEqual({ lat: 10.77, lng: 106.7 });
    expect(parseEwkbPoint(ewkbHex(106.7, 10.77, false))).toEqual({ lat: 10.77, lng: 106.7 });
  });

  it("từ chối dữ liệu sai", () => {
    expect(parseEwkbPoint(null)).toBeNull();
    expect(parseEwkbPoint("")).toBeNull();
    expect(parseEwkbPoint("zz")).toBeNull();
    expect(parseEwkbPoint("0102000020E6100000")).toBeNull(); // LineString, quá ngắn
    expect(parseEwkbPoint(ewkbHex(200, 10))).toBeNull();
  });
});

describe("parseLineString / straightLine / boundsOf", () => {
  it("nhận GeoJSON LineString hợp lệ", () => {
    const line = {
      type: "LineString",
      coordinates: [
        [106.7, 10.77],
        [106.71, 10.78],
      ],
    };
    expect(parseLineString(line)).toEqual(line);
    expect(parseLineString({ type: "Point", coordinates: [1, 2] })).toBeNull();
    expect(parseLineString({ type: "LineString", coordinates: [[1, 2]] })).toBeNull();
    expect(
      parseLineString({
        type: "LineString",
        coordinates: [
          [1, "x"],
          [2, 3],
        ],
      }),
    ).toBeNull();
    expect(parseLineString("0102")).toBeNull();
  });

  it("nối thẳng các điểm theo thứ tự", () => {
    expect(straightLine([{ lat: 1, lng: 2 }])).toBeNull();
    expect(
      straightLine([
        { lat: 10, lng: 106 },
        { lat: 11, lng: 107 },
      ]),
    ).toEqual({
      type: "LineString",
      coordinates: [
        [106, 10],
        [107, 11],
      ],
    });
  });

  it("khung bao", () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        { lat: 10.8, lng: 106.6 },
        { lat: 10.7, lng: 106.7 },
      ]),
    ).toEqual([
      [106.6, 10.7],
      [106.7, 10.8],
    ]);
  });
});

describe("googleMapsDirectionsUrl", () => {
  it("chỉ đường xe máy tới một điểm", () => {
    const url = new URL(googleMapsDirectionsUrl({ lat: 10.7725, lng: 106.698 }));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("10.772500,106.698000");
    expect(url.searchParams.get("travelmode")).toBe("two-wheeler");
    expect(url.searchParams.has("waypoints")).toBe(false);
  });

  it("cả tuyến với điểm dừng (tối đa 9)", () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ lat: 10 + i / 100, lng: 106 }));
    const url = new URL(googleMapsDirectionsUrl(pts[0]!, { waypoints: pts, mode: "driving" }));
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(9);
  });
});

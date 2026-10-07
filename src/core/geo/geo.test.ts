import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatAddress, streetPart } from "./address";
import { circlePolygon } from "./circle";
import { destinationPoint, haversineM } from "./distance";
import { DEFAULT_MAP_CENTER, SERVICE_AREA_BBOX, isInServiceArea, isValidLatLng } from "./service-area";

const BEN_THANH = { lat: 10.77254, lng: 106.69798 };

describe("haversineM", () => {
  it("bằng 0 cho cùng một điểm", () => {
    expect(haversineM(BEN_THANH, BEN_THANH)).toBe(0);
  });

  it("Chợ Bến Thành → Nhà thờ Đức Bà ≈ 800 m", () => {
    const d = haversineM(BEN_THANH, { lat: 10.77979, lng: 106.69902 });
    expect(d).toBeGreaterThan(780);
    expect(d).toBeLessThan(830);
  });

  it("1 độ vĩ ≈ 111,2 km", () => {
    expect(haversineM({ lat: 10, lng: 106 }, { lat: 11, lng: 106 })).toBeCloseTo(111_195, -2);
  });
});

describe("destinationPoint", () => {
  it("đi về phía bắc làm tăng vĩ độ, giữ kinh độ", () => {
    const p = destinationPoint(BEN_THANH, 1000, 0);
    expect(p.lng).toBeCloseTo(BEN_THANH.lng, 9);
    expect(p.lat).toBeGreaterThan(BEN_THANH.lat);
    expect(haversineM(BEN_THANH, p)).toBeCloseTo(1000, 3);
  });

  it("chuẩn hoá kinh độ khi vượt kinh tuyến 180", () => {
    const p = destinationPoint({ lat: 0, lng: 179.99 }, 5000, 90);
    expect(p.lng).toBeLessThan(-179);
  });
});

describe("circlePolygon", () => {
  it("trả về vòng khép kín 64 bước mặc định", () => {
    const poly = circlePolygon(BEN_THANH, 5);
    const ring = poly.coordinates[0];
    expect(poly.type).toBe("Polygon");
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
  });

  it("mọi đỉnh cách tâm đúng bán kính", () => {
    const ring = circlePolygon(BEN_THANH, 3, 16).coordinates[0];
    for (const [lng, lat] of ring) {
      expect(haversineM(BEN_THANH, { lat, lng })).toBeCloseTo(3000, 2);
    }
  });

  it("đỉnh đầu tiên nằm ở phía bắc tâm", () => {
    const [lng, lat] = circlePolygon(BEN_THANH, 1, 8).coordinates[0][0];
    expect(lng).toBeCloseTo(BEN_THANH.lng, 9);
    expect(lat).toBeGreaterThan(BEN_THANH.lat);
  });

  it("vòng ngoài đi ngược chiều kim đồng hồ (RFC 7946)", () => {
    const ring = circlePolygon(BEN_THANH, 2, 32).coordinates[0];
    // Diện tích có dấu (shoelace) dương ⇔ ngược chiều kim đồng hồ trên mặt phẳng lng/lat
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
    }
    expect(area).toBeGreaterThan(0);
  });

  it("từ chối tham số không hợp lệ", () => {
    expect(() => circlePolygon(BEN_THANH, 0)).toThrow(RangeError);
    expect(() => circlePolygon(BEN_THANH, -1)).toThrow(RangeError);
    expect(() => circlePolygon(BEN_THANH, Number.NaN)).toThrow(RangeError);
    expect(() => circlePolygon(BEN_THANH, 1, 2)).toThrow(RangeError);
    expect(() => circlePolygon(BEN_THANH, 1, 10.5)).toThrow(RangeError);
    expect(() => circlePolygon({ lat: 91, lng: 0 }, 1)).toThrow(RangeError);
    expect(() => circlePolygon({ lat: 10, lng: Number.POSITIVE_INFINITY }, 1)).toThrow(RangeError);
  });

  it("thuộc tính: mọi đỉnh nằm trên vòng tròn (sai số < 0,1%) với tâm trong vùng phục vụ", () => {
    const b = SERVICE_AREA_BBOX;
    fc.assert(
      fc.property(
        fc.double({ min: b.minLat, max: b.maxLat, noNaN: true }),
        fc.double({ min: b.minLng, max: b.maxLng, noNaN: true }),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        (lat, lng, radiusKm) => {
          const ring = circlePolygon({ lat, lng }, radiusKm, 24).coordinates[0];
          return ring.every(([x, y]) => {
            const d = haversineM({ lat, lng }, { lat: y, lng: x });
            return Math.abs(d - radiusKm * 1000) <= radiusKm;
          });
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("vùng phục vụ", () => {
  it("chấp nhận các điểm trong TP.HCM", () => {
    expect(isInServiceArea(BEN_THANH)).toBe(true);
    expect(isInServiceArea(DEFAULT_MAP_CENTER)).toBe(true);
    expect(isInServiceArea({ lat: 10.85023, lng: 106.7557 })).toBe(true); // Chợ Thủ Đức
    expect(isInServiceArea({ lat: 11.04585, lng: 106.63304 })).toBe(true); // Hòa Lợi (Bình Dương cũ)
    expect(isInServiceArea({ lat: 10.346, lng: 107.084 })).toBe(true); // Vũng Tàu (BR-VT cũ)
    expect(isInServiceArea({ lat: 10.53, lng: 107.4 })).toBe(true); // Xuyên Mộc
    expect(isInServiceArea({ lat: 11.45, lng: 106.6 })).toBe(true); // bắc Bình Dương cũ
  });

  it("biên khung bao tính là bên trong", () => {
    const b = SERVICE_AREA_BBOX;
    expect(isInServiceArea({ lat: b.minLat, lng: b.minLng })).toBe(true);
    expect(isInServiceArea({ lat: b.maxLat, lng: b.maxLng })).toBe(true);
  });

  it("từ chối điểm ngoài vùng hoặc không hợp lệ", () => {
    expect(isInServiceArea({ lat: 21.0285, lng: 105.8542 })).toBe(false); // Hà Nội
    expect(isInServiceArea({ lat: 10.0452, lng: 105.7469 })).toBe(false); // Cần Thơ
    expect(isInServiceArea({ lat: 8.6826, lng: 106.6089 })).toBe(false); // Côn Đảo
    expect(isInServiceArea({ lat: 10.93, lng: 108.1 })).toBe(false); // Phan Thiết (Lâm Đồng mới)
    expect(isInServiceArea(null)).toBe(false);
    expect(isInServiceArea(undefined)).toBe(false);
    expect(isInServiceArea({ lat: Number.NaN, lng: 106.7 })).toBe(false);
  });

  it("isValidLatLng kiểm miền WGS84", () => {
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidLatLng({ lat: 90.1, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: -180.5 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe("địa chỉ", () => {
  it("bỏ phường và tỉnh/thành ở cuối địa chỉ", () => {
    expect(streetPart("135 Nam Kỳ Khởi Nghĩa, Bến Thành, Hồ Chí Minh", "Bến Thành", "Hồ Chí Minh")).toBe(
      "135 Nam Kỳ Khởi Nghĩa",
    );
  });

  it("so khớp không phân biệt hoa thường và tiền tố hành chính", () => {
    expect(streetPart("45 Nguyễn Huệ, Phường Sài Gòn, TP. Hồ Chí Minh", "Sài Gòn", "Hồ Chí Minh")).toBe(
      "45 Nguyễn Huệ",
    );
  });

  it("giữ nguyên khi không có phần trùng hoặc chỉ có một phần", () => {
    expect(streetPart("Chợ Bến Thành, Bến Thành, Hồ Chí Minh", "Tân Định", null)).toBe(
      "Chợ Bến Thành, Bến Thành, Hồ Chí Minh",
    );
    expect(streetPart("Bến Thành", "Bến Thành", "Hồ Chí Minh")).toBe("Bến Thành");
    expect(streetPart("  ", null, null)).toBe("");
  });

  it("ghép địa chỉ đầy đủ, bỏ phần trống", () => {
    expect(formatAddress("45 Nguyễn Huệ", "Sài Gòn", "Hồ Chí Minh")).toBe(
      "45 Nguyễn Huệ, Sài Gòn, Hồ Chí Minh",
    );
    expect(formatAddress("45 Nguyễn Huệ", null, " ")).toBe("45 Nguyễn Huệ");
  });
});

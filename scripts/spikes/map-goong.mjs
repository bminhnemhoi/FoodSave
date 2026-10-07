/* eslint-disable no-console -- script spike in báo cáo ra stdout */
// Spike P0-17/18: đánh giá Goong (geocode v2, autocomplete, directions xe máy, distance matrix)
// So khớp với nguồn độc lập OpenStreetMap/Nominatim (1 req/s theo chính sách sử dụng).
// Chạy: GOONG_API_KEY=... node scripts/spikes/map-goong.mjs > docs/spikes/map-goong.md
const KEY = process.env.GOONG_API_KEY;
if (!KEY) throw new Error("Thiếu GOONG_API_KEY");

const ADDRESSES = [
  "Chợ Bến Thành, TP. Hồ Chí Minh",
  "Nhà thờ Đức Bà, TP. Hồ Chí Minh",
  "Bưu điện Trung tâm Sài Gòn, TP. Hồ Chí Minh",
  "Dinh Độc Lập, TP. Hồ Chí Minh",
  "Chợ Bình Tây, TP. Hồ Chí Minh",
  "Landmark 81, TP. Hồ Chí Minh",
  "Bệnh viện Chợ Rẫy, TP. Hồ Chí Minh",
  "Chợ Tân Định, TP. Hồ Chí Minh",
  "Thảo Cầm Viên Sài Gòn, TP. Hồ Chí Minh",
  "Chợ Bà Chiểu, TP. Hồ Chí Minh",
  "Đại học Bách khoa TP.HCM, 268 Lý Thường Kiệt, TP. Hồ Chí Minh",
  "Công viên Văn hóa Đầm Sen, TP. Hồ Chí Minh",
  "Crescent Mall, TP. Hồ Chí Minh",
  "Chợ Thủ Đức, TP. Hồ Chí Minh",
  "135 Nam Kỳ Khởi Nghĩa, TP. Hồ Chí Minh",
  "227 Nguyễn Văn Cừ, TP. Hồ Chí Minh",
  "10 Mai Chí Thọ, TP. Hồ Chí Minh",
  "280 An Dương Vương, TP. Hồ Chí Minh",
  "Chung cư Sunrise City, Nguyễn Hữu Thọ, TP. Hồ Chí Minh",
  "Hẻm 51 Cao Thắng, TP. Hồ Chí Minh",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const haversineM = (a, b) => {
  const R = 6371000,
    rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function goongGeocode(address) {
  const t0 = Date.now();
  const r = await fetch(
    `https://rsapi.goong.io/v2/geocode?address=${encodeURIComponent(address)}&api_key=${KEY}`,
  );
  const j = await r.json();
  const top = j.results?.[0];
  return top
    ? {
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
        label: top.formatted_address,
        ms: Date.now() - t0,
      }
    : null;
}

async function nominatim(address) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&q=${encodeURIComponent(address)}`,
    { headers: { "User-Agent": "FoodSave-spike/1.0 (foodsavevietnam@gmail.com)" } },
  );
  const j = await r.json();
  return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
}

const rows = [];
for (const address of ADDRESSES) {
  const g = await goongGeocode(address);
  const n = await nominatim(address.replace("TP. Hồ Chí Minh", "Ho Chi Minh City"));
  await sleep(1100);
  const d = g && n ? haversineM(g, n) : null;
  rows.push({ address, g, n, d });
}

// Directions xe máy — 3 tuyến thật
const ROUTES = [
  ["Chợ Bến Thành → Landmark 81", "10.7725,106.6980", "10.7950,106.7218"],
  ["Chợ Bình Tây → BV Chợ Rẫy", "10.7497,106.6511", "10.7578,106.6593"],
  ["Crescent Mall → Chợ Bến Thành", "10.7290,106.7187", "10.7725,106.6980"],
];
const routeRows = [];
for (const [name, o, dst] of ROUTES) {
  const out = {};
  for (const vehicle of ["bike", "car"]) {
    const r = await fetch(
      `https://rsapi.goong.io/Direction?origin=${o}&destination=${dst}&vehicle=${vehicle}&api_key=${KEY}`,
    );
    const j = await r.json();
    const leg = j.routes?.[0]?.legs?.[0];
    out[vehicle] = leg
      ? {
          km: leg.distance.value / 1000,
          min: leg.duration.value / 60,
          poly: !!j.routes[0].overview_polyline?.points,
        }
      : null;
  }
  routeRows.push({ name, ...out });
}

const t0 = Date.now();
const dm = await (
  await fetch(
    `https://rsapi.goong.io/DistanceMatrix?origins=10.7725,106.6980&destinations=${["10.7950,106.7218", "10.7497,106.6511", "10.7290,106.7187", "10.7578,106.6593", "10.8015,106.6987"].join("|")}&vehicle=bike&api_key=${KEY}`,
  )
).json();
const dmMs = Date.now() - t0;

const ac = await (
  await fetch(
    `https://rsapi.goong.io/v2/place/autocomplete?input=${encodeURIComponent("51 Cao Thắng")}&location=10.7769,106.7009&api_key=${KEY}`,
  )
).json();

const within50 = rows.filter((r) => r.d !== null && r.d < 50).length;
const within150 = rows.filter((r) => r.d !== null && r.d < 150).length;
const fmt = (n, p = 0) => (n === null || n === undefined ? "—" : n.toFixed(p));

console.log(`# Spike bản đồ Goong (P0-17/18)

- Ngày chạy: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
- Script: \`scripts/spikes/map-goong.mjs\` (chạy lại được)
- Phương pháp: geocode bằng **Goong v2**, đối chiếu với **OpenStreetMap/Nominatim** làm nguồn độc lập. Không có "ghim chuẩn đo tay": khoảng lệch là **giữa hai nguồn**, nên chỉ là chỉ báo. Lệch lớn thường do Nominatim không tìm đúng điểm (POI, hẻm).

## A. Geocode 20 địa chỉ TP.HCM

| # | Địa chỉ | Goong (lat, lng) | Địa chỉ Goong trả về | Lệch so OSM (m) | Goong ms |
|---|---|---|---|---|---|
${rows.map((r, i) => `| ${i + 1} | ${r.address} | ${r.g ? `${r.g.lat.toFixed(5)}, ${r.g.lng.toFixed(5)}` : "không tìm thấy"} | ${r.g?.label ?? "—"} | ${fmt(r.d)} | ${r.g?.ms ?? "—"} |`).join("\n")}

**Tổng hợp:** Goong trả kết quả cho ${rows.filter((r) => r.g).length}/20 địa chỉ; trùng OSM < 50 m: **${within50}/20**, < 150 m: **${within150}/20**.

## B. Chỉ đường (Directions)

| Tuyến | Xe máy (km / phút) | Ô tô (km / phút) | Có polyline |
|---|---|---|---|
${routeRows.map((r) => `| ${r.name} | ${fmt(r.bike?.km, 2)} / ${fmt(r.bike?.min)} | ${fmt(r.car?.km, 2)} / ${fmt(r.car?.min)} | ${r.bike?.poly ? "có" : "không"} |`).join("\n")}

## C. Distance Matrix 1×5 (xe máy)

Thời gian phản hồi: ${dmMs} ms. Kết quả: ${dm.rows?.[0]?.elements?.map((e) => `${e.distance?.text}/${e.duration?.text}`).join(" · ")}

## D. Autocomplete v2 ("51 Cao Thắng", ưu tiên quanh trung tâm)

${(ac.predictions ?? [])
  .slice(0, 5)
  .map((p) => `- ${p.description}`)
  .join("\n")}
`);

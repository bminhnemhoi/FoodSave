// Sinh lịch sử demo có thể tái lập (cùng ngày ⇒ cùng dữ liệu) cho public.demo_seed_history.
// Mỗi ngày còn trống trong [hôm nay − N, hôm qua] nhận 1–3 lần bàn giao (08:00–20:00 giờ VN) và thỉnh
// thoảng một lô hết hạn không ai nhận, để biểu đồ ESG có xu hướng và tỷ lệ "hết hạn chưa nhận".
import { HISTORY_CATALOG } from "./dataset.mjs";
import { HOUR, MINUTE, vnDate, vnMidnight } from "./hours.mjs";

/** PRNG mulberry32, hạt giống = FNV-1a của chuỗi. */
function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STORE_WEIGHTS = {
  judge_store: 2,
  may: 2,
  bep_xanh: 2,
  som_mai: 2,
  nha_lanh: 1.5,
  la_chuoi: 2,
  an_nhien: 1,
  vuon_nha: 1,
};

function pickWeighted(r, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [key, w] of entries) {
    x -= w;
    if (x <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function quantity(r, item) {
  const raw = item.min + r() * (item.max - item.min);
  return item.kg ? Math.round(raw * 10) / 10 : Math.round(raw);
}

/**
 * @param orgs    map key → { id, siteId, kind, owner }
 * @param users   map account key → { id }
 * @param missingDays  ngày (Date, 00:00 giờ VN) cần sinh
 */
export function buildHistoryItems({ orgs, users, missingDays, now }) {
  const stores = Object.entries(STORE_WEIGHTS).filter(([key]) => orgs[key]?.siteId);
  const charities = Object.values(orgs).filter((o) => o.kind === "charity" && o.siteId);
  if (!stores.length || !charities.length) return [];

  const items = [];
  for (const day of missingDays) {
    const r = rng(`foodsave-demo-${vnDate(day)}`);
    const count = 1 + (r() < 0.55 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const store = orgs[pickWeighted(r, stores)];
      const charity = charities[Math.floor(r() * charities.length)];
      const catalog = HISTORY_CATALOG[store.key];
      const item = catalog[Math.floor(r() * catalog.length)];
      const at = new Date(day.getTime() + 8 * HOUR + Math.floor(r() * 12 * 60) * MINUTE);
      if (at.getTime() > now.getTime() - 2 * HOUR) continue;
      const extra = r() < 0.3 ? (item.kg ? Math.round(r() * 30) / 10 + 0.5 : 1 + Math.floor(r() * 5)) : 0;
      items.push({
        kind: "delivered",
        store_site_id: store.siteId,
        charity_site_id: charity.siteId,
        store_user_id: users[store.owner].id,
        charity_user_id: users[charity.owner].id,
        category_code: item.category,
        title: item.title,
        quantity: quantity(r, item),
        extra_quantity: extra,
        at: at.toISOString(),
      });
    }
    if (r() < 0.15) {
      const store = orgs[pickWeighted(r, stores)];
      const catalog = HISTORY_CATALOG[store.key];
      const item = catalog[Math.floor(r() * catalog.length)];
      const at = new Date(day.getTime() + 20 * HOUR);
      if (at.getTime() <= now.getTime() - 2 * HOUR) {
        items.push({
          kind: "expired",
          store_site_id: store.siteId,
          store_user_id: users[store.owner].id,
          category_code: item.category,
          title: item.title,
          quantity: quantity(r, item),
          at: at.toISOString(),
        });
      }
    }
  }
  return items;
}

/** Các ngày (00:00 giờ VN) trong [hôm nay − days, hôm qua] chưa có trong `coveredDates` (YYYY-MM-DD). */
export function missingHistoryDays(now, days, coveredDates) {
  const covered = new Set(coveredDates);
  const out = [];
  for (let k = days; k >= 1; k--) {
    const day = vnMidnight(now, -k);
    if (!covered.has(vnDate(day))) out.push(day);
  }
  return out;
}

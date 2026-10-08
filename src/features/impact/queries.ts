import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  factorSetsFromRows,
  sumImpact,
  type ImpactFactorSet,
  type ImpactTotals,
  type LedgerEntry,
} from "@/core/impact";
import { clientEnv } from "@/lib/env.client";
import { createClient } from "@/server/db/supabase";
import type { Database } from "@/types/database.types";

/**
 * Số liệu tác động thật (P2-13; DATA-MODEL §2.5, §13; ESG-METHODOLOGY §2.2, §6.6).
 *
 * - `getPublicImpact()` — cho khách (landing): đọc view `public_impact_stats` (security_invoker trên
 *   `impact_public_daily`, anon đọc được) bằng client ANON không cookie, cache theo thẻ
 *   `PUBLIC_IMPACT_TAG` 10 phút (PRD US-PUB-02 AC1). Bàn giao xong ⇒ `revalidateTag(PUBLIC_IMPACT_TAG, "max")`.
 *   Số công khai **loại dữ liệu demo**; kg demo trả riêng để hiển thị kèm nhãn.
 * - `getOrgImpact(orgId, { from, to })` — cho dashboard cửa hàng/tổ chức: cộng `impact_ledger` (credit −
 *   reversal) bằng client của người dùng (RLS: owner/manager/staff của một trong hai bên).
 * - Hệ số + nguồn đọc từ `impact_factors` (bảng công khai).
 */

export const PUBLIC_IMPACT_TAG = "public-impact";
const PUBLIC_IMPACT_REVALIDATE_SECONDS = 600;
const LEDGER_PAGE = 1000;
const LEDGER_MAX_ROWS = 50_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FactorSource = {
  metric: "co2e_kg_per_kg" | "water_l_per_kg" | "kg_per_meal";
  value: number;
  unit: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePage: string | null;
};

export type ImpactFactorsInfo = {
  /**
   * Bộ hệ số mới nhất có đủ CO₂e + suất ăn. `app_settings.impact_factor_version` không công khai nên
   * không đọc được version đang kích hoạt từ phía khách; hiện chỉ có v1 nên hai cách trùng nhau.
   */
  current: ImpactFactorSet | null;
  sources: FactorSource[];
};

export type PublicImpact =
  | {
      status: "ok";
      /** Chỉ dữ liệu thật (không demo). `waterL` = null: tổng hợp công khai không có cột nước. */
      totals: ImpactTotals;
      kg30d: number;
      /** kg của các tổ chức demo — hiển thị riêng, có nhãn "Dữ liệu demo". */
      demoKg: number;
      updatedAt: string | null;
      factors: ImpactFactorsInfo;
    }
  | { status: "unavailable" };

export type OrgImpact = {
  totals: ImpactTotals;
  /** Có dòng demo (tổ chức demo chỉ có dữ liệu demo — ESG §2.2). */
  isDemo: boolean;
  /** Các version hệ số xuất hiện trong kỳ (ESG §6.5). */
  factorVersions: string[];
  factors: ImpactFactorsInfo;
};

type FactorRow = Pick<
  Database["public"]["Tables"]["impact_factors"]["Row"],
  "version" | "metric" | "value" | "unit" | "source_title" | "source_url" | "source_page"
>;

function factorsInfo(rows: readonly FactorRow[]): ImpactFactorsInfo {
  const sets = factorSetsFromRows(rows.map((r) => ({ ...r, value: Number(r.value) })));
  const current = sets.at(-1) ?? null;
  const sources: FactorSource[] = current
    ? rows
        .filter((r) => r.version === current.version)
        .filter((r): r is FactorRow & { metric: FactorSource["metric"] } =>
          ["co2e_kg_per_kg", "water_l_per_kg", "kg_per_meal"].includes(r.metric),
        )
        .map((r) => ({
          metric: r.metric,
          value: Number(r.value),
          unit: r.unit,
          sourceTitle: r.source_title,
          sourceUrl: r.source_url,
          sourcePage: r.source_page,
        }))
    : [];
  return { current, sources };
}

const FACTOR_COLUMNS = "version, metric, value, unit, source_title, source_url, source_page";

/** Client anon không cookie; mọi request GET được cache theo thẻ (Next data cache, mô hình không Cache Components). */
function publicClient() {
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            next: { revalidate: PUBLIC_IMPACT_REVALIDATE_SECONDS, tags: [PUBLIC_IMPACT_TAG] },
          }),
      },
    },
  );
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function getPublicImpact(): Promise<PublicImpact> {
  try {
    const supabase = publicClient();
    const [statsRes, factorsRes] = await Promise.all([
      supabase
        .from("public_impact_stats")
        .select("kg_total, co2e_kg_total, meals_total, deliveries_total, kg_30d, demo_kg_total, updated_at")
        .maybeSingle(),
      supabase.from("impact_factors").select(FACTOR_COLUMNS),
    ]);
    if (statsRes.error || factorsRes.error) {
      console.error("[impact] public stats", {
        code: statsRes.error?.code ?? factorsRes.error?.code,
      });
      return { status: "unavailable" };
    }
    const s = statsRes.data;
    return {
      status: "ok",
      totals: {
        kg: num(s?.kg_total),
        co2eKg: num(s?.co2e_kg_total),
        waterL: null,
        meals: num(s?.meals_total),
        deliveries: num(s?.deliveries_total),
      },
      kg30d: num(s?.kg_30d),
      demoKg: num(s?.demo_kg_total),
      updatedAt: s?.updated_at ?? null,
      factors: factorsInfo(factorsRes.data ?? []),
    };
  } catch (err) {
    // Mất kết nối DB lúc build/ISR: landing vẫn render, khối tác động báo tạm thời chưa có số
    console.error("[impact] public stats unreachable", { name: err instanceof Error ? err.name : "unknown" });
    return { status: "unavailable" };
  }
}

export type ImpactRange = { from?: Date | string; to?: Date | string };

const iso = (v: Date | string) => (typeof v === "string" ? new Date(v) : v).toISOString();

/**
 * Tác động của một tổ chức trong khoảng `[from, to)` (theo `occurred_at`; credit = thời điểm dropoff,
 * reversal = thời điểm đảo — ESG §6.1). Người xem phải là owner/manager/staff của tổ chức (RLS); không đủ
 * quyền ⇒ tổng 0. Trả về cả version hệ số đã dùng trong kỳ.
 */
export async function getOrgImpact(orgId: string, range: ImpactRange = {}): Promise<OrgImpact> {
  // orgId đi vào bộ lọc `or=(…)` của PostgREST ⇒ chỉ nhận UUID (chống chèn bộ lọc)
  if (!UUID_RE.test(orgId)) throw new Error("orgId không hợp lệ");
  const supabase = await createClient();

  const entries: LedgerEntry[] = [];
  const versions = new Set<string>();
  let isDemo = false;
  for (let offset = 0; offset < LEDGER_MAX_ROWS; offset += LEDGER_PAGE) {
    let q = supabase
      .from("impact_ledger")
      .select("entry_type, kg, co2e_kg, water_l, meals, factor_version, is_demo")
      .or(`store_org_id.eq.${orgId},charity_org_id.eq.${orgId}`)
      .order("id", { ascending: true })
      .range(offset, offset + LEDGER_PAGE - 1);
    if (range.from) q = q.gte("occurred_at", iso(range.from));
    if (range.to) q = q.lt("occurred_at", iso(range.to));
    const { data, error } = await q;
    if (error) throw new Error(`Không tải được sổ tác động (${error.code})`);
    for (const r of data ?? []) {
      entries.push({
        entryType: r.entry_type,
        kg: num(r.kg),
        co2eKg: num(r.co2e_kg),
        waterL: r.water_l === null ? null : num(r.water_l),
        meals: num(r.meals),
      });
      versions.add(r.factor_version);
      if (r.is_demo) isDemo = true;
    }
    if (!data || data.length < LEDGER_PAGE) break;
  }

  const { data: factorRows, error: factorsError } = await supabase
    .from("impact_factors")
    .select(FACTOR_COLUMNS);
  if (factorsError) throw new Error(`Không tải được hệ số tác động (${factorsError.code})`);

  return {
    totals: sumImpact(entries),
    isDemo,
    factorVersions: [...versions].sort(),
    factors: factorsInfo(factorRows ?? []),
  };
}

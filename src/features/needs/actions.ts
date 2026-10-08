"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { toReserveBundlePayload, type ProviderRoute } from "@/core/matching";
import { loadCharityContext } from "@/features/charity-allocations/context";
import { mapRpcError, RPC_MESSAGES } from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";
import { getMapsProvider } from "@/server/providers/maps";
import type { Json } from "@/types/database.types";

import {
  mapCancelNeedError,
  mapReserveError,
  NEED_MESSAGES_SERVER,
  PUBLISH_OVERRIDES,
  type NeedActionError,
  type OfferRef,
} from "./errors";
import { planKey, type PlanView } from "./present";
import { computePlans, loadNeedCategories, loadNeedDetail, planContextFrom, type PlansData } from "./queries";
import {
  buildPublishNeedArgs,
  cancelNeedInput,
  choosePlanInput,
  findPlansInput,
  needFieldErrorsFromRpc,
  publishNeedInput,
  validateNeedForm,
  type NeedFieldErrors,
} from "./schemas";

/**
 * Server Action của luồng nhu cầu (P3-05; US-CHA-09…13). Mỗi action: zod → client Supabase của NGƯỜI DÙNG →
 * RPC (quyền, trạng thái, số lượng kiểm ở DB) → lỗi tiếng Việt cụ thể. `clientOpId` sinh ở client một lần cho
 * mỗi ý định nên gửi lại khi mất mạng không tạo trùng (DATA-MODEL §15).
 */

const invalid = (): NeedActionError => ({ code: "validation_failed", message: RPC_MESSAGES.invalid });
const unauthenticated = (): NeedActionError => ({
  code: "unauthenticated",
  message: RPC_MESSAGES.unauthenticated,
});

function revalidateNeed(needId?: string) {
  revalidatePath("/charity/needs");
  if (needId) revalidatePath(`/charity/needs/${needId}`);
  revalidatePath("/charity");
}

// ---------------------------------------------------------------------------
// Đăng nhu cầu
// ---------------------------------------------------------------------------

export type PublishNeedResult =
  | { ok: true; data: { needId: string } }
  | { ok: false; error: NeedActionError; fieldErrors?: NeedFieldErrors };

export async function publishNeed(input: z.input<typeof publishNeedInput>): Promise<PublishNeedResult> {
  const parsed = publishNeedInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: invalid() };
  if (!(await getUser())) return { ok: false, error: unauthenticated() };

  const { values, clientOpId } = parsed.data;
  const ctx = await loadCharityContext();
  const site = ctx.sites.find((s) => s.id === values.siteId);
  const fieldErrors = validateNeedForm(values, {
    now: new Date(),
    acceptedCategories: site?.acceptedCategories ?? null,
  });
  if (!site && !fieldErrors.siteId) fieldErrors.siteId = "Bạn không có quyền đăng nhu cầu cho điểm nhận này.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: invalid(), fieldErrors };

  const supabase = await createClient();
  const args = buildPublishNeedArgs(values);
  const { data, error } = await supabase.rpc("publish_need", {
    ...args,
    // RPC nhận NULL cho hai trường tùy chọn (types sinh tự động chưa đánh dấu nullable)
    p_people_to_serve: args.p_people_to_serve as number,
    p_note: args.p_note as string,
    p_client_op_id: clientOpId,
  });
  if (error) {
    const mapped = mapRpcError(error, PUBLISH_OVERRIDES);
    if (mapped.code === "server_error")
      console.error("[needs] publish_need", { code: error.code, message: error.message });
    const fields = mapped.fieldErrors
      ? needFieldErrorsFromRpc(mapped.fieldErrors, { unit: values.unit })
      : {};
    return {
      ok: false,
      error: { code: mapped.code, message: mapped.message },
      ...(Object.keys(fields).length ? { fieldErrors: fields } : {}),
    };
  }
  revalidateNeed();
  return { ok: true, data: { needId: String(data) } };
}

// ---------------------------------------------------------------------------
// Hủy nhu cầu (C12)
// ---------------------------------------------------------------------------

export type SimpleResult = { ok: true } | { ok: false; error: NeedActionError };

export async function cancelNeed(input: z.input<typeof cancelNeedInput>): Promise<SimpleResult> {
  const parsed = cancelNeedInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: invalid() };
  if (!(await getUser())) return { ok: false, error: unauthenticated() };
  const { needId, reason, clientOpId } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_need", {
    p_need_id: needId,
    p_reason: reason,
    p_client_op_id: clientOpId,
  });
  if (error) {
    const mapped = mapCancelNeedError(error);
    if (mapped.code === "server_error")
      console.error("[needs] cancel_need", { code: error.code, message: error.message });
    return { ok: false, error: mapped };
  }
  revalidateNeed(needId);
  revalidatePath("/charity/pickups", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tìm phương án (ghép lại phần thiếu)
// ---------------------------------------------------------------------------

export type PlansResult = { ok: true; data: PlansData } | { ok: false; error: NeedActionError };

async function freshPlans(needId: string): Promise<PlansResult> {
  const detail = await loadNeedDetail(needId, Date.now());
  if (!detail) return { ok: false, error: { code: "not_found", message: RPC_MESSAGES.notFound } };
  const ctx = planContextFrom(detail);
  if (!ctx) {
    if (!detail.need.live)
      return { ok: false, error: { code: "need_closed", message: NEED_MESSAGES_SERVER.needClosed } };
    if (detail.need.remaining <= 0)
      return {
        ok: false,
        error: { code: "need_already_covered", message: NEED_MESSAGES_SERVER.needCovered },
      };
    return { ok: false, error: { code: "forbidden", message: NEED_MESSAGES_SERVER.notAuthorized } };
  }
  const outcome = await computePlans(ctx, await loadNeedCategories());
  return outcome.ok ? { ok: true, data: outcome.data } : { ok: false, error: outcome.error };
}

export async function findPlans(input: z.input<typeof findPlansInput>): Promise<PlansResult> {
  const parsed = findPlansInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: invalid() };
  if (!(await getUser())) return { ok: false, error: unauthenticated() };
  return freshPlans(parsed.data.needId);
}

// ---------------------------------------------------------------------------
// Chọn phương án → (tuyến xe máy thật) → reserve_bundle
// ---------------------------------------------------------------------------

export type ChoosePlanData = {
  bundleId: string;
  requested: number;
  confirmed: number;
  stores: number;
  routeSource: "provider" | "estimate";
};

export type ChoosePlanResult =
  { ok: true; data: ChoosePlanData } | { ok: false; error: NeedActionError; plans?: PlansData };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Bundle đã tạo bằng đúng `client_op_id` này (gửi lại sau khi lần trước đã thành công). */
async function bundleByOp(
  supabase: Supabase,
  needId: string,
  clientOpId: string,
): Promise<ChoosePlanData | null> {
  const { data } = await supabase
    .from("need_bundles")
    .select("id, stop_count, route_provider, allocations(status)")
    .eq("need_id", needId)
    .eq("client_op_id", clientOpId)
    .maybeSingle();
  if (!data) return null;
  const allocs = (data.allocations ?? []) as { status: string }[];
  return {
    bundleId: data.id,
    requested: allocs.filter((a) => a.status === "requested").length,
    confirmed: allocs.filter((a) => a.status === "confirmed").length,
    stores: data.stop_count,
    routeSource: data.route_provider ? "provider" : "estimate",
  };
}

/** Tuyến xe máy thật CHỈ cho phương án được chọn và chỉ khi mọi điểm công khai vị trí (ADR-007 §5). */
async function providerRoute(
  view: PlanView,
  home: { lat: number; lng: number },
): Promise<ProviderRoute | null> {
  if (!view.allPublic || view.stops.some((s) => !s.location)) return null;
  try {
    const route = await getMapsProvider().route({
      points: [home, ...view.stops.map((s) => s.location!), home],
      mode: "motorbike",
    });
    if (route.geometry.coordinates.length < 2) return null;
    return {
      geojson: route.geometry,
      distanceM: route.distanceM,
      durationS: route.durationS,
      provider: route.provider,
    };
  } catch (err) {
    console.warn("[needs] route skipped", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function choosePlan(input: z.input<typeof choosePlanInput>): Promise<ChoosePlanResult> {
  const parsed = choosePlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: invalid() };
  if (!(await getUser())) return { ok: false, error: unauthenticated() };
  const { needId, planKey: key, clientOpId } = parsed.data;
  const supabase = await createClient();

  // Lần trước đã giữ xong (mạng rớt khi nhận phản hồi) ⇒ trả lại đúng kết quả cũ
  const done = await bundleByOp(supabase, needId, clientOpId);
  if (done) return { ok: true, data: done };

  const detail = await loadNeedDetail(needId, Date.now());
  if (!detail) return { ok: false, error: { code: "not_found", message: RPC_MESSAGES.notFound } };
  const ctx = planContextFrom(detail);
  if (!ctx) {
    const res = await freshPlans(needId);
    return {
      ok: false,
      error: res.ok ? { code: "plans_changed", message: NEED_MESSAGES_SERVER.plansChanged } : res.error,
    };
  }

  const categories = await loadNeedCategories(supabase);
  const outcome = await computePlans(ctx, categories);
  if (!outcome.ok) return { ok: false, error: outcome.error };

  // Chỉ giữ đúng phương án người dùng đã thấy; dữ liệu đổi ⇒ trả phương án mới để xem lại
  const plan = outcome.result.plans.find((p) => planKey(p.lines) === key);
  const view = outcome.data.plans.find((v) => v.key === key);
  if (!plan || !view)
    return {
      ok: false,
      error: {
        code: "plans_changed",
        replan: true,
        message:
          outcome.data.plans.length > 0 ? NEED_MESSAGES_SERVER.plansChanged : NEED_MESSAGES_SERVER.noPlans,
      },
      plans: outcome.data,
    };

  const route = await providerRoute(view, ctx.home);
  const payload = toReserveBundlePayload(outcome.result, plan, { route, rematchOf: ctx.rematchOf });
  const { data, error } = await supabase.rpc("reserve_bundle", {
    p_need_id: needId,
    p_lines: payload.p_lines as unknown as Json,
    p_meta: payload.p_meta as unknown as Json,
    p_client_op_id: clientOpId,
  });

  if (error) {
    if (error.message === "idempotency_conflict") {
      const again = await bundleByOp(supabase, needId, clientOpId);
      if (again) return { ok: true, data: again };
    }
    const refs = new Map<string, OfferRef>();
    for (const s of view.stops)
      for (const l of s.lines) refs.set(l.offerId, { title: l.title, storeName: s.storeName, unit: l.unit });
    const mapped = mapReserveError(error, (id) => refs.get(id) ?? null);
    if (mapped.code === "server_error")
      console.error("[needs] reserve_bundle", { code: error.code, message: error.message });
    if (mapped.replan) {
      const fresh = await freshPlans(needId);
      return { ok: false, error: mapped, ...(fresh.ok ? { plans: fresh.data } : {}) };
    }
    return { ok: false, error: mapped };
  }

  const res = (data ?? {}) as { bundle_id?: string; allocations?: { status?: string }[] };
  const allocs = res.allocations ?? [];
  revalidateNeed(needId);
  revalidatePath("/charity/pickups", "layout");
  return {
    ok: true,
    data: {
      bundleId: res.bundle_id ?? "",
      requested: allocs.filter((a) => a.status === "requested").length,
      confirmed: allocs.filter((a) => a.status === "confirmed").length,
      stores: plan.stopCount,
      routeSource: route ? "provider" : "estimate",
    },
  };
}

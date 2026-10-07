"use client";

import { ArrowLeft, ArrowRight, Check, CircleAlert, Loader2, LogOut, MessageSquareQuote } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { SkipLink } from "@/components/layout/app-shell";
import { BodyRole } from "@/components/layout/body-role";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { KIND_COPY } from "../options";
import { nextStep, prevStep, stepIndex, STEP_KEYS, type StepKey, type StepState } from "../progress";
import type { WizardData } from "../queries";
import { AutosaveIndicator, AutosaveProvider, useAutosaveRegistry } from "./autosave";
import { BasicsStep } from "./steps/basics-step";
import { DocumentsStep } from "./steps/documents-step";
import { LegalStep } from "./steps/legal-step";
import { LocationStep } from "./steps/location-step";
import { ReviewStep } from "./steps/review-step";
import { WizardContext, type WizardContextValue } from "./wizard-context";

/** Trang khôi phục từ back/forward cache có cùng renderId ⇒ tải lại để không ghi đè dữ liệu mới hơn. */
const seenRenders = new Set<string>();

const STEP_DESCRIPTION: Record<StepKey, Record<"store" | "charity", string>> = {
  basics: {
    store: "Tên và loại hình giúp tổ chức từ thiện nhận ra cửa hàng của bạn.",
    charity: "Cho FoodSave và các cửa hàng biết tổ chức của bạn phục vụ ai.",
  },
  location: {
    store: "Ghim đúng cổng ra vào để tình nguyện viên đến lấy hàng, và khai giờ mở cửa.",
    charity: "Nơi nhận thực phẩm, bán kính phục vụ, loại thực phẩm nhận và giờ nhận.",
  },
  legal: {
    store: "Chỉ FoodSave dùng để xác minh. Thông tin này không hiển thị công khai.",
    charity: "Chỉ FoodSave dùng để xác minh. Thông tin này không hiển thị công khai.",
  },
  documents: {
    store: "Giấy tờ lưu ở kho riêng tư, chỉ FoodSave xem khi duyệt và tự xóa 30 ngày sau quyết định.",
    charity: "Giấy tờ lưu ở kho riêng tư, chỉ FoodSave xem khi duyệt và tự xóa 30 ngày sau quyết định.",
  },
  review: {
    store: "Kiểm tra lại hồ sơ, đọc cam kết và gửi cho FoodSave duyệt.",
    charity: "Kiểm tra lại hồ sơ, đọc cam kết và gửi cho FoodSave duyệt.",
  },
};

function stepHref(kind: string, step: StepKey) {
  return `/onboarding/${kind}/${step}`;
}

function Stepper({
  kind,
  steps,
  current,
  reachable,
  onNavigate,
}: {
  kind: string;
  steps: StepState[];
  current: StepKey;
  reachable: (s: StepKey) => boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <nav aria-label="Các bước hồ sơ">
      <ol className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const isCurrent = s.key === current;
          const status = s.complete ? "Đã xong" : isCurrent ? "Đang làm" : "Chưa xong";
          const marker = (
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold tabular-nums",
                s.complete && "border-success/40 bg-success-soft text-success",
                !s.complete && isCurrent && "border-primary bg-primary text-primary-foreground",
                !s.complete && !isCurrent && "border-border-strong/60 bg-surface text-ink-muted",
              )}
            >
              {s.complete ? <Check className="size-4" /> : i + 1}
            </span>
          );
          const body = (
            <span className="flex min-w-0 flex-col">
              <span className={cn("leading-snug", isCurrent ? "font-semibold text-ink" : "text-ink")}>
                {s.title}
              </span>
              <span className={cn("text-xs", isCurrent ? "text-ink-muted" : "text-ink-subtle")}>
                {status}
              </span>
            </span>
          );
          const cls = "flex min-h-12 items-center gap-3 rounded-lg px-2.5 py-2";
          return (
            <li key={s.key}>
              {isCurrent || !reachable(s.key) ? (
                <div
                  aria-current={isCurrent ? "step" : undefined}
                  aria-disabled={!isCurrent && !reachable(s.key) ? true : undefined}
                  className={cn(cls, isCurrent && "bg-primary-soft", !isCurrent && "opacity-70")}
                >
                  {marker}
                  {body}
                </div>
              ) : (
                <Link
                  href={stepHref(kind, s.key)}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(stepHref(kind, s.key));
                  }}
                  className={cn(cls, "hover:bg-bg-sunken")}
                >
                  {marker}
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepContent({ step }: { step: StepKey }) {
  switch (step) {
    case "basics":
      return <BasicsStep />;
    case "location":
      return <LocationStep />;
    case "legal":
      return <LegalStep />;
    case "documents":
      return <DocumentsStep />;
    case "review":
      return <ReviewStep />;
  }
}

function ShellInner({
  data,
  step,
  steps: loadedSteps,
  accountEmail,
}: {
  data: WizardData;
  step: StepKey;
  steps: StepState[];
  accountEmail: string | null;
}) {
  const router = useRouter();
  // Bước hiện tại tự báo đã đủ hay chưa ⇒ thanh tiến độ cập nhật ngay, không chờ tải lại trang
  const [liveComplete, setLiveComplete] = useState<boolean | null>(null);
  const steps = useMemo(
    () =>
      loadedSteps.map((s) =>
        s.key === step && liveComplete !== null ? { ...s, complete: liveComplete } : s,
      ),
    [loadedSteps, step, liveComplete],
  );
  const registry = useAutosaveRegistry();
  const { kind } = data;
  const copy = KIND_COPY[kind];

  const [orgId, setOrgId] = useState<string | null>(data.org?.id ?? null);
  const [pending, setPending] = useState<"next" | "nav" | null>(null);
  const [navError, setNavError] = useState<string | null>(null);
  const validator = useRef<(() => Promise<boolean> | boolean) | null>(null);
  const handledRender = useRef<string | null>(null);

  useEffect(() => {
    if (handledRender.current === data.renderId) return;
    handledRender.current = data.renderId;
    if (seenRenders.has(data.renderId)) router.refresh();
    else seenRenders.add(data.renderId);
  }, [data.renderId, router]);

  const navigate = useCallback(
    async (href: string) => {
      setNavError(null);
      setPending((p) => p ?? "nav");
      const saved = await registry.flushAll();
      if (!saved) {
        setPending(null);
        setNavError(
          "Chưa lưu được thay đổi mới nhất. Bấm “Thử lại” ở chỉ báo lưu, hoặc kiểm tra kết nối mạng.",
        );
        return;
      }
      router.push(href);
    },
    [registry, router],
  );

  const ctx = useMemo<WizardContextValue>(
    () => ({
      kind,
      step,
      data,
      accountEmail,
      orgId,
      setOrgId,
      setValidator: (fn) => {
        validator.current = fn;
      },
      reportComplete: setLiveComplete,
      navigate,
    }),
    [kind, step, data, accountEmail, orgId, navigate],
  );

  const next = nextStep(step);
  const prev = prevStep(step);
  const index = stepIndex(step);
  const doneCount = steps.filter((s) => s.complete).length;
  const totalRequired = STEP_KEYS.length - 1;
  const reachable = (s: StepKey) => s === "basics" || orgId !== null;

  async function goNext() {
    if (!next || pending) return;
    setNavError(null);
    setPending("next");
    const ok = validator.current ? await validator.current() : true;
    if (!ok) {
      setPending(null);
      return;
    }
    await navigate(stepHref(kind, next));
  }

  return (
    <WizardContext.Provider value={ctx}>
      <div data-role={kind} className="flex min-h-full flex-1 flex-col">
        <BodyRole role={kind} />
        <SkipLink />
        <header className="border-b bg-surface">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-md"
              aria-label="FoodSave — trang chủ"
            >
              <Wordmark className="text-xl" />
            </Link>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => void navigate("/onboarding")}
              >
                <LogOut aria-hidden />
                Lưu và thoát
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 pt-6 pb-4 sm:px-8 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10 lg:pt-10">
          <aside className="hidden lg:block">
            <div className="sticky top-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2 px-2.5">
                <p className="text-sm font-semibold text-role-accent">{copy.wizardTitle}</p>
                <Progress
                  value={(doneCount / totalRequired) * 100}
                  aria-label={`Tiến độ hồ sơ: ${doneCount} trên ${totalRequired} bước đã xong`}
                  className="h-1.5"
                />
                <p className="text-xs text-ink-subtle tabular-nums">
                  {doneCount}/{totalRequired} bước đã xong
                </p>
                <AutosaveIndicator className="mt-1 min-h-5" />
              </div>
              <Stepper
                kind={kind}
                steps={steps}
                current={step}
                reachable={reachable}
                onNavigate={(h) => void navigate(h)}
              />
            </div>
          </aside>

          <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-col gap-6 outline-none">
            <div className="flex flex-col gap-3 lg:hidden">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-role-accent">
                  Bước {index + 1}/{STEP_KEYS.length}
                </span>
                <span className="text-ink-subtle tabular-nums">
                  {doneCount}/{totalRequired} bước đã xong
                </span>
              </div>
              <Progress
                value={((index + 1) / STEP_KEYS.length) * 100}
                aria-label={`Bước ${index + 1} trên ${STEP_KEYS.length}`}
                className="h-1.5"
              />
            </div>

            <header className="flex flex-col gap-2">
              <h1 className="text-[1.625rem] leading-[2.125rem] font-bold text-balance md:text-[1.875rem] md:leading-[2.375rem]">
                {steps[index]?.title}
              </h1>
              <p className="max-w-prose text-ink-muted">{STEP_DESCRIPTION[step][kind]}</p>
              <AutosaveIndicator className="min-h-5 lg:hidden" />
            </header>

            {data.org?.status === "needs_changes" ? (
              <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
                <MessageSquareQuote aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">FoodSave cần bạn bổ sung</p>
                  <p className="text-sm break-words whitespace-pre-line text-ink">
                    {data.org.rejectionReason?.trim() || "Vui lòng kiểm tra lại hồ sơ và gửi duyệt lại."}
                  </p>
                </div>
              </div>
            ) : null}

            <StepContent step={step} />

            <div className="mt-2 border-t pt-5 lg:border-0 lg:pt-0">
              {navError ? (
                <p role="alert" className="mb-3 flex items-start gap-2 text-sm text-danger">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {navError}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                {prev ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={pending !== null}
                    onClick={() => void navigate(stepHref(kind, prev))}
                  >
                    <ArrowLeft aria-hidden />
                    Quay lại
                  </Button>
                ) : (
                  <span />
                )}
                {next ? (
                  <Button
                    type="button"
                    size="lg"
                    // Giữ focus ở ô đang nhập khi bấm chuột: không để lỗi "khi rời ô" hiện ra làm nút dịch
                    // chỗ giữa mousedown và mouseup (mất lượt bấm). Bàn phím không bị ảnh hưởng.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void goNext()}
                    disabled={pending !== null}
                    aria-busy={pending === "next"}
                  >
                    {pending === "next" ? (
                      <>
                        <Loader2 aria-hidden className="animate-spin" />
                        Đang lưu…
                      </>
                    ) : (
                      <>
                        Tiếp tục
                        <ArrowRight aria-hidden />
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      </div>
    </WizardContext.Provider>
  );
}

/** Khung wizard onboarding (P1-02): stepper, tiến độ, tự lưu, Quay lại/Tiếp tục. */
export function WizardShell(props: {
  data: WizardData;
  step: StepKey;
  steps: StepState[];
  accountEmail: string | null;
}) {
  return (
    <AutosaveProvider>
      <ShellInner {...props} />
    </AutosaveProvider>
  );
}

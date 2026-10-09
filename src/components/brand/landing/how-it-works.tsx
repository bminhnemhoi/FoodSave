import {
  BookCheck,
  ClipboardCheck,
  HandHeart,
  Home,
  type LucideIcon,
  PackagePlus,
  QrCode,
  Store,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { SectionHead } from "./shared";

type Actor = "store" | "charity" | "both" | "system";

type Step = {
  title: string;
  body: string;
  icon: LucideIcon;
  /** Dấu vết bước này để lại trong hệ thống (thứ người dùng thấy được). */
  trace: string;
  actor: Actor;
};

/** 5 bước thật của vòng thực phẩm (PRD) — mỗi bước nêu ai làm và dấu vết để lại. */
const STEPS: Step[] = [
  {
    title: "Đăng lô",
    body: "Cửa hàng chụp ảnh, nhập số lượng và hạn dùng. Nhãn tươi tự gắn theo nhóm thực phẩm.",
    icon: PackagePlus,
    trace: "Nhãn Xanh / Vàng / Đỏ",
    actor: "store",
  },
  {
    title: "Xin nhận",
    body: "Tổ chức gần đó thấy lô trên bản đồ Kho tặng, hoặc đăng nhu cầu để FoodSave ghép từ nhiều cửa hàng.",
    icon: HandHeart,
    trace: "Bản đồ · phương án ghép",
    actor: "charity",
  },
  {
    title: "Xác nhận",
    body: "Cửa hàng xác nhận từng yêu cầu. Số lượng được giữ lại, hai bên nhận thông báo ngay.",
    icon: ClipboardCheck,
    trace: "Giữ hàng có hạn",
    actor: "store",
  },
  {
    title: "Bàn giao QR",
    body: "Người lấy hàng đưa mã QR hoặc mã 6 số. Cửa hàng quét và đối soát từng dòng.",
    icon: QrCode,
    trace: "Mã dùng một lần, 15 phút",
    actor: "both",
  },
  {
    title: "Ghi tác động",
    body: "Lô đã giao vào sổ tác động: kg, suất ăn, CO₂e — kèm nguồn hệ số.",
    icon: BookCheck,
    trace: "kg · suất · CO₂e",
    actor: "system",
  },
];

const ACTORS: Record<Actor, { label: string; icon: LucideIcon }> = {
  store: { label: "Cửa hàng", icon: Store },
  charity: { label: "Tổ chức", icon: Home },
  both: { label: "Hai bên đối soát", icon: QrCode },
  system: { label: "FoodSave tự ghi", icon: BookCheck },
};

/** Vai trò ⇒ `data-role` để chip dùng accent vai trò (DESIGN-SYSTEM §3.4); "hai bên"/"tự ghi" dùng primary. */
const ACTOR_ROLE: Partial<Record<Actor, string>> = { store: "store", charity: "charity" };

/**
 * "Cách hoạt động" (DESIGN-SYSTEM §10.4): một ngôn ngữ hình ảnh duy nhất — dòng thời gian 5 nút số nối bằng
 * một đường (vẽ ra khi cuộn tới, §8.1), mỗi bước cùng giải phẫu: icon · tiêu đề · mô tả · dấu vết · ai làm.
 * Desktop vừa một khung hình 900 px; mobile là dòng thời gian dọc.
 */
export function HowItWorks() {
  return (
    <section id="cach-hoat-dong" aria-labelledby="how-heading" className="fs-grid-light scroll-mt-4 bg-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-8 lg:gap-14 lg:py-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <SectionHead
            id="how-heading"
            eyebrow="Cách FoodSave hoạt động"
            title="Từ quầy bánh tới bữa ăn, năm bước có dấu vết"
            className="lg:max-w-xl"
          />
          <p className="max-w-md text-lg text-pretty text-ink-muted lg:pb-1">
            Mọi bước đều do người thật xác nhận trên FoodSave và được ghi lại — không có bước nào chỉ nằm trên
            giấy.
          </p>
        </div>

        <ol className="relative grid gap-5 lg:grid-cols-5 lg:gap-4">
          {/* Đường nối: dọc (mobile) / ngang (desktop) qua tâm các nút số */}
          <span
            aria-hidden
            className="fs-draw-y absolute top-6 bottom-6 left-6 w-0.5 rounded-full bg-gradient-to-b from-primary via-brand-leaf to-brand-yellow lg:hidden"
          />
          <span
            aria-hidden
            className="fs-draw-x absolute top-6 right-[10%] left-[10%] hidden h-0.5 rounded-full bg-gradient-to-r from-primary via-brand-leaf to-brand-yellow lg:block"
          />
          {STEPS.map((step, i) => {
            const actor = ACTORS[step.actor];
            const ActorIcon = actor.icon;
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="relative grid grid-cols-[3rem_1fr] gap-4 lg:grid-cols-1 lg:grid-rows-[auto_1fr] lg:gap-5"
              >
                <span
                  aria-hidden
                  className="relative z-10 grid size-12 place-items-center rounded-full bg-brand-deep font-display text-lg font-extrabold text-on-deep tabular-nums ring-[6px] ring-bg lg:mx-auto"
                >
                  {i + 1}
                </span>
                <article className="flex h-full flex-col gap-3 rounded-2xl border bg-surface p-5 shadow-1">
                  <div className="flex items-center gap-3 lg:flex-col lg:items-start">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <h3 className="text-lg leading-6 font-semibold">
                      <span className="sr-only">Bước {i + 1}: </span>
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm leading-6 text-ink-muted">{step.body}</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-dashed pt-3 lg:flex-col lg:items-start lg:justify-start">
                    <p className="text-xs leading-4 font-medium text-ink-subtle">
                      <span className="sr-only">Dấu vết: </span>
                      {step.trace}
                    </p>
                    <p
                      data-role={ACTOR_ROLE[step.actor]}
                      className={cn(
                        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-4 font-semibold",
                        ACTOR_ROLE[step.actor]
                          ? "bg-role-accent-soft text-role-accent"
                          : "bg-bg-sunken text-ink-muted",
                      )}
                    >
                      <ActorIcon aria-hidden className="size-3.5" />
                      <span className="sr-only">Ai làm: </span>
                      {actor.label}
                    </p>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

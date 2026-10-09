import { BadgeCheck, BookCheck, EyeOff, type LucideIcon, QrCode, Route } from "lucide-react";
import Image from "next/image";

import { PhoneFrame, ScreenshotTag } from "@/components/brand/marketing";
import { SHOTS } from "@/components/brand/product-shots";
import { cn } from "@/lib/utils";

import { SectionHead } from "./shared";

function TileHead({
  icon: Icon,
  title,
  body,
  tone = "light",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl",
          tone === "dark" ? "bg-on-deep/10 text-brand-mint" : "bg-primary-soft text-primary",
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className={cn("text-xl leading-7 font-semibold", tone === "dark" && "text-on-deep")}>{title}</h3>
      <p className={cn("text-sm leading-6", tone === "dark" ? "text-on-deep-muted" : "text-ink-muted")}>
        {body}
      </p>
    </div>
  );
}

const POLICIES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BadgeCheck,
    title: "Duyệt hồ sơ trước khi mở cổng",
    body: "FoodSave xem giấy tờ của cửa hàng và tổ chức; quản trị viên đăng nhập bằng xác thực hai lớp.",
  },
  {
    icon: EyeOff,
    title: "Riêng tư theo mặc định",
    body: "Mái ấm có thể chỉ hiện vị trí gần đúng. FoodSave không thu số hay ảnh CCCD.",
  },
];

/**
 * "Minh bạch" (DESIGN-SYSTEM §10.4): lưới bento bằng ảnh chụp màn hình THẬT (dữ liệu demo) — mã bàn giao QR +
 * 6 số, chuyến có điểm dừng đánh số, thẻ sổ tác động — cộng hai cam kết không cần ảnh. Chỉ nêu tính năng đã có.
 */
export function Trust() {
  return (
    <section id="minh-bach" aria-labelledby="trust-heading" className="scroll-mt-4 bg-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-8 lg:py-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <SectionHead
            id="trust-heading"
            eyebrow="Minh bạch"
            title="Tin được vì kiểm chứng được"
            lead="Thiện nguyện cần niềm tin. FoodSave để lại dấu vết ở mọi bước quan trọng, và chỉ thu dữ liệu thật sự cần."
            className="lg:max-w-xl"
          />
          <ScreenshotTag className="lg:mb-2" />
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
          {/* A — Bàn giao: điện thoại hiện mã, tràn khỏi đáy ô */}
          <article className="fs-stage relative flex flex-col gap-8 overflow-hidden rounded-[1.75rem] p-6 sm:p-8 lg:col-span-5 lg:row-span-2">
            <TileHead
              tone="dark"
              icon={QrCode}
              title="Bàn giao có đối soát"
              body="Người lấy hàng đưa mã QR hoặc mã 6 số, dùng một lần, hiệu lực 15 phút. Cửa hàng quét rồi xác nhận số lượng từng dòng; thiếu hàng phải ghi lý do."
            />
            <div className="-mb-40 flex justify-center sm:-mb-48 lg:relative lg:mb-0 lg:min-h-[26rem] lg:flex-1">
              <PhoneFrame
                shot={SHOTS.handover}
                statusBar="surface"
                sizes="(min-width: 1024px) 336px, 72vw"
                className="h-fit w-[72%] max-w-[20rem] rotate-[-3deg] lg:absolute lg:bottom-0 lg:left-1/2 lg:w-[80%] lg:max-w-[21rem] lg:-translate-x-1/2 lg:translate-y-[22%]"
              />
            </div>
          </article>

          {/* B — Chuyến có thứ tự điểm dừng */}
          <article className="flex flex-col gap-6 overflow-hidden rounded-[1.75rem] border bg-surface p-6 shadow-1 sm:p-8 lg:col-span-7">
            <TileHead
              icon={Route}
              title="Mỗi chuyến có thứ tự, có dấu vết"
              body="Điểm dừng được đánh số theo hạn hiệu lực sớm nhất; mỗi điểm có mã bàn giao riêng, nên biết lô nào đã tới tay ai, lúc nào."
            />
            <div className="relative -mr-6 -mb-6 overflow-hidden rounded-tl-xl border-t border-l shadow-2 sm:-mr-8 sm:-mb-8">
              <Image
                src={SHOTS.route.src}
                alt={SHOTS.route.alt}
                sizes="(min-width: 1152px) 640px, (min-width: 1024px) 56vw, 96vw"
                className="h-auto w-full"
              />
            </div>
          </article>

          {/* C — Sổ tác động */}
          <article className="flex flex-col gap-6 overflow-hidden rounded-[1.75rem] border bg-surface p-6 shadow-1 sm:p-8 lg:col-span-7">
            <TileHead
              icon={BookCheck}
              title="Sổ tác động có nguồn"
              body="Chỉ tính hàng đã bàn giao. Hệ số CO₂e và suất ăn ghi rõ tài liệu gốc, có phiên bản — khối “Tác động đã ghi nhận” ở trên đọc cùng sổ này."
            />
            <div className="overflow-hidden rounded-xl border bg-bg-sunken">
              <Image
                src={SHOTS.ledger.src}
                alt={SHOTS.ledger.alt}
                sizes="(min-width: 1152px) 600px, (min-width: 1024px) 52vw, 92vw"
                className="h-auto w-full"
              />
            </div>
          </article>

          {/* D — Cam kết không cần ảnh: dải ngang hai cột */}
          <article className="rounded-[1.75rem] border bg-surface p-6 shadow-1 sm:p-8 lg:col-span-12">
            <h3 className="sr-only font-semibold">Hồ sơ và quyền riêng tư</h3>
            <ul className="grid gap-6 sm:grid-cols-2 sm:gap-10">
              {POLICIES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">{title}</p>
                    <p className="text-sm leading-6 text-ink-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

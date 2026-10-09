import { Timer } from "lucide-react";
import Image from "next/image";

import { IllustrativeTag } from "@/components/brand/marketing";
import { photo } from "@/components/brand/photos";
import { FreshnessBadge, type FreshnessLabel } from "@/components/labels/freshness-badge";

import { SectionHead } from "./shared";

const LABEL_RULES: { label: FreshnessLabel; title: string; body: string }[] = [
  { label: "green", title: "Còn thời gian", body: "Lấy theo kế hoạch trong ngày hoặc hôm sau." },
  { label: "yellow", title: "Nên lấy sớm", body: "Ưu tiên ghép đơn và phân công trong vài giờ tới." },
  { label: "red", title: "Cần lấy ngay", body: "Chỉ gợi ý cho tổ chức đến kịp trước giờ hết hạn." },
];

/** "Nhãn tươi" — ảnh món ăn + thẻ minh họa (có nhãn) và ba quy tắc nhãn. */
export function Labels() {
  const p = photo("banh-mi-ca-phe");
  return (
    <section id="nhan-tuoi" aria-labelledby="labels-heading" className="scroll-mt-4 bg-surface">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <div className="relative order-2 lg:order-1">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[1.375rem] bg-bg-sunken shadow-photo">
            <Image
              src={p.src}
              alt={p.alt}
              fill
              sizes="(min-width: 1024px) 520px, 92vw"
              className="object-cover"
            />
          </div>
          <div
            data-illustrative
            className="absolute -bottom-6 left-4 flex flex-col gap-1.5 rounded-2xl bg-surface p-3 text-sm shadow-float ring-1 ring-ink/5 sm:-right-4 sm:left-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <FreshnessBadge label="yellow" size="sm" />
              <IllustrativeTag />
            </div>
            <p className="font-semibold">Bánh mì · 18 ổ</p>
            <p className="flex items-center gap-1 text-ink-muted tabular-nums">
              <Timer aria-hidden className="size-4" />
              Hạn hiệu lực 21:00
            </p>
          </div>
        </div>
        <div className="order-1 flex flex-col gap-8 lg:order-2">
          <SectionHead
            id="labels-heading"
            eyebrow="Nhãn tươi"
            title="Ba nhãn, một ngôn ngữ chung"
            lead="Nhãn được tính lúc xem từ hạn hiệu lực và nhóm thực phẩm, nên luôn đúng với thời điểm hiện tại. Cửa hàng, tổ chức và tình nguyện viên nhìn cùng một màu, cùng một chữ."
          />
          <ul className="flex flex-col gap-3" aria-label="Nhãn tươi">
            {LABEL_RULES.map((rule) => (
              <li key={rule.label} className="flex items-start gap-4 rounded-xl border bg-bg p-4">
                <FreshnessBadge label={rule.label} className="mt-0.5" />
                <div>
                  <p className="font-semibold">{rule.title}</p>
                  <p className="text-sm text-ink-muted">{rule.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

import { BookCheck, CircleCheck, Timer } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { displayFont } from "@/components/brand/fonts";
import { Logo } from "@/components/brand/logo";
import { IllustrativeTag } from "@/components/brand/marketing";
import { photo, type PhotoId } from "@/components/brand/photos";
import { FreshnessBadge } from "@/components/labels/freshness-badge";
import { cn } from "@/lib/utils";

/** Bối cảnh ảnh + câu dẫn của từng trang xác thực. */
export type AuthScene = "login" | "register" | "recover";

const SCENES: Record<AuthScene, { photo: PhotoId; headline: string; position: string }> = {
  login: {
    photo: "trao-hop-thuc-pham",
    headline: "Mỗi lô thực phẩm được cứu là một bữa ăn được trao đi.",
    position: "object-[50%_40%]",
  },
  register: {
    photo: "banh-mi-ngot-tiem-banh",
    headline: "Thực phẩm còn tốt đáng được tới tay người cần.",
    position: "object-[50%_45%]",
  },
  recover: {
    photo: "rau-cu-cho-gia-lai",
    headline: "Tài khoản của bạn — an toàn, riêng tư, minh bạch.",
    position: "object-[50%_35%]",
  },
};

/** Thẻ nổi minh họa (L3) — luôn gắn nhãn "Minh họa", không phải số liệu thật. */
function SceneCard({ scene }: { scene: AuthScene }) {
  const base =
    "flex w-fit max-w-xs flex-col gap-1.5 rounded-2xl bg-surface p-3 text-sm leading-5 text-ink shadow-float";
  if (scene === "register") {
    return (
      <div className={base}>
        <div className="flex items-center justify-between gap-3">
          <FreshnessBadge label="red" size="sm" />
          <IllustrativeTag />
        </div>
        <p className="font-semibold">Bánh mì ngọt · 24 cái</p>
        <p className="flex items-center gap-1 text-ink-muted tabular-nums">
          <Timer aria-hidden className="size-4" />
          Cần lấy trước 21:00
        </p>
      </div>
    );
  }
  if (scene === "recover") {
    return (
      <div className={base}>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs leading-4 font-semibold text-primary-active">
            <BookCheck aria-hidden className="size-3.5" />
            Sổ tác động
          </span>
          <IllustrativeTag />
        </div>
        <p className="font-semibold">Mọi bàn giao đều có dấu vết</p>
        <p className="text-ink-muted">Ai giao, ai nhận, bao nhiêu, lúc nào.</p>
      </div>
    );
  }
  return (
    <div className={base}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 text-xs leading-4 font-semibold text-success">
          <CircleCheck aria-hidden className="size-3.5" />
          Đã bàn giao
        </span>
        <IllustrativeTag />
      </div>
      <p className="font-semibold">18 ổ bánh mì cho Mái ấm Nắng Mai</p>
      <p className="text-ink-muted tabular-nums">Đối soát 2/2 dòng · 19:42</p>
    </div>
  );
}

type AuthShellProps = {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Ảnh + câu dẫn bên trái. Mặc định "login". */
  scene?: AuthScene;
};

/**
 * Khung chung cho các trang xác thực (DESIGN-SYSTEM §2.5): ảnh thật phủ lớp chuyển màu thương hiệu — cột trái
 * trên desktop, dải ảnh gọn phía trên trên mobile — kèm logo, câu dẫn và một thẻ minh họa; form bên phải.
 * Chữ trên ảnh chỉ đặt ở vùng phủ ≥ 85% nên luôn đạt tương phản AA.
 */
export function AuthShell({ title, description, children, footer, scene = "login" }: AuthShellProps) {
  const s = SCENES[scene];
  const p = photo(s.photo);
  return (
    <main
      className={cn(
        displayFont.variable,
        "grid min-h-dvh grid-rows-[auto_1fr] lg:grid-cols-[1fr_1.1fr] lg:grid-rows-1",
      )}
    >
      <aside className="relative isolate flex h-40 flex-col justify-between overflow-hidden p-4 text-on-deep sm:h-48 sm:px-8 lg:h-auto lg:min-h-dvh lg:p-10">
        <Image
          src={p.src}
          alt=""
          fill
          preload
          placeholder="blur"
          sizes="(min-width: 1024px) 48vw, 100vw"
          className={cn("-z-20 object-cover", s.position)}
        />
        <div aria-hidden className="fs-photo-scrim-band absolute inset-0 -z-10 lg:hidden" />
        <div aria-hidden className="fs-photo-scrim absolute inset-0 -z-10 hidden lg:block" />

        <Link href="/" className="w-fit rounded-md text-xl focus-visible:outline-on-deep lg:text-2xl">
          <Logo tone="white" />
        </Link>

        <p className="text-sm font-medium text-on-deep lg:hidden">
          Cứu thực phẩm, minh bạch đến từng suất ăn.
        </p>

        <div className="hidden max-w-md flex-col gap-6 lg:flex">
          <SceneCard scene={scene} />
          <div className="flex flex-col gap-4">
            <p className="font-display text-[2.125rem] leading-[1.12] font-extrabold text-balance">
              {s.headline}
            </p>
            <p className="text-on-deep-muted">
              Cửa hàng, tổ chức từ thiện và tình nguyện viên cùng điều phối — minh bạch đến từng suất ăn.
            </p>
          </div>
          <p className="text-sm text-on-deep-muted">
            Nền tảng phi lợi nhuận · TISPA 2026 ·{" "}
            <Link
              href="/credits"
              className="underline underline-offset-4 hover:text-on-deep focus-visible:outline-on-deep"
            >
              Nguồn ảnh
            </Link>
          </p>
        </div>
      </aside>

      <section className="flex flex-col items-center px-4 py-8 sm:px-8 sm:py-12 lg:justify-center">
        <div className="w-full max-w-md">
          <h1 className="font-display text-[2rem] leading-tight font-extrabold">{title}</h1>
          {description ? <div className="mt-2 text-ink-muted">{description}</div> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-sm text-ink-muted">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}

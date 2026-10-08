import {
  ArrowRight,
  BadgeCheck,
  BookCheck,
  Check,
  CircleCheck,
  EyeOff,
  HandHeart,
  LogIn,
  QrCode,
  Sprout,
  Store,
  Timer,
  type LucideIcon,
  Bike,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { displayFont } from "@/components/brand/fonts";
import { Logo } from "@/components/brand/logo";
import { CollagePhoto, Enter, FloatingCard, IllustrativeTag } from "@/components/brand/marketing";
import { photo, type BrandPhoto } from "@/components/brand/photos";
import { FreshnessBadge, type FreshnessLabel } from "@/components/labels/freshness-badge";
import { Button } from "@/components/ui/button";
import { HeroImpactCard, HeroImpactCardSkeleton } from "@/features/impact/components/hero-impact-card";
import {
  PublicImpactSection,
  PublicImpactSectionSkeleton,
} from "@/features/impact/components/public-impact-section";
import { cn } from "@/lib/utils";

const REGISTER_STORE = "/register?next=%2Fonboarding%2Fstore";
const REGISTER_CHARITY = "/register?next=%2Fonboarding%2Fcharity";

const LABEL_RULES: { label: FreshnessLabel; title: string; body: string }[] = [
  { label: "green", title: "Còn thời gian", body: "Lấy theo kế hoạch trong ngày hoặc hôm sau." },
  { label: "yellow", title: "Nên lấy sớm", body: "Ưu tiên ghép đơn và phân công trong vài giờ tới." },
  { label: "red", title: "Cần lấy ngay", body: "Chỉ gợi ý cho tổ chức đến kịp trước giờ hết hạn." },
];

type Step = { title: string; body: string; media: { photo: BrandPhoto } | { mock: "confirm" | "ledger" } };

const STEPS: Step[] = [
  {
    title: "Đăng lô",
    body: "Cửa hàng chụp ảnh, nhập số lượng và hạn dùng. Nhãn tươi tự gắn theo nhóm thực phẩm.",
    media: { photo: photo("banh-mi-que") },
  },
  {
    title: "Xin nhận",
    body: "Tổ chức gần đó thấy lô trên bản đồ Kho tặng và xin nhận đúng số cần.",
    media: { photo: photo("com-tam") },
  },
  {
    title: "Xác nhận",
    body: "Cửa hàng xác nhận yêu cầu. Số lượng được giữ lại, hai bên nhận thông báo ngay.",
    media: { mock: "confirm" },
  },
  {
    title: "Bàn giao QR",
    body: "Người lấy hàng đưa mã QR hoặc mã 6 số. Cửa hàng quét và đối soát từng dòng.",
    media: { photo: photo("trao-thanh-long") },
  },
  {
    title: "Ghi tác động",
    body: "Lô đã giao vào sổ tác động: kg, suất ăn, CO₂e — kèm nguồn hệ số.",
    media: { mock: "ledger" },
  },
];

type Audience = {
  role: "store" | "charity" | "volunteer";
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  points: string[];
  photo: BrandPhoto;
  cta?: { href: string; label: string };
  note?: string;
};

const AUDIENCES: Audience[] = [
  {
    role: "store",
    icon: Store,
    eyebrow: "Cửa hàng",
    title: "Tiệm bánh, nhà hàng, cửa hàng tiện lợi, siêu thị",
    points: [
      "Đăng lô trong khoảng một phút, nhãn tươi tự gắn",
      "Xem và xác nhận từng yêu cầu nhận lô",
      "Theo dõi tác động từ dữ liệu bàn giao thật",
    ],
    photo: photo("banh-mi-ngot-tiem-banh"),
    cta: { href: REGISTER_STORE, label: "Tạo tài khoản cửa hàng" },
  },
  {
    role: "charity",
    icon: HandHeart,
    eyebrow: "Tổ chức từ thiện",
    title: "Mái ấm, bếp ăn từ thiện, viện dưỡng lão",
    points: [
      "Tìm lô quanh điểm nhận trên bản đồ Kho tặng",
      "Xin nhận đúng số cần, theo dõi trạng thái",
      "Tự đến lấy hoặc giao tình nguyện viên, bàn giao bằng QR",
    ],
    photo: photo("chia-suat-an"),
    cta: { href: REGISTER_CHARITY, label: "Tạo tài khoản tổ chức" },
  },
  {
    role: "volunteer",
    icon: Bike,
    eyebrow: "Tình nguyện viên",
    title: "Sinh viên, người đi làm muốn góp sức",
    points: [
      "Tham gia qua lời mời của tổ chức từ thiện",
      "Nhận chuyến lấy hàng ngay trên điện thoại",
      "Mở mã QR khi bàn giao, không cần giấy tờ",
    ],
    photo: photo("tinh-nguyen-vien-dong-goi"),
    note: "Chưa có lời mời? Hãy liên hệ tổ chức bạn muốn giúp.",
  },
];

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: QrCode,
    title: "Bàn giao có đối soát",
    body: "Hai bên xác nhận số lượng từng dòng bằng QR hoặc mã 6 số; thiếu hàng phải ghi lý do.",
  },
  {
    icon: BookCheck,
    title: "Sổ tác động có nguồn",
    body: "Chỉ tính hàng đã bàn giao. Hệ số CO₂e và suất ăn ghi rõ tài liệu gốc, có phiên bản.",
  },
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

const NAV = [
  { href: "#cach-hoat-dong", label: "Cách hoạt động" },
  { href: "#nhan-tuoi", label: "Nhãn tươi" },
  { href: "#tac-dong", label: "Tác động" },
];

function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <a
        href="#noi-dung"
        className="sr-only rounded-md bg-surface px-4 py-2 font-medium text-ink focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Bỏ qua tới nội dung chính
      </a>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-5">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md text-xl focus-visible:outline-on-deep"
        >
          <Logo tone="white" />
        </Link>
        <nav aria-label="Trang chủ" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-on-deep-muted transition-colors hover:text-on-deep focus-visible:outline-on-deep"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            className="min-h-11 text-on-deep hover:bg-on-deep/10 hover:text-on-deep focus-visible:outline-on-deep"
          >
            <Link href="/login">
              <LogIn aria-hidden />
              Đăng nhập
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="hidden min-h-11 border-on-deep/35 bg-transparent text-on-deep hover:bg-on-deep/10 hover:text-on-deep focus-visible:outline-on-deep sm:inline-flex"
          >
            <Link href="/register">Đăng ký</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const a = photo("rau-cu-cho-gia-lai");
  const b = photo("banh-mi");
  const c = photo("trao-hop-thuc-pham");
  return (
    <section aria-labelledby="hero-heading" className="fs-stage fs-grain overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-28 pb-16 sm:px-8 sm:pt-32 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pt-36 lg:pb-24">
        <div className="flex flex-col gap-6">
          <Enter
            as="p"
            rise
            delay={0}
            className="flex w-fit items-center gap-2 rounded-full border border-on-deep/20 bg-on-deep/5 px-3 py-1 text-sm font-medium text-brand-mint"
          >
            <Sprout aria-hidden className="size-4" />
            Nền tảng phi lợi nhuận · Không thu phí
          </Enter>
          <Enter
            as="h1"
            rise
            delay={40}
            id="hero-heading"
            className="font-display text-[clamp(2.5rem,5.6vw,4.1rem)] leading-[1.06] font-extrabold text-balance text-on-deep"
          >
            Cứu thực phẩm, <span className="text-brand-yellow">minh bạch</span> đến từng suất ăn.
          </Enter>
          <Enter as="p" rise delay={80} className="max-w-[34rem] text-lg leading-relaxed text-on-deep-muted">
            FoodSave kết nối thực phẩm còn dùng tốt từ cửa hàng tới mái ấm, bếp ăn từ thiện và viện dưỡng lão
            — nhanh, đúng người, và có bằng chứng cho từng lô.
          </Enter>
          <Enter delay={220} className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="min-h-12 w-full bg-brand-yellow px-6 text-ink hover:bg-brand-yellow-soft focus-visible:outline-on-deep sm:w-auto"
            >
              <Link href={REGISTER_STORE}>
                <Store aria-hidden />
                Đăng ký cửa hàng
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-12 w-full border-on-deep/40 bg-transparent px-6 text-on-deep hover:bg-on-deep/10 hover:text-on-deep focus-visible:outline-on-deep sm:w-auto"
            >
              <Link href={REGISTER_CHARITY}>
                <HandHeart aria-hidden />
                Đăng ký tổ chức
              </Link>
            </Button>
          </Enter>
          <Enter as="ul" delay={300} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-on-deep-muted">
            {["Duyệt hồ sơ trước khi mở cổng", "Bàn giao bằng QR", "Số liệu có nguồn"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check aria-hidden className="size-4 text-brand-mint" />
                {t}
              </li>
            ))}
          </Enter>
        </div>

        <div
          role="group"
          aria-label="Ảnh và giao diện minh họa"
          className="relative mx-auto aspect-[1/1.02] w-full max-w-[34rem] sm:aspect-[1/0.9] lg:max-w-none"
        >
          <CollagePhoto
            photo={a}
            className="top-[2%] right-[3%] aspect-[4/5] w-[52%]"
            sizes="(min-width: 1024px) 300px, 52vw"
            tilt={3}
            parallax={-18}
            delay={80}
          />
          <CollagePhoto
            photo={b}
            className="top-[16%] left-[2%] aspect-[4/3] w-[50%]"
            sizes="(min-width: 1024px) 290px, 50vw"
            tilt={-4.5}
            parallax={14}
            delay={180}
          />
          <CollagePhoto
            photo={c}
            className="bottom-[3%] left-[27%] aspect-[3/2] w-[44%]"
            sizes="(min-width: 1024px) 250px, 44vw"
            tilt={-1.5}
            parallax={26}
            delay={280}
          />

          <FloatingCard className="bottom-[30%] -left-1 sm:bottom-[26%] sm:-left-4" delay={460} parallax={10}>
            <div className="flex items-center justify-between gap-3">
              <FreshnessBadge label="red" size="sm" />
              <IllustrativeTag />
            </div>
            <p className="font-semibold">Cơm phần rau củ · 7 suất</p>
            <p className="flex items-center gap-1 text-ink-muted tabular-nums">
              <Timer aria-hidden className="size-4" />
              Còn 1 giờ 58 phút
            </p>
          </FloatingCard>

          <FloatingCard className="-right-1 bottom-[4%] min-w-44 sm:-right-3" delay={560} parallax={-8}>
            <Suspense fallback={<HeroImpactCardSkeleton />}>
              <HeroImpactCard />
            </Suspense>
          </FloatingCard>

          <FloatingCard className="top-[-4%] left-[34%] hidden sm:block" delay={660} parallax={-12}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-active">
                <QrCode aria-hidden className="size-5" />
              </span>
              <div>
                <p className="text-xs leading-4 text-ink-muted">Mã bàn giao</p>
                <p className="font-display text-lg leading-6 font-extrabold tracking-[0.08em] tabular-nums">
                  482 913
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-xs leading-4 text-success">
                <CircleCheck aria-hidden className="size-3.5" />
                Đã đối soát 3/3 dòng
              </span>
              <IllustrativeTag />
            </div>
          </FloatingCard>
        </div>
      </div>
    </section>
  );
}

function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  className,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", className)}>
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2
        id={id}
        className="font-display text-[clamp(1.875rem,4vw,2.75rem)] leading-[1.12] font-extrabold text-balance"
      >
        {title}
      </h2>
      {lead ? <p className="text-lg text-ink-muted">{lead}</p> : null}
    </div>
  );
}

function StepMock({ kind }: { kind: "confirm" | "ledger" }) {
  return (
    <div
      className={cn(
        "relative flex size-full items-end justify-center p-3 pt-9",
        kind === "confirm" ? "bg-primary-soft" : "bg-bg-sunken",
      )}
    >
      <IllustrativeTag className="absolute top-2.5 right-2.5 bg-surface" />
      {kind === "confirm" ? (
        <div className="flex w-full flex-col gap-1 rounded-lg bg-surface p-2.5 text-xs leading-4 shadow-2">
          <p className="truncate text-sm leading-5 font-semibold">Mái ấm Nắng Mai</p>
          <p className="truncate text-ink-muted">Xin nhận 12 ổ bánh mì</p>
          <div className="mt-1.5 flex gap-1.5">
            <span className="inline-flex h-7 flex-1 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
              Xác nhận
            </span>
            <span className="inline-flex h-7 flex-1 items-center justify-center rounded-md border border-border-strong font-semibold">
              Từ chối
            </span>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-1.5 rounded-lg bg-surface p-2 text-xs leading-4 shadow-2">
          <p className="flex items-center gap-1 text-sm leading-5 font-semibold">
            <BookCheck aria-hidden className="size-4 shrink-0 text-primary" />
            Sổ tác động
          </p>
          <dl className="grid grid-cols-3 gap-1 text-center">
            {[
              ["+6,0", "kg"],
              ["12", "suất"],
              ["+15", "kg CO₂e"],
            ].map(([v, u]) => (
              <div key={u} className="flex flex-col-reverse rounded-md bg-bg py-1">
                <dt className="whitespace-nowrap text-ink-muted">{u}</dt>
                <dd className="font-display text-sm leading-5 font-extrabold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="cach-hoat-dong" aria-labelledby="how-heading" className="scroll-mt-4 bg-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-8 lg:py-28">
        <SectionHead
          id="how-heading"
          eyebrow="Cách FoodSave hoạt động"
          title="Từ quầy bánh tới bữa ăn, năm bước có dấu vết"
          lead="Mọi bước đều do người thật xác nhận trên FoodSave và được ghi lại — không có bước nào chỉ nằm trên giấy."
        />
        <ol className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative flex flex-col gap-4">
              <div className="relative aspect-[16/9] overflow-hidden rounded-xl border bg-bg-sunken sm:aspect-[4/3]">
                {"photo" in step.media ? (
                  <Image
                    src={step.media.photo.src.src}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 220px, (min-width: 640px) 45vw, 92vw"
                    className="object-cover"
                  />
                ) : (
                  <StepMock kind={step.media.mock} />
                )}
              </div>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-deep font-display text-sm font-extrabold text-on-deep tabular-nums"
                >
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">
                    <span className="sr-only">Bước {i + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="text-sm leading-6 text-ink-muted">{step.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Labels() {
  const p = photo("banh-mi-ca-phe");
  return (
    <section id="nhan-tuoi" aria-labelledby="labels-heading" className="scroll-mt-4 border-t bg-surface">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div className="relative order-2 lg:order-1">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[1.375rem] bg-bg-sunken shadow-photo">
            <Image
              src={p.src.src}
              alt={p.alt}
              fill
              sizes="(min-width: 1024px) 520px, 92vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-6 left-4 flex flex-col gap-1.5 rounded-2xl bg-surface p-3 text-sm shadow-float ring-1 ring-ink/5 sm:-right-4 sm:left-auto">
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
            title="Ba nhãn, một ngôn ngữ chung"
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

function Audiences() {
  return (
    <section aria-labelledby="audience-heading" className="bg-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-8 lg:py-28">
        <SectionHead
          id="audience-heading"
          eyebrow="Dành cho ai"
          title="Ba vai trò, một vòng thực phẩm khép kín"
          lead="FoodSave duyệt hồ sơ cửa hàng và tổ chức trước khi mở cổng. Tình nguyện viên tham gia qua lời mời của tổ chức."
        />
        <ul className="grid gap-6 md:grid-cols-3">
          {AUDIENCES.map(({ role, icon: Icon, eyebrow, title, points, photo: p, cta, note }) => (
            <li
              key={role}
              data-role={role}
              className="flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-1"
            >
              <div className="relative aspect-[4/3] bg-bg-sunken">
                <Image
                  src={p.src.src}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 360px, 92vw"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col gap-4 p-6">
                <p className="flex items-center gap-2 text-sm font-semibold text-role-accent">
                  <Icon aria-hidden className="size-4" />
                  {eyebrow}
                </p>
                <h3 className="text-xl leading-7 font-semibold">{title}</h3>
                <ul className="flex flex-col gap-2 text-sm text-ink-muted">
                  {points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-role-accent" />
                      {pt}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-2">
                  {cta ? (
                    <Link
                      href={cta.href}
                      className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-role-accent underline-offset-4 hover:underline"
                    >
                      {cta.label}
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  ) : (
                    <p className="text-sm text-ink-subtle">{note}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Trust() {
  const p = photo("cho-rau-sai-gon");
  return (
    <section id="minh-bach" aria-labelledby="trust-heading" className="scroll-mt-4 border-t bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-28">
        <div className="flex flex-col gap-8">
          <SectionHead
            id="trust-heading"
            eyebrow="Minh bạch"
            title="Tin được vì kiểm chứng được"
            lead="Thiện nguyện cần niềm tin. FoodSave để lại dấu vết ở mọi bước quan trọng, và chỉ thu dữ liệu thật sự cần."
          />
          <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm leading-6 text-ink-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-[1.375rem] bg-bg-sunken shadow-photo lg:aspect-[4/5]">
          <Image
            src={p.src.src}
            alt={p.alt}
            fill
            sizes="(min-width: 1024px) 540px, 92vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section aria-labelledby="cta-heading" className="bg-bg px-4 pb-20 sm:px-8 lg:pb-28">
      <div className="fs-stage fs-grain mx-auto flex w-full max-w-6xl flex-col items-start gap-6 overflow-hidden rounded-[1.75rem] px-6 py-12 sm:px-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-xl flex-col gap-3">
          <h2
            id="cta-heading"
            className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.12] font-extrabold text-on-deep"
          >
            Còn thực phẩm tốt cuối ngày? Đừng để nó thành rác.
          </h2>
          <p className="text-on-deep-muted">
            Đăng ký miễn phí. Sau khi FoodSave duyệt hồ sơ, cửa hàng và tổ chức dùng được ngay mọi tính năng.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-on-deep-muted">
          <p>Bắt đầu từ nút ở đầu trang, hoặc:</p>
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-brand-yellow underline-offset-4 hover:underline focus-visible:outline-on-deep"
          >
            Tạo tài khoản FoodSave
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  const linkCls = "inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline";
  return (
    <footer className="border-t bg-bg-sunken">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 text-sm text-ink-muted sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            {/* Ảnh tĩnh (được cache) thay cho SVG nội tuyến — HTML trang chủ nhẹ hơn */}
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG logo, không cần tối ưu ảnh */}
            <img
              src="/brand/foodsave-logo-horizontal.svg"
              alt="FoodSave"
              width={133}
              height={32}
              className="h-8 w-auto"
            />
            <p>Cứu thực phẩm, minh bạch đến từng suất ăn. Nền tảng phi lợi nhuận, không thu phí.</p>
          </div>
          <nav aria-label="Pháp lý" className="flex flex-wrap gap-x-6">
            <Link href="/terms" className={linkCls}>
              Điều khoản
            </Link>
            <Link href="/privacy" className={linkCls}>
              Chính sách bảo mật
            </Link>
            <Link href="/credits" className={linkCls}>
              Nguồn ảnh
            </Link>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t pt-6 text-ink-subtle sm:flex-row sm:justify-between sm:gap-6">
          <p>
            © 2026 FoodSave · Dự án dự thi Giải thưởng Đổi mới sáng tạo công nghệ trong thiện nguyện bền vững
          </p>
          <p>
            Ảnh minh họa từ Pexels (giấy phép Pexels), người trong ảnh không phải đối tác FoodSave.{" "}
            <Link href="/credits" className="underline underline-offset-4 hover:text-ink">
              Xem nguồn
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <div className={cn(displayFont.variable, "relative flex flex-1 flex-col")}>
      <SiteHeader />
      <main id="noi-dung" className="flex flex-1 flex-col">
        <Hero />
        <HowItWorks />
        <Labels />
        {/* Bộ đếm tác động thật: số đọc từ Data Cache (thẻ public-impact, 10 phút), làm mới ngay sau mỗi bàn giao */}
        <Suspense fallback={<PublicImpactSectionSkeleton />}>
          <PublicImpactSection />
        </Suspense>
        <Audiences />
        <Trust />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

import { LogIn } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#cach-hoat-dong", label: "Cách hoạt động" },
  { href: "#san-pham", label: "Sản phẩm" },
  { href: "#nhan-tuoi", label: "Nhãn tươi" },
  { href: "#tac-dong", label: "Tác động" },
  { href: "#minh-bach", label: "Minh bạch" },
];

/** Header nằm trên mảng tối hero (DESIGN-SYSTEM §10.4): logo trắng, mục lục trang, Đăng nhập + Đăng ký. */
export function SiteHeader() {
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
          prefetch={false}
          href="/"
          className="inline-flex min-h-11 items-center rounded-md text-xl focus-visible:outline-on-deep"
        >
          <Logo tone="white" />
        </Link>
        <nav aria-label="Trang chủ" className="hidden items-center gap-0.5 lg:flex">
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
          <Link
            prefetch={false}
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "min-h-11 text-on-deep hover:bg-on-deep/10 hover:text-on-deep focus-visible:outline-on-deep",
            )}
          >
            <LogIn aria-hidden />
            Đăng nhập
          </Link>
          <Link
            prefetch={false}
            href="/register"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "hidden min-h-11 border-on-deep/35 bg-transparent text-on-deep hover:bg-on-deep/10 hover:text-on-deep focus-visible:outline-on-deep sm:inline-flex",
            )}
          >
            Đăng ký
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const linkCls = "inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline";
  return (
    <footer className="bg-bg-sunken">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 text-sm text-ink-muted sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-sm flex-col items-start gap-3">
            {/* Ảnh tĩnh (được cache) thay cho SVG nội tuyến — HTML trang chủ nhẹ hơn */}
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG logo, không cần tối ưu ảnh */}
            <img
              src="/brand/foodsave-logo-horizontal.svg"
              alt="FoodSave"
              width={133}
              height={32}
              loading="lazy"
              decoding="async"
              className="h-8 w-auto"
            />
            <p>Cứu thực phẩm, minh bạch đến từng suất ăn. Nền tảng phi lợi nhuận, không thu phí.</p>
          </div>
          <nav aria-label="Pháp lý" className="flex flex-wrap gap-x-6">
            <Link prefetch={false} href="/terms" className={linkCls}>
              Điều khoản
            </Link>
            <Link prefetch={false} href="/privacy" className={linkCls}>
              Chính sách bảo mật
            </Link>
            <Link prefetch={false} href="/credits" className={linkCls}>
              Nguồn ảnh
            </Link>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t pt-6 text-ink-subtle sm:flex-row sm:justify-between sm:gap-6">
          <p>
            © 2026 FoodSave · Dự án dự thi Giải thưởng Đổi mới sáng tạo công nghệ trong thiện nguyện bền vững
          </p>
          <p className="sm:max-w-md sm:text-right">
            Ảnh minh họa từ Pexels (giấy phép Pexels), người trong ảnh không phải đối tác FoodSave. Ảnh giao
            diện là ảnh chụp màn hình thật với dữ liệu demo.{" "}
            <Link prefetch={false} href="/credits" className="underline underline-offset-4 hover:text-ink">
              Xem nguồn
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

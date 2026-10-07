import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

type AuthShellProps = {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Khung chung cho các trang xác thực: thương hiệu bên trái (desktop), form bên phải. */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary-active p-10 text-surface lg:flex">
        <Link href="/" className="w-fit rounded-md focus-visible:outline-surface">
          <Wordmark inverted className="text-2xl [&>span:nth-child(2)]:text-label-green-border" />
        </Link>
        <div className="max-w-md">
          <p className="text-3xl leading-tight font-bold">
            Mỗi lô thực phẩm được cứu là một bữa ăn được trao đi.
          </p>
          <p className="mt-4 text-surface/80">
            Cửa hàng, tổ chức từ thiện và tình nguyện viên cùng điều phối — minh bạch đến từng suất ăn.
          </p>
        </div>
        <p className="text-sm text-surface/70">Nền tảng phi lợi nhuận · TISPA 2026</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-primary opacity-60 blur-3xl"
        />
      </aside>

      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-block rounded-md lg:hidden">
            <Wordmark className="text-2xl" />
          </Link>
          <h1 className="text-[1.75rem] font-bold">{title}</h1>
          {description ? <div className="mt-2 text-ink-muted">{description}</div> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-sm text-ink-muted">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}

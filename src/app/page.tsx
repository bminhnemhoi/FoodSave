import { HandHeart, LogIn, MapPinned, QrCode, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { FreshnessBadge, type FreshnessLabel } from "@/components/labels/freshness-badge";
import { Button } from "@/components/ui/button";
import {
  PublicImpactSection,
  PublicImpactSectionSkeleton,
} from "@/features/impact/components/public-impact-section";

const LABEL_RULES: { label: FreshnessLabel; title: string; body: string }[] = [
  { label: "green", title: "Còn thời gian", body: "Lấy theo kế hoạch trong ngày hoặc hôm sau." },
  { label: "yellow", title: "Nên lấy sớm", body: "Ưu tiên ghép đơn và phân công trong vài giờ tới." },
  { label: "red", title: "Cần lấy ngay", body: "Chỉ gợi ý cho tổ chức đến kịp trước giờ hết hạn." },
];

const PILLARS = [
  { icon: Store, title: "Cửa hàng đăng lô", body: "Số lượng, hạn dùng, khung giờ lấy — nhãn tươi tự gắn." },
  {
    icon: HandHeart,
    title: "Tổ chức đăng nhu cầu",
    body: "Hệ thống ghép từ nhiều cửa hàng gần nhất cho đủ.",
  },
  {
    icon: MapPinned,
    title: "Tuyến lấy hàng",
    body: "Bản đồ và thứ tự điểm dừng tối ưu cho tình nguyện viên.",
  },
  { icon: QrCode, title: "Bàn giao QR", body: "Hai bên cùng xác nhận số lượng — không thất lạc." },
  {
    icon: ShieldCheck,
    title: "Minh chứng & ESG",
    body: "Ảnh làm mờ khuôn mặt, chỉ số tác động có trích nguồn.",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Wordmark className="text-2xl" />
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-brand-yellow-soft px-3 py-1 text-xs font-medium text-ink sm:inline">
            Bản dựng thử · TISPA 2026
          </span>
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/login">
              <LogIn aria-hidden />
              Đăng nhập
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-8 pb-16 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:pt-16">
        <div className="flex flex-col gap-6">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">Nền tảng phi lợi nhuận</p>
          <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.15] font-bold">
            Cứu thực phẩm, minh bạch đến từng suất ăn.
          </h1>
          <p className="max-w-prose text-lg text-ink-muted">
            FoodSave kết nối thực phẩm còn dùng tốt từ cửa hàng tới mái ấm, bếp ăn từ thiện và viện dưỡng lão
            — nhanh, đúng người, và có bằng chứng cho từng lô.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="min-h-11">
              <Link href="/register?next=%2Fonboarding%2Fstore">Đăng ký cửa hàng</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-11">
              <Link href="/register?next=%2Fonboarding%2Fcharity">Đăng ký tổ chức</Link>
            </Button>
          </div>
          <p className="text-sm text-ink-subtle">
            Tình nguyện viên tham gia qua lời mời của tổ chức từ thiện. FoodSave duyệt hồ sơ cửa hàng và tổ
            chức trước khi mở cổng.
          </p>
        </div>

        <ul className="flex flex-col gap-3" aria-label="Nhãn tươi">
          {LABEL_RULES.map((rule) => (
            <li key={rule.label} className="flex items-start gap-4 rounded-lg border bg-surface p-4 shadow-1">
              <FreshnessBadge label={rule.label} />
              <div>
                <p className="font-semibold">{rule.title}</p>
                <p className="text-sm text-ink-muted">{rule.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t bg-bg-sunken">
        <ul className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-5">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-2 rounded-lg bg-surface p-5">
              <Icon aria-hidden className="size-6 text-primary" />
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-ink-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Bộ đếm tác động thật: số đọc từ Data Cache (thẻ public-impact, 10 phút), làm mới ngay sau mỗi bàn giao */}
      <Suspense fallback={<PublicImpactSectionSkeleton />}>
        <PublicImpactSection />
      </Suspense>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          © 2026 FoodSave · Dự án dự thi Giải thưởng Đổi mới sáng tạo công nghệ trong thiện nguyện bền vững
        </p>
        <nav aria-label="Pháp lý" className="flex gap-4">
          <Link
            href="/terms"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline"
          >
            Điều khoản
          </Link>
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline"
          >
            Chính sách bảo mật
          </Link>
        </nav>
      </footer>
    </main>
  );
}

import { HandHeart, MapPinned, QrCode, ShieldCheck, Store } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import { FreshnessBadge, type FreshnessLabel } from "@/components/labels/freshness-badge";
import { Button } from "@/components/ui/button";

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
        <span className="rounded-full bg-brand-yellow-soft px-3 py-1 text-xs font-medium text-ink">
          Bản dựng thử · TISPA 2026
        </span>
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
            <Button size="lg" disabled>
              Đăng ký cửa hàng
            </Button>
            <Button size="lg" variant="outline" disabled>
              Đăng ký tổ chức
            </Button>
          </div>
          <p className="text-sm text-ink-subtle">Cổng đăng ký mở ở giai đoạn P1 (từ 12/10/2026).</p>
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

      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-ink-subtle sm:px-8">
        © 2026 FoodSave · Dự án dự thi Giải thưởng Đổi mới sáng tạo công nghệ trong thiện nguyện bền vững
      </footer>
    </main>
  );
}

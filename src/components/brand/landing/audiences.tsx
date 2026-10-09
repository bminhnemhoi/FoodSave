import { ArrowRight, Bike, Check, HandHeart, type LucideIcon, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { photo, type BrandPhoto } from "@/components/brand/photos";

import { REGISTER_CHARITY, REGISTER_STORE, SectionHead } from "./shared";

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
      "Đăng nhu cầu, chọn phương án ghép từ nhiều cửa hàng",
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

/** "Dành cho ai" — ba vai trò, ảnh + accent vai trò (DESIGN-SYSTEM §3.4). */
export function Audiences() {
  return (
    <section aria-labelledby="audience-heading" className="bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-8 lg:py-24">
        <SectionHead
          id="audience-heading"
          eyebrow="Dành cho ai"
          title="Ba vai trò, một vòng thực phẩm khép kín"
          lead="FoodSave duyệt hồ sơ cửa hàng và tổ chức trước khi mở cổng. Tình nguyện viên tham gia qua lời mời của tổ chức."
        />
        <ul className="grid gap-6 md:grid-cols-3">
          {AUDIENCES.map(({ role, icon: Icon, eyebrow, title, points, photo: p, cta, note }) => (
            <li
              key={role}
              data-role={role}
              className="flex flex-col overflow-hidden rounded-2xl border bg-bg shadow-1"
            >
              <div className="relative aspect-[4/3] bg-bg-sunken">
                <Image
                  src={p.src}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 360px, 92vw"
                  className="object-cover"
                />
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-role-accent shadow-2">
                  <Icon aria-hidden className="size-4" />
                  {eyebrow}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-6">
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
                      prefetch={false}
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

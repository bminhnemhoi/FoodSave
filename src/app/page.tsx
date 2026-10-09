import { displayFont } from "@/components/brand/fonts";
import { Audiences } from "@/components/brand/landing/audiences";
import { ClosingCta } from "@/components/brand/landing/closing-cta";
import { Hero } from "@/components/brand/landing/hero";
import { HowItWorks } from "@/components/brand/landing/how-it-works";
import { Labels } from "@/components/brand/landing/labels";
import { ProductShowcase } from "@/components/brand/landing/product-showcase";
import { SiteFooter, SiteHeader } from "@/components/brand/landing/site-chrome";
import { Trust } from "@/components/brand/landing/trust";
import { PublicImpactSection } from "@/features/impact/components/public-impact-section";
import { cn } from "@/lib/utils";

/**
 * Landing (DESIGN-SYSTEM §10.4) — trang TĨNH: prerender lúc build, phục vụ từ CDN, không chờ DB. Số tác động
 * thật được lấy phía trình duyệt từ `/api/public-impact` (thẻ hero + khối "Tác động đã ghi nhận").
 * Nhịp khối: tối (hero ảnh) → sáng (cách hoạt động) → mực (sản phẩm) → sáng (nhãn tươi) → tối (tác động) →
 * sáng (minh bạch, dành cho ai) → tối (CTA cuối, nối thẳng chân trang).
 */
export default function HomePage() {
  return (
    <div className={cn(displayFont.variable, "relative flex flex-1 flex-col")}>
      <SiteHeader />
      <main id="noi-dung" className="flex flex-1 flex-col">
        <Hero />
        <HowItWorks />
        <ProductShowcase />
        <Labels />
        <PublicImpactSection />
        <Trust />
        <Audiences />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

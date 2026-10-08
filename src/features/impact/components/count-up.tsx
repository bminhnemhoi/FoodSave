"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** "1.234,5" ⇒ { n: 1234.5, digits: 1 } (định dạng vi-VN của `@/core/impact`). */
export function parseViNumber(text: string): { n: number; digits: number } | null {
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(text)) return null;
  const [int = "", frac = ""] = text.split(",");
  const n = Number(`${int.replaceAll(".", "")}.${frac || "0"}`);
  return Number.isFinite(n) ? { n, digits: frac.length } : null;
}

const DURATION_MS = 1100;
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

type CountUpProps = {
  /** Số đã định dạng ở server ("1.234,5"). Luôn nằm trong DOM (`data-value`) — trình đọc màn hình và test đọc số này. */
  value: string;
  className?: string;
};

/**
 * Đếm lên một lần khi khối vào khung nhìn (DESIGN-SYSTEM §8: ≤ 1,2 s, không lặp). Không có JS, khối đã nằm
 * trong khung nhìn lúc tải, hoặc bật "giảm chuyển động" ⇒ hiện ngay giá trị cuối. Số chạy là lớp
 * `aria-hidden` chồng lên số thật; số thật chỉ mờ đi trong lúc chạy nên bố cục không đổi (không CLS).
 * Dùng IntersectionObserver + requestAnimationFrame và ghi chữ thẳng vào DOM: không thư viện, không render
 * lại React mỗi khung hình, không ép reflow lúc hydrate (giữ điểm hiệu năng trang chủ).
 */
export function CountUp({ value, className }: CountUpProps) {
  const root = useRef<HTMLSpanElement>(null);
  const finalEl = useRef<HTMLSpanElement>(null);
  const runEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    const fin = finalEl.current;
    const run = runEl.current;
    const parsed = parseViNumber(value);
    if (!el || !fin || !run || !parsed || parsed.n === 0) return;
    if (!("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const fmt = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: parsed.digits,
      maximumFractionDigits: parsed.digits,
    });
    let frame = 0;
    let state: "unknown" | "armed" | "done" = "unknown";
    const finish = () => {
      run.hidden = true;
      fin.style.opacity = "";
    };
    const start = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / DURATION_MS);
        run.textContent = fmt.format(parsed.n * easeOutQuart(t));
        if (t < 1) frame = requestAnimationFrame(step);
        else finish();
      };
      frame = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (state === "unknown") {
          // Lần báo đầu tiên: đang hiện sẵn trên màn hình ⇒ giữ nguyên số, không làm nháy
          if (entry.isIntersecting) {
            state = "done";
            io.disconnect();
            return;
          }
          state = "armed";
          run.textContent = fmt.format(0);
          run.hidden = false;
          fin.style.opacity = "0";
          return;
        }
        if (state === "armed" && entry.intersectionRatio >= 0.6) {
          state = "done";
          io.disconnect();
          start();
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      finish();
    };
  }, [value]);

  return (
    <span ref={root} className={cn("relative inline-block tabular-nums", className)}>
      <span ref={finalEl} data-value>
        {value}
      </span>
      <span ref={runEl} aria-hidden hidden className="absolute inset-y-0 left-0 whitespace-nowrap" />
    </span>
  );
}

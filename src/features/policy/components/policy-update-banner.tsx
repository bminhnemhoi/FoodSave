"use client";

import { Check, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { POLICY_CHANGES } from "@/lib/legal";

import { acceptPolicyUpdate } from "../actions";
import { POLICY_UPDATE_TITLE } from "../consent";

function source(): "web" | "pwa" {
  if (typeof window === "undefined") return "web";
  return window.matchMedia?.("(display-mode: standalone)").matches ? "pwa" : "web";
}

/**
 * Banner đồng ý lại chính sách (B3): nằm đầu nội dung trang trong app shell, KHÔNG chặn thao tác nào. "Xem điểm thay
 * đổi" mở danh sách ngay tại chỗ (kèm liên kết /privacy); "Đồng ý" ghi đồng ý `terms` phiên bản mới rồi ẩn banner.
 */
export function PolicyUpdateBanner() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const accept = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await acceptPolicyUpdate({ source: source() });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setHidden(true);
        toast.success("Cảm ơn bạn đã xem và đồng ý chính sách mới.");
        router.refresh();
      } catch {
        setError(
          "Không có kết nối mạng. Bạn vẫn dùng FoodSave bình thường — hãy bấm “Đồng ý” lại khi có mạng.",
        );
      }
    });
  };

  return (
    <aside
      aria-labelledby="policy-update-title"
      data-policy-banner
      className="mb-6 flex flex-col gap-3 rounded-xl border border-info/30 bg-info-soft p-4 text-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <FileText aria-hidden className="size-5 shrink-0 text-info" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Không dùng heading: banner nằm trước h1 của trang (giữ đúng thứ tự tiêu đề) */}
          <p id="policy-update-title" className="text-[0.9375rem] font-semibold text-ink">
            {POLICY_UPDATE_TITLE}
          </p>
          <details className="text-ink-muted">
            <summary className="w-fit cursor-pointer py-1 font-medium text-ink underline underline-offset-4">
              Xem điểm thay đổi
            </summary>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              {POLICY_CHANGES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Link
              href="/privacy#thay-doi"
              className="mt-2 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
            >
              Đọc toàn bộ Chính sách bảo mật
            </Link>
          </details>
        </div>
        <Button
          type="button"
          className="min-h-11 w-full shrink-0 sm:w-auto"
          onClick={accept}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Đồng ý
        </Button>
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-danger">
          {error}
        </p>
      ) : null}
    </aside>
  );
}

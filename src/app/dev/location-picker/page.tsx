import { LogIn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { clientEnv } from "@/lib/env.client";
import { getUser } from "@/server/auth/session";

import { LocationPickerDemo } from "./demo";

export const metadata: Metadata = { title: "Thử bộ chọn vị trí", robots: { index: false } };

/** P1-03: trang thử LocationPicker (dev). Không có ở production. Server Action bản đồ yêu cầu đăng nhập. */
export default async function LocationPickerDevPage() {
  if (clientEnv.NEXT_PUBLIC_APP_ENV === "production") notFound();
  const user = await getUser();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Trang thử · dev</p>
        <h1 className="text-[1.75rem] leading-tight font-bold">Bộ chọn vị trí</h1>
        <p className="max-w-prose text-ink-muted">
          Tìm địa chỉ có gợi ý, dùng vị trí hiện tại, kéo ghim trên bản đồ. Ghim là nguồn sự thật; phường/xã
          tự điền bằng reverse geocode. Ghim ngoài TP.HCM bị chặn.
        </p>
      </header>
      {user ? (
        <LocationPickerDemo />
      ) : (
        <EmptyState
          icon={LogIn}
          title="Cần đăng nhập để tìm địa chỉ"
          description="Dịch vụ tìm địa chỉ chỉ mở cho người đã đăng nhập để bảo vệ hạn mức của FoodSave."
          action={
            <Button asChild>
              <Link href="/login?next=%2Fdev%2Flocation-picker">Đăng nhập</Link>
            </Button>
          }
        />
      )}
    </main>
  );
}

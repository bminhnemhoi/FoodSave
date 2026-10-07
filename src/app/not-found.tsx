import { ArrowLeft, Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-8">
      <Link
        href="/"
        className="inline-flex min-h-11 w-fit items-center rounded-md"
        aria-label="FoodSave — trang chủ"
      >
        <Wordmark className="text-xl" />
      </Link>
      <h1 className="text-[1.75rem] font-bold">Không tìm thấy trang</h1>
      <EmptyState
        icon={Compass}
        title="Trang này không tồn tại hoặc bạn không có quyền xem"
        description="Kiểm tra lại đường dẫn, hoặc quay về trang chủ để tiếp tục."
        action={
          <Button asChild>
            <Link href="/">
              <ArrowLeft aria-hidden />
              Về trang chủ
            </Link>
          </Button>
        }
      />
    </main>
  );
}

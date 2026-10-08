import { PackageSearch } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

/** Lô không tồn tại hoặc thuộc chi nhánh người xem không được giao (RLS) — không phân biệt để tránh dò. */
export default function OfferNotFound() {
  return (
    <EmptyState
      icon={PackageSearch}
      title="Không tìm thấy lô này"
      description="Lô có thể đã bị xóa, hoặc thuộc chi nhánh mà tài khoản của bạn không được giao."
      action={
        <Button asChild>
          <Link href="/store/inventory">Về danh sách lô</Link>
        </Button>
      }
    />
  );
}

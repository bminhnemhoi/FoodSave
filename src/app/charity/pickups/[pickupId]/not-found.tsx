import { Route } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

/** Chuyến không tồn tại hoặc không thuộc điểm nhận bạn phụ trách (RLS không phân biệt hai trường hợp). */
export default function TripNotFound() {
  return (
    <EmptyState
      icon={Route}
      title="Không tìm thấy chuyến"
      description={
        <p>Chuyến này không tồn tại, hoặc thuộc điểm nhận mà tài khoản của bạn không phụ trách.</p>
      }
      action={
        <Button asChild>
          <Link href="/charity/pickups">Về danh sách chuyến</Link>
        </Button>
      }
    />
  );
}

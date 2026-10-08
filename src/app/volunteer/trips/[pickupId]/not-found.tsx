import { Route } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

/** Chuyến không tồn tại, đã giao cho người khác, hoặc không phải của bạn (RLS không phân biệt các trường hợp). */
export default function VolunteerTripNotFound() {
  return (
    <EmptyState
      icon={Route}
      title="Không tìm thấy chuyến"
      description={
        <p>
          Chuyến này không còn giao cho bạn (điều phối viên có thể đã giao lại cho người khác) hoặc không tồn
          tại.
        </p>
      }
      action={
        <Button asChild size="lg" className="h-12 text-base">
          <Link href="/volunteer">Về “Hôm nay”</Link>
        </Button>
      }
    />
  );
}

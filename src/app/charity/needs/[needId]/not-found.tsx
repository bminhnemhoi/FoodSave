import { HandHeart } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

/** Nhu cầu không tồn tại hoặc không thuộc tổ chức của người xem (không phân biệt — tránh dò). */
export default function NeedNotFound() {
  return (
    <EmptyState
      icon={HandHeart}
      title="Không tìm thấy nhu cầu"
      description="Nhu cầu này không tồn tại, hoặc thuộc một tổ chức khác. Hãy mở lại từ danh sách nhu cầu."
      action={
        <Button asChild>
          <Link href="/charity/needs">Về danh sách nhu cầu</Link>
        </Button>
      }
    />
  );
}

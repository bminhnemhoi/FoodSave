import { ConsoleListSkeleton } from "@/features/admin-console/components/console-skeletons";

export default function Loading() {
  return <ConsoleListSkeleton label="Đang tải nhật ký kiểm toán…" chips={0} />;
}

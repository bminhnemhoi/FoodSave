import { ConsoleListSkeleton } from "@/features/admin-console/components/console-skeletons";

export default function Loading() {
  return <ConsoleListSkeleton label="Đang tải danh sách lô…" kpis={3} chips={8} />;
}

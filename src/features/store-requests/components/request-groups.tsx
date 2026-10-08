import type { StoreAllocation } from "../queries";
import { RequestCard } from "./request-card";

/** Nhóm phân bổ của một lô: Chờ xác nhận → Đang chuẩn bị → Đã kết thúc (ưu tiên việc cần làm). */
const GROUPS: { key: string; title: string; match: (a: StoreAllocation) => boolean }[] = [
  { key: "pending", title: "Chờ xác nhận", match: (a) => a.status === "requested" },
  {
    key: "active",
    title: "Đang chuẩn bị bàn giao",
    match: (a) => a.status === "confirmed" || a.status === "assigned",
  },
  { key: "picked", title: "Đã lấy hàng", match: (a) => a.status === "picked_up" || a.status === "delivered" },
  {
    key: "closed",
    title: "Đã kết thúc",
    match: (a) => a.status === "rejected" || a.status === "cancelled" || a.status === "expired",
  },
];

export function RequestGroups({
  allocations,
  serverNow,
}: {
  allocations: StoreAllocation[];
  serverNow: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((g) => {
        const items = allocations.filter(g.match);
        if (items.length === 0) return null;
        return (
          <section key={g.key} aria-labelledby={`group-${g.key}`} className="flex flex-col gap-3">
            <h3
              id={`group-${g.key}`}
              className="flex items-center gap-2 text-sm font-semibold text-ink-muted"
            >
              {g.title}
              <span className="rounded-full bg-bg-sunken px-2 py-0.5 text-xs tabular-nums">
                {items.length}
              </span>
            </h3>
            <ul className="flex flex-col gap-3">
              {items.map((a) => (
                <li key={a.id}>
                  <RequestCard allocation={a} serverNow={serverNow} headingLevel={4} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Dòng bảng mở rộng được: nút "Chi tiết" (`aria-expanded`/`aria-controls`) bật một dòng phụ trải hết bề
 * ngang bảng. Nội dung ô và chi tiết do Server Component dựng sẵn (đã che dữ liệu nhạy cảm).
 */
export function ExpandableRow({
  cells,
  detail,
  colSpan,
  label,
  testId,
}: {
  cells: React.ReactNode;
  detail: React.ReactNode;
  /** Tổng số cột của bảng (kể cả cột nút). */
  colSpan: number;
  /** Mô tả dòng cho trình đọc màn hình, vd. "Duyệt hồ sơ lúc 09/10/2026 11:42". */
  label: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  return (
    <>
      <TableRow data-testid={testId} data-state={open ? "open" : "closed"}>
        {cells}
        <TableCell className="py-3 pr-4 text-right">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-10"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
            {open ? "Ẩn" : "Chi tiết"}
            <span className="sr-only">: {label}</span>
          </Button>
        </TableCell>
      </TableRow>
      <TableRow id={detailId} hidden={!open} className="bg-bg-sunken/50 hover:bg-bg-sunken/50">
        <TableCell colSpan={colSpan} className="px-4 py-4 whitespace-normal">
          {detail}
        </TableCell>
      </TableRow>
    </>
  );
}

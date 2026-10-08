"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { qrMatrix, qrSvgPath, type QrErrorCorrection } from "./qr-matrix";

type QrCodeProps = {
  value: string;
  /** Tên cho trình đọc màn hình (nội dung mã luôn có phương án thay thế bằng chữ bên cạnh). */
  label: string;
  errorCorrection?: QrErrorCorrection;
  className?: string;
};

/**
 * QR dạng SVG (sắc nét ở mọi kích thước, không ảnh bitmap): nền trắng thuần + module mực đậm nhất,
 * vùng yên tĩnh 4 module nằm trong SVG nên không phụ thuộc padding bên ngoài.
 */
export function QrCode({ value, label, errorCorrection = "Q", className }: QrCodeProps) {
  const { d, viewBoxSize } = useMemo(
    () => qrSvgPath(qrMatrix(value, errorCorrection)),
    [value, errorCorrection],
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      shapeRendering="crispEdges"
      className={cn("block aspect-square h-auto w-full", className)}
      data-qr-size={viewBoxSize}
    >
      {/* --primary-foreground = #FFFFFF: nền trắng thuần cho máy quét (DESIGN-SYSTEM §11.2 QrHandover) */}
      <rect width={viewBoxSize} height={viewBoxSize} className="fill-primary-foreground" />
      <path d={d} className="fill-ink" />
    </svg>
  );
}

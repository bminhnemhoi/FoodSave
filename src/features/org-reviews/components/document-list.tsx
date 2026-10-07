"use client";

import { ExternalLink, Eye, EyeOff, FileText, ImageIcon, Loader2, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DOC_TYPE_LABEL } from "@/features/organizations/labels";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";

import { openOrgDocumentAction } from "../actions";
import type { ReviewDocument } from "../queries";

type Preview = { id: string; url: string; expiresAt: string };

const isImage = (mime: string) => mime.startsWith("image/");

const TIME_ONLY = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Giấy tờ KYC (US-ADM-03): mỗi lần bấm "Xem" xin một signed URL 60 giây mới. Ảnh xem ngay trong trang;
 * PDF mở ở tab mới (tab được mở trước trong cùng cú bấm để không bị chặn popup). Không có nút tải xuống.
 */
export function DocumentList({ documents, orgName }: { documents: ReviewDocument[]; orgName: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [opened, setOpened] = useState<Preview | null>(null);
  const [, startTransition] = useTransition();

  const view = (doc: ReviewDocument) => {
    const image = isImage(doc.mimeType);
    // Mở tab ngay trong sự kiện bấm (trước await) để trình duyệt không chặn popup
    const tab = image ? null : window.open("", "_blank");
    setBusy(doc.id);
    startTransition(async () => {
      const res = await openOrgDocumentAction(doc.id).catch(() => null);
      setBusy(null);
      if (!res || !res.ok) {
        tab?.close();
        toast.error(res?.message ?? "Không mở được tệp. Kiểm tra kết nối mạng rồi thử lại.");
        return;
      }
      const info = { id: doc.id, url: res.url, expiresAt: res.expiresAt };
      if (image) {
        setPreview(info);
        return;
      }
      setOpened(info);
      if (tab) {
        tab.opener = null;
        tab.location.href = res.url;
      }
    });
  };

  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-bg-sunken px-4 py-6 text-center text-ink-muted">
        Chưa có giấy tờ nào được tải lên.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {documents.map((doc) => {
        const Icon = isImage(doc.mimeType) ? ImageIcon : FileText;
        const label = DOC_TYPE_LABEL[doc.docType];
        const showPreview = preview?.id === doc.id;
        const showOpened = opened?.id === doc.id;
        return (
          <li key={doc.id} className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-bg-sunken text-ink-muted">
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{label}</p>
                <p className="text-sm text-ink-subtle">
                  {isImage(doc.mimeType) ? "Ảnh" : "PDF"} · {formatBytes(doc.sizeBytes)} · tải lên{" "}
                  {formatDateTime(doc.uploadedAt)}
                </p>
                {doc.purgeAfter && !doc.deleted ? (
                  <p className="text-sm text-ink-subtle">Tự xóa ngày {formatDate(doc.purgeAfter)}</p>
                ) : null}
              </div>
              {doc.deleted ? (
                <p className="text-sm text-ink-muted">Tệp đã xóa theo chính sách lưu giữ</p>
              ) : showPreview ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10"
                  onClick={() => setPreview(null)}
                >
                  <EyeOff aria-hidden />
                  Ẩn
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10"
                  onClick={() => view(doc)}
                  disabled={busy === doc.id}
                  aria-disabled={busy === doc.id}
                  aria-label={`Xem ${label}`}
                >
                  {busy === doc.id ? <Loader2 aria-hidden className="animate-spin" /> : <Eye aria-hidden />}
                  Xem
                </Button>
              )}
            </div>

            {showPreview ? (
              <figure className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ngắn hạn của bucket private */}
                <img
                  src={preview.url}
                  alt={`${label} của ${orgName}`}
                  className="max-h-[70vh] w-full rounded-md border bg-bg-sunken object-contain"
                  referrerPolicy="no-referrer"
                />
                <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-subtle">
                  <span className="inline-flex items-center gap-1">
                    <Lock aria-hidden className="size-3.5" />
                    Liên kết riêng hết hạn lúc {TIME_ONLY.format(new Date(preview.expiresAt))}
                  </span>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
                  >
                    <ExternalLink aria-hidden className="size-3.5" />
                    Mở trong tab mới
                  </a>
                </figcaption>
              </figure>
            ) : null}

            {showOpened ? (
              <p
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-subtle"
                role="status"
              >
                <span className="inline-flex items-center gap-1">
                  <Lock aria-hidden className="size-3.5" />
                  Đã mở ở tab mới. Liên kết riêng hết hạn lúc {TIME_ONLY.format(new Date(opened.expiresAt))}.
                </span>
                <a
                  href={opened.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                  Mở lại
                </a>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

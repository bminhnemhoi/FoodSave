import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";

import { photo, PHOTO_CREDITS, type PhotoId } from "@/components/brand/photos";

export const metadata: Metadata = {
  title: "Nguồn ảnh",
  description: "Nguồn, tác giả và giấy phép của các ảnh minh họa trên trang công khai của FoodSave.",
};

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-ink"
    >
      {children}
      <ExternalLink aria-hidden className="size-3.5" />
      <span className="sr-only"> (mở tab mới)</span>
    </a>
  );
}

/** Ghi nguồn ảnh minh họa (DESIGN-SYSTEM §2.4) — đọc từ `public/images/credits.json`. */
export default function CreditsPage() {
  const { photos, license, note, updated } = PHOTO_CREDITS;
  const [y, m, d] = updated.split("-");
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1>Nguồn ảnh</h1>
        <p className="text-sm text-ink-muted">
          Cập nhật <span className="tabular-nums">{`${d}/${m}/${y}`}</span>
        </p>
      </header>
      <p>{note}</p>
      <p>
        Tất cả ảnh dưới đây dùng theo <External href={license.url}>{license.name}</External>:{" "}
        {license.summary} FoodSave vẫn ghi tên tác giả để cảm ơn và để ai cũng kiểm tra được nguồn.
      </p>

      <ul className="mt-2 flex flex-col divide-y rounded-lg border bg-surface">
        {photos.map((c) => {
          const p = photo(c.id as PhotoId);
          return (
            <li key={c.id} className="flex gap-4 p-4">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-bg-sunken sm:size-24">
                <Image src={p.src} alt="" fill sizes="96px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <p className="font-semibold text-ink">{c.alt}</p>
                <p className="text-ink-muted">
                  Ảnh: <External href={c.photographerUrl}>{c.photographer}</External>
                  {c.location ? ` · ${c.location}` : ""}
                </p>
                <p className="text-ink-muted">
                  Nguồn: <External href={c.sourceUrl}>{`${c.source} — “${c.title}”`}</External>
                </p>
                <p className="text-ink-muted">Giấy phép: {c.license}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">
        Logo FoodSave dùng phông Bricolage Grotesque (giấy phép SIL Open Font License 1.1); chữ giao diện dùng
        Be Vietnam Pro (SIL OFL 1.1).
      </p>
    </>
  );
}

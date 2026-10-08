"use client";

import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ActionResult } from "../errors";
import { publicMediaUrl, uploadLogo } from "../upload";
import { FieldErrorText, Section } from "./fields";

type SaveLogo = (input: { orgId: string; path: string | null }) => Promise<ActionResult<{ savedAt: string }>>;

/**
 * Logo tổ chức (bucket `media` public, ảnh mã hóa lại qua canvas trong `uploadLogo`).
 * Dùng chung: wizard (`saveLogo`, hồ sơ nháp) và Cài đặt (`saveSettingsLogo`, tổ chức đã duyệt).
 */
export function LogoField({
  orgId,
  initialPath,
  save,
  onSaved,
  title = "Logo (không bắt buộc)",
  description = "Logo hiển thị công khai sau khi hồ sơ được duyệt. Ảnh vuông, rõ nét là đẹp nhất.",
}: {
  orgId: string;
  initialPath: string | null;
  save: SaveLogo;
  onSaved?: (savedAt: string, path: string | null) => void;
  title?: string;
  description?: string;
}) {
  const [path, setPath] = useState<string | null>(initialPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const up = await uploadLogo({ orgId, file });
    if (!up.ok) {
      setBusy(false);
      setError(up.error);
      return;
    }
    const res = await save({ orgId, path: up.value });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setPath(up.value);
    onSaved?.(res.data.savedAt, up.value);
  }

  async function removeLogo() {
    setBusy(true);
    setError(null);
    const res = await save({ orgId, path: null });
    setBusy(false);
    if (!res.ok) setError(res.error.message);
    else {
      setPath(null);
      onSaved?.(res.data.savedAt, null);
    }
  }

  return (
    <Section title={title} headingId="logo-heading" description={description}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-bg-sunken">
          {path ? (
            <Image
              src={publicMediaUrl(path)}
              alt="Logo hiện tại"
              width={80}
              height={80}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            <ImagePlus aria-hidden className="size-7 text-ink-subtle" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="logo-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="peer sr-only"
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="logo-file"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-60",
            )}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
            {path ? "Đổi logo" : "Tải logo lên"}
          </label>
          {path ? (
            <Button type="button" variant="ghost" size="lg" onClick={() => void removeLogo()} disabled={busy}>
              <Trash2 aria-hidden />
              Gỡ logo
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <FieldErrorText id="logo-file">{error}</FieldErrorText> : null}
    </Section>
  );
}

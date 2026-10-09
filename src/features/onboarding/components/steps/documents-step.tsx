"use client";

import { CircleAlert, FileImage, FileText, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DOC_TYPE_LABEL } from "@/features/organizations/labels";
import { formatFileSize, KYC_ACCEPT } from "@/lib/image/resize";
import { cn } from "@/lib/utils";

import { deleteDocument, saveLogo } from "../../actions";
import { storedFileLabel } from "../../documents";
import { DOC_SLOTS, KIND_COPY, type DocSlot } from "../../options";
import { documentsComplete } from "../../progress";
import type { WizardDocument } from "../../queries";
import { uploadKycDocument } from "../../upload";
import { useAutosaveRegistry } from "../autosave";
import { FieldErrorText } from "../fields";
import { LogoField } from "../logo-field";
import { useWizard } from "../wizard-context";

const MAX_PER_SLOT = 5;

const dateTime = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
});

function RequirementBadge({ requirement }: { requirement: DocSlot["requirement"] }) {
  const text =
    requirement === "required" ? "Bắt buộc" : requirement === "one_of" ? "Cần ít nhất một" : "Không bắt buộc";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        requirement === "optional"
          ? "border-border-strong/40 bg-bg-sunken text-ink-muted"
          : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      {text}
    </span>
  );
}

function DocumentRow({
  doc,
  title,
  onDeleted,
}: {
  doc: WizardDocument;
  title: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPdf = doc.mimeType === "application/pdf";
  const Icon = isPdf ? FileText : FileImage;
  const when = dateTime.format(new Date(doc.uploadedAt));
  const name = doc.fileName ?? storedFileLabel(doc.storagePath);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await deleteDocument({ documentId: doc.id });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setOpen(false);
    onDeleted();
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-bg px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Icon aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={name}>
            {name}
          </p>
          <p className="text-xs text-ink-subtle">
            {isPdf ? "Tệp PDF" : "Ảnh (đã xóa thông tin vị trí)"} ·{" "}
            <span className="tabular-nums">{formatFileSize(doc.sizeBytes)}</span> · Tải lên lúc{" "}
            <span className="tabular-nums">{when}</span>
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 text-danger hover:text-danger"
            onClick={() => setOpen(true)}
            aria-label={`Xóa ${name} (${title}) tải lên lúc ${when}`}
          >
            <Trash2 aria-hidden />
            <span className="hidden sm:inline">Xóa</span>
          </Button>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Xóa giấy tờ này?</DialogTitle>
              <DialogDescription>
                Tệp “{name}” ({title}) tải lên lúc {when} sẽ bị xóa khỏi kho lưu trữ và không khôi phục được.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" autoFocus>
                  Quay lại
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void remove()}
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
                Xóa tệp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </li>
  );
}

function SlotCard({
  slot,
  docs,
  orgId,
  missing,
  onAdded,
  onRemoved,
}: {
  slot: DocSlot;
  docs: WizardDocument[];
  orgId: string;
  missing: boolean;
  onAdded: (d: WizardDocument) => void;
  onRemoved: (id: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputId = `doc-${slot.type}`;
  const full = docs.length >= MAX_PER_SLOT;
  const errorText =
    error ??
    (missing
      ? slot.requirement === "required"
        ? `Vui lòng tải lên ${slot.title.toLowerCase()}.`
        : `Vui lòng tải lên ${DOC_TYPE_LABEL.establishment_decision.toLowerCase()} hoặc ${DOC_TYPE_LABEL.operating_license.toLowerCase()}.`
      : null);

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPhase("working");
    setError(null);
    const res = await uploadKycDocument({ orgId, docType: slot.type, file });
    setPhase("idle");
    if (!res.ok) setError(res.error);
    else onAdded(res.value);
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="flex flex-col gap-3 rounded-xl border bg-surface p-4 sm:p-5"
      data-testid={`doc-slot-${slot.type}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`${inputId}-title`} className="font-semibold">
          {slot.title}
        </h3>
        <RequirementBadge requirement={slot.requirement} />
      </div>
      <p className="text-sm text-ink-muted">{slot.description}</p>

      {docs.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={`Đã tải lên: ${slot.title}`}>
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} title={slot.title} onDeleted={() => onRemoved(d.id)} />
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2">
        <input
          id={inputId}
          type="file"
          accept={KYC_ACCEPT}
          className="peer sr-only"
          disabled={phase === "working" || full}
          aria-describedby={`${inputId}-hint${errorText ? ` ${inputId}-error` : ""}`}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 sm:w-fit",
          )}
        >
          {phase === "working" ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
          {phase === "working"
            ? "Đang xử lý và tải lên…"
            : docs.length > 0
              ? "Tải thêm tệp"
              : "Chọn tệp để tải lên"}
          <span className="sr-only">: {slot.title}</span>
        </label>
        <p id={`${inputId}-hint`} className="text-xs text-ink-subtle">
          {full
            ? `Đã đủ ${MAX_PER_SLOT} tệp cho mục này. Xóa bớt nếu cần tải tệp khác.`
            : "Ảnh JPG, PNG, WebP hoặc PDF tối đa 10 MB. Ảnh được nén và xóa thông tin vị trí trước khi tải lên."}
        </p>
        {errorText ? <FieldErrorText id={inputId}>{errorText}</FieldErrorText> : null}
      </div>
    </section>
  );
}

function LogoCard({ orgId, initialPath }: { orgId: string; initialPath: string | null }) {
  const registry = useAutosaveRegistry();
  return (
    <LogoField
      orgId={orgId}
      initialPath={initialPath}
      save={saveLogo}
      onSaved={(savedAt) => registry.markSaved(savedAt)}
    />
  );
}

/** Bước 4 — Giấy tờ (P1-04): bucket `kyc` riêng tư, ảnh được mã hóa lại, PDF ≤ 10 MB; logo tùy chọn. */
export function DocumentsStep() {
  const { kind, data, orgId, setValidator, reportComplete } = useWizard();
  const registry = useAutosaveRegistry();
  const [docs, setDocs] = useState<WizardDocument[]>(data.documents);
  const [showErrors, setShowErrors] = useState(false);
  const slots = DOC_SLOTS[kind];
  const complete = documentsComplete(
    kind,
    docs.map((d) => d.docType),
  );

  useEffect(() => reportComplete(complete), [complete, reportComplete]);

  useEffect(() => {
    setValidator(() => {
      if (complete) return true;
      setShowErrors(true);
      const firstMissing = slots.find((s) => s.requirement !== "optional");
      document.getElementById(`doc-${firstMissing?.type}`)?.focus();
      return false;
    });
    return () => setValidator(null);
  }, [complete, setValidator, slots]);

  if (!orgId) return null;
  const hasOneOf = slots.some((s) => s.requirement === "one_of" && docs.some((d) => d.docType === s.type));

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2 rounded-lg border bg-surface p-4 text-sm text-ink-muted">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
        <span>
          Chỉ quản trị viên FoodSave xem được giấy tờ, qua liên kết hết hạn sau 60 giây. Tệp tự xóa 30 ngày
          sau khi FoodSave ra quyết định duyệt hồ sơ {KIND_COPY[kind].noun} của bạn. FoodSave không yêu cầu
          ảnh CCCD.
        </span>
      </p>

      {showErrors && !complete ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Còn thiếu giấy tờ bắt buộc. Vui lòng tải lên trước khi tiếp tục.
        </p>
      ) : null}

      <div className="grid gap-4">
        {slots.map((slot) => {
          const slotDocs = docs.filter((d) => d.docType === slot.type);
          const missing =
            showErrors &&
            slotDocs.length === 0 &&
            (slot.requirement === "required" || (slot.requirement === "one_of" && !hasOneOf));
          return (
            <SlotCard
              key={slot.type}
              slot={slot}
              docs={slotDocs}
              orgId={orgId}
              missing={missing}
              onAdded={(d) => {
                setDocs((all) => [...all, d]);
                registry.markSaved(new Date().toISOString());
              }}
              onRemoved={(id) => {
                setDocs((all) => all.filter((x) => x.id !== id));
                registry.markSaved(new Date().toISOString());
              }}
            />
          );
        })}
      </div>

      <LogoCard orgId={orgId} initialPath={data.org?.logoPath ?? null} />
    </div>
  );
}

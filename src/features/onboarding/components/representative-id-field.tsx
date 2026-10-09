"use client";

import { BadgeCheck, CircleAlert, IdCard, Loader2, Pencil, QrCode, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { FullscreenDialog } from "@/components/qr/fullscreen-dialog";
import { QrScannerLazy } from "@/components/qr/qr-scanner-lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { saveRepresentativeId } from "../actions";
import {
  CCCD_MESSAGES,
  compareNames,
  normalizeCccd,
  parseCccdQr,
  validateCccd,
  type NameMatch,
} from "../cccd";
import type { RepresentativeIdSummary } from "../queries";
import { useAutosave, type SaveResult } from "./autosave";
import { describedBy, FieldErrorText, FieldHint } from "./fields";

/**
 * Số CCCD người đại diện (B2; NĐ 356/2025: ảnh CCCD là dữ liệu NHẠY CẢM, số định danh là dữ liệu cơ bản):
 * nhập 12 số hoặc quét QR trên CCCD gắn chip. QR được đọc ngay trên máy — chỉ giữ số + họ tên, mọi trường khác bị
 * bỏ trong `parseCccdQr`; họ tên trên thẻ được so với "Người đại diện" đã khai. Sau khi lưu chỉ còn dạng che.
 */

const LABEL = "Số CCCD người đại diện (12 số)";
const SCAN_REJECT =
  "Đây không phải mã QR trên CCCD gắn chip, hoặc số trong mã không hợp lệ. Hãy quét mã ở mặt trước thẻ.";
const NETWORK = "Không có kết nối mạng nên chưa lưu được số CCCD. Hãy thử lại khi có mạng.";

type Draft = { idNumber: string; source: "manual" | "cccd_qr"; nameOnCard: string | null };

/** Bộ lọc của máy quét: nội dung QR thô không rời hàm này — chỉ trả số + họ tên đã chuẩn hóa. */
function acceptCccdQr(text: string): string | null {
  const r = parseCccdQr(text);
  return r.ok ? JSON.stringify({ n: r.idNumber, f: r.fullName }) : null;
}

function NameMatchNote({
  match,
  nameOnCard,
  declared,
}: {
  match: NameMatch;
  nameOnCard: string;
  declared: string;
}) {
  if (match === "missing") {
    return (
      <p className="text-sm text-ink-muted">
        Họ tên trên thẻ: <strong className="text-ink">{nameOnCard}</strong>. Nhập “Họ và tên” người đại diện ở
        trên để FoodSave so khớp.
      </p>
    );
  }
  const ok = match === "exact" || match === "no_diacritics";
  return (
    <p
      role="status"
      data-name-match={ok ? "yes" : "no"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
        ok ? "bg-success-soft text-ink" : "border border-warning/30 bg-warning-soft text-ink",
      )}
    >
      {ok ? (
        <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      )}
      <span>
        {ok ? (
          <>
            <strong>Họ tên khớp</strong>
            {match === "no_diacritics" ? " (khác dấu)" : ""} với người đại diện đã khai: {nameOnCard}.
          </>
        ) : (
          <>
            <strong>Họ tên không khớp</strong>: trên thẻ là “{nameOnCard}”, đã khai là “{declared}”. Hãy kiểm
            tra lại họ tên người đại diện hoặc thẻ CCCD.
          </>
        )}
      </span>
    </p>
  );
}

function SavedSummary({ summary, declaredName }: { summary: RepresentativeIdSummary; declaredName: string }) {
  return (
    <div className="flex flex-col gap-2" data-representative-id="saved">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-ink">
        <ShieldCheck aria-hidden className="size-4 shrink-0 text-success" />
        <span>Đã lưu:</span>
        <strong className="font-mono tracking-wider tabular-nums">{summary.masked}</strong>
        <span className="text-sm text-ink-muted">
          ({summary.source === "cccd_qr" ? "quét QR trên CCCD" : "nhập tay"})
        </span>
      </p>
      {summary.source === "cccd_qr" && summary.nameOnCard ? (
        <NameMatchNote
          match={compareNames(summary.nameOnCard, declaredName)}
          nameOnCard={summary.nameOnCard}
          declared={declaredName}
        />
      ) : null}
    </div>
  );
}

/** Ô nhập + máy quét (dùng chung cho wizard và Cài đặt). */
function CccdEntry({
  id,
  draft,
  onChange,
  declaredName,
  error,
  disabled,
}: {
  id: string;
  draft: Draft;
  onChange: (d: Draft) => void;
  declaredName: string;
  error: string | null;
  disabled?: boolean;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const typed = normalizeCccd(draft.idNumber);
  const check = typed.length === 12 || /\D/.test(typed) ? validateCccd(typed) : null;
  const shownError = error ?? (check && !check.ok ? CCCD_MESSAGES[check.error] : null);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {LABEL} <span className="font-normal text-ink-subtle">(không bắt buộc)</span>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={draft.idNumber}
          onChange={(e) => onChange({ idNumber: e.target.value, source: "manual", nameOnCard: null })}
          inputMode="numeric"
          autoComplete="off"
          maxLength={15}
          disabled={disabled}
          className="font-mono tracking-wider tabular-nums sm:max-w-xs"
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy(id, true, shownError)}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={disabled}
          onClick={() => {
            setScanKey((k) => k + 1);
            setScanOpen(true);
          }}
        >
          <QrCode aria-hidden />
          Quét QR trên CCCD gắn chip
        </Button>
      </div>
      {shownError ? (
        <FieldErrorText id={id}>{shownError}</FieldErrorText>
      ) : (
        <FieldHint id={id}>
          Giúp FoodSave xác minh người đại diện nhanh hơn. Chỉ lưu số, không lưu ảnh CCCD; sau khi lưu bạn chỉ
          thấy dạng che như 079*****1234.
        </FieldHint>
      )}
      {draft.source === "cccd_qr" && draft.nameOnCard ? (
        <NameMatchNote
          match={compareNames(draft.nameOnCard, declaredName)}
          nameOnCard={draft.nameOnCard}
          declared={declaredName}
        />
      ) : null}

      <FullscreenDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Quét QR trên CCCD gắn chip"
        description="Mã được đọc ngay trên máy: FoodSave chỉ giữ số CCCD và họ tên, bỏ ngay ngày sinh, giới tính, địa chỉ."
        tone="dark"
      >
        {scanOpen ? (
          <QrScannerLazy
            key={scanKey}
            accept={acceptCccdQr}
            onResult={(value) => {
              const v = JSON.parse(value) as { n: string; f: string };
              onChange({ idNumber: v.n, source: "cccd_qr", nameOnCard: v.f });
              setScanOpen(false);
              toast.success("Đã đọc số CCCD từ mã QR.");
            }}
            onUseCode={() => {
              setScanOpen(false);
              requestAnimationFrame(() => document.getElementById(id)?.focus());
            }}
            rejectMessage={SCAN_REJECT}
            copy={{
              aim: "Đưa mã QR ở mặt trước CCCD gắn chip vào giữa khung. Máy sẽ tự nhận.",
              fallbackLabel: "Nhập số bằng tay",
              fallbackHint: "nhập 12 số CCCD bằng tay",
            }}
          />
        ) : null}
      </FullscreenDialog>
    </div>
  );
}

function validDraft(d: Draft): Draft | null {
  const v = validateCccd(d.idNumber);
  if (!v.ok) return null;
  return { idNumber: v.value, source: d.source, nameOnCard: d.source === "cccd_qr" ? d.nameOnCard : null };
}

/**
 * Bước "Pháp lý" của wizard: tự lưu (cùng cơ chế nháp) khi số hợp lệ. Có số đã lưu ⇒ hiện dạng che + "Nhập lại".
 */
export function WizardRepresentativeId({
  orgId,
  declaredName,
  initial,
}: {
  orgId: string | null;
  declaredName: string;
  initial: RepresentativeIdSummary | null;
}) {
  const [saved, setSaved] = useState<RepresentativeIdSummary | null>(initial);
  const [editing, setEditing] = useState(initial === null);
  const [draft, setDraft] = useState<Draft>({ idNumber: "", source: "manual", nameOnCard: null });
  const [error, setError] = useState<string | null>(null);
  const value = useMemo(() => (editing && orgId ? validDraft(draft) : null), [draft, editing, orgId]);

  async function save(v: Draft): Promise<SaveResult> {
    if (!orgId) return { ok: false, message: "Vui lòng hoàn tất bước Thông tin cơ bản trước." };
    const res = await saveRepresentativeId({ orgId, ...v });
    if (!res.ok) {
      setError(res.error.fieldErrors?.idNumber ?? res.error.message);
      return { ok: false, message: res.error.message };
    }
    setError(null);
    // Lưu xong ⇒ chỉ còn dạng che trên màn hình (số đầy đủ không giữ lại trong trạng thái giao diện)
    setSaved({ masked: res.data.masked, source: v.source, nameOnCard: v.nameOnCard });
    setEditing(false);
    setDraft({ idNumber: "", source: "manual", nameOnCard: null });
    return { ok: true, savedAt: res.data.savedAt };
  }

  useAutosave({ id: "representative-id", value, save, baseline: null });

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-surface p-4" data-representative-id-field>
      <p className="flex items-center gap-2 font-semibold text-ink">
        <IdCard aria-hidden className="size-5 text-ink-subtle" />
        CCCD của người đại diện
      </p>
      {saved && !editing ? (
        <>
          <SavedSummary summary={saved} declaredName={declaredName} />
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-fit"
            onClick={() => {
              setDraft({ idNumber: "", source: "manual", nameOnCard: null });
              setError(null);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            Nhập lại số CCCD
          </Button>
        </>
      ) : (
        <CccdEntry
          id="legal-representativeId"
          draft={draft}
          onChange={(d) => {
            setError(null);
            setDraft(d);
          }}
          declaredName={declaredName}
          error={error}
          disabled={!orgId}
        />
      )}
    </div>
  );
}

/**
 * Cài đặt › Hồ sơ của tổ chức đã duyệt: lần ghi đầu (tổ chức duyệt trước khi có B2), lưu bằng nút. Đã có số ⇒ chỉ
 * hiện dạng che; muốn đổi người đại diện thì gửi đề nghị sửa thông tin pháp lý.
 */
export function SettingsRepresentativeId({
  orgId,
  declaredName,
  initial,
  canEdit,
}: {
  orgId: string;
  declaredName: string;
  initial: RepresentativeIdSummary | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ idNumber: "", source: "manual", nameOnCard: null });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (initial) return <SavedSummary summary={initial} declaredName={declaredName} />;
  if (!canEdit) {
    return (
      <p className="text-sm text-ink-muted">
        Chưa có số CCCD người đại diện. Chủ sở hữu hoặc quản lý có thể thêm.
      </p>
    );
  }

  const submit = () => {
    const v = validDraft(draft);
    if (!v) {
      const check = validateCccd(draft.idNumber);
      setError(check.ok ? null : CCCD_MESSAGES[check.error]);
      document.getElementById("settings-representativeId")?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveRepresentativeId({ orgId, ...v });
        if (!res.ok) {
          setError(res.error.fieldErrors?.idNumber ?? res.error.message);
          return;
        }
        setDraft({ idNumber: "", source: "manual", nameOnCard: null });
        toast.success(`Đã lưu số CCCD người đại diện (${res.data.masked}).`);
        router.refresh();
      } catch {
        setError(NETWORK);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <CccdEntry
        id="settings-representativeId"
        draft={draft}
        onChange={(d) => {
          setError(null);
          setDraft(d);
        }}
        declaredName={declaredName}
        error={error}
        disabled={pending}
      />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-fit"
        onClick={submit}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
        Lưu số CCCD
      </Button>
    </div>
  );
}

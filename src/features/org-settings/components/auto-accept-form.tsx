"use client";

import { Loader2, Save } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { describedBy, FormField } from "@/features/onboarding/components/fields";
import { NETWORK_ERROR, useOpId } from "@/features/offers/use-op-id";

import { saveAutoAccept } from "../actions";
import { AUTO_ACCEPT_TRUST_MESSAGE, parseMinTrust, type AutoAcceptMode } from "../schemas";
import { Notice } from "./notice";

const OPTIONS: { value: AutoAcceptMode; label: string; description: string }[] = [
  {
    value: "off",
    label: "Tôi tự duyệt từng yêu cầu",
    description:
      "Yêu cầu chờ bạn bấm “Xác nhận” hoặc “Từ chối”. Không trả lời kịp thì yêu cầu tự hết hạn và số lượng trả lại lô.",
  },
  {
    value: "all",
    label: "Tự động chấp nhận mọi tổ chức đã được FoodSave duyệt",
    description:
      "Yêu cầu được xác nhận ngay khi tổ chức gửi, bạn không cần bấm gì. Hợp khi bạn bận hoặc lô Đỏ cần đi nhanh.",
  },
  {
    value: "trusted",
    label: "Chỉ tự động chấp nhận tổ chức có điểm uy tín từ ngưỡng trở lên",
    description: "Tổ chức dưới ngưỡng vẫn chờ bạn duyệt như bình thường.",
  },
];

function modeText(mode: AutoAcceptMode, minTrust: number): string {
  const label = OPTIONS.find((o) => o.value === mode)!.label;
  return mode === "trusted" ? `${label} (từ ${minTrust} điểm)` : label;
}

/**
 * "Duyệt yêu cầu nhận lô" của một chi nhánh cửa hàng (F-10, F-23, US-STO-14 AC1–AC2): thủ công / tự động
 * chấp nhận mọi tổ chức đã duyệt / chỉ tổ chức có điểm uy tín ≥ ngưỡng. Lưu bằng `upsert_site`
 * (`auto_accept_mode`, `auto_accept_min_trust`); `request_offer` và `reserve_bundle` áp dụng ngay cho yêu cầu mới.
 */
export function AutoAcceptForm({
  siteId,
  siteName,
  initialMode,
  initialMinTrust,
  canEdit,
  headingId,
}: {
  siteId: string;
  siteName: string;
  initialMode: AutoAcceptMode;
  initialMinTrust: number;
  canEdit: boolean;
  /** Tiêu đề mục (nhãn của nhóm lựa chọn). */
  headingId: string;
}) {
  const uid = useId();
  const op = useOpId();
  const [mode, setMode] = useState<AutoAcceptMode>(initialMode);
  const [trustText, setTrustText] = useState(String(Math.round(initialMinTrust)));
  const [trustTouched, setTrustTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const minTrust = parseMinTrust(trustText);
  const trustId = `${uid}-trust`;
  const trustError =
    mode === "trusted" && trustTouched && minTrust === null ? AUTO_ACCEPT_TRUST_MESSAGE : null;

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">Đang dùng: {modeText(initialMode, Math.round(initialMinTrust))}</p>
        <p className="text-ink-muted">Chủ cửa hàng hoặc quản lý của chi nhánh này đổi được mục này.</p>
      </div>
    );
  }

  function save() {
    setFormError(null);
    if (mode === "trusted" && minTrust === null) {
      setTrustTouched(true);
      document.getElementById(trustId)?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveAutoAccept({
          siteId,
          clientOpId: op.get(),
          mode,
          minTrust: mode === "trusted" ? minTrust : null,
        });
        op.reset();
        if (!res.ok) {
          setFormError(res.error.fieldErrors?.minTrust ?? res.error.message);
          return;
        }
        toast.success(`Đã lưu cách duyệt yêu cầu cho “${siteName}”.`);
      } catch {
        setFormError(NETWORK_ERROR);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as AutoAcceptMode)}
        aria-labelledby={headingId}
        disabled={pending}
        className="grid gap-2"
      >
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft"
          >
            <RadioGroupItem value={o.value} className="mt-1" aria-describedby={`${uid}-${o.value}-desc`} />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{o.label}</span>
              <span id={`${uid}-${o.value}-desc`} className="text-sm text-ink-muted">
                {o.description}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {mode === "trusted" ? (
        <FormField
          id={trustId}
          label="Ngưỡng điểm uy tín (0–100)"
          required
          error={trustError}
          hint="FoodSave tính điểm uy tín từ lịch sử nhận, giao hàng và minh chứng của tổ chức. Tổ chức mới bắt đầu ở 50 điểm, nên ngưỡng trên 50 chỉ tự chấp nhận tổ chức đã có lịch sử tốt."
        >
          <Input
            id={trustId}
            value={trustText}
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            disabled={pending}
            onChange={(e) => setTrustText(e.target.value)}
            onBlur={() => setTrustTouched(true)}
            aria-invalid={trustError ? true : undefined}
            aria-describedby={describedBy(trustId, true, trustError)}
            className="max-w-28 tabular-nums"
          />
        </FormField>
      ) : null}

      <Notice tone="info">
        Chỉ áp dụng cho yêu cầu mới gửi tới chi nhánh này. Mỗi yêu cầu được tự chấp nhận, bạn vẫn nhận thông
        báo “Đã tự chấp nhận yêu cầu” để chuẩn bị hàng.
      </Notice>

      {formError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={save} disabled={pending} aria-disabled={pending} className="min-h-11">
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
          {pending ? "Đang lưu…" : "Lưu cách duyệt"}
        </Button>
      </div>
    </div>
  );
}

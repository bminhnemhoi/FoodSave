"use client";

import { Ban, Bike, CircleAlert, Flag, Footprints, Loader2, SkipForward, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { vehicleLabel, volunteerName } from "@/features/volunteers/present";
import { formatKg } from "@/features/catalog/labels";
import { cn } from "@/lib/utils";

import {
  CANCEL_REASONS,
  INCIDENT_KIND_TEXT,
  INCIDENT_KINDS,
  OTHER_REASON,
  SKIP_REASONS,
  type CoordinatorIncidentKind,
} from "../dispatch";
import { cancelTrip, replanTrip, reportTripIncident, skipTripStop } from "../dispatch-actions";
import type { VolunteerOption } from "./volunteer-planner";

const NETWORK_ERROR = "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.";

/** Chọn lý do nhanh hoặc "Khác" + ô ghi rõ; trả lý do cuối cùng (đã trim) hoặc "" khi chưa đủ. */
function ReasonPicker({
  id,
  legend,
  presets,
  value,
  other,
  onChange,
  onOtherChange,
  max,
  error,
}: {
  id: string;
  legend: string;
  presets: readonly string[];
  value: string;
  other: string;
  onChange: (v: string) => void;
  onOtherChange: (v: string) => void;
  max: number;
  error: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-ink">{legend}</legend>
      <RadioGroup value={value} onValueChange={onChange} aria-describedby={error ? `${id}-error` : undefined}>
        {[...presets, OTHER_REASON].map((r, i) => (
          <div key={r} className="flex min-h-11 items-center gap-3">
            <RadioGroupItem id={`${id}-r${i}`} value={r} />
            <Label htmlFor={`${id}-r${i}`} className="cursor-pointer font-normal">
              {r}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {value === OTHER_REASON ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-other`}>Ghi rõ lý do</Label>
          <Textarea
            id={`${id}-other`}
            value={other}
            maxLength={max}
            rows={2}
            onChange={(e) => onOtherChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function finalReason(value: string, other: string): string {
  return value === OTHER_REASON ? other.trim() : value;
}

function useOpId() {
  const ref = useRef<{ key: string; id: string } | null>(null);
  return (key: string) => {
    if (!ref.current || ref.current.key !== key) ref.current = { key, id: crypto.randomUUID() };
    return ref.current.id;
  };
}

// ---------------------------------------------------------------------------
// Hủy chuyến (C5 — US-CHA-23)
// ---------------------------------------------------------------------------

export function CancelTripDialog({
  pickupId,
  volunteerName: name,
  disabledReason,
}: {
  pickupId: string;
  volunteerName: string | null;
  /** Đã lấy hàng ở một điểm / không đủ quyền ⇒ nút bị vô hiệu kèm giải thích. */
  disabledReason: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const opId = useOpId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(CANCEL_REASONS[0]);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    const reason = finalReason(value, other);
    if (!reason) {
      setError("Vui lòng ghi rõ lý do hủy.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await cancelTrip({ pickupId, reason, clientOpId: opId(reason) });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setOpen(false);
        toast.success(
          "Đã hủy chuyến. Các lô chưa lấy trở về mục “Chờ lên chuyến” để giao người khác hoặc tự đến lấy.",
        );
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  if (disabledReason) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-fit"
          disabled
          aria-describedby={`${id}-why`}
        >
          <Ban aria-hidden />
          Hủy chuyến
        </Button>
        <p id={`${id}-why`} className="text-sm text-ink-subtle">
          {disabledReason}
        </p>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setError(null);
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 w-fit text-danger hover:text-danger">
          <Ban aria-hidden />
          Hủy chuyến
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hủy chuyến này?</DialogTitle>
          <DialogDescription>
            Chưa lấy hàng ở điểm nào nên cửa hàng vẫn giữ nguyên số lượng cho bạn: các lô trở về trạng thái
            “Đã xác nhận” để giao tình nguyện viên khác hoặc tự đến lấy. Cửa hàng
            {name ? ` và ${name}` : ""} được báo ngay.
          </DialogDescription>
        </DialogHeader>
        <ReasonPicker
          id={id}
          legend="Lý do hủy"
          presets={CANCEL_REASONS}
          value={value}
          other={other}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          onOtherChange={setOther}
          max={500}
          error={error}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Quay lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Ban aria-hidden />}
            Hủy chuyến
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Bỏ qua một điểm lấy hàng (C6)
// ---------------------------------------------------------------------------

export function SkipStopDialog({
  pickupId,
  stopId,
  stopTitle,
  describedBy,
}: {
  pickupId: string;
  stopId: string;
  stopTitle: string;
  describedBy?: string;
}) {
  const id = useId();
  const router = useRouter();
  const opId = useOpId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(SKIP_REASONS[0]);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    const reason = finalReason(value, other);
    if (!reason) {
      setError("Vui lòng ghi rõ lý do bỏ qua.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await skipTripStop({ pickupId, stopId, reason, clientOpId: opId(reason) });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setOpen(false);
        toast.success(`Đã bỏ qua ${stopTitle}. Lô ở điểm này trở về “Chờ lên chuyến”.`);
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setError(null);
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" aria-describedby={describedBy}>
          <SkipForward aria-hidden />
          Bỏ qua điểm này
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bỏ qua {stopTitle}?</DialogTitle>
          <DialogDescription>
            Tình nguyện viên không ghé điểm này nữa. Lô ở đây trở về trạng thái “Đã xác nhận” (cửa hàng vẫn
            giữ số lượng) để bạn giao chuyến khác. Cửa hàng được báo.
          </DialogDescription>
        </DialogHeader>
        <ReasonPicker
          id={id}
          legend="Lý do bỏ qua"
          presets={SKIP_REASONS}
          value={value}
          other={other}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          onOtherChange={setOther}
          max={300}
          error={error}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Quay lại
          </Button>
          <Button type="button" className="min-h-11" onClick={confirm} disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <SkipForward aria-hidden />}
            Bỏ qua điểm này
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Báo sự cố (C10, US-CHA-38)
// ---------------------------------------------------------------------------

export function IncidentDialog({ pickupId }: { pickupId: string }) {
  const id = useId();
  const router = useRouter();
  const opId = useOpId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CoordinatorIncidentKind>("no_show");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const text = description.trim();
    if (text.length < 10) {
      setError("Mô tả ít nhất 10 ký tự để FoodSave xử lý được.");
      document.getElementById(`${id}-desc`)?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await reportTripIncident({
          pickupId,
          kind,
          description: text,
          clientOpId: opId(`${kind}:${text}`),
        });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setOpen(false);
        setDescription("");
        toast.success("Đã gửi phản ánh. FoodSave và bên liên quan đã được báo.");
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setError(null);
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 w-fit">
          <Flag aria-hidden />
          Báo sự cố
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Báo sự cố trong chuyến</DialogTitle>
          <DialogDescription>
            FoodSave và bên liên quan được báo; sự cố an toàn thực phẩm hoặc không đến được xử lý gấp. Bên kia
            chỉ thấy tên tổ chức, không thấy tên người báo.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Loại sự cố</legend>
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as CoordinatorIncidentKind)}>
            {INCIDENT_KINDS.map((k) => (
              <div key={k} className="flex items-start gap-3 py-1">
                <RadioGroupItem
                  id={`${id}-${k}`}
                  value={k}
                  className="mt-1"
                  aria-describedby={`${id}-${k}-hint`}
                />
                <div className="flex flex-col">
                  <Label htmlFor={`${id}-${k}`} className="cursor-pointer font-medium">
                    {INCIDENT_KIND_TEXT[k].label}
                  </Label>
                  <span id={`${id}-${k}-hint`} className="text-sm text-ink-muted">
                    {INCIDENT_KIND_TEXT[k].hint}
                  </span>
                </div>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-desc`}>Mô tả</Label>
          <Textarea
            id={`${id}-desc`}
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
            placeholder="Chuyện gì đã xảy ra, ở điểm nào, lúc mấy giờ?"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-count`}
          />
          <p id={`${id}-count`} className="text-xs text-ink-subtle tabular-nums">
            {description.trim().length}/2000 ký tự (ít nhất 10)
          </p>
          {error ? (
            <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Quay lại
          </Button>
          <Button type="button" className="min-h-11" onClick={submit} disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Flag aria-hidden />}
            Gửi phản ánh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Đổi người / chuyển tự đến lấy (US-CHA-16 AC4, US-CHA-23 AC1)
// ---------------------------------------------------------------------------

export function ReassignPanel({
  pickupId,
  currentAssigneeId,
  volunteers,
  tripKg,
  headline,
}: {
  pickupId: string;
  currentAssigneeId: string | null;
  volunteers: VolunteerOption[];
  tripKg: number;
  headline: string;
}) {
  const id = useId();
  const router = useRouter();
  const opId = useOpId();
  const options = volunteers.filter((v) => v.userId !== currentAssigneeId && v.pausedAt === null);
  const [choice, setChoice] = useState<string>(options[0]?.userId ?? "self");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res =
          choice === "self"
            ? await replanTrip({ mode: "self", pickupId, clientOpId: opId("self") })
            : await replanTrip({
                mode: "volunteer",
                pickupId,
                assigneeUserId: choice,
                clientOpId: opId(choice),
              });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        const v = options.find((o) => o.userId === choice);
        toast.success(
          choice === "self"
            ? "Đã chuyển thành chuyến tự đến lấy. Mở mã bàn giao khi tới cửa hàng."
            : `Đã giao chuyến cho ${v ? volunteerName(v) : "tình nguyện viên"}. Người này sẽ nhận thông báo.`,
        );
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
      <h3 id={`${id}-t`} className="flex items-center gap-2 font-semibold">
        <UserRoundCog aria-hidden className="size-5 text-role-accent" />
        {headline}
      </h3>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Chọn người lấy hàng</legend>
        <RadioGroup value={choice} onValueChange={setChoice}>
          {options.map((v) => (
            <div key={v.userId} className="flex min-h-11 items-start gap-3 py-1">
              <RadioGroupItem id={`${id}-${v.userId}`} value={v.userId} className="mt-1" />
              <Label
                htmlFor={`${id}-${v.userId}`}
                className="flex cursor-pointer flex-col items-start gap-0.5 font-normal"
              >
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <Bike aria-hidden className="size-4" />
                  {volunteerName(v)}
                </span>
                <span
                  className={cn(
                    "text-sm text-ink-muted tabular-nums",
                    (v.capacityKg ?? 20) < tripKg && "text-warning",
                  )}
                >
                  {vehicleLabel(v.vehicle)} · chở {formatKg(v.capacityKg ?? 20)}
                  {(v.capacityKg ?? 20) < tripKg ? " (ít hơn hàng của chuyến)" : ""}
                  {v.areaLabel ? ` · ${v.areaLabel}` : ""}
                  {v.openTrips > 0 ? ` · đang có ${v.openTrips} chuyến` : ""}
                </span>
              </Label>
            </div>
          ))}
          <div className="flex min-h-11 items-start gap-3 py-1">
            <RadioGroupItem id={`${id}-self`} value="self" className="mt-1" />
            <Label
              htmlFor={`${id}-self`}
              className="flex cursor-pointer flex-col items-start gap-0.5 font-normal"
            >
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <Footprints aria-hidden className="size-4" />
                Tổ chức tự đến lấy
              </span>
              <span className="text-sm text-ink-muted">
                Nhân viên đi lấy và hiện mã bàn giao tại cửa hàng.
              </span>
            </Label>
          </div>
        </RadioGroup>
      </fieldset>
      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">Không còn tình nguyện viên nào khác đang hoạt động.</p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-11 w-fit"
        onClick={submit}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <UserRoundCog aria-hidden />}
        {choice === "self" ? "Chuyển sang tự đến lấy" : "Giao cho người này"}
      </Button>
    </section>
  );
}

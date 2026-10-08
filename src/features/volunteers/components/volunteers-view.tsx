"use client";

import {
  Bike,
  CalendarCheck,
  ChevronRight,
  CircleAlert,
  CirclePause,
  CirclePlay,
  Hourglass,
  Loader2,
  LocateFixed,
  LocateOff,
  MailPlus,
  MapPin,
  PauseCircle,
  Phone,
  Route,
  RotateCcw,
  Send,
  UserCheck,
  UserMinus,
  Users,
  Weight,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatKg } from "@/features/catalog/labels";
import {
  STATUS_TONE,
  type StatusTone,
} from "@/features/charity-allocations/components/allocation-status-badge";
import { KpiTile } from "@/features/charity-allocations/components/kpi-tile";
import { inviteMember, removeMember, resendInvite, type InviteResult } from "@/features/members/actions";
import type { InvitationRow } from "@/features/members/queries";
import { inviteSchema, invitationState } from "@/features/members/schemas";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { revokeInvitation, setVolunteerPaused } from "../actions";
import { summarize, vehicleLabel, volunteerName, volunteerState, VOLUNTEER_STATE_LABEL } from "../present";
import type { VolunteerRow } from "../queries";
import { PAUSE_REASON_MAX } from "../schemas";

const NETWORK_ERROR = "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.";

type VolunteersViewProps = {
  orgId: string;
  orgName: string;
  volunteers: VolunteerRow[];
  invitations: InvitationRow[];
  /** owner/manager: mời, gửi lại, thu hồi, tạm ngưng. */
  canManage: boolean;
  /** owner: gỡ khỏi tổ chức (`remove_member`). */
  canRemove: boolean;
  serverNow: number;
};

function announceInvite(res: InviteResult) {
  if (res.emailSent) toast.success(`Đã gửi lời mời tới ${res.email}.`);
  else
    toast.warning(
      `Đã tạo lời mời cho ${res.email} nhưng chưa gửi được email. Bấm “Gửi lại” trong danh sách lời mời.`,
      { duration: 8000 },
    );
}

/**
 * Trang Tình nguyện viên của tổ chức (PRD US-CHA-14, US-CHA-15; ROADMAP P3-08 phía điều phối): số liệu đầu
 * trang, danh sách TNV (phương tiện, sức chở, khu vực gần đúng, đồng ý vị trí, chuyến tháng này), ngăn chi tiết
 * (tạm ngưng / tiếp tục, gỡ), mời qua email và lời mời đang chờ (gửi lại, thu hồi).
 */
export function VolunteersView({
  orgId,
  orgName,
  volunteers,
  invitations,
  canManage,
  canRemove,
  serverNow,
}: VolunteersViewProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const summary = summarize(volunteers);
  const open = volunteers.find((v) => v.userId === openId) ?? null;
  const now = new Date(serverNow);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="vol-kpi" className="flex flex-col gap-3">
        <h2 id="vol-kpi" className="sr-only">
          Tổng quan tình nguyện viên
        </h2>
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <KpiTile icon={Users} label="Đang hoạt động" value={String(summary.active)} unit="người" />
          <KpiTile icon={Route} label="Đang có chuyến" value={String(summary.onTrip)} unit="người" />
          <KpiTile icon={PauseCircle} label="Tạm ngưng" value={String(summary.paused)} unit="người" />
          <KpiTile
            icon={CalendarCheck}
            label="Chuyến hoàn tất tháng này"
            value={String(summary.tripsThisMonth)}
            unit="chuyến"
          />
        </div>
      </section>

      <section aria-labelledby="vol-list" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="vol-list" className="text-[1.375rem] leading-[1.875rem] font-semibold">
            Tình nguyện viên ({volunteers.length})
          </h2>
          {canManage ? <InviteVolunteerDialog orgId={orgId} orgName={orgName} /> : null}
        </div>
        {!canManage ? (
          <p className="text-sm text-ink-subtle">
            Chỉ chủ sở hữu hoặc quản lý tổ chức mời, tạm ngưng hay gỡ được tình nguyện viên.
          </p>
        ) : null}

        {volunteers.length === 0 ? (
          <EmptyState
            variant="section"
            icon={Bike}
            title="Chưa có tình nguyện viên"
            description={
              <p>
                Mời tình nguyện viên qua email. Họ tạo tài khoản, khai phương tiện và sức chở, rồi nhận chuyến
                lấy hàng ngay trên điện thoại.
              </p>
            }
            action={canManage ? <InviteVolunteerDialog orgId={orgId} orgName={orgName} /> : undefined}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {volunteers.map((v) => (
              <li key={v.userId}>
                <VolunteerCard v={v} onOpen={() => setOpenId(v.userId)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? <InvitationList invitations={invitations} now={now} /> : null}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          {open ? (
            <VolunteerDetail
              v={open}
              orgId={orgId}
              orgName={orgName}
              canManage={canManage}
              canRemove={canRemove}
              now={now}
              onRemoved={() => setOpenId(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const STATE_STYLE: Record<ReturnType<typeof volunteerState>, { tone: StatusTone; icon: typeof Users }> = {
  active: { tone: "success", icon: UserCheck },
  on_trip: { tone: "info", icon: Route },
  paused: { tone: "warning", icon: CirclePause },
};

function StateBadge({ v }: { v: VolunteerRow }) {
  const state = volunteerState(v);
  const { tone, icon: Icon } = STATE_STYLE[state];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONE[tone],
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {VOLUNTEER_STATE_LABEL[state]}
      {state === "on_trip" && v.openTrips > 1 ? ` (${v.openTrips})` : ""}
    </span>
  );
}

function ConsentBadge({ consent }: { consent: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
      {consent ? (
        <LocateFixed aria-hidden className="size-4 text-success" />
      ) : (
        <LocateOff aria-hidden className="size-4" />
      )}
      {consent ? "Đồng ý chia sẻ vị trí trong chuyến" : "Chỉ check-in tại điểm dừng"}
    </span>
  );
}

function VolunteerCard({ v, onOpen }: { v: VolunteerRow; onOpen: () => void }) {
  const name = volunteerName(v);
  const titleId = `vol-${v.userId}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "flex h-full flex-col gap-3 rounded-lg border bg-surface p-4 shadow-1",
        v.pausedAt && "bg-bg-sunken",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={titleId} className="min-w-0 text-base font-semibold break-words text-ink">
          {name}
        </h3>
        <StateBadge v={v} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Phương tiện</dt>
          <Bike aria-hidden className="size-4 shrink-0 text-ink-subtle" />
          <dd>{vehicleLabel(v.vehicle)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Sức chở</dt>
          <Weight aria-hidden className="size-4 shrink-0 text-ink-subtle" />
          <dd className="tabular-nums">
            {v.capacityKg !== null ? `Chở tối đa ${formatKg(v.capacityKg)}` : "Chưa khai sức chở"}
          </dd>
        </div>
        <div className="flex items-start gap-1.5 sm:col-span-2">
          <dt className="sr-only">Khu vực</dt>
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <dd>{v.areaLabel ? `${v.areaLabel} (gần đúng)` : "Chưa khai khu vực"}</dd>
        </div>
        <div className="flex items-center gap-1.5 sm:col-span-2">
          <dt className="sr-only">Chuyến</dt>
          <CalendarCheck aria-hidden className="size-4 shrink-0 text-ink-subtle" />
          <dd className="tabular-nums">
            {v.tripsThisMonth} chuyến tháng này
            {v.lastTripAt ? ` · gần nhất ${formatDate(v.lastTripAt)}` : " · chưa có chuyến"}
          </dd>
        </div>
      </dl>
      <ConsentBadge consent={v.locationConsent} />
      {!v.hasProfile ? (
        <p className="flex items-start gap-1.5 text-sm text-warning">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Chưa hoàn thiện hồ sơ — FoodSave tạm tính sức chở 20 kg.
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="mt-auto min-h-11 w-full justify-between sm:w-fit"
        onClick={onOpen}
        aria-describedby={titleId}
      >
        Xem chi tiết
        <ChevronRight aria-hidden />
      </Button>
    </article>
  );
}

function VolunteerDetail({
  v,
  orgId,
  orgName,
  canManage,
  canRemove,
  now,
  onRemoved,
}: {
  v: VolunteerRow;
  orgId: string;
  orgName: string;
  canManage: boolean;
  canRemove: boolean;
  now: Date;
  onRemoved: () => void;
}) {
  const name = volunteerName(v);
  return (
    <>
      <SheetHeader className="gap-2 border-b p-5 pr-12">
        <SheetTitle className="text-lg font-semibold text-ink">{name}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <StateBadge v={v} />
          <span className="text-ink-muted">Tham gia {formatDate(v.joinedAt)}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 p-5">
        <dl className="flex flex-col gap-3 text-sm">
          <Row icon={Bike} label="Phương tiện" value={vehicleLabel(v.vehicle)} />
          <Row
            icon={Weight}
            label="Sức chở"
            value={v.capacityKg !== null ? formatKg(v.capacityKg) : "Chưa khai (tạm tính 20 kg)"}
          />
          <Row
            icon={MapPin}
            label="Khu vực hoạt động"
            value={v.areaLabel ? `${v.areaLabel} — vị trí gần đúng khoảng 1 km` : "Chưa khai"}
          />
          <Row icon={Phone} label="Số điện thoại" value={v.phoneMasked ?? "Chưa có"} />
          <Row
            icon={v.locationConsent ? LocateFixed : LocateOff}
            label="Chia sẻ vị trí"
            value={
              v.locationConsent
                ? "Đã đồng ý: bạn thấy vị trí gần đúng khi chuyến đang chạy và app đang mở."
                : "Chưa đồng ý: chỉ thấy các lần check-in tại điểm dừng."
            }
          />
          <Row
            icon={CalendarCheck}
            label="Chuyến đã hoàn tất"
            value={`${v.tripsCompleted} chuyến (${v.tripsThisMonth} trong tháng này)${
              v.lastTripAt ? ` · gần nhất ${formatDateTime(v.lastTripAt)}` : ""
            }`}
          />
          {v.openTrips > 0 ? (
            <Row icon={Route} label="Đang có chuyến" value={`${v.openTrips} chuyến đã giao hoặc đang chạy`} />
          ) : null}
          {v.availabilityNote ? (
            <Row icon={Hourglass} label="Thời gian rảnh" value={v.availabilityNote} />
          ) : null}
        </dl>
        <p className="text-xs text-ink-subtle">
          Số điện thoại được che một phần để bảo vệ tình nguyện viên. Khu vực chỉ là ô gần đúng, không phải
          địa chỉ nhà. Cập nhật lúc {formatDateTime(now)}.
        </p>

        {v.pausedAt ? (
          <div className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-ink">
            <p className="flex items-center gap-1.5 font-medium text-warning">
              <CirclePause aria-hidden className="size-4" />
              Tạm ngưng từ {formatDateTime(v.pausedAt)}
            </p>
            {v.pausedReason ? <p>Lý do: {v.pausedReason}</p> : null}
            <p className="text-ink-muted">Không được gợi ý và không giao được chuyến mới cho người này.</p>
          </div>
        ) : null}

        {canManage ? <PauseControl v={v} orgId={orgId} name={name} /> : null}
        {canRemove ? (
          <RemoveVolunteer v={v} orgId={orgId} orgName={orgName} name={name} onDone={onRemoved} />
        ) : null}
      </div>
    </>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Bike; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
      <div className="flex min-w-0 flex-col">
        <dt className="text-xs font-medium text-ink-muted">{label}</dt>
        <dd className="break-words text-ink">{value}</dd>
      </div>
    </div>
  );
}

function PauseControl({ v, orgId, name }: { v: VolunteerRow; orgId: string; name: string }) {
  const id = useId();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const paused = v.pausedAt !== null;

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setVolunteerPaused({
          orgId,
          userId: v.userId,
          paused: !paused,
          reason: paused ? null : reason.trim() || null,
        });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        toast.success(paused ? `${name} đã có thể nhận chuyến mới.` : `Đã tạm ngưng ${name}.`);
        setReason("");
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
      <h3 id={`${id}-t`} className="font-semibold">
        {paused ? "Cho nhận chuyến trở lại" : "Tạm ngưng nhận chuyến"}
      </h3>
      <p className="text-sm text-ink-muted">
        {paused
          ? "Tình nguyện viên sẽ được gợi ý và nhận chuyến mới như bình thường."
          : "Tình nguyện viên không được gợi ý và không giao được chuyến mới. Chuyến đã giao vẫn giữ nguyên — đổi người ở trang chuyến nếu cần."}
      </p>
      {!paused ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-reason`}>Lý do (không bắt buộc)</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={PAUSE_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: Đang thi học kỳ đến hết tháng"
            aria-describedby={`${id}-hint`}
            rows={2}
          />
          <p id={`${id}-hint`} className="text-xs text-ink-subtle tabular-nums">
            Chỉ điều phối viên của tổ chức thấy lý do. {reason.length}/{PAUSE_REASON_MAX}
          </p>
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft p-2.5 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant={paused ? "default" : "outline"}
        className="min-h-11 w-full sm:w-fit"
        onClick={submit}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : paused ? (
          <CirclePlay aria-hidden />
        ) : (
          <CirclePause aria-hidden />
        )}
        {paused ? "Tiếp tục nhận chuyến" : "Tạm ngưng"}
      </Button>
    </section>
  );
}

function RemoveVolunteer({
  v,
  orgId,
  orgName,
  name,
  onDone,
}: {
  v: VolunteerRow;
  orgId: string;
  orgName: string;
  name: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await removeMember({ orgId, userId: v.userId });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setOpen(false);
        toast.success(`Đã gỡ ${name} khỏi ${orgName}.`);
        onDone();
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setError(null);
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" className="min-h-11 w-fit text-danger hover:text-danger">
          <UserMinus aria-hidden />
          Gỡ khỏi tổ chức
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="text-lg font-semibold">
            Gỡ {name} khỏi {orgName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left text-ink-muted">
            Người này không còn nhận chuyến và không xem được dữ liệu của {orgName}. Nếu chỉ tạm vắng, hãy
            dùng “Tạm ngưng” thay vì gỡ. Muốn thêm lại, bạn gửi lời mời mới.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {v.openTrips > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-ink">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            Người này đang có {v.openTrips} chuyến. Hãy đổi người hoặc hủy chuyến đó trước.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="min-h-11">
            Quay lại
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <UserMinus aria-hidden />}
            {pending ? "Đang gỡ…" : "Gỡ tình nguyện viên"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Mời & lời mời đang chờ
// ---------------------------------------------------------------------------

function InviteVolunteerDialog({ orgId, orgName }: { orgId: string; orgName: string }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = inviteSchema.safeParse({ orgId, email, role: "volunteer", siteIds: null });
    if (!parsed.success) {
      setError(parsed.error.issues.find((i) => i.path[0] === "email")?.message ?? "Email chưa hợp lệ.");
      document.getElementById(`${id}-email`)?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const res = await inviteMember(parsed.data);
        if (!res.ok) {
          setError(res.error.fieldErrors?.email ?? res.error.message);
          return;
        }
        announceInvite(res.data);
        setEmail("");
        setOpen(false);
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
        <Button type="button" className="min-h-11">
          <MailPlus aria-hidden />
          Mời tình nguyện viên
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mời tình nguyện viên</DialogTitle>
          <DialogDescription>
            FoodSave gửi email có liên kết tham gia {orgName} (hiệu lực 7 ngày, chỉ dùng được với đúng email
            này). Người được mời không cần FoodSave duyệt.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-label="Mời tình nguyện viên">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-email`}>Email người được mời</Label>
            <Input
              id={`${id}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              placeholder="ten@example.com"
            />
            {error ? (
              <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" className="min-h-11" disabled={pending} aria-busy={pending || undefined}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              Gửi lời mời
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvitationList({ invitations, now }: { invitations: InvitationRow[]; now: Date }) {
  return (
    <section aria-labelledby="vol-invites" className="flex flex-col gap-3">
      <h2 id="vol-invites" className="text-lg font-semibold">
        Lời mời đang chờ ({invitations.length})
      </h2>
      <p className="text-sm text-ink-muted">
        “Gửi lại” tạo liên kết mới và vô hiệu liên kết cũ. “Thu hồi” làm liên kết ngừng hoạt động ngay.
      </p>
      {invitations.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-ink-muted">
          <MailPlus aria-hidden className="size-4 shrink-0" />
          Không có lời mời nào đang chờ.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-surface">
          {invitations.map((inv) => {
            const expired = invitationState(inv.expiresAt, now) === "expired";
            return (
              <li
                key={inv.id}
                aria-label={inv.email}
                className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium break-all">{inv.email}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                        STATUS_TONE[expired ? "warning" : "info"],
                      )}
                    >
                      {expired ? (
                        <Hourglass aria-hidden className="size-3.5" />
                      ) : (
                        <Send aria-hidden className="size-3.5" />
                      )}
                      {expired ? "Đã hết hạn" : "Đã mời"}
                    </span>
                    <span>
                      Gửi {formatDate(inv.createdAt)} ·{" "}
                      {expired
                        ? `hết hạn ${formatDate(inv.expiresAt)}`
                        : `hết hạn ${formatDateTime(inv.expiresAt)}`}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <ResendButton invitation={inv} />
                  <RevokeButton invitation={inv} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ResendButton({ invitation }: { invitation: InvitationRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await resendInvite({ invitationId: invitation.id });
            if (!res.ok) toast.error(res.error.message);
            else {
              announceInvite(res.data);
              router.refresh();
            }
          } catch {
            toast.error(NETWORK_ERROR);
          }
        })
      }
    >
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
      Gửi lại<span className="sr-only">: {invitation.email}</span>
    </Button>
  );
}

function RevokeButton({ invitation }: { invitation: InvitationRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await revokeInvitation({ invitationId: invitation.id });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setOpen(false);
        toast.success(`Đã thu hồi lời mời gửi ${invitation.email}.`);
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setError(null);
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 text-danger hover:text-danger">
          <X aria-hidden />
          Thu hồi<span className="sr-only">: {invitation.email}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="text-lg font-semibold">Thu hồi lời mời?</AlertDialogTitle>
          <AlertDialogDescription className="text-left text-ink-muted">
            Liên kết đã gửi tới {invitation.email} ngừng hoạt động ngay. Muốn mời lại, bạn gửi lời mời mới.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="min-h-11">
            Quay lại
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
            Thu hồi lời mời
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

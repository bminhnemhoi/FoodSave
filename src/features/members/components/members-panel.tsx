"use client";

import { Loader2, MailPlus, Pencil, RotateCcw, Send, UserMinus, Users } from "lucide-react";
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
import { roleUsesSiteScope } from "@/core/access/settings";
import { describedBy, FormField, Section } from "@/features/onboarding/components/fields";
import type { OrgKind } from "@/features/onboarding/options";
import { formatDate, formatDateTime } from "@/lib/format";

import { inviteMember, removeMember, resendInvite, updateMember, type InviteResult } from "../actions";
import type { InvitationRow, MemberRow } from "../queries";
import { inviteSchema, invitationState, type OrgRoleValue } from "../schemas";
import { MemberRoleBadge, RolePicker, scopeText, SiteScopePicker } from "./member-fields";

const NETWORK_ERROR = "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.";

type SiteOption = { id: string; name: string };

function announceInvite(res: InviteResult) {
  if (res.emailSent) toast.success(`Đã gửi lời mời tới ${res.email}.`);
  else
    toast.warning(
      `Đã tạo lời mời cho ${res.email} nhưng chưa gửi được email. Bấm “Gửi lại” trong danh sách lời mời.`,
      { duration: 8000 },
    );
}

// ---------------------------------------------------------------------------
// Mời thành viên
// ---------------------------------------------------------------------------

function InviteForm({
  kind,
  orgId,
  roles,
  sites,
}: {
  kind: OrgKind;
  orgId: string;
  roles: OrgRoleValue[];
  sites: SiteOption[];
}) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRoleValue | "">(roles.includes("staff") ? "staff" : (roles[0] ?? ""));
  const [siteIds, setSiteIds] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showScope = sites.length > 1 && role !== "" && roleUsesSiteScope(role);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const input = { orgId, email, role, siteIds: showScope ? siteIds : null };
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      const first = errs.email ? `${uid}-email` : errs.role ? `${uid}-role` : `${uid}-sites`;
      const el = document.getElementById(first);
      (el instanceof HTMLInputElement ? el : el?.querySelector<HTMLElement>("button"))?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      try {
        const res = await inviteMember(parsed.data);
        if (!res.ok) {
          setErrors(res.error.fieldErrors ?? {});
          setFormError(res.error.message);
          return;
        }
        announceInvite(res.data);
        setEmail("");
        setSiteIds(null);
      } catch {
        setFormError(NETWORK_ERROR);
      }
    });
  }

  return (
    <Section
      title={kind === "store" ? "Mời nhân viên" : "Mời thành viên"}
      headingId={`${uid}-title`}
      description="FoodSave gửi email có liên kết nhận lời mời (hiệu lực 7 ngày, chỉ dùng được với đúng email này). Người được mời đăng nhập hoặc tạo tài khoản rồi bấm nhận."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-5" aria-labelledby={`${uid}-title`}>
        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}
        <FormField id={`${uid}-email`} label="Email người được mời" required error={errors.email ?? null}>
          <Input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy(`${uid}-email`, null, errors.email)}
            className="sm:max-w-md"
          />
        </FormField>
        <RolePicker id={`${uid}-role`} roles={roles} value={role} onChange={setRole} error={errors.role} />
        {showScope ? (
          <SiteScopePicker
            id={`${uid}-sites`}
            sites={sites}
            value={siteIds}
            onChange={setSiteIds}
            error={errors.siteIds}
          />
        ) : null}
        <div>
          <Button type="submit" disabled={pending} aria-disabled={pending} className="min-h-11">
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            {pending ? "Đang gửi…" : "Gửi lời mời"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Danh sách thành viên + sửa quyền / gỡ (chỉ chủ sở hữu)
// ---------------------------------------------------------------------------

function EditMemberDialog({
  kind,
  orgId,
  member,
  roles,
  sites,
}: {
  kind: OrgKind;
  orgId: string;
  member: MemberRow;
  roles: OrgRoleValue[];
  sites: SiteOption[];
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<OrgRoleValue>(member.role);
  const [siteIds, setSiteIds] = useState<string[] | null>(member.siteIds);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = member.fullName || member.email || "thành viên";
  const showScope = sites.length > 1 && roleUsesSiteScope(role);

  function onOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setRole(member.role);
      setSiteIds(member.siteIds);
      setError(null);
    }
    setOpen(next);
  }

  function save() {
    const scope = showScope ? siteIds : null;
    if (scope !== null && scope.length === 0) {
      setError("Chọn ít nhất một điểm, hoặc chọn “Mọi điểm”.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await updateMember({ orgId, userId: member.userId, role, siteIds: scope });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setOpen(false);
        toast.success(`Đã cập nhật quyền của ${name}.`);
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-11">
          <Pencil aria-hidden />
          Sửa quyền<span className="sr-only">: {name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Sửa quyền của {name}</DialogTitle>
          <DialogDescription className="text-ink-muted">
            Thay đổi có hiệu lực từ lần tải trang tiếp theo của{" "}
            {kind === "store" ? "nhân viên" : "thành viên"} và được ghi nhật ký.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <RolePicker id={`${uid}-role`} roles={roles} value={role} onChange={setRole} />
        {showScope ? (
          <SiteScopePicker id={`${uid}-sites`} sites={sites} value={siteIds} onChange={setSiteIds} />
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Quay lại
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={save}
            disabled={pending}
            aria-disabled={pending}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {pending ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({
  orgId,
  orgName,
  member,
}: {
  orgId: string;
  orgName: string;
  member: MemberRow;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = member.fullName || member.email || "thành viên";

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await removeMember({ orgId, userId: member.userId });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        setOpen(false);
        toast.success(`Đã gỡ ${name} khỏi ${orgName}.`);
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
          <UserMinus aria-hidden />
          Gỡ<span className="sr-only">: {name}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="text-lg font-semibold">
            Gỡ {name} khỏi {orgName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left text-ink-muted">
            Người này không còn vào được cổng và dữ liệu của {orgName} từ lần tải trang tiếp theo. Thao tác
            được ghi nhật ký; muốn thêm lại, bạn gửi lời mời mới.
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
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <UserMinus aria-hidden />}
            {pending ? "Đang gỡ…" : "Gỡ thành viên"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MemberList({
  kind,
  orgId,
  orgName,
  viewerId,
  members,
  sites,
  canManage,
  assignable,
}: {
  kind: OrgKind;
  orgId: string;
  orgName: string;
  viewerId: string;
  members: MemberRow[];
  sites: SiteOption[];
  canManage: boolean;
  assignable: OrgRoleValue[];
}) {
  return (
    <Section
      title={`${kind === "store" ? "Nhân viên" : "Thành viên"} (${members.length})`}
      headingId="members-list"
      description={
        canManage
          ? "Bạn là chủ sở hữu: có thể đổi vai trò, giới hạn điểm hoặc gỡ thành viên."
          : "Chỉ chủ sở hữu đổi được vai trò hoặc gỡ thành viên."
      }
    >
      <ul className="flex flex-col divide-y rounded-lg border bg-surface">
        {members.map((m) => {
          const self = m.userId === viewerId;
          const name = m.fullName || m.email || "Thành viên";
          return (
            <li
              key={m.userId}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
              aria-label={name}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 font-medium break-words">
                  {name}
                  {self ? <span className="text-sm font-normal text-ink-subtle">(bạn)</span> : null}
                </p>
                {m.email && m.fullName ? <p className="text-sm break-all text-ink-muted">{m.email}</p> : null}
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <MemberRoleBadge role={m.role} />
                  {roleUsesSiteScope(m.role) && sites.length > 1 ? (
                    <span>{scopeText(m.siteIds, sites)}</span>
                  ) : null}
                  {m.joinedAt ? <span>Tham gia {formatDate(m.joinedAt)}</span> : null}
                </div>
              </div>
              {canManage && !self ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <EditMemberDialog kind={kind} orgId={orgId} member={m} roles={assignable} sites={sites} />
                  <RemoveMemberDialog orgId={orgId} orgName={orgName} member={m} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Lời mời đang chờ (Gửi lại = lời mời mới, thu hồi liên kết cũ)
// ---------------------------------------------------------------------------

function ResendButton({ invitation }: { invitation: InvitationRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 shrink-0"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await resendInvite({ invitationId: invitation.id });
            if (!res.ok) toast.error(res.error.message);
            else announceInvite(res.data);
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

function InvitationList({ invitations, sites }: { invitations: InvitationRow[]; sites: SiteOption[] }) {
  return (
    <Section
      title={`Lời mời đang chờ (${invitations.length})`}
      headingId="members-invitations"
      description="“Gửi lại” tạo liên kết mới và vô hiệu liên kết cũ. Lời mời tự hết hạn sau 7 ngày."
    >
      {invitations.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <MailPlus aria-hidden className="size-4 shrink-0" />
          Không có lời mời nào đang chờ.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-surface">
          {invitations.map((inv) => {
            const expired = invitationState(inv.expiresAt) === "expired";
            return (
              <li
                key={inv.id}
                aria-label={inv.email}
                className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium break-all">{inv.email}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <MemberRoleBadge role={inv.role} />
                    {roleUsesSiteScope(inv.role) && sites.length > 1 ? (
                      <span>{scopeText(inv.siteIds, sites)}</span>
                    ) : null}
                    {expired ? (
                      <span className="font-medium text-warning">Đã hết hạn</span>
                    ) : (
                      <span>Hết hạn {formatDateTime(inv.expiresAt)}</span>
                    )}
                  </div>
                </div>
                <ResendButton invitation={inv} />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/**
 * Tab "Nhân viên" / "Thành viên" (F-09, US-STO-06, US-CHA-14): mời qua email với vai trò và phạm vi điểm,
 * danh sách thành viên (đổi quyền, gỡ — chỉ chủ sở hữu), lời mời đang chờ (gửi lại).
 */
export function MembersPanel({
  kind,
  orgId,
  orgName,
  viewerId,
  members,
  invitations,
  sites,
  invitable,
  assignable,
  canManage,
}: {
  kind: OrgKind;
  orgId: string;
  orgName: string;
  viewerId: string;
  members: MemberRow[];
  invitations: InvitationRow[];
  sites: SiteOption[];
  invitable: OrgRoleValue[];
  assignable: OrgRoleValue[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {invitable.length > 0 ? <InviteForm kind={kind} orgId={orgId} roles={invitable} sites={sites} /> : null}
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          variant="section"
          title="Chưa có thành viên"
          description="Gửi lời mời ở trên để thêm người cùng quản lý."
        />
      ) : (
        <MemberList
          kind={kind}
          orgId={orgId}
          orgName={orgName}
          viewerId={viewerId}
          members={members}
          sites={sites}
          canManage={canManage}
          assignable={assignable}
        />
      )}
      {invitable.length > 0 ? <InvitationList invitations={invitations} sites={sites} /> : null}
    </div>
  );
}

"use client";

import { Bike, Crown, UserCog, UserRound, type LucideIcon } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FieldErrorText } from "@/features/onboarding/components/fields";
import { ORG_ROLE_DESCRIPTION, ORG_ROLE_LABEL } from "@/features/organizations/labels";
import { cn } from "@/lib/utils";

import type { OrgRoleValue } from "../schemas";

export const ROLE_ICON: Record<OrgRoleValue, LucideIcon> = {
  owner: Crown,
  manager: UserCog,
  staff: UserRound,
  volunteer: Bike,
};

/** Vai trò: icon + chữ (CLAUDE.md "nhãn luôn có icon + chữ"). */
export function MemberRoleBadge({ role, className }: { role: OrgRoleValue; className?: string }) {
  const Icon = ROLE_ICON[role];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border border-border-strong/40 bg-bg-sunken px-2.5 py-1 text-sm font-medium whitespace-nowrap text-ink",
        className,
      )}
    >
      <Icon aria-hidden className="size-4 text-role-accent" />
      {ORG_ROLE_LABEL[role]}
    </span>
  );
}

export function RolePicker({
  id,
  roles,
  value,
  onChange,
  error,
}: {
  id: string;
  roles: OrgRoleValue[];
  value: OrgRoleValue | "";
  onChange: (role: OrgRoleValue) => void;
  error?: string | null;
}) {
  return (
    <fieldset id={id} className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">
        Vai trò{" "}
        <span aria-hidden className="text-danger">
          *
        </span>
      </legend>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as OrgRoleValue)}
        aria-invalid={error ? true : undefined}
        className="grid gap-2 sm:grid-cols-2"
      >
        {roles.map((r) => {
          const Icon = ROLE_ICON[r];
          return (
            <label
              key={r}
              className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft"
            >
              <RadioGroupItem value={r} className="mt-1" aria-describedby={`${id}-${r}-desc`} />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon aria-hidden className="size-4 text-role-accent" />
                  {ORG_ROLE_LABEL[r]}
                </span>
                <span id={`${id}-${r}-desc`} className="text-sm text-ink-muted">
                  {ORG_ROLE_DESCRIPTION[r]}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {error ? <FieldErrorText id={id}>{error}</FieldErrorText> : null}
    </fieldset>
  );
}

/** Giới hạn điểm: `null` = mọi điểm (`org_members.site_ids`). Chỉ hiện khi tổ chức có từ 2 điểm. */
export function SiteScopePicker({
  id,
  sites,
  value,
  onChange,
  error,
}: {
  id: string;
  sites: { id: string; name: string }[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  error?: string | null;
}) {
  const some = value !== null;
  return (
    <fieldset id={id} className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">Phạm vi điểm</legend>
      <RadioGroup
        value={some ? "some" : "all"}
        onValueChange={(v) => onChange(v === "all" ? null : (value ?? []))}
        className="grid gap-2 sm:grid-cols-2"
      >
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft">
          <RadioGroupItem value="all" />
          <span>Mọi điểm</span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft">
          <RadioGroupItem value="some" />
          <span>Chỉ một số điểm</span>
        </label>
      </RadioGroup>
      {some ? (
        <div role="group" aria-label="Chọn điểm được thao tác" className="grid gap-2 pl-1 sm:grid-cols-2">
          {sites.map((s) => (
            <label
              key={s.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5"
            >
              <Checkbox
                checked={value.includes(s.id)}
                onCheckedChange={(on) =>
                  onChange(on === true ? [...new Set([...value, s.id])] : value.filter((x) => x !== s.id))
                }
              />
              <span className="text-sm break-words">{s.name}</span>
            </label>
          ))}
        </div>
      ) : null}
      {error ? <FieldErrorText id={id}>{error}</FieldErrorText> : null}
    </fieldset>
  );
}

/** "Mọi điểm" hoặc tên các điểm được giao. */
export function scopeText(siteIds: string[] | null, sites: { id: string; name: string }[]): string {
  if (siteIds === null) return "Mọi điểm";
  const names = siteIds.map((id) => sites.find((s) => s.id === id)?.name ?? "Điểm đã ngừng").join(", ");
  return names || "—";
}

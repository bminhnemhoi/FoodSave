"use client";

import { ChevronDown, LifeBuoy, Loader2, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth/actions";
import { SUPPORT_EMAIL } from "@/lib/contact";

/** Chữ cái đầu của tên gọi (từ cuối trong tên tiếng Việt). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? "?";
  return last.charAt(0).toLocaleUpperCase("vi");
}

type UserMenuProps = {
  name: string;
  email: string | null;
  orgName?: string | null;
  settingsHref?: string;
};

/** Menu tài khoản: Cài đặt, Liên hệ hỗ trợ, Đăng xuất (DESIGN-SYSTEM §10.1). */
export function UserMenu({ name, email, orgName, settingsHref }: UserMenuProps) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Tài khoản: ${name}`}
        className="flex min-h-11 items-center gap-1 rounded-full py-1 pr-1 pl-1 hover:bg-muted aria-expanded:bg-muted sm:gap-2 sm:pr-2"
      >
        <Avatar className="size-9 ring-2 ring-role-accent-fill/60">
          <AvatarFallback className="bg-role-accent-soft font-semibold text-role-accent">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate text-sm font-medium lg:inline">{name}</span>
        <ChevronDown aria-hidden className="hidden size-4 text-ink-subtle sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
          <span className="truncate text-sm font-semibold text-ink">{name}</span>
          {email ? <span className="truncate text-xs font-normal text-ink-muted">{email}</span> : null}
          {orgName ? (
            <span className="mt-1 truncate text-xs font-normal text-ink-muted">
              Đang làm việc tại: {orgName}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {settingsHref ? (
            <DropdownMenuItem asChild className="min-h-10">
              <Link href={settingsHref}>
                <Settings aria-hidden />
                Cài đặt
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild className="min-h-10">
            <a href={`mailto:${SUPPORT_EMAIL}`}>
              <LifeBuoy aria-hidden />
              Liên hệ hỗ trợ
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-10"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await signOut();
            });
          }}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <LogOut aria-hidden />}
          {pending ? "Đang đăng xuất…" : "Đăng xuất"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

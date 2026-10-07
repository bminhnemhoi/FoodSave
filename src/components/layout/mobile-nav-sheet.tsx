"use client";

import { Menu } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { PORTAL_NAV, type PortalRole } from "./nav-config";
import { NavList } from "./nav-links";

/** Menu điều hướng dạng sheet cho mobile ở cổng không có bottom tab (Admin — DESIGN-SYSTEM §10.2). */
export function MobileNavSheet({ role }: { role: PortalRole }) {
  const nav = PORTAL_NAV[role];
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Mở menu điều hướng">
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 max-w-[85vw] bg-bg-sunken">
        <SheetHeader className="border-b">
          <SheetTitle>
            <Wordmark className="text-xl" />
          </SheetTitle>
          <SheetDescription>Điều hướng cổng {nav.roleLabel}</SheetDescription>
        </SheetHeader>
        <nav aria-label="Điều hướng chính" className="overflow-y-auto px-3 pb-6">
          <NavList role={role} inSheet />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

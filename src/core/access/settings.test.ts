import { describe, expect, it } from "vitest";

import {
  assignableRoles,
  canCreateSite,
  canEditClosures,
  canEditProfile,
  canInvite,
  canManageMembers,
  canManageSite,
  canOpenSettings,
  canPause,
  canRequestLegalChange,
  invitableRoles,
  roleUsesSiteScope,
  type MemberScope,
} from "./settings";

const owner: MemberScope = { role: "owner", siteIds: null };
const manager: MemberScope = { role: "manager", siteIds: null };
const scopedManager: MemberScope = { role: "manager", siteIds: ["a"] };
const scopedOwner: MemberScope = { role: "owner", siteIds: ["a"] };
const staff: MemberScope = { role: "staff", siteIds: null };
const volunteer: MemberScope = { role: "volunteer", siteIds: null };

describe("quyền trang Cài đặt", () => {
  it("chỉ owner/manager mở được Cài đặt (US-STO-06 AC2)", () => {
    expect(canOpenSettings(owner)).toBe(true);
    expect(canOpenSettings(manager)).toBe(true);
    expect(canOpenSettings(staff)).toBe(false);
    expect(canOpenSettings(volunteer)).toBe(false);
    expect(canEditProfile(staff)).toBe(false);
    expect(canPause(manager)).toBe(true);
    expect(canPause(staff)).toBe(false);
  });

  it("đề nghị sửa pháp lý, đổi quyền và gỡ thành viên: chỉ owner", () => {
    expect(canRequestLegalChange(owner)).toBe(true);
    expect(canRequestLegalChange(manager)).toBe(false);
    expect(canManageMembers(owner)).toBe(true);
    expect(canManageMembers(manager)).toBe(false);
  });

  it("điểm: khớp private.can_manage_site", () => {
    expect(canCreateSite(owner)).toBe(true);
    expect(canCreateSite(manager)).toBe(true);
    expect(canCreateSite(scopedManager)).toBe(false);
    expect(canCreateSite(staff)).toBe(false);
    expect(canManageSite(scopedManager, "a")).toBe(true);
    expect(canManageSite(scopedManager, "b")).toBe(false);
    expect(canManageSite(scopedOwner, "b")).toBe(true);
    expect(canManageSite(staff, "a")).toBe(false);
  });

  it("ngày nghỉ: khớp can_access_site (giới hạn điểm áp cả owner)", () => {
    expect(canEditClosures(owner, "x")).toBe(true);
    expect(canEditClosures(scopedOwner, "b")).toBe(false);
    expect(canEditClosures(scopedManager, "a")).toBe(true);
    expect(canEditClosures(staff, "a")).toBe(false);
  });

  it("mời: manager không mời owner; TNV chỉ cho tổ chức từ thiện", () => {
    expect(canInvite(staff)).toBe(false);
    expect(invitableRoles(owner, "store")).toEqual(["owner", "manager", "staff"]);
    expect(invitableRoles(owner, "charity")).toEqual(["owner", "manager", "staff", "volunteer"]);
    expect(invitableRoles(manager, "store")).toEqual(["manager", "staff"]);
    expect(invitableRoles(manager, "charity")).toEqual(["manager", "staff", "volunteer"]);
    expect(invitableRoles(staff, "charity")).toEqual([]);
    expect(assignableRoles("store")).not.toContain("volunteer");
    expect(assignableRoles("charity")).toContain("volunteer");
  });

  it("giới hạn điểm chỉ áp cho quản lý/nhân viên", () => {
    expect(roleUsesSiteScope("staff")).toBe(true);
    expect(roleUsesSiteScope("manager")).toBe(true);
    expect(roleUsesSiteScope("owner")).toBe(false);
    expect(roleUsesSiteScope("volunteer")).toBe(false);
  });
});

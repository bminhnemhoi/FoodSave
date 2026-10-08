import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  acceptInviteSchema,
  invitationState,
  inviteSchema,
  invitePath,
  isInviteToken,
  portalAfterAccept,
  updateMemberSchema,
} from "./schemas";
import { generateInviteToken, inviteTokenHashHex, inviteTokenHashParam } from "./token";

const ORG = "6f1c2b8e-3a4d-4c5e-9f60-7a8b9c0d1e2f";
const SITE_A = "0b9c3a2e-1d4f-4a6b-8c7d-9e0f1a2b3c4d";
const SITE_B = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("token lời mời", () => {
  it("32 byte base64url ⇒ 43 ký tự an toàn cho URL, mỗi lần khác nhau", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isInviteToken(a)).toBe(true);
    expect(acceptInviteSchema.safeParse({ token: a }).success).toBe(true);
  });

  it("băm sha256 đúng chuỗi UTF-8 như SQL sha256(convert_to(token,'UTF8'))", async () => {
    const token = "abc_DEF-123";
    const expected = createHash("sha256").update(Buffer.from(token, "utf8")).digest("hex");
    expect(await inviteTokenHashHex(token)).toBe(expected);
    expect(await inviteTokenHashParam(token)).toBe(`\\x${expected}`);
    expect((await inviteTokenHashParam(token)).length).toBe(2 + 64);
  });

  it("từ chối token sai định dạng (không gọi DB)", () => {
    expect(isInviteToken("short")).toBe(false);
    expect(isInviteToken("a".repeat(201))).toBe(false);
    expect(isInviteToken("abc def ghi jkl mno")).toBe(false);
    expect(isInviteToken("../../etc/passwd/xxxxxxxx")).toBe(false);
    expect(isInviteToken(undefined)).toBe(false);
    expect(invitePath("abc")).toBe("/invite/abc");
  });
});

describe("schema mời / sửa thành viên", () => {
  it("chuẩn hóa email, null = mọi điểm", () => {
    const r = inviteSchema.parse({ orgId: ORG, email: "  NV.Ca.Toi@Tiem.VN ", role: "staff", siteIds: null });
    expect(r.email).toBe("nv.ca.toi@tiem.vn");
    expect(r.siteIds).toBeNull();
  });

  it("giới hạn điểm phải khác rỗng và không trùng", () => {
    expect(inviteSchema.safeParse({ orgId: ORG, email: "a@b.vn", role: "staff", siteIds: [] }).success).toBe(
      false,
    );
    expect(
      inviteSchema.safeParse({ orgId: ORG, email: "a@b.vn", role: "staff", siteIds: [SITE_A, SITE_A] })
        .success,
    ).toBe(false);
    expect(
      updateMemberSchema.safeParse({ orgId: ORG, userId: ORG, role: "manager", siteIds: [SITE_A, SITE_B] })
        .success,
    ).toBe(true);
  });

  it("email sai và vai trò lạ bị từ chối bằng tiếng Việt", () => {
    const r = inviteSchema.safeParse({ orgId: ORG, email: "khong-phai-email", role: "admin", siteIds: null });
    expect(r.success).toBe(false);
    const messages = r.error!.issues.map((i) => i.message);
    expect(messages).toContain("Email chưa đúng định dạng, ví dụ: ten@tochuc.vn.");
    expect(messages).toContain("Vui lòng chọn vai trò.");
  });
});

describe("trạng thái và điều hướng", () => {
  it("lời mời quá hạn", () => {
    const now = new Date("2026-10-08T10:00:00+07:00");
    expect(invitationState("2026-10-15T10:00:00+07:00", now)).toBe("pending");
    expect(invitationState("2026-10-08T10:00:00+07:00", now)).toBe("expired");
  });

  it("tình nguyện viên vào /volunteer, còn lại vào cổng theo loại tổ chức", () => {
    expect(portalAfterAccept("volunteer", "charity")).toBe("/volunteer");
    expect(portalAfterAccept("staff", "store")).toBe("/store");
    expect(portalAfterAccept("manager", "charity")).toBe("/charity");
  });
});

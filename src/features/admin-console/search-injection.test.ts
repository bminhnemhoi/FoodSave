import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { escapeLike } from "@/features/org-reviews/schemas";

import { parseAuditFilters, parseOfferFilters } from "./filters";

/**
 * Hồi quy B7 cho ô tìm kiếm của bảng điều khiển Admin: tên cửa hàng (/admin/offers) và người thực hiện
 * (/admin/audit) chỉ đi vào MỘT bộ lọc ilike có thoát ký tự LIKE — không ghép chuỗi `.or()`; nhóm hành động
 * lấy từ danh sách đóng nên không mang được ký tự đại diện.
 */

const client = createClient("http://127.0.0.1:54321", "test-anon-key");
const urlOf = (builder: unknown) => (builder as { url: URL }).url;

const ATTACKS = ["a),status.eq.draft", "x,is_demo.eq.true", "%' or 1=1 --", "a)&status=eq.draft", "_%\\"];

describe("B7 — tìm kiếm của Admin không đổi được điều kiện lọc", () => {
  it("tên cửa hàng: một tham số organizations.name, giá trị đã thoát", () => {
    for (const raw of ATTACKS) {
      const { q } = parseOfferFilters({ q: raw });
      const url = urlOf(
        client
          .from("offers")
          .select("id, organizations!inner(name)")
          .ilike("organizations.name", `%${escapeLike(q)}%`),
      );
      expect([...url.searchParams.keys()].sort()).toEqual(["organizations.name", "select"]);
      expect(url.searchParams.get("organizations.name")).toBe(`ilike.%${escapeLike(q)}%`);
      expect(url.searchParams.getAll("status")).toEqual([]);
      expect(url.searchParams.getAll("is_demo")).toEqual([]);
    }
  });

  it("người thực hiện: hai truy vấn ilike riêng (tên, email), không có `or`", () => {
    for (const raw of ATTACKS) {
      const { actor } = parseAuditFilters({ actor: raw });
      for (const column of ["full_name", "email"] as const) {
        const url = urlOf(
          client
            .from("profiles")
            .select("id")
            .ilike(column, `%${escapeLike(actor)}%`),
        );
        expect([...url.searchParams.keys()].sort()).toEqual([column, "select"]);
        expect(url.searchParams.has("or")).toBe(false);
      }
    }
  });

  it("nhóm hành động: chỉ giá trị trong danh sách, '_' được thoát", () => {
    expect(parseAuditFilters({ act: "org%" }).act).toBeNull();
    const { act } = parseAuditFilters({ act: "volunteer_profile" });
    const url = urlOf(
      client
        .from("audit_logs")
        .select("id")
        .like("action", `${escapeLike(act!)}.%`),
    );
    expect(url.searchParams.get("action")).toBe("like.volunteer\\_profile.%");
  });
});

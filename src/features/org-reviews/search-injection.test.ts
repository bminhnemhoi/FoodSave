import { createClient } from "@supabase/supabase-js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { escapeLike } from "./schemas";

/**
 * Hồi quy B7 (SECURITY-PRIVACY §10.2): bản cũ ghép thẳng chuỗi tìm kiếm vào `.or()` của PostgREST.
 * v2 (P1): ô tìm kiếm duy nhất là hàng đợi duyệt của Admin — `.ilike("name", "%" + escapeLike(q) + "%")`
 * (tham số có kiểu, không ghép bộ lọc). Kho tặng P2 (`marketplace_offers`) bổ sung test riêng.
 */

/** Diễn giải mẫu LIKE (ký tự thoát `\`) thành RegExp khớp toàn chuỗi — như Postgres. */
function likeToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\" && i + 1 < pattern.length) {
      out += pattern[++i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (c === "%") out += "[\\s\\S]*";
    else if (c === "_") out += "[\\s\\S]";
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`, "u");
}

const client = createClient("http://127.0.0.1:54321", "test-anon-key");

describe("B7 — chuỗi tìm kiếm không đổi được điều kiện lọc", () => {
  it("escapeLike: mẫu chỉ khớp đúng chuỗi gốc (wildcard trong dữ liệu là ký tự thường)", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom("a", "b", "%", "_", "\\", ",", "(", ")", ".", "*", " ") }),
        fc.string({ unit: fc.constantFrom("a", "b", "%", "_", "\\", ",", "(", ")", ".", "*", " ") }),
        (s, t) => {
          const exact = likeToRegExp(escapeLike(s));
          expect(exact.test(s)).toBe(true);
          expect(exact.test(t)).toBe(t === s);
          expect(likeToRegExp(`%${escapeLike(s)}%`).test(t)).toBe(t.includes(s));
        },
      ),
    );
  });

  it("chuỗi kiểu `a),status.eq.draft` nằm trọn trong giá trị của MỘT bộ lọc ilike", () => {
    for (const q of ["a),status.eq.draft", "x,status.eq.approved", "%' or 1=1 --", "a)&status=eq.draft"]) {
      const builder = client
        .from("organizations")
        .select("id")
        .ilike("name", `%${escapeLike(q)}%`);
      const url = (builder as unknown as { url: URL }).url;
      expect([...url.searchParams.keys()].sort()).toEqual(["name", "select"]);
      expect(url.searchParams.get("name")).toBe(`ilike.%${escapeLike(q)}%`);
      expect(url.searchParams.getAll("status")).toEqual([]);
    }
  });
});

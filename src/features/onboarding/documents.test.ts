import { describe, expect, it } from "vitest";

import { kycObjectPath, storedFileLabel, uploadedFileName } from "./documents";

describe("tên tệp giấy tờ (UAT 09/10 m1)", () => {
  it("tên tệp vừa chọn: giữ nguyên tên, bỏ đường dẫn và ký tự điều khiển", () => {
    expect(uploadedFileName("giay-phep-kinh-doanh.pdf")).toBe("giay-phep-kinh-doanh.pdf");
    expect(uploadedFileName("C:\\fakepath\\Giấy phép  KD.pdf")).toBe("Giấy phép KD.pdf");
    expect(uploadedFileName("a\u0000b\nc.png")).toBe("abc.png");
    expect(uploadedFileName("   ")).toBeNull();
    expect(uploadedFileName(`${"x".repeat(300)}.pdf`)).toHaveLength(200);
  });

  it("tệp đã lưu (không còn tên gốc): nhãn từ UUID trong đường dẫn, không lộ thư mục tổ chức", () => {
    const org = "0b8f5c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b";
    const path = kycObjectPath(org, "business_license", "3F2A1B7C-1111-4c2b-9a3d-2b7c9d0e1f20", "pdf");
    expect(storedFileLabel(path)).toBe("Tệp 3f2a1b7c.pdf");
    expect(storedFileLabel(path)).not.toContain(org.slice(0, 8));
    expect(storedFileLabel("không-hợp-lệ")).toBe("Tệp đã tải lên");
  });
});

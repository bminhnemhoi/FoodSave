import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chính sách bảo mật" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Chính sách bảo mật</h1>
      <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
        Bản nháp phục vụ thử nghiệm (P0). Bản đầy đủ theo Luật Bảo vệ dữ liệu cá nhân 2025 sẽ được công bố ở
        giai đoạn P1.
      </p>
      <h2>Dữ liệu chúng tôi thu thập</h2>
      <p>
        Họ tên, email và mật khẩu (được mã hóa) để tạo tài khoản. Giấy tờ pháp lý của tổ chức chỉ được thu
        thập khi bạn đăng ký hồ sơ, lưu ở kho riêng tư và chỉ FoodSave dùng để xét duyệt.
      </p>
      <h2>Quyền của bạn</h2>
      <p>
        Bạn có thể yêu cầu xem, sửa hoặc xóa dữ liệu của mình và rút lại sự đồng ý bất cứ lúc nào qua email
        foodsavevietnam@gmail.com.
      </p>
    </>
  );
}

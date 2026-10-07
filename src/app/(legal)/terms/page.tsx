import type { Metadata } from "next";

export const metadata: Metadata = { title: "Điều khoản sử dụng" };

export default function TermsPage() {
  return (
    <>
      <h1>Điều khoản sử dụng</h1>
      <p className="rounded-lg bg-warning-soft p-4 text-sm text-warning">
        Bản nháp phục vụ thử nghiệm (P0). Bản đầy đủ sẽ được công bố ở giai đoạn P1, trước khi mở đăng ký hồ
        sơ.
      </p>
      <h2>1. FoodSave là gì</h2>
      <p>
        FoodSave là nền tảng phi lợi nhuận kết nối thực phẩm còn dùng tốt từ cửa hàng tới tổ chức từ thiện.
        FoodSave không mua bán thực phẩm và không thu phí giao dịch.
      </p>
      <h2>2. Trách nhiệm về an toàn thực phẩm</h2>
      <p>
        Cửa hàng cam kết thực phẩm đăng tặng còn trong hạn sử dụng và được bảo quản đúng cách. Tổ chức nhận có
        quyền từ chối từng phần lô hàng khi phát hiện vấn đề chất lượng lúc bàn giao.
      </p>
      <h2>3. Tài khoản</h2>
      <p>
        Bạn chịu trách nhiệm bảo mật thông tin đăng nhập. Hồ sơ cửa hàng và tổ chức chỉ hoạt động sau khi được
        FoodSave xét duyệt.
      </p>
    </>
  );
}

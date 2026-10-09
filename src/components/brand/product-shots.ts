import type { StaticImageData } from "next/image";

import maBanGiao from "../../../public/images/product/ma-ban-giao.jpg";
import loTangCuaHang from "../../../public/images/product/lo-tang-cua-hang.jpg";
import phuongAnGhep from "../../../public/images/product/phuong-an-ghep.jpg";
import soTacDong from "../../../public/images/product/so-tac-dong.jpg";
import tnvDiemKeTiep from "../../../public/images/product/tnv-diem-ke-tiep.jpg";
import tuyenLayHang from "../../../public/images/product/tuyen-lay-hang.jpg";

/**
 * Ảnh chụp màn hình THẬT của FoodSave cho landing (DESIGN-SYSTEM §2.4, §10.4) — chụp từ bản chạy local với
 * tài khoản và tổ chức demo (tên hư cấu), deviceScaleFactor 2, không có dữ liệu người thật; mã QR/mã 6 số là
 * token local, vô nghĩa trên production. Alt luôn nói rõ "ảnh chụp màn hình" + "dữ liệu demo".
 * Chụp lại khi giao diện đổi: xem "Ảnh sản phẩm" trong DESIGN-SYSTEM §10.4.
 */
export type ProductShot = { src: StaticImageData; alt: string };

export const SHOTS = {
  plans: {
    src: phuongAnGhep,
    alt: "Ảnh chụp màn hình FoodSave, dữ liệu demo: nhu cầu 36 ổ bánh mì của một mái ấm với ba phương án ghép trên bản đồ — phương án 1 đáp ứng đủ 36/36 từ 3 cửa hàng, tuyến ước tính 9,6 km.",
  },
  volunteer: {
    src: tnvDiemKeTiep,
    alt: "Ảnh chụp màn hình ứng dụng tình nguyện viên, dữ liệu demo: chuyến đã nhận, nút “Bắt đầu chuyến” và thẻ điểm kế tiếp là một cửa hàng tiện lợi.",
  },
  handover: {
    src: maBanGiao,
    alt: "Ảnh chụp màn hình FoodSave, dữ liệu demo: mã bàn giao gồm mã QR và mã 6 số, dùng một lần, hiệu lực 15 phút, đang chờ cửa hàng quét.",
  },
  route: {
    src: tuyenLayHang,
    alt: "Ảnh chụp màn hình FoodSave, dữ liệu demo: chuyến tự đến lấy với hai điểm dừng đánh số theo thứ tự, mỗi điểm có nút mở mã bàn giao, và tuyến xe máy trên bản đồ.",
  },
  ledger: {
    src: soTacDong,
    alt: "Ảnh chụp màn hình bảng điều khiển cửa hàng, dữ liệu demo: thẻ “Đã trao tháng 10” lấy từ sổ tác động, chỉ tính hàng đã bàn giao tới tổ chức.",
  },
  storeLots: {
    src: loTangCuaHang,
    alt: "Ảnh chụp màn hình ứng dụng cửa hàng, dữ liệu demo: danh sách lô tặng, lô nhãn Đỏ xếp đầu kèm đếm ngược.",
  },
} satisfies Record<string, ProductShot>;

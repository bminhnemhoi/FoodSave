import type { StaticImageData } from "next/image";

import credits from "../../../public/images/credits.json";
import banhMiCaPhe from "../../../public/images/banh-mi-ca-phe.jpg";
import banhMiNgot from "../../../public/images/banh-mi-ngot-tiem-banh.jpg";
import banhMiQue from "../../../public/images/banh-mi-que.jpg";
import banhMi from "../../../public/images/banh-mi.jpg";
import chiaSuatAn from "../../../public/images/chia-suat-an.jpg";
import rauCu from "../../../public/images/rau-cu-cho-gia-lai.jpg";
import tinhNguyenVien from "../../../public/images/tinh-nguyen-vien-dong-goi.jpg";
import traoHop from "../../../public/images/trao-hop-thuc-pham.jpg";

/**
 * Ảnh minh họa có giấy phép tự do (Pexels) — nguồn, tác giả, giấy phép ở `public/images/credits.json` và
 * trang /credits. Thay dần bằng ảnh thật (có đồng ý) của đối tác thí điểm: giữ `id`, đổi tệp + credits.
 */
export type PhotoCredit = (typeof credits.photos)[number];
export type BrandPhoto = { src: StaticImageData; alt: string; credit: PhotoCredit };

const SOURCES = {
  "banh-mi": banhMi,
  "rau-cu-cho-gia-lai": rauCu,
  "trao-hop-thuc-pham": traoHop,
  "banh-mi-que": banhMiQue,
  "banh-mi-ngot-tiem-banh": banhMiNgot,
  "chia-suat-an": chiaSuatAn,
  "tinh-nguyen-vien-dong-goi": tinhNguyenVien,
  "banh-mi-ca-phe": banhMiCaPhe,
} satisfies Record<string, StaticImageData>;

export type PhotoId = keyof typeof SOURCES;

export function photo(id: PhotoId): BrandPhoto {
  const credit = credits.photos.find((p) => p.id === id);
  if (!credit) throw new Error(`Thiếu nguồn ảnh cho "${id}" trong public/images/credits.json`);
  return { src: SOURCES[id], alt: credit.alt, credit };
}

export const PHOTO_CREDITS = credits;

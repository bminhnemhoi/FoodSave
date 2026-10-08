import { z } from "zod";

/** Đầu vào "Xin nhận" dùng chung client/server (số lượng kiểm chi tiết theo đơn vị ở `qty.ts`). */
export const requestOfferSchema = z.object({
  offerId: z.uuid(),
  siteId: z.uuid(),
  qty: z.number().positive().max(999_999_999),
  clientOpId: z.uuid(),
});

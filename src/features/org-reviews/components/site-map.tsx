"use client";

import { MapViewLazy } from "@/components/map/map-view-lazy";

/** Bản đồ nhỏ vị trí chính xác của điểm (chỉ Admin aal2 đọc được tọa độ qua `get_site_location`). */
export function SiteMap({
  siteId,
  name,
  lat,
  lng,
  kind,
  address,
}: {
  siteId: string;
  name: string;
  lat: number;
  lng: number;
  kind: "store" | "charity";
  address: string;
}) {
  return (
    <div className="h-64 w-full sm:h-72">
      <MapViewLazy
        points={[{ id: siteId, lat, lng, title: name, kind }]}
        initialView={{ latitude: lat, longitude: lng, zoom: 15 }}
        ariaLabel={`Bản đồ vị trí ${name}: ${address}`}
        caption={
          <>
            Vị trí <strong>chính xác</strong> của {kind === "store" ? "cửa hàng" : "điểm nhận"} — chỉ Admin
            thấy; người khác chỉ thấy theo chế độ hiển thị của điểm.
          </>
        }
      />
    </div>
  );
}

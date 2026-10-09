"use client";

import type { GeoJSONSource, MapSourceDataEvent } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import { prefersReducedMotion } from "../map-style";

export type ClusterItem<P> =
  | {
      kind: "cluster";
      key: string;
      clusterId: number;
      lng: number;
      lat: number;
      /** Số điểm trong cụm. */
      count: number;
      /** Thuộc tính gộp (`clusterProperties`) của MapLibre. */
      props: Record<string, unknown>;
    }
  | { kind: "point"; key: string; point: P };

/**
 * Gom cụm bằng source GeoJSON `cluster: true` của MapLibre nhưng vẽ cụm/điểm bằng DOM (nút focus được bằng bàn
 * phím, `aria-label` đầy đủ — §13.3, §13.7). Mỗi feature của source phải có `properties.id`; source cần một lớp
 * ẩn `layerId` (circle, opacity 0) để đọc đúng các cụm/điểm ĐANG VẼ ở mức zoom hiện tại (`queryRenderedFeatures` —
 * không lẫn tile của mức zoom cũ như `querySourceFeatures`, tránh cụm và điểm của nó chồng lên nhau). Trước khi
 * bản đồ vẽ xong lần đầu vẫn trả đủ điểm — không bao giờ trống. Thứ tự Tab: cụm trước, rồi điểm theo danh sách.
 */
export function useDomClusters<P>({
  mapRef,
  sourceId,
  layerId,
  points,
  idOf,
}: {
  mapRef: RefObject<MapRef | null>;
  sourceId: string;
  /** Lớp ẩn của source (để đọc các đối tượng đang vẽ). */
  layerId: string;
  points: P[];
  idOf: (p: P) => string;
}) {
  const [rendered, setRendered] = useState<ClusterItem<P>[]>([]);
  const [ready, setReady] = useState(false);
  const sourceLoaded = useRef(false);
  const byId = useMemo(() => new Map(points.map((p) => [idOf(p), p])), [points, idOf]);
  const order = useMemo(() => new Map(points.map((p, i) => [idOf(p), i])), [points, idOf]);

  const recompute = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.getSource(sourceId) || !map.getLayer(layerId)) return;
    const seen = new Set<string>();
    const out: ClusterItem<P>[] = [];
    for (const f of map.queryRenderedFeatures({ layers: [layerId] })) {
      const p = f.properties ?? {};
      if (p.cluster) {
        const key = `c${p.cluster_id}`;
        if (seen.has(key) || f.geometry.type !== "Point") continue;
        seen.add(key);
        const [lng, lat] = f.geometry.coordinates as [number, number];
        out.push({
          kind: "cluster",
          key,
          clusterId: Number(p.cluster_id),
          lng,
          lat,
          count: Number(p.point_count),
          props: p,
        });
      } else {
        const point = byId.get(String(p.id));
        const key = `p${p.id}`;
        if (!point || seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: "point", key, point });
      }
    }
    const rank = (r: ClusterItem<P>) => (r.kind === "point" ? (order.get(idOf(r.point)) ?? 0) : -1);
    out.sort((a, b) => rank(a) - rank(b));
    setRendered(out);
  }, [mapRef, sourceId, layerId, byId, order, idOf]);

  // Dữ liệu đổi (lọc) ⇒ tính lại khi source cập nhật xong
  useEffect(() => {
    const t = setTimeout(recompute, 50);
    return () => clearTimeout(t);
  }, [recompute]);

  const onSourceData = useCallback(
    (e: MapSourceDataEvent) => {
      if (e.sourceId === sourceId && e.isSourceLoaded) sourceLoaded.current = true;
    },
    [sourceId],
  );

  /** Gắn vào `onIdle` của bản đồ: tile đã vẽ xong ⇒ đọc cụm/điểm đang hiện. */
  const onIdle = useCallback(() => {
    if (!sourceLoaded.current) return;
    setReady(true);
    recompute();
  }, [recompute]);

  const zoomInto = useCallback(
    async (c: { clusterId: number; lng: number; lat: number }) => {
      const map = mapRef.current;
      const source = map?.getMap().getSource(sourceId) as GeoJSONSource | undefined;
      if (!map || !source) return;
      let zoom = map.getZoom() + 2;
      try {
        zoom = await source.getClusterExpansionZoom(c.clusterId);
      } catch {
        // cụm đã đổi do dữ liệu mới — vẫn phóng to theo mặc định
      }
      map.easeTo({ center: [c.lng, c.lat], zoom, duration: prefersReducedMotion() ? 0 : 500 });
    },
    [mapRef, sourceId],
  );

  const items: ClusterItem<P>[] = ready
    ? rendered
    : points.map((point) => ({ kind: "point", key: `p${idOf(point)}`, point }));
  return { items, recompute, onSourceData, onIdle, zoomInto };
}

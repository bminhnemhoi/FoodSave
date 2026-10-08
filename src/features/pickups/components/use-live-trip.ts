"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { LatLng } from "@/core/geo/types";
import { createClient } from "@/lib/supabase/client";

import { parseEwkbPoint } from "../geo";
import { liveReducer, stopChangeAnnouncement, type StopRow } from "../live";
import type { Trip, TripStop } from "../queries";

/** Đọc lại vị trí/trạng thái chuyến mỗi 20 giây (bảng `pickups` không nằm trong Realtime — SECURITY-PRIVACY C9). */
const POSITION_POLL_MS = 20_000;
/** Gom nhiều sự kiện Realtime liên tiếp thành một lần tải lại dữ liệu trang. */
const REFRESH_DEBOUNCE_MS = 1_200;

export type LivePosition = { location: LatLng; at: string; accuracyM: number | null } | null;

export type LiveTrip = {
  stops: TripStop[];
  position: LivePosition;
  /** Realtime đang nối (SUBSCRIBED). */
  connected: boolean;
  /** Câu thông báo gần nhất cho trình đọc màn hình. */
  announcement: string | null;
  /** Điểm dừng vừa đổi (nhấn mạnh trong danh sách vài giây). */
  flashId: string | null;
  nowMs: number;
};

function titleOf(s: TripStop): string {
  if (s.kind === "dropoff") return `Giao về ${s.siteName}`;
  return s.siteName && s.siteName !== s.orgName ? `${s.orgName} · ${s.siteName}` : s.orgName || s.siteName;
}

/**
 * Bản đồ điều phối "trực tiếp" (ROADMAP P3-11, PRD US-CHA-18):
 * - Realtime `postgres_changes` trên `pickup_stops` lọc theo chuyến (RLS quyết định ai nhận) ⇒ trạng thái,
 *   ETA, check-in đổi ngay không cần tải lại; sau đó tải lại dữ liệu trang (debounce) để đồng bộ bàn giao.
 * - Vị trí TNV: đọc `pickups.last_location` qua RLS (điều phối viên được phép) mỗi 20 giây khi tab đang mở;
 *   chỉ có khi TNV đồng ý và đang mở app — không bao giờ tự suy ra hay giả lập.
 */
export function useLiveTrip(trip: Trip, enabled: boolean): LiveTrip {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [state, dispatch] = useReducer(liveReducer<TripStop>, {
    stops: trip.stops,
    changed: null,
    needsRefresh: false,
  });
  const [connected, setConnected] = useState(false);
  const [position, setPosition] = useState<LivePosition>(
    trip.lastLocation && trip.lastLocationAt
      ? { location: trip.lastLocation, at: trip.lastLocationAt, accuracyM: trip.lastLocationAccuracyM }
      : null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flashId, setFlashId] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const statusRef = useRef({
    status: trip.status,
    acceptedAt: trip.acceptedAt,
    assignee: trip.assigneeUserId,
  });

  // Dữ liệu mới từ server (router.refresh) là nguồn sự thật — đồng bộ ngay trong lần render (không qua effect)
  const [syncedTrip, setSyncedTrip] = useState(trip);
  if (syncedTrip !== trip) {
    setSyncedTrip(trip);
    dispatch({ type: "reset", stops: trip.stops });
    setPosition(
      trip.lastLocation && trip.lastLocationAt
        ? { location: trip.lastLocation, at: trip.lastLocationAt, accuracyM: trip.lastLocationAccuracyM }
        : null,
    );
  }
  useEffect(() => {
    statusRef.current = { status: trip.status, acceptedAt: trip.acceptedAt, assignee: trip.assigneeUserId };
  }, [trip]);

  const changed = state.changed;
  const announcement = useMemo(
    () => (changed ? stopChangeAnnouncement(changed.before, changed.after, titleOf(changed.after)) : null),
    [changed],
  );

  // Realtime: thay đổi điểm dừng của chuyến này
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        if (active) router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(`pickup-stops:${trip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_stops", filter: `pickup_id=eq.${trip.id}` },
        (payload) => {
          if (!active) return;
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as StopRow;
          if (payload.eventType === "UPDATE") {
            dispatch({ type: "change", pickupId: trip.id, row });
            // Nhấn mạnh điểm vừa đổi vài giây
            if (typeof row.id === "string") {
              setFlashId(row.id);
              if (flashTimer.current) window.clearTimeout(flashTimer.current);
              flashTimer.current = window.setTimeout(() => setFlashId(null), 4_000);
            }
          }
          scheduleRefresh();
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") setConnected(true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
          setConnected(false);
      });
    return () => {
      active = false;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, supabase, trip.id, router]);

  // Điểm dừng lạ (lên lại kế hoạch) ⇒ tải lại ngay
  useEffect(() => {
    if (state.needsRefresh) router.refresh();
  }, [state.needsRefresh, router]);

  // Vị trí TNV + trạng thái chuyến (nhận chuyến, bắt đầu, hoàn tất) — bảng không phát Realtime
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      setNowMs(Date.now());
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase
        .from("pickups")
        .select(
          "status, accepted_at, assignee_user_id, last_location, last_location_at, last_location_accuracy_m",
        )
        .eq("id", trip.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const loc = parseEwkbPoint(data.last_location as unknown as string | null);
      setPosition(
        loc && data.last_location_at
          ? { location: loc, at: data.last_location_at, accuracyM: data.last_location_accuracy_m }
          : null,
      );
      const prev = statusRef.current;
      if (
        data.status !== prev.status ||
        data.accepted_at !== prev.acceptedAt ||
        data.assignee_user_id !== prev.assignee
      ) {
        statusRef.current = {
          status: data.status,
          acceptedAt: data.accepted_at,
          assignee: data.assignee_user_id,
        };
        router.refresh();
      }
    };
    const timer = window.setInterval(() => void poll(), POSITION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, supabase, trip.id, router]);

  return { stops: state.stops, position, connected, announcement, flashId, nowMs };
}

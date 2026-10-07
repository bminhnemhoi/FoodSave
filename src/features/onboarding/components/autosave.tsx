"use client";

import { CircleAlert, CloudCheck, Loader2, RotateCcw } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ERROR_MESSAGES } from "../errors";

/**
 * Tự lưu nháp (DESIGN-SYSTEM §11.2 `Wizard`/`AutosaveIndicator`, US-STO-01 AC1):
 * - debounce ~800 ms sau mỗi thay đổi hợp lệ, một lượt lưu tại một thời điểm, lượt sau dùng giá trị mới nhất;
 * - `flushAll()` trước khi chuyển bước; chặn đóng tab khi còn thay đổi chưa lưu;
 * - chỉ báo "Đang lưu…", "Đã lưu nháp lúc HH:mm", "Lưu thất bại — Thử lại".
 */

export type SaveResult = { ok: true; savedAt: string } | { ok: false; message: string };

type SourceState = {
  status: "idle" | "dirty" | "saving" | "saved" | "error";
  savedAt?: string;
  message?: string;
};

type Source = { flush: () => Promise<boolean>; state: SourceState };

type Registry = {
  register: (id: string, flush: () => Promise<boolean>) => () => void;
  report: (id: string, state: SourceState) => void;
  /** Lưu mọi thay đổi đang chờ; `false` nếu có nguồn lưu thất bại. */
  flushAll: () => Promise<boolean>;
  /** Ghi nhận một thao tác lưu tức thời (tải tệp, xóa tệp…). */
  markSaved: (savedAt: string) => void;
};

const AutosaveContext = createContext<Registry | null>(null);
const AutosaveStateContext = createContext<{ sources: Record<string, SourceState>; manualSavedAt?: string }>({
  sources: {},
});

export function AutosaveProvider({ children }: { children: React.ReactNode }) {
  const sourcesRef = useRef(new Map<string, Source>());
  const [sources, setSources] = useState<Record<string, SourceState>>({});
  const [manualSavedAt, setManualSavedAt] = useState<string | undefined>();

  const registry = useMemo<Registry>(
    () => ({
      register(id, flush) {
        sourcesRef.current.set(id, { flush, state: { status: "idle" } });
        return () => {
          sourcesRef.current.delete(id);
          setSources((s) => {
            const next = { ...s };
            delete next[id];
            return next;
          });
        };
      },
      report(id, state) {
        const src = sourcesRef.current.get(id);
        if (src) src.state = state;
        setSources((s) => ({ ...s, [id]: state }));
      },
      async flushAll() {
        const results = await Promise.all([...sourcesRef.current.values()].map((s) => s.flush()));
        return results.every(Boolean);
      },
      markSaved(savedAt) {
        setManualSavedAt(savedAt);
      },
    }),
    [],
  );

  // Chặn đóng tab/tải lại khi còn thay đổi chưa lưu (DESIGN-SYSTEM §11.2)
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const pending = [...sourcesRef.current.values()].some(
        (s) => s.state.status === "dirty" || s.state.status === "saving",
      );
      if (pending) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <AutosaveContext.Provider value={registry}>
      <AutosaveStateContext.Provider value={{ sources, manualSavedAt }}>
        {children}
      </AutosaveStateContext.Provider>
    </AutosaveContext.Provider>
  );
}

export function useAutosaveRegistry(): Registry {
  const ctx = useContext(AutosaveContext);
  if (!ctx) throw new Error("useAutosaveRegistry phải nằm trong AutosaveProvider");
  return ctx;
}

/** JSON ổn định (khóa sắp xếp) để so sánh giá trị đã lưu. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/**
 * Tự lưu một nguồn dữ liệu. `value = null` ⇒ chưa có gì để lưu (ví dụ chưa đủ trường bắt buộc để tạo nháp).
 * Giá trị lần render đầu coi như đã lưu (khớp dữ liệu từ server). `baseline` cho phép coi một giá trị
 * khác là đã lưu (ví dụ `null` ⇒ lịch mặc định chưa từng lưu).
 */
export function useAutosave<T>({
  id,
  value,
  save,
  enabled = true,
  delay = 800,
  baseline,
}: {
  id: string;
  value: T | null;
  save: (value: T) => Promise<SaveResult>;
  enabled?: boolean;
  delay?: number;
  baseline?: T | null;
}) {
  const registry = useAutosaveRegistry();
  const key = value === null ? null : stableKey(value);

  const [initialKey] = useState(() =>
    baseline === undefined ? key : baseline === null ? null : stableKey(baseline),
  );
  const savedKey = useRef<string | null>(initialKey);
  const latest = useRef<{ key: string | null; value: T | null }>({ key, value });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const lastState = useRef<SourceState>({ status: "idle" });

  useEffect(() => {
    saveRef.current = save;
    enabledRef.current = enabled;
    latest.current = { key, value };
  });

  const report = useCallback(
    (state: SourceState) => {
      lastState.current = state;
      registry.report(id, state);
    },
    [registry, id],
  );

  const runOnce = useCallback(async (): Promise<boolean> => {
    const { key: k, value: v } = latest.current;
    if (k === null || v === null || k === savedKey.current || !enabledRef.current) return true;
    report({ ...lastState.current, status: "saving" });
    let res: SaveResult;
    try {
      res = await saveRef.current(v);
    } catch {
      res = { ok: false, message: ERROR_MESSAGES.offline };
    }
    if (res.ok) {
      savedKey.current = k;
      const stillDirty = latest.current.key !== null && latest.current.key !== k;
      report({ status: stillDirty ? "dirty" : "saved", savedAt: res.savedAt });
      return true;
    }
    report({ status: "error", savedAt: lastState.current.savedAt, message: res.message });
    return false;
  }, [report]);

  /**
   * Lưu tới khi khớp giá trị mới nhất (tối đa vài lượt nếu người dùng vẫn gõ). Các lượt gọi xếp hàng
   * nối tiếp nhau nên không bao giờ có hai lượt lưu song song.
   */
  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    const task = queue.current.then(async () => {
      for (let i = 0; i < 4; i++) {
        const k = latest.current.key;
        // Chưa có gì hợp lệ để lưu, hoặc nguồn đang tắt ⇒ không chặn chuyển bước
        if (k === null || !enabledRef.current || k === savedKey.current) return true;
        if (!(await runOnce())) return false;
      }
      return latest.current.key === savedKey.current;
    });
    queue.current = task.catch(() => false);
    return task;
  }, [runOnce]);

  useEffect(() => registry.register(id, flush), [registry, id, flush]);

  useEffect(() => {
    if (!enabled || key === null || key === savedKey.current) return;
    report({ ...lastState.current, status: "dirty" });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
    return () => clearTimeout(timer.current);
  }, [key, enabled, delay, flush, report]);

  return { flush };
}

const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
});

/** "Đã lưu nháp lúc 14:32" — giờ Việt Nam. */
export function formatSavedAt(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function AutosaveIndicator({ className }: { className?: string }) {
  const { sources, manualSavedAt } = useContext(AutosaveStateContext);
  const registry = useAutosaveRegistry();
  const [retrying, setRetrying] = useState(false);
  const states = Object.values(sources);
  const saving = states.some((s) => s.status === "saving" || s.status === "dirty");
  const failed = states.find((s) => s.status === "error");
  const savedAt = [manualSavedAt, ...states.map((s) => s.savedAt)]
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);

  let content: React.ReactNode = null;
  if (failed) {
    content = (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-danger">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        <span>Lưu thất bại</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto min-h-11 px-1 text-danger sm:min-h-0"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await registry.flushAll();
            setRetrying(false);
          }}
        >
          <RotateCcw aria-hidden />
          Thử lại
        </Button>
      </span>
    );
  } else if (saving) {
    content = (
      <span className="flex items-center gap-2 text-ink-muted">
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        Đang lưu…
      </span>
    );
  } else if (savedAt) {
    content = (
      <span className="flex items-center gap-2 text-ink-muted">
        <CloudCheck aria-hidden className="size-4 shrink-0 text-success" />
        Đã lưu nháp lúc <span className="tabular-nums">{formatSavedAt(savedAt)}</span>
      </span>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cn("text-sm", className)} data-testid="autosave-status">
      {content}
      {failed?.message ? <span className="sr-only"> {failed.message}</span> : null}
    </div>
  );
}

/** Thông điệp lỗi lưu gần nhất (hiển thị dưới form). */
export function useAutosaveError(): string | null {
  const { sources } = useContext(AutosaveStateContext);
  return Object.values(sources).find((s) => s.status === "error")?.message ?? null;
}

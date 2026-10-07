"use client";

import {
  CircleAlert,
  Crosshair,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinCheck,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { LocationPickerMapLazy } from "@/components/map/location-picker-map-lazy";
import type { PinChangePhase } from "@/components/map/location-picker-map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { haversineM } from "@/core/geo/distance";
import { isInServiceArea } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { formatCoordinate, formatDistance, formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";

import { resolvePlace, reverseLookup, searchPlaces } from "../actions";
import {
  OUTSIDE_SERVICE_AREA_MESSAGE,
  SEARCH_MAX_CHARS,
  SEARCH_MIN_CHARS,
  type LocationSource,
  type LocationValue,
  type PlaceSuggestion,
} from "../schemas";

const DEBOUNCE_MS = 300;
/** Ghim lệch quá 2 km so với gợi ý đã chọn ⇒ phải xác nhận (spike map-goong §Kết luận). */
const MAX_PIN_DRIFT_M = 2000;

const SOURCE_LABEL: Record<LocationSource, string> = {
  autocomplete: "Gợi ý địa chỉ",
  gps: "Vị trí hiện tại (GPS)",
  pin: "Ghim trên bản đồ",
};

/** UUID v4 cho session token gợi ý (randomUUID không có ở ngữ cảnh http không bảo mật). */
function newSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function geolocationMessage(code: number): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "Bạn đã chặn quyền vị trí. Hãy cho phép vị trí trong cài đặt trình duyệt cho trang này, hoặc tìm địa chỉ ở ô phía trên.";
    case 3: // TIMEOUT
      return "Định vị quá lâu. Hãy thử lại ở nơi thoáng hơn, hoặc tìm địa chỉ ở ô phía trên.";
    default:
      return "Không xác định được vị trí hiện tại. Hãy tìm địa chỉ hoặc bấm lên bản đồ để đặt ghim.";
  }
}

function Message({
  tone,
  children,
  id,
}: {
  tone: "danger" | "warning" | "info";
  children: React.ReactNode;
  id?: string;
}) {
  const Icon = tone === "danger" ? CircleAlert : tone === "warning" ? TriangleAlert : Info;
  return (
    <div
      id={id}
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "flex gap-2.5 rounded-lg border p-3 text-sm",
        tone === "danger" && "border-danger/30 bg-danger-soft text-danger",
        tone === "warning" && "border-warning/30 bg-warning-soft text-ink",
        tone === "info" && "border-info/30 bg-info-soft text-ink",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warning" && "text-warning",
          tone === "info" && "text-info",
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export type LocationPickerProps = {
  /** Giá trị ban đầu (ví dụ khôi phục bản nháp). */
  defaultValue?: LocationValue | null;
  /** Nhận giá trị hợp lệ, hoặc `null` khi chưa chọn / ngoài vùng phục vụ / chưa xác nhận. */
  onChange?: (value: LocationValue | null) => void;
  /** Vẽ vòng bán kính phục vụ quanh ghim (km). */
  radiusKm?: number;
  /** Hiện nút "Dùng vị trí hiện tại". */
  allowCurrentLocation?: boolean;
  /** Tên input ẩn chứa JSON giá trị, để dùng trong <form> với Server Action. */
  name?: string;
  label?: string;
  mapClassName?: string;
  className?: string;
};

/**
 * Bộ chọn vị trí (F-05, P1-03, DESIGN-SYSTEM §11.2). Luồng chuẩn ADR-006: gợi ý có ưu tiên vị trí →
 * chọn → place detail → GHIM KÉO ĐƯỢC LÀ NGUỒN SỰ THẬT → reverse geocode điền phường/xã.
 * Không bao giờ geocode chữ tự do. Chặn ghim ngoài vùng phục vụ TP.HCM.
 */
export function LocationPicker({
  defaultValue = null,
  onChange,
  radiusKm,
  allowCurrentLocation = true,
  name,
  label = "Tìm địa chỉ",
  mapClassName,
  className,
}: LocationPickerProps) {
  const uid = useId();
  const inputId = `${uid}-search`;
  const listId = `${uid}-listbox`;
  const hintId = `${uid}-hint`;
  const addressId = `${uid}-address`;
  const optionId = (i: number) => `${uid}-option-${i}`;

  // Tìm kiếm
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const sessionToken = useRef<string>("");
  const searchSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Vị trí
  const [pin, setPin] = useState<LatLng | null>(
    defaultValue ? { lat: defaultValue.lat, lng: defaultValue.lng } : null,
  );
  const [addressLine, setAddressLine] = useState(defaultValue?.addressLine ?? "");
  const [ward, setWard] = useState<string | null>(defaultValue?.ward ?? null);
  const [city, setCity] = useState<string | null>(defaultValue?.city ?? null);
  const [source, setSource] = useState<LocationSource | null>(defaultValue?.source ?? null);
  const [anchor, setAnchor] = useState<LatLng | null>(null);
  const [driftConfirmed, setDriftConfirmed] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [bias, setBias] = useState<LatLng | null>(null);

  const [resolving, setResolving] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const reverseSeq = useRef(0);

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  function token(): string {
    if (!sessionToken.current) sessionToken.current = newSessionToken();
    return sessionToken.current;
  }

  // ---------- Tìm kiếm (debounce 300 ms, bỏ kết quả cũ) ----------
  function handleQueryChange(next: string) {
    setQuery(next);
    setActiveIndex(-1);
    setSearchError(null);
    clearTimeout(debounceTimer.current);
    const q = next.trim();
    const seq = ++searchSeq.current;
    if (q.length < SEARCH_MIN_CHARS) {
      setSuggestions([]);
      setSearching(false);
      setSearched(false);
      setOpen(false);
      return;
    }
    setSearching(true);
    debounceTimer.current = setTimeout(async () => {
      const res = await searchPlaces(q, token(), bias);
      if (seq !== searchSeq.current) return; // đã có lượt gõ mới hơn
      setSearching(false);
      setSearched(true);
      if (res.ok) {
        setSuggestions(res.data);
        setOpen(true);
        setLiveMessage(
          res.data.length > 0
            ? `Có ${res.data.length} gợi ý. Dùng phím mũi tên lên, xuống để chọn.`
            : "Không tìm thấy địa chỉ phù hợp.",
        );
      } else {
        setSuggestions([]);
        setOpen(false);
        setSearchError(res.error);
      }
    }, DEBOUNCE_MS);
  }

  function clearSearch() {
    clearTimeout(debounceTimer.current);
    searchSeq.current++;
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setSearching(false);
    setSearched(false);
    setActiveIndex(-1);
    setSearchError(null);
  }

  async function selectSuggestion(s: PlaceSuggestion) {
    clearTimeout(debounceTimer.current);
    searchSeq.current++;
    setOpen(false);
    setSearching(false);
    setActiveIndex(-1);
    setQuery(s.secondaryText ? `${s.mainText}, ${s.secondaryText}` : s.mainText);
    setResolving(true);
    setSearchError(null);
    setLiveMessage("Đang lấy vị trí của địa chỉ đã chọn…");

    const res = await resolvePlace(s.id, token());
    sessionToken.current = ""; // kết thúc phiên gợi ý (tính phí theo phiên)
    setResolving(false);
    if (!res.ok) {
      setSearchError(res.error);
      setLiveMessage("");
      return;
    }
    const p = { lat: res.data.lat, lng: res.data.lng };
    reverseSeq.current++; // huỷ reverse geocode đang chờ
    setReversing(false);
    setReverseError(null);
    setPin(p);
    setAnchor(p);
    setDriftConfirmed(false);
    setAddressLine(res.data.addressLine);
    setWard(res.data.ward);
    setCity(res.data.city);
    setSource("autocomplete");
    setFocusKey((k) => k + 1);
    setLiveMessage(
      isInServiceArea(p)
        ? `Đã ghim ${res.data.label}. Kéo ghim trên bản đồ nếu cần chỉnh.`
        : OUTSIDE_SERVICE_AREA_MESSAGE,
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = suggestions.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (n === 0) return;
        if (!open) setOpen(true);
        setActiveIndex((i) => (i + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (n === 0) return;
        if (!open) setOpen(true);
        setActiveIndex((i) => (i <= 0 ? n - 1 : i - 1));
        break;
      case "Enter":
        // Không để Enter gửi form chứa bộ chọn
        e.preventDefault();
        if (open && n > 0) void selectSuggestion(suggestions[activeIndex >= 0 ? activeIndex : 0]!);
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        } else if (query) {
          e.preventDefault();
          clearSearch();
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  // ---------- Ghim: kéo / bấm bản đồ / phím mũi tên ----------
  async function lookupAddress(p: LatLng) {
    const seq = ++reverseSeq.current;
    setReversing(true);
    setReverseError(null);
    const res = await reverseLookup(p.lat, p.lng);
    if (seq !== reverseSeq.current) return;
    setReversing(false);
    if (!res.ok) {
      setWard(null);
      setReverseError(res.error);
      return;
    }
    if (!res.data) {
      setWard(null);
      setReverseError("Không xác định được địa chỉ tại điểm này. Bạn có thể nhập địa chỉ thủ công bên dưới.");
      return;
    }
    setAddressLine(res.data.addressLine);
    setWard(res.data.ward);
    setCity(res.data.city);
    setLiveMessage(`Địa chỉ tại ghim: ${res.data.label}.`);
  }

  function handlePinChange(p: LatLng, phase: PinChangePhase) {
    setPin(p);
    if (phase === "move") return;
    setSource("pin");
    setDriftConfirmed(false);
    if (!isInServiceArea(p)) {
      reverseSeq.current++;
      setReversing(false);
      setLiveMessage(OUTSIDE_SERVICE_AREA_MESSAGE);
      return;
    }
    void lookupAddress(p);
  }

  // ---------- Vị trí hiện tại ----------
  function locateMe() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocateError(
        "Trình duyệt này không hỗ trợ định vị. Hãy tìm địa chỉ hoặc bấm lên bản đồ để đặt ghim.",
      );
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocating(false);
        setBias(p); // ưu tiên gợi ý quanh vị trí thật của người dùng
        setPin(p);
        setAnchor(null);
        setDriftConfirmed(false);
        setSource("gps");
        setFocusKey((k) => k + 1);
        if (!isInServiceArea(p)) {
          setLiveMessage(OUTSIDE_SERVICE_AREA_MESSAGE);
          return;
        }
        void lookupAddress(p);
      },
      (err) => {
        setLocating(false);
        setLocateError(geolocationMessage(err.code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // ---------- Kiểm tra & phát giá trị ----------
  const outside = pin !== null && !isInServiceArea(pin);
  const driftM = anchor && pin && source === "pin" ? haversineM(anchor, pin) : 0;
  const needsDriftConfirm = driftM > MAX_PIN_DRIFT_M && !driftConfirmed;
  const addressMissing = pin !== null && !reversing && addressLine.trim().length < 3;

  const value = useMemo<LocationValue | null>(() => {
    if (!pin || !source || outside || needsDriftConfirm || reversing || resolving) return null;
    const line = addressLine.trim();
    if (line.length < 3) return null;
    return { lat: pin.lat, lng: pin.lng, addressLine: line.slice(0, 200), ward, city, source };
  }, [pin, source, outside, needsDriftConfirm, reversing, resolving, addressLine, ward, city]);

  const valueKey = value ? JSON.stringify(value) : "";
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.(valueKey ? (JSON.parse(valueKey) as LocationValue) : null);
  }, [valueKey]);

  const showList = open && suggestions.length > 0;
  const noResults =
    open && searched && !searching && suggestions.length === 0 && query.trim().length >= SEARCH_MIN_CHARS;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {name ? <input type="hidden" name={name} value={valueKey} /> : null}

      {/* Ô tìm địa chỉ — combobox WAI-ARIA 1.2 */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            id={inputId}
            role="combobox"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={SEARCH_MAX_CHARS}
            placeholder="Ví dụ: 135 Nam Kỳ Khởi Nghĩa"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-describedby={hintId}
            aria-busy={searching || resolving}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setOpen(false)}
            className="h-12 pr-11 pl-10 text-base md:h-11 md:text-base"
          />
          <div className="absolute top-1/2 right-1 -translate-y-1/2">
            {searching || resolving ? (
              <span className="grid size-10 place-items-center" aria-hidden>
                <Loader2 className="size-4 animate-spin text-ink-subtle" />
              </span>
            ) : query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearSearch}
                aria-label="Xóa nội dung tìm kiếm"
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>

          <ul
            id={listId}
            role="listbox"
            aria-label="Gợi ý địa chỉ"
            hidden={!showList}
            className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-popover py-1 shadow-2"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                // Giữ focus ở ô nhập khi bấm chuột
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void selectSuggestion(s)}
                onMouseMove={() => i !== activeIndex && setActiveIndex(i)}
                className="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5 aria-selected:bg-accent"
              >
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words text-ink">{s.mainText}</span>
                  {s.secondaryText ? (
                    <span className="block text-sm break-words text-ink-muted">{s.secondaryText}</span>
                  ) : null}
                </span>
                {s.distanceM != null ? (
                  <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
                    {formatDistance(s.distanceM)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <p id={hintId} className="text-sm text-ink-subtle">
          Gõ số nhà và tên đường rồi chọn một gợi ý. Sau đó kéo ghim tới đúng cổng ra vào.
        </p>
        <div aria-live="polite" className="sr-only">
          {liveMessage}
        </div>
        {noResults ? (
          <Message tone="info">
            Không tìm thấy địa chỉ phù hợp. Thử ghi rõ số nhà và tên đường, hoặc bấm lên bản đồ để đặt ghim.
          </Message>
        ) : null}
        {searchError ? <Message tone="danger">{searchError}</Message> : null}
      </div>

      {allowCurrentLocation ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-fit"
            onClick={locateMe}
            disabled={locating}
            aria-busy={locating}
          >
            {locating ? <Loader2 aria-hidden className="animate-spin" /> : <LocateFixed aria-hidden />}
            {locating ? "Đang định vị…" : "Dùng vị trí hiện tại"}
          </Button>
          {locateError ? <Message tone="warning">{locateError}</Message> : null}
        </div>
      ) : null}

      {/* Bản đồ: ghim kéo được, bấm để đặt ghim */}
      <div className="flex flex-col gap-2">
        <div className={cn("h-72 w-full sm:h-80 lg:h-96", mapClassName)}>
          <LocationPickerMapLazy
            pin={pin}
            focusKey={focusKey}
            radiusKm={radiusKm}
            onPinChange={handlePinChange}
            ariaLabel={
              pin
                ? `Bản đồ chọn vị trí. Ghim tại vĩ độ ${formatCoordinate(pin.lat)}, kinh độ ${formatCoordinate(pin.lng)}.`
                : "Bản đồ chọn vị trí. Chưa có ghim — bấm lên bản đồ để đặt ghim."
            }
          />
        </div>
        <p className="flex items-start gap-2 text-sm text-ink-subtle">
          <Crosshair aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Bấm lên bản đồ để đặt ghim; kéo ghim (hoặc chọn ghim rồi dùng phím mũi tên) để chỉnh chính xác.
            {radiusKm && radiusKm > 0 ? ` Vòng nét đứt là bán kính phục vụ ${formatKm(radiusKm)}.` : null}
          </span>
        </p>
      </div>

      {outside ? <Message tone="danger">{OUTSIDE_SERVICE_AREA_MESSAGE}</Message> : null}

      {driftM > MAX_PIN_DRIFT_M ? (
        <Message tone="warning">
          <p>
            Ghim đang cách địa chỉ đã chọn khoảng <strong>{formatDistance(driftM)}</strong>. Hãy kiểm tra lại
            vị trí.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Checkbox
              id={`${uid}-drift`}
              checked={driftConfirmed}
              onCheckedChange={(v) => setDriftConfirmed(v === true)}
            />
            <Label htmlFor={`${uid}-drift`} className="font-medium text-ink">
              Tôi xác nhận vị trí ghim là đúng
            </Label>
          </div>
        </Message>
      ) : null}

      {/* Kết quả: địa chỉ (sửa được), phường/xã, toạ độ */}
      {pin ? (
        <section
          aria-labelledby={`${uid}-result`}
          className="flex flex-col gap-4 rounded-lg border bg-surface p-4 sm:p-5"
        >
          <h3 id={`${uid}-result`} className="flex items-center gap-2 text-base font-semibold">
            {value ? (
              <MapPinCheck aria-hidden className="size-5 text-success" />
            ) : (
              <MapPin aria-hidden className="size-5 text-ink-subtle" />
            )}
            Vị trí đã chọn
            {reversing ? (
              <span className="ml-auto flex items-center gap-1.5 text-sm font-normal text-ink-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Đang xác định địa chỉ…
              </span>
            ) : null}
          </h3>

          <div className="flex flex-col gap-2">
            <Label htmlFor={addressId}>Số nhà, tên đường</Label>
            <Input
              id={addressId}
              value={addressLine}
              maxLength={200}
              autoComplete="address-line1"
              onChange={(e) => setAddressLine(e.target.value)}
              aria-invalid={addressMissing || undefined}
              aria-describedby={`${addressId}-hint`}
              className="h-11 text-base md:text-base"
            />
            <p
              id={`${addressId}-hint`}
              className={cn("text-sm", addressMissing ? "text-danger" : "text-ink-subtle")}
            >
              {addressMissing
                ? "Vui lòng nhập địa chỉ (số nhà, tên đường)."
                : "Tự điền từ bản đồ — bạn có thể sửa cho chính xác. Vị trí lưu theo ghim, không theo chữ."}
            </p>
          </div>
          {reverseError ? <Message tone="warning">{reverseError}</Message> : null}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-ink-subtle">Phường/xã</dt>
              <dd className="font-medium text-ink">
                {ward ?? (reversing ? "Đang xác định…" : "Chưa xác định")}
              </dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Tỉnh/thành</dt>
              <dd className="font-medium text-ink">{city ?? "—"}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-ink-subtle">Toạ độ ghim</dt>
              <dd
                data-testid="location-coords"
                data-lat={pin.lat}
                data-lng={pin.lng}
                className="font-medium text-ink tabular-nums"
              >
                Vĩ độ {formatCoordinate(pin.lat)} · Kinh độ {formatCoordinate(pin.lng)}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-ink-subtle">Nguồn</dt>
              <dd className="font-medium text-ink">{source ? SOURCE_LABEL[source] : "—"}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

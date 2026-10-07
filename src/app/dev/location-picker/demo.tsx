"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/features/locations/components/location-picker";
import type { LocationValue } from "@/features/locations/schemas";

const RADII = [0, 2, 5, 10] as const;

/** Khung thử LocationPicker: chọn bán kính, xem giá trị phát ra. Chỉ dùng ở môi trường dev. */
export function LocationPickerDemo() {
  const [value, setValue] = useState<LocationValue | null>(null);
  const [radius, setRadius] = useState<number>(5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="demo-radius">Bán kính phục vụ (thử vòng tròn)</Label>
        <select
          id="demo-radius"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-base sm:w-60"
        >
          {RADII.map((r) => (
            <option key={r} value={r}>
              {r === 0 ? "Không vẽ vòng" : `${r} km`}
            </option>
          ))}
        </select>
      </div>

      <LocationPicker onChange={setValue} radiusKm={radius || undefined} name="location" />

      <section aria-labelledby="demo-output" className="flex flex-col gap-2">
        <h2 id="demo-output" className="text-lg font-semibold">
          Giá trị phát ra (onChange)
        </h2>
        <pre
          data-testid="location-value"
          className="overflow-x-auto rounded-lg border bg-bg-sunken p-4 text-sm whitespace-pre-wrap text-ink"
        >
          {value ? JSON.stringify(value, null, 2) : "null — chưa có vị trí hợp lệ"}
        </pre>
      </section>
    </div>
  );
}

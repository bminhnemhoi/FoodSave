// MapLibre v6 suy ra URL web worker từ import.meta.url; sau khi Turbopack đóng gói, đường dẫn đó không tồn tại.
// Chép worker (+ module dùng chung mà worker import tương đối) vào public/ và gọi setWorkerUrl() phía client.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const out = path.join(process.cwd(), "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, f), path.join(out, f));
}

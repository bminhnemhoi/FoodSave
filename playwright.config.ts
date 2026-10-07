import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // E2E full-stack (Next + Supabase + Goong) chạy song song: chờ tối đa 10 s cho mỗi assertion.
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Máy dev chạy cả Next + Supabase (Docker): 2 worker để ổn định; CI dùng mặc định.
  workers: process.env.CI ? undefined : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        env: {
          NEXT_PUBLIC_APP_URL: baseURL,
          // Chỉ máy chủ test: cả bộ E2E đăng ký nhiều tài khoản từ 127.0.0.1. Production luôn = 1.
          AUTH_RATE_LIMIT_MULTIPLIER: "50",
          ...(process.env.NEXT_DIST_DIR ? { NEXT_DIST_DIR: process.env.NEXT_DIST_DIR } : {}),
        },
        stdout: process.env.E2E_SERVER_LOG ? "pipe" : "ignore",
        stderr: "pipe",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});

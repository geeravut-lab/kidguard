import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "off",
    // รันกับ URL ภายนอกผ่าน proxy ของสภาพแวดล้อม (ทั้ง browser และ request fixture)
    ...(process.env.E2E_BASE_URL && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  },
  projects: [
    { name: "mobile-390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
    { name: "desktop-1280x800", use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `pnpm exec next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 60_000, env: { ...(process.env as Record<string, string>), LINE_API_BASE: "http://127.0.0.1:9" } },
});

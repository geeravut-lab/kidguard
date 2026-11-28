import { defineConfig } from "@playwright/test";

// จำลองการใช้งานจริงของทุกบทบาทผ่านหน้าจอ (ใช้สาธิตให้ผู้บริหาร) — ยิงใส่ E2E_BASE_URL (ค่าเริ่มต้น production)
export default defineConfig({
  testDir: "tests/demo",
  timeout: 40 * 60_000,
  expect: { timeout: 45_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://kidguards.vercel.app",
    trace: "off",
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  },
  projects: [{ name: "demo", use: { viewport: { width: 1366, height: 800 } } }],
});

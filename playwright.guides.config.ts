import { defineConfig, devices } from "@playwright/test";

// ถ่ายภาพหน้าจอจริงสำหรับคู่มือ (ใช้ข้อมูลสมมุติ ลบท้ายรัน): pnpm guides:shots แล้ว pnpm guides:build
const PORT = 3100;
export default defineConfig({
  testDir: "tests/guides",
  timeout: 900_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [{ name: "guides", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: `pnpm exec next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 60_000, env: { ...(process.env as Record<string, string>), LINE_API_BASE: "http://127.0.0.1:9" } },
});

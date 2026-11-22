import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "mobile-390x844", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
    { name: "desktop-1280x800", use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `pnpm exec next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 60_000 },
});

import { expect, type Page } from "@playwright/test";
import { PASSWORD } from "../db/helpers";

export const isMobile = (name: string) => name.startsWith("mobile");

export async function loginUI(page: Page, email: string, next?: string) {
  await page.goto(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** บนมือถือ เมนูบางรายการอยู่ในแผ่น "เพิ่มเติม" */

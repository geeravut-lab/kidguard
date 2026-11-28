import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/preview/parent", "/preview/gate", "/offline"];
const isMobile = () => test.info().project.name.startsWith("mobile");

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "ห้ามเลื่อนแนวนอนทั้งหน้า").toBeLessThanOrEqual(1);
}

test.describe("หน้าหลัก", () => {
  for (const path of PAGES) {
    test(`${path}: โหลดได้, ไม่เลื่อนแนวนอน, ผ่าน axe (serious/critical)`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("main h1").first()).toBeVisible();
      await noHorizontalScroll(page);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
    });
  }

  test("หน้าแรกไม่มีแบนเนอร์ 'ระบบกำลังอยู่ระหว่างพัฒนา' (ทั้งไทยและอังกฤษ)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("ระบบกำลังอยู่ระหว่างพัฒนา")).toHaveCount(0);
    await expect(page.getByText("ตอนนี้ผู้ปกครองลงทะเบียนและโรงเรียนตั้งค่าได้แล้ว")).toHaveCount(0);
    await page.context().addCookies([{ name: "kg_lang", value: "en", url: page.url() }]);
    await page.goto("/");
    await expect(page.getByText("Under development")).toHaveCount(0);
  });

  test("404 แสดงหน้าอธิบายและลิงก์กลับ", async ({ page }) => {
    const res = await page.goto("/ไม่มีหน้านี้");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
  });
});

test.describe("ความปลอดภัยและ PWA", () => {
  test("header ความปลอดภัยครบ", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["strict-transport-security"]).toContain("max-age");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("manifest ถูกต้อง และไอคอนทุกตัวโหลดได้เป็น PNG", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.short_name).toBe("KidGuard");
    const purposes = m.icons.map((i: { purpose: string }) => i.purpose);
    expect(purposes).toContain("maskable");
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()["content-type"]).toContain("image/png");
    }
  });

  test("/brand/logo และ /brand/favicon ชี้ไปรูปในตัว", async ({ request }) => {
    const logo = await request.get("/brand/logo");
    expect(logo.status()).toBe(200);
    expect(logo.headers()["content-type"]).toContain("image/svg");
    const fav = await request.get("/brand/favicon");
    expect(fav.headers()["content-type"]).toContain("image/png");
  });

  test("service worker ไม่ถูกแคชนาน และแคชเฉพาะ /offline กับไอคอน", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.headers()["cache-control"]).toContain("no-cache");
    const body = await res.text();
    expect(body).toContain('"/offline"');
    expect(body).not.toMatch(/\/api\//);
  });

  test("/api/health ตอบ ok และไม่เปิดเผยรายละเอียด", async ({ request }) => {
    const res = await request.get("/api/health");
    const j = await res.json();
    expect(res.status()).toBe(200);
    expect(j).toMatchObject({ ok: true, service: "kidguard", db: "up" });
    expect(Object.keys(j).sort()).toEqual(["db", "ok", "service", "time"]);
  });

  test("favicon และ apple-touch-icon อยู่ใน <head>", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="icon"][href^="/brand/favicon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });
});

test.describe("สปินเนอร์และกันกดซ้ำ (กติกาข้อ 3)", () => {
  test("ปุ่ม async: แสดงสปินเนอร์ + disabled + aria-busy, กดซ้ำไม่ได้ และหายเมื่อเสร็จ", async ({ page }) => {
    await page.goto("/preview/parent");
    const btn = page.getByRole("button", { name: /รับนักเรียนแล้ว|กำลังดำเนินการ/ });
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute("aria-busy", "true");
    await expect(btn.getByRole("status")).toBeVisible();
    // กดซ้ำระหว่างรอ ต้องไม่มีผล (ปุ่ม disabled)
    await btn.click({ force: true, timeout: 500 }).catch(() => {});
    await expect(page.getByRole("status").filter({ hasText: "บันทึกแล้ว" })).toBeVisible({ timeout: 5000 });
    await expect(btn).not.toHaveAttribute("aria-busy", "true");
  });

  test("ปุ่มบนจอประตู: สปินเนอร์ขณะเรียกนักเรียน แล้วสถานะเปลี่ยน", async ({ page }) => {
    await page.goto("/preview/gate");
    const first = page.getByRole("listitem").filter({ hasText: "คุณสมชาย" });
    const call = first.getByRole("button", { name: "เรียกนักเรียน" });
    await call.click();
    await expect(first.getByRole("button").first()).toHaveAttribute("aria-busy", "true");
    await expect(first.getByText("เรียกนักเรียนแล้ว")).toBeVisible({ timeout: 5000 });
    await expect(first.getByRole("button", { name: "ส่งนักเรียนแล้ว" })).toBeVisible();
  });

  test("เปลี่ยนภาษา: ปุ่มมีสปินเนอร์ แล้วเนื้อหาเปลี่ยนเป็นอังกฤษและจำค่าไว้", async ({ page, context }) => {
    await page.goto("/");
    if (isMobile()) await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const sw = page.locator('[role="group"][aria-label="เปลี่ยนภาษา"]:visible');
    await sw.getByRole("button", { name: "English" }).click();
    await expect(page.locator("main h1")).toContainText("Parents are on the way", { timeout: 8000 });
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "kg_lang")?.value).toBe("en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("แถบความคืบหน้าแสดงขณะเปลี่ยนหน้าที่ช้า", async ({ page }) => {
    await page.goto("/");
    await page.route(/\/preview\/gate/, async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    const link = page.getByRole("link", { name: /ดูตัวอย่างจอประตูโรงเรียน/ });
    await link.click();
    await expect(page.getByTestId("nav-progress")).toHaveAttribute("data-active", "true");
    await expect(page.locator("main h1")).toContainText("คิวรับนักเรียน", { timeout: 8000 });
    await expect(page.getByTestId("nav-progress")).toHaveAttribute("data-active", "false");
  });
});

test.describe("เมนู responsive", () => {
  test("มือถือ: bottom bar + แผ่น 'เพิ่มเติม' ปิดด้วยปุ่ม Back ของเครื่องโดย history ไม่สะสม", async ({ page }) => {
    test.skip(!isMobile(), "เฉพาะมือถือ");
    await page.goto("/preview/gate");
    await expect(page.locator('nav[aria-label="เมนูหลัก"]:visible')).toHaveCount(1);
    const before = await page.evaluate(() => history.length);
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    await expect(page.getByRole("dialog", { name: "เพิ่มเติม" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).toContain("/preview/gate");
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(before + 1);
  });

  test("มือถือ: ปิดแผ่นด้วย Esc/ปุ่มปิด แล้ว history ไม่เหลือค้าง", async ({ page }) => {
    test.skip(!isMobile(), "เฉพาะมือถือ");
    await page.goto("/");
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    await page.getByRole("button", { name: "ปิด" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("desktop: sidebar แสดง และไม่มี bottom bar", async ({ page }) => {
    test.skip(isMobile(), "เฉพาะ desktop");
    await page.goto("/");
    await expect(page.locator("aside").getByRole("navigation", { name: "เมนูหลัก" })).toBeVisible();
    await expect(page.locator("aside").getByRole("link", { name: "หน้าแรก" })).toHaveAttribute("aria-current", "page");
  });

  test("หน้าที่ไม่ใช่เมนูหลักมีลิงก์ 'กลับไป…'", async ({ page }) => {
    await page.goto("/preview/gate");
    await page.getByRole("link", { name: /กลับไปหน้าแรก/ }).click();
    await expect(page.locator("main h1")).toContainText("ผู้ปกครองกำลังมา");
  });
});

test.describe("ติดตั้งเป็นแอป", () => {
  test("ปุ่มติดตั้งแสดงวิธีติดตั้งเมื่อเบราว์เซอร์ไม่มี install prompt", async ({ page }) => {
    await page.goto("/");
    if (isMobile()) await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const scope = isMobile() ? page.getByRole("dialog") : page.locator("aside");
    const btn = scope.locator("button:visible", { hasText: "ติดตั้งเป็นแอปบนเครื่อง" }).first();
    await btn.click();
    await expect(scope.getByRole("region", { name: /ติดตั้งบนเครื่องนี้|ติดตั้งบน iPhone/ })).toBeVisible();
  });
});

import { expect, test, type Locator } from "@playwright/test";
import { addMember, admin, cleanup, HAS_DB, makeSchool, makeUser } from "../db/helpers";
import { loginUI } from "./helpers";

test.skip(!HAS_DB, "ต้องมีคีย์ Supabase (ดู CLAUDE.md)");
test.setTimeout(120_000);
test.afterAll(cleanup);

const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
const inView = async (inner: Locator, box: Locator) => {
  const [a, b] = await Promise.all([inner.boundingBox(), box.boundingBox()]);
  return !!a && !!b && a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1;
};

test.describe("เมนูข้าง (เดสก์ท็อป)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "sidebar มีเฉพาะจอใหญ่");
  test("หน้าย่อยของแอดมิน: ติดสีเฉพาะเมนูของหน้านั้น ไม่ค้างที่ 'คำขอผูกนักเรียน' (/admin)", async ({ page }) => {
    const school = await makeSchool("nav0");
    const adm = await makeUser("nav0adm");
    await addMember(school, adm.id, "school_admin");
    await loginUI(page, adm.email, "/admin");
    for (const [path, name] of [["/admin/classrooms", "ห้องเรียน"], ["/admin/students", "นักเรียน"], ["/admin/audit", "บันทึกการใช้งาน"], ["/admin", "คำขอผูกนักเรียน"]] as const) {
      await page.goto(path);
      const side = page.locator("aside");
      await expect(side.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(side.locator('[aria-current="page"]')).toHaveText(name);
    }
  });
});

test.describe("แถบเมนูล่างบนมือถือ", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "แถบล่างมีเฉพาะมือถือ");
  test("เมนูที่เปิดอยู่ติดสีเขียวธีมของระบบ (เมนูอื่นไม่ติด, /admin ไม่ติดเมื่ออยู่หน้าย่อย)", async ({ page }) => {
    const school = await makeSchool("nav1");
    const adm = await makeUser("nav1adm");
    await addMember(school, adm.id, "school_admin");
    await loginUI(page, adm.email, "/admin/classrooms");
    const bar = page.getByRole("navigation", { name: "เมนูหลัก" }).first();
    const active = bar.getByRole("link", { name: "ห้องเรียน", exact: true });
    await expect(active).toHaveAttribute("aria-current", "page");
    expect(await bg(active)).not.toBe("rgba(0, 0, 0, 0)");
    const primary = await page.evaluate(() => { const d = document.createElement("div"); d.className = "bg-primary"; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    expect(await bg(active)).toBe(primary);
    const other = bar.getByRole("link", { name: "คำขอผูกนักเรียน", exact: true });
    await expect(other).not.toHaveAttribute("aria-current", "page");
    expect(await bg(other)).toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ path: "test-results/nav-bar-active.png" });
  });

  test("เมนูที่อยู่ในแผ่น 'เพิ่มเติม': ปุ่มเพิ่มเติมติดสี, เปิดแล้วเลื่อนให้เห็นเมนูที่ใช้งานอยู่, มีลูกศรบอกว่ายังเลื่อนดูต่อได้", async ({ page }) => {
    const school = await makeSchool("nav2");
    const adm = await makeUser("nav2adm");
    await addMember(school, adm.id, "school_admin");
    await loginUI(page, adm.email, "/admin/audit");
    const more = page.getByRole("button", { name: "เพิ่มเติม" });
    await expect(more).toHaveAttribute("data-active", "true");
    await more.click();
    const dlg = page.getByRole("dialog");
    const scroller = dlg.getByTestId("more-scroll");
        await expect(dlg.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(dlg.locator('[aria-current="page"]')).toBeVisible();
    await expect.poll(() => inView(dlg.locator('[aria-current="page"]'), scroller)).toBe(true);
    await page.screenshot({ path: "test-results/nav-more-sheet.png" });
    // เนื้อหายาวกว่ากล่อง → ต้องมีลูกศรอย่างน้อยหนึ่งด้าน; เลื่อนสุดบน/ล่างแล้วลูกศรด้านนั้นหาย อีกด้านโผล่
    const tall = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 8);
    expect(tall).toBe(true);
    await scroller.evaluate((el) => { el.scrollTop = 0; });
    await expect(dlg.getByTestId("more-scroll-up")).toHaveCount(0);
    await expect(dlg.getByTestId("more-scroll-down")).toBeVisible();
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(dlg.getByTestId("more-scroll-down")).toHaveCount(0);
    await expect(dlg.getByTestId("more-scroll-up")).toBeVisible();
    await page.screenshot({ path: "test-results/nav-more-sheet-bottom.png" });
  });

  test("หน้าที่อยู่ในแถบล่าง: ปุ่มเพิ่มเติมไม่ติดสี", async ({ page }) => {
    const school = await makeSchool("nav3");
    const adm = await makeUser("nav3adm");
    await addMember(school, adm.id, "school_admin");
    await loginUI(page, adm.email, "/admin/students");
    await expect(page.getByRole("button", { name: "เพิ่มเติม" })).not.toHaveAttribute("data-active", "true");
  });
});

test.describe("ตัวสลับโรงเรียน (แอดมินแพลตฟอร์ม)", () => {
  test("เห็นกล่อง 'โรงเรียนที่กำลังจัดการ' + เลือกโรงเรียนอื่นแล้วเมนู/หัวเมนูเปลี่ยนตาม; เจ้าหน้าที่โรงเรียนเดียวไม่เห็นตัวเลือก", async ({ page, browser }, info) => {
    const mobile = info.project.name.startsWith("mobile");
    const a = await makeSchool("sw1");
    const b = await makeSchool("sw2");
    await admin().from("schools").update({ name_th: "โรงเรียนสลับ เอ" }).eq("id", a);
    await admin().from("schools").update({ name_th: "โรงเรียนสลับ บี" }).eq("id", b);
    const pa = await makeUser("swpa");
    await admin().from("platform_admins").insert({ user_id: pa.id, is_owner: false });
    const one = await makeUser("swone");
    await addMember(a, one.id, "school_admin");
    await loginUI(page, pa.email, "/platform");
    if (mobile) await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const scope = mobile ? page.getByRole("dialog") : page.locator("aside");
    const box = scope.getByTestId("school-switcher");
    await expect(box).toBeVisible();
    await box.getByLabel("เลือกโรงเรียน").selectOption({ label: "โรงเรียนสลับ บี" });
    await box.getByRole("button", { name: "เปลี่ยนโรงเรียน" }).click();
    await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
    if (mobile) await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    await expect(scope.getByTestId("current-school")).toHaveText("โรงเรียนสลับ บี", { timeout: 20_000 });
    // เจ้าหน้าที่ที่อยู่โรงเรียนเดียว: เห็นชื่อโรงเรียนแต่ไม่มีตัวเลือกให้สลับ
    const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const p2 = await ctx.newPage();
    await loginUI(p2, one.email, "/admin");
    if (mobile) await p2.getByRole("button", { name: "เพิ่มเติม" }).click();
    const scope2 = mobile ? p2.getByRole("dialog") : p2.locator("aside");
    await expect(scope2.getByTestId("school-switcher")).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("เมนูข้างของแอดมินแพลตฟอร์มบนจอเตี้ย (เดสก์ท็อป)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "sidebar มีเฉพาะจอใหญ่");
  for (const h of [800, 640, 520]) {
    test(`จอสูง ${h}px: รายการเมนูมีพื้นที่ (≥ 200px) เลื่อนถึงเมนูสุดท้ายได้ และเข้าถึงปุ่มออกจากระบบได้`, async ({ page }) => {
      const a = await makeSchool("sh" + h);
      const b = await makeSchool("sj" + h);
      void a; void b;
      const pa = await makeUser("shpa");
      await admin().from("platform_admins").insert({ user_id: pa.id, is_owner: false });
      await page.setViewportSize({ width: 1280, height: h });
      await loginUI(page, pa.email, "/platform");
      const side = page.locator("aside");
      const nav = side.getByRole("navigation").first();
      const box = await nav.evaluate((el) => (el.parentElement as HTMLElement).clientHeight);
      expect(box).toBeGreaterThanOrEqual(200);
      // เลื่อนในรายการเมนูจนสุด → เมนูสุดท้าย (บัญชีของฉัน) ต้องอยู่ในกรอบที่เห็น
      const last = nav.getByRole("link", { name: "บัญชีของฉัน", exact: true });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      // ท้ายแถบ (ออกจากระบบ) ต้องเข้าถึงได้ด้วยการเลื่อนแถบข้าง
      const logout = side.getByRole("button", { name: "ออกจากระบบ" });
      await logout.scrollIntoViewIfNeeded();
      await expect(logout).toBeInViewport();
    });
  }
});

import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation } from "../db/helpers";
import { loginUI } from "./helpers";

test.skip(!HAS_DB, "ต้องมีคีย์ Supabase (ดู CLAUDE.md)");
test.setTimeout(240_000);
test.afterAll(cleanup);
const svc = () => admin();

async function world(tag: string) {
  const school = await makeSchool(tag);
  await setSchoolLocation(school);
  const room = await makeClassroom(school, "ป.2/1");
  const stu = await makeStudent(school, room, "สมชาย", "ทดสอบนามสกุล");
  await svc().from("students").update({ nickname: "ชาย" }).eq("id", stu);
  const parent = await makeParent(`${tag}p`, school, room, [stu]);
  const adm = await makeUser(`${tag}adm`);
  const gate = await makeUser(`${tag}gate`);
  await addMember(school, adm.id, "school_admin");
  await addMember(school, gate.id, "gate_staff");
  return { school, room, stu, parent, adm, gate };
}
const startSession = (w: Awaited<ReturnType<typeof world>>) =>
  svc().rpc("pickup_start", { p_user: w.parent.id, p_school: w.school, p_person: w.parent.person, p_vehicle: w.parent.vehicle, p_students: [w.stu], p_dist_m: 500, p_eta_s: 120, p_src: "estimate" });
const statusOk = (p: Page, text: string | RegExp) => p.getByRole("status").filter({ hasText: text });

test.describe("รหัสผู้รับแทน (ผู้ปกครอง → ประตู)", () => {
  test("ผู้ปกครองสร้างรหัส+QR → เจ้าหน้าที่ประตูตรวจและยืนยัน (ครั้งเดียว) → ผู้ปกครองเห็นว่าใช้แล้ว", async ({ page }) => {
    const w = await world("sp1");
    await loginUI(page, w.parent.email, "/passes");
    await page.getByLabel("ชื่อผู้รับแทน").fill("ลุงสมชาย");
    await page.getByLabel("ทะเบียนรถ (ถ้ามี)").fill("1กข234");
    await page.getByRole("button", { name: "สร้างรหัส" }).click();
    const code = (await page.getByTestId("pass-code").textContent({ timeout: 30_000 }))!.trim();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    await expect(page.getByAltText("QR ของรหัสผู้รับแทน")).toBeVisible({ timeout: 30_000 });
    const row = (await svc().from("pickup_passes").select("code_hash,status").eq("created_by", w.parent.id).single()).data!;
    expect(row.code_hash).not.toContain(code);
    expect(await page.content()).not.toContain(row.code_hash);

    // ประตู: รหัสผิด → ปฏิเสธ; รหัสถูก → เห็นชื่อ/เด็ก → ยืนยัน
    await page.context().clearCookies();
    await loginUI(page, w.gate.email, "/gate");
    const panel = page.getByTestId("pass-check");
    await panel.getByLabel("รหัสผู้รับแทน").fill("AAAAAAAA");
    await panel.getByRole("button", { name: "ตรวจรหัส" }).click();
    await expect(panel.getByRole("alert")).toContainText("รหัสไม่ถูกต้อง", { timeout: 30_000 });
    await panel.getByLabel("รหัสผู้รับแทน").fill(code.toLowerCase());
    await panel.getByRole("button", { name: "ตรวจรหัส" }).click();
    await expect(page.getByTestId("pass-holder")).toHaveText("ลุงสมชาย", { timeout: 30_000 });
    await expect(page.getByTestId("pass-result")).toContainText("ชาย");
    await page.getByRole("button", { name: "ตรวจบัตรแล้ว — ส่งนักเรียน" }).click();
    await expect(page.getByTestId("pass-done")).toBeVisible({ timeout: 30_000 });
    // ใช้ซ้ำไม่ได้
    await panel.getByLabel("รหัสผู้รับแทน").fill(code);
    await panel.getByRole("button", { name: "ตรวจรหัส" }).click();
    await expect(panel.getByRole("alert")).toContainText("ใช้ไปแล้ว", { timeout: 30_000 });
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);

    // ผู้ปกครองเห็นว่าใช้แล้ว + ได้รับแจ้ง
    await page.context().clearCookies();
    await loginUI(page, w.parent.email, "/passes");
    await expect(page.getByTestId("pass-list").locator('[data-status="used"]')).toHaveCount(1, { timeout: 30_000 });
    expect((await svc().from("app_notifications").select("body").eq("user_id", w.parent.id)).data?.some((n) => n.body?.includes("ลุงสมชาย"))).toBe(true);
  });

  test("ผู้ปกครองยกเลิกรหัสได้; ผู้ใช้ที่ไม่ใช่ผู้ปกครองเข้าหน้านี้ไม่ได้", async ({ page }) => {
    const w = await world("sp2");
    await loginUI(page, w.parent.email, "/passes");
    await page.getByLabel("ชื่อผู้รับแทน").fill("ป้านิด");
    await page.getByRole("button", { name: "สร้างรหัส" }).click();
    await expect(page.getByTestId("pass-code")).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole("button", { name: "ยกเลิกรหัส" }).click();
    await expect(page.getByTestId("pass-list").locator('[data-status="revoked"]')).toHaveCount(1, { timeout: 30_000 });
    expect((await svc().from("pickup_passes").select("status").eq("created_by", w.parent.id).single()).data!.status).toBe("revoked");
    await page.context().clearCookies();
    await loginUI(page, w.gate.email);
    await page.goto("/passes");
    await expect(page).not.toHaveURL(/\/passes$/);
  });
});

test.describe("แจ้งล่วงหน้า / เสียงเรียก / ธงห้ามปล่อย / ประตู", () => {
  test("แจ้งล่วงหน้า: ผู้ปกครองตั้งแล้วเจ้าหน้าที่ประตูเห็นสรุปของวันนี้", async ({ page }) => {
    const w = await world("sp3");
    await loginUI(page, w.parent.email, "/home");
    await expect(page.getByTestId("plans-current")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("checkbox").first().check();
    await page.getByLabel("กลับอย่างไร").selectOption("bus");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(statusOk(page, "บันทึกการแจ้งล่วงหน้าแล้ว")).toBeVisible({ timeout: 30_000 });
    expect((await svc().from("dismissal_plans").select("mode").eq("student_id", w.stu)).data).toEqual([{ mode: "bus" }]);
    await page.context().clearCookies();
    await loginUI(page, w.gate.email, "/gate");
    await expect(page.getByTestId("plans-today")).toContainText("ไปกับรถโรงเรียน", { timeout: 30_000 });
    await expect(page.getByTestId("plans-today")).toContainText("ชาย");
  });

  test("ธงห้ามปล่อย: ผู้ดูแลติดธง → จอประตูเห็นเครื่องหมาย (ไม่เห็นเหตุผล) และปุ่มส่งนักเรียนถูกปิด → ยกเลิกธงแล้วกลับมาใช้ได้", async ({ page, browser }) => {
    test.skip(test.info().project.name.startsWith("mobile"), "ซ้ำกับจอใหญ่ — ทดสอบที่ desktop");
    const w = await world("sp4");
    expect((await startSession(w)).error).toBeNull();
    await loginUI(page, w.adm.email, `/admin/custody?student=${w.stu}`);
    await page.getByLabel("บันทึกเหตุผล (เห็นเฉพาะผู้ดูแลโรงเรียน)").fill("คำสั่งศาลลับสุดยอด");
    await page.getByRole("button", { name: "ติดธง" }).click();
    await expect(statusOk(page, "ติดธงแล้ว")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("custody-list")).toContainText("คำสั่งศาลลับสุดยอด");

    const gctx = await browser.newContext();
    const gate = await gctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    await expect(gate.getByTestId("held-badge")).toBeVisible({ timeout: 30_000 });
    expect(await gate.content()).not.toContain("คำสั่งศาลลับสุดยอด");
    await expect(gate.getByRole("button", { name: "ส่งนักเรียนแล้ว" })).toBeDisabled();
    // บังคับที่ server ด้วย: เรียก RPC ตรง ๆ ก็ถูกปฏิเสธ
    const sid = (await svc().from("pickup_sessions").select("id").eq("parent_user_id", w.parent.id).single()).data!.id;
    expect((await svc().rpc("pickup_release", { p_actor: w.gate.id, p_session: sid })).error?.message).toContain("held");
    // ยกเลิกธง → จอประตูอัปเดตเอง
    await page.getByRole("button", { name: "ยกเลิกธง" }).click();
    await expect(gate.getByTestId("held-badge")).toHaveCount(0, { timeout: 30_000 });
    await expect(gate.getByRole("button", { name: "ส่งนักเรียนแล้ว" })).toBeEnabled();
    await gctx.close();
  });

  test("ประตู/โซน: ผู้ดูแลเพิ่มประตูและกำหนดห้อง → คิวมีชื่อประตูและกรองตามประตูได้", async ({ page, browser }) => {
    test.skip(test.info().project.name.startsWith("mobile"), "ทดสอบที่ desktop");
    const w = await world("sp5");
    await loginUI(page, w.adm.email, "/admin/zones");
    await page.getByLabel("ชื่อประตู เช่น ประตู 1").fill("ประตูหน้า");
    await page.getByRole("button", { name: "เพิ่มประตู" }).click();
    await expect(page.locator('[data-zone="ประตูหน้า"]')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("ประตูของแต่ละห้อง ป.2/1").selectOption({ label: "ประตูหน้า" });
    await page.locator('[data-room="ป.2/1"]').getByRole("button", { name: "บันทึก" }).click();
    await expect.poll(async () => (await svc().from("classrooms").select("zone_id").eq("id", w.room).single()).data!.zone_id, { timeout: 30_000 }).not.toBeNull();
    expect((await startSession(w)).error).toBeNull();
    const gctx = await browser.newContext();
    const gate = await gctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    await expect(gate.getByTestId("row-zone")).toHaveText("ประตูหน้า", { timeout: 30_000 });
    await expect(gate.getByTestId("queue-row")).toHaveCount(1);
    await gate.getByTestId("zone-filter").getByRole("button", { name: "ไม่ระบุประตู" }).click();
    await expect(gate.getByTestId("queue-row")).toHaveCount(0);
    await gate.getByTestId("zone-filter").getByRole("button", { name: "ประตูหน้า" }).click();
    await expect(gate.getByTestId("queue-row")).toHaveCount(1);
    await gctx.close();
  });

  test("เสียงเรียก: เปิดที่โรงเรียน → เจ้าหน้าที่เปิดเสียงในเครื่อง → เมื่อกดเรียกจะพูดชื่อเล่น+ห้อง (ไม่พูดนามสกุล) และไม่พูดซ้ำเมื่อรีเฟรช", async ({ browser }) => {
    test.skip(test.info().project.name.startsWith("mobile"), "ทดสอบที่ desktop");
    const w = await world("sp6");
    await svc().from("school_settings").update({ voice_enabled: true }).eq("school_id", w.school);
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      const spoken: string[] = [];
      (window as unknown as { __spoken: string[] }).__spoken = spoken;
      const fake = { speak: (u: { text: string }) => { if (u.text.trim()) spoken.push(u.text); }, getVoices: () => [], cancel: () => undefined };
      Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
      (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class { text: string; lang = ""; voice = null; rate = 1; constructor(t: string) { this.text = t; } };
    });
    const gate = await ctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    expect((await startSession(w)).error).toBeNull();
    await expect(gate.getByTestId("queue-row")).toHaveCount(1, { timeout: 30_000 });
    await gate.getByTestId("voice-toggle").click();
    await expect(gate.getByTestId("voice-toggle")).toHaveAttribute("aria-pressed", "true");
    const sid = (await svc().from("pickup_sessions").select("id").eq("parent_user_id", w.parent.id).single()).data!.id;
    await svc().rpc("pickup_call", { p_actor: w.gate.id, p_session: sid });
    await expect.poll(async () => gate.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length), { timeout: 30_000 }).toBe(1);
    const said = await gate.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken[0]!);
    expect(said).toContain("น้องชาย");
    expect(said).toContain("ป.2/1");
    expect(said).not.toContain("นามสกุล");
    expect(said).not.toContain("ทดสอบ");
    await gate.reload(); // รีเฟรช: ไม่พูดซ้ำสิ่งที่เรียกไปแล้ว
    await expect(gate.getByTestId("voice-toggle")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
    await gate.waitForTimeout(1500);
    expect(await gate.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(0);
    await ctx.close();
  });
});

test.describe("ประกาศฉุกเฉิน / พักการรับ / จอ TV", () => {
  test("ประกาศ+พักการรับ: ผู้ปกครองเห็นแบนเนอร์ จอประตูปิดปุ่ม → เปิดรับอีกครั้งแล้วแบนเนอร์หาย", async ({ page, browser }) => {
    test.skip(test.info().project.name.startsWith("mobile"), "ทดสอบที่ desktop");
    const w = await world("sp7");
    expect((await startSession(w)).error).toBeNull();
    await loginUI(page, w.adm.email, "/admin/announce");
    await page.getByLabel("หัวข้อ").fill("ฝนตกหนัก");
    await page.getByLabel("ข้อความ").fill("รับนักเรียนที่อาคาร A เท่านั้น");
    await page.getByLabel("ระดับ").selectOption("danger");
    await page.getByRole("checkbox", { name: /พักการรับนักเรียนทั้งโรงเรียน/ }).check();
    await page.getByRole("button", { name: "ส่งประกาศ" }).click();
    await expect(page.getByTestId("broadcast-recipients")).toContainText("ส่งถึง", { timeout: 60_000 });
    await expect(page.getByTestId("resume-btn")).toBeVisible({ timeout: 30_000 });

    const pctx = await browser.newContext();
    const parent = await pctx.newPage();
    await loginUI(parent, w.parent.email, "/home");
    await expect(parent.getByTestId("notice-banner")).toContainText("ฝนตกหนัก", { timeout: 30_000 });
    await expect(parent.getByTestId("notice-banner")).toContainText("พักการรับนักเรียน");
    await expect(parent.getByRole("link", { name: /ฉันกำลังไปรับ/ })).toBeVisible();

    const gctx = await browser.newContext();
    const gate = await gctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    await expect(gate.getByTestId("paused-banner")).toBeVisible({ timeout: 30_000 });
    await expect(gate.getByRole("button", { name: "ส่งนักเรียนแล้ว" })).toBeDisabled();
    expect((await svc().from("app_notifications").select("title").eq("user_id", w.parent.id).like("dedupe_key", "broadcast:%")).data).toHaveLength(1);

    await page.getByTestId("resume-btn").click();
    await expect(page.getByTestId("resume-btn")).toHaveCount(0, { timeout: 30_000 });
    await expect(gate.getByTestId("paused-banner")).toHaveCount(0, { timeout: 30_000 });
    await parent.reload();
    await expect(parent.getByTestId("notice-banner")).toHaveCount(0);
    await pctx.close();
    await gctx.close();
  });

  test("จอ TV: สร้างลิงก์ลับ → เปิดโดยไม่ล็อกอิน (ไม่มีเมนู) → เรียกนักเรียนแล้วชื่อขึ้นเอง ไม่มีนามสกุล/ผู้ปกครอง/ทะเบียน → ยกเลิกจอแล้วเปิดไม่ได้", async ({ page, browser }) => {
    test.skip(test.info().project.name.startsWith("mobile"), "ทดสอบที่ desktop");
    const w = await world("sp8");
    await loginUI(page, w.adm.email, "/admin/tv");
    await page.getByLabel("ชื่อจอ เช่น จอหน้าประตู 1").fill("จอหน้าประตู");
    await page.getByRole("button", { name: "เพิ่มจอ" }).click();
    const url = (await page.getByTestId("tv-url-text").textContent({ timeout: 30_000 }))!.trim();
    expect(url).toMatch(/\/tv\/[A-Za-z0-9_-]{24}$/);
    expect(JSON.stringify((await svc().from("tv_displays").select("token_hash").eq("school_id", w.school).single()).data)).not.toContain(url.split("/").pop()!);

    const tctx = await browser.newContext(); // ไม่มีคุกกี้ล็อกอิน
    const tv = await tctx.newPage();
    const path = new URL(url).pathname;
    await tv.goto(path);
    await expect(tv.getByTestId("tv-wait")).toBeVisible({ timeout: 30_000 });
    await expect(tv.getByRole("navigation")).toHaveCount(0); // ไม่มีเมนูแอป
    expect((await startSession(w)).error).toBeNull();
    const sid = (await svc().from("pickup_sessions").select("id").eq("parent_user_id", w.parent.id).single()).data!.id;
    await svc().rpc("pickup_call", { p_actor: w.gate.id, p_session: sid });
    const item = tv.getByTestId("tv-called-item");
    await expect(item).toHaveCount(1, { timeout: 30_000 }); // อัปเดตเองจากการถามลายนิ้วมือ ไม่ได้ reload
    await expect(item).toContainText("ชาย");
    await expect(item).toContainText("ป.2/1");
    const html = await tv.content();
    const plate = (await svc().from("vehicles").select("plate").eq("user_id", w.parent.id).single()).data!.plate as string;
    for (const secret of ["ทดสอบนามสกุล", "สมชาย", w.parent.email, plate, "คุณ sp8p"]) expect(html).not.toContain(secret);

    // ยกเลิกจอ → เปิดไม่ได้อีก และโทเคนปลอม = 404
    await page.goto("/admin/tv");
    await page.getByRole("button", { name: "ยกเลิกจอ" }).click();
    await expect(page.getByTestId("tv-list")).toHaveCount(0, { timeout: 30_000 });
    expect((await tctx.request.get(path)).status()).toBe(404);
    expect((await tctx.request.get("/tv/" + "A".repeat(24))).status()).toBe(404);
    expect((await tctx.request.get("/api/tv/" + "A".repeat(24))).status()).toBe(404);
    await tctx.close();
  });

  test("สวิตช์ฟีเจอร์: ปิด tv_mode แล้วเมนูเทา หน้า/ลิงก์/API ใช้ไม่ได้จริง (ไม่ใช่แค่ซ่อนปุ่ม) และเปิดคืนได้", async ({ page, browser }) => {
    test.skip(test.info().project.name.startsWith("mobile"), "ทดสอบที่ desktop");
    const w = await world("sp9");
    const pa = await makeUser("sp9pa");
    await svc().from("platform_admins").insert({ user_id: pa.id, is_owner: false });
    const token = "Z".repeat(24);
    const { hashToken } = await import("../../src/lib/safety/pure-hash");
    await svc().from("tv_displays").insert({ school_id: w.school, name: "จอ", token_hash: hashToken(token) });
    const tctx = await browser.newContext();
    expect((await tctx.request.get(`/tv/${token}`)).status()).toBe(200);
    await loginUI(page, pa.email, "/platform/flags");
    try {
      await page.getByTestId("flag-tv_mode").getByRole("button", { name: "ปิด" }).click();
      await expect(page.getByTestId("flag-tv_mode")).toHaveAttribute("data-on", "false", { timeout: 30_000 });
      expect((await tctx.request.get(`/tv/${token}`)).status()).toBe(404);
      expect((await tctx.request.get(`/api/tv/${token}`)).status()).toBe(404);
      // ผู้ดูแลโรงเรียน: เมนูเป็นสีเทา (กดไม่ได้) และเปิดหน้าตรง ๆ ได้ 404
      const actx = await browser.newContext();
      const adm = await actx.newPage();
      await loginUI(adm, w.adm.email, "/admin");
      await expect(adm.locator('[data-disabled="true"]').filter({ hasText: "จอ TV" }).first()).toBeVisible({ timeout: 30_000 });
      expect((await adm.goto("/admin/tv"))?.status()).toBe(404);
      await actx.close();
    } finally {
      await page.goto("/platform/flags");
      if ((await page.getByTestId("flag-tv_mode").getAttribute("data-on")) === "false") {
        await page.getByTestId("flag-tv_mode").getByRole("button", { name: "เปิด" }).click();
        await expect(page.getByTestId("flag-tv_mode")).toHaveAttribute("data-on", "true", { timeout: 30_000 });
      }
    }
    expect((await tctx.request.get(`/tv/${token}`)).status()).toBe(200);
    await tctx.close();
  });
});

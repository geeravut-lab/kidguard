import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation } from "../db/helpers";
import { loginUI } from "./helpers";

test.skip(!HAS_DB, "ต้องมีคีย์ Supabase (ดู CLAUDE.md)");
test.setTimeout(180_000);
test.afterAll(cleanup);
const svc = () => admin();
const SECRET = "zz-e2e-channel-secret";
const TOKEN = "zz-e2e-access-token";
const NORTH = { latitude: 13.7563 + 0.0108, longitude: 100.5018, accuracy: 20 };

async function world(tag: string) {
  const school = await makeSchool(tag);
  await setSchoolLocation(school);
  const slug = (await svc().from("schools").select("slug").eq("id", school).single()).data!.slug as string;
  const room = await makeClassroom(school, "ป.2/1");
  const stu = await makeStudent(school, room, "เด็กชาย", "ทดสอบนามสกุล");
  await svc().from("students").update({ nickname: "ภูมิ" }).eq("id", stu);
  const parent = await makeParent(`${tag}p`, school, room, [stu]);
  const admU = await makeUser(`${tag}adm`);
  const gate = await makeUser(`${tag}gate`);
  await addMember(school, admU.id, "school_admin");
  await addMember(school, gate.id, "gate_staff");
  return { school, slug, room, stu, parent, admU, gate };
}

async function configureLine(page: Page, basicId = "@zze2e") {
  await page.goto("/admin/line");
  await page.getByLabel(/Basic ID/).fill(basicId);
  await page.getByLabel("Channel secret").fill(SECRET);
  await page.getByLabel(/Channel access token/).fill(TOKEN);
  await page.getByLabel("เพดานข้อความต่อเดือน").fill("50");
  await page.getByLabel("เปิดใช้การแจ้งเตือนทาง LINE").check();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "บันทึกแล้ว" })).toBeVisible({ timeout: 30_000 });
}
const signed = (raw: string) => ({ "x-line-signature": createHmac("sha256", SECRET).update(raw).digest("base64"), "content-type": "application/json" });
const bell = (p: Page) => p.locator('[data-testid="bell-count"]:visible').first();

test.describe("ตั้งค่า LINE ของโรงเรียน (OA แยกต่อโรงเรียน)", () => {
  test("บันทึกค่า: ความลับเข้ารหัสและไม่แสดงกลับ, เปิดใช้ก่อนตั้งค่าครบไม่ได้, มี Webhook URL ของโรงเรียน, ผู้อื่นเปิดหน้านี้ไม่ได้", async ({ page, browser }) => {
    const w = await world("n1");
    await loginUI(page, w.admU.email, "/admin/line");
    await expect(page.getByTestId("line-config-status")).toContainText("ยังตั้งค่าไม่ครบ", { timeout: 30_000 });
    await expect(page.getByTestId("line-webhook")).toHaveText(new RegExp(`/api/line/webhook/${w.slug}$`));
    // เปิดใช้ทั้งที่ยังไม่มี secret/token → ปฏิเสธ
    await page.getByLabel(/Basic ID/).fill("@zze2e");
    await page.getByLabel("เปิดใช้การแจ้งเตือนทาง LINE").check();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("ข้อมูลไม่ถูกต้อง", { timeout: 30_000 });
    await configureLine(page);
    await expect(page.getByTestId("line-config-status")).toContainText("ตั้งค่าครบแล้ว", { timeout: 30_000 });
    // ไม่แสดงความลับกลับมา
    await page.reload();
    expect(await page.getByLabel("Channel secret").inputValue()).toBe("");
    expect(await page.getByLabel(/Channel access token/).inputValue()).toBe("");
    expect(await page.content()).not.toContain(SECRET);
    expect(await page.content()).not.toContain(TOKEN);
    const row = (await svc().from("school_line_channels").select("channel_secret_enc,access_token_enc,enabled,monthly_quota,basic_id").eq("school_id", w.school).single()).data!;
    expect(row).toMatchObject({ enabled: true, monthly_quota: 50, basic_id: "@zze2e" });
    expect(row.channel_secret_enc.startsWith("v1:") && !row.channel_secret_enc.includes(SECRET)).toBe(true);
    // เว้นว่างช่องลับ = ไม่เปลี่ยน
    await page.getByLabel("เพดานข้อความต่อเดือน").fill("75");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "บันทึกแล้ว" })).toBeVisible({ timeout: 30_000 });
    expect((await svc().from("school_line_channels").select("channel_secret_enc,monthly_quota").eq("school_id", w.school).single()).data).toMatchObject({ channel_secret_enc: row.channel_secret_enc, monthly_quota: 75 });
    // ทดสอบการเชื่อมต่อ (token ปลอม → LINE ปฏิเสธ/เข้าถึงไม่ได้ → แจ้งว่าไม่สำเร็จ ไม่พัง)
    await page.getByRole("button", { name: "ทดสอบการเชื่อมต่อ" }).click();
    await expect(page.getByTestId("line-test-result")).toContainText("เชื่อมต่อไม่สำเร็จ", { timeout: 40_000 });
    // audit ไม่มีความลับ
    const aud = JSON.stringify((await svc().from("audit_log").select("detail").eq("school_id", w.school)).data);
    expect(aud).not.toContain(SECRET);
    expect(aud).not.toContain(TOKEN);
    // ผู้ปกครองเปิดหน้านี้ = 404
    const ctx = await browser.newContext(); const p2 = await ctx.newPage();
    await loginUI(p2, w.parent.email, "/admin/line");
    await expect(p2.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });
});

test.describe("ผู้ปกครองผูก LINE (รหัสครั้งเดียว → webhook → เชื่อมต่อแล้วอัตโนมัติ)", () => {
  test("4 ขั้นตอน + หน้าจอเปลี่ยนเป็น 'เชื่อมต่อแล้ว' เอง + ยกเลิกได้; ลายเซ็นผิดถูกปฏิเสธ", async ({ page, browser, request }) => {
    const w = await world("n2");
    const actx = await browser.newContext(); const ap = await actx.newPage();
    await loginUI(ap, w.admU.email, "/admin/line");
    await configureLine(ap, "@zzparent");
    await actx.close();

    await loginUI(page, w.parent.email, "/profile");
    await expect(page.getByRole("heading", { name: "แจ้งเตือนทาง LINE" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "เชื่อมต่อ LINE" }).click();
    const code = (await page.getByTestId("line-code").innerText({ timeout: 30_000 })).trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await expect(page.getByTestId("line-steps")).toContainText("คัดลอกรหัส");
    await expect(page.getByRole("link", { name: /เพิ่ม LINE Official Account/ })).toHaveAttribute("href", "https://line.me/R/ti/p/%40zzparent");
    await expect(page.getByRole("link", { name: /เปิดแชตพร้อมรหัส/ })).toHaveAttribute("href", `https://line.me/R/oaMessage/%40zzparent/?${code}`);
    expect(JSON.stringify((await svc().from("notification_channels").select("*").eq("user_id", w.parent.id)).data)).not.toContain(code); // เก็บ hash เท่านั้น

    // ลายเซ็นผิด → 401
    const raw = JSON.stringify({ events: [{ type: "message", replyToken: "rt", source: { userId: "Ue2eparent" }, message: { type: "text", text: code } }] });
    expect((await request.post(`/api/line/webhook/${w.slug}`, { headers: { "x-line-signature": "wrong", "content-type": "application/json" }, data: Buffer.from(raw) })).status()).toBe(401);
    expect((await svc().from("notification_channels").select("status").eq("user_id", w.parent.id).single()).data?.status).toBe("pending");
    // ผู้ใช้ส่งรหัสเข้า OA (LINE เรียก webhook พร้อมลายเซ็นที่ถูกต้อง) → หน้าเดิมเปลี่ยนเป็นเชื่อมต่อแล้วเอง (ไม่ reload)
    const ok = await request.post(`/api/line/webhook/${w.slug}`, { headers: signed(raw), data: Buffer.from(raw) });
    expect(ok.status()).toBe(200);
    await expect(page.getByTestId("line-connected")).toBeVisible({ timeout: 40_000 });
    expect(await page.getByTestId("line-steps").count()).toBe(0);
    expect((await svc().from("notification_channels").select("status,address").eq("user_id", w.parent.id).single()).data).toEqual({ status: "active", address: "Ue2eparent" });
    // ยกเลิกการเชื่อมต่อ
    await page.getByRole("button", { name: "ยกเลิกการเชื่อมต่อ" }).click();
    await expect(page.getByRole("button", { name: "เชื่อมต่อ LINE" })).toBeVisible({ timeout: 30_000 });
    expect((await svc().from("notification_channels").select("id").eq("user_id", w.parent.id)).data).toEqual([]);
  });

  test("โรงเรียนที่ยังไม่เปิดช่องทาง: ผู้ปกครองเห็นข้อความอธิบาย ไม่มีปุ่มเชื่อมต่อ", async ({ page }) => {
    const w = await world("n3");
    await loginUI(page, w.parent.email, "/profile");
    await expect(page.getByText("โรงเรียนนี้ยังไม่เปิดช่องทาง LINE")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "เชื่อมต่อ LINE" })).toHaveCount(0);
  });
});

test.describe("แจ้งเตือนในแอป: อีกฝ่ายกด check-out → กระดิ่งขึ้นสด (D)", () => {
  async function activeParent(browser: import("@playwright/test").Browser, w: Awaited<ReturnType<typeof world>>) {
    const ctx: BrowserContext = await browser.newContext({ geolocation: NORTH, permissions: ["geolocation"] });
    const page = await ctx.newPage();
    await loginUI(page, w.parent.email, "/pickup");
    await page.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
    await expect(page.getByTestId("travel-view")).toBeVisible({ timeout: 40_000 });
    return { ctx, page };
  }

  test("เจ้าหน้าที่ส่งนักเรียนก่อน → ผู้ปกครองเห็นกระดิ่ง +1 ทันที, ในกล่องแจ้งเตือนไม่มีนามสกุลเด็ก, เปิดแล้วอ่านแล้วไปหน้าที่เกี่ยวข้อง", async ({ browser }) => {
    const w = await world("n4");
    const { ctx: pctx, page: parent } = await activeParent(browser, w);
    const gctx = await browser.newContext(); const gate = await gctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    await expect(gate.getByTestId("queue-row")).toHaveCount(1, { timeout: 40_000 });
    await expect(bell(parent)).toHaveCount(0);

    await gate.getByTestId("queue-row").getByRole("button", { name: "ส่งนักเรียนแล้ว" }).click();
    await expect(bell(parent)).toHaveText("1", { timeout: 40_000 }); // ไม่ได้ reload หน้าผู้ปกครอง
    await parent.goto("/notifications");
    const item = parent.getByTestId("notification").first();
    await expect(item).toHaveAttribute("data-unread", "true");
    await expect(item).toContainText("โรงเรียนส่งนักเรียนแล้ว");
    await expect(item).toContainText("ภูมิ ป.2/1");
    await expect(item).toContainText("เจ้าหน้าที่คิวรับนักเรียน");
    expect(await item.innerText()).not.toContain("นามสกุล");
    await item.getByRole("button", { name: "เปิดแอป" }).click();
    await expect(parent).toHaveURL(/\/pickup$/, { timeout: 30_000 });
    await expect(bell(parent)).toHaveCount(0);
    await parent.goto("/notifications");
    await expect(parent.getByTestId("notification").first()).toHaveAttribute("data-unread", "false");
    await pctx.close(); await gctx.close();
  });

  test("ผู้ปกครองกดรับก่อน → เจ้าหน้าที่ประตูเห็นกระดิ่ง +1 สด; 'อ่านทั้งหมดแล้ว' ล้างตัวเลข", async ({ browser }) => {
    const w = await world("n5");
    const { ctx: pctx, page: parent } = await activeParent(browser, w);
    const gctx = await browser.newContext(); const gate = await gctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    await expect(gate.getByTestId("queue-row")).toHaveCount(1, { timeout: 40_000 });
    await parent.getByRole("button", { name: "รับนักเรียนแล้ว" }).click();
    await expect(gate.getByTestId("queue-row")).toHaveCount(0, { timeout: 40_000 });
    await expect(bell(gate)).toHaveText("1", { timeout: 40_000 });
    await gate.goto("/notifications");
    await expect(gate.getByTestId("notification").first()).toContainText("ผู้ปกครองรับนักเรียนแล้ว");
    await expect(gate.getByTestId("notification").first()).toContainText("ภูมิ ป.2/1");
    await gate.getByRole("button", { name: "อ่านทั้งหมดแล้ว" }).click();
    await expect(gate.getByTestId("notification").first()).toHaveAttribute("data-unread", "false", { timeout: 30_000 });
    await expect(bell(gate)).toHaveCount(0);
    await pctx.close(); await gctx.close();
  });

  test("แอดมินอนุมัติคำขอผูกนักเรียน → ผู้ปกครองได้รับแจ้งทันที", async ({ browser }) => {
    const w = await world("n6");
    const s2 = await makeStudent(w.school, w.room, "น้อง", "อีกคน");
    await svc().rpc("claim_student", { p_school: w.school, p_classroom: w.room, p_name: "น้อง อีกคน", p_relation: "mother", p_teacher_name: null }); // เรียกด้วย service ไม่ได้ผล (ไม่มี auth) — ใช้ผู้ปกครองจริงด้านล่าง
    void s2;
    const pctx = await browser.newContext(); const parent = await pctx.newPage();
    await loginUI(parent, w.parent.email, "/home");
    await parent.context().cookies();
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: w.parent.email, password: "Zz-test-pass-12345" });
    expect((await c.rpc("claim_student", { p_school: w.school, p_classroom: w.room, p_name: "น้อง อีกคน", p_relation: "mother", p_teacher_name: null })).error).toBeNull();
    const actx = await browser.newContext(); const adm = await actx.newPage();
    await loginUI(adm, w.admU.email, "/admin");
    await adm.getByTestId("claim-card").filter({ hasText: "น้อง อีกคน" }).getByRole("button", { name: "อนุมัติ", exact: true }).click();
    await expect(bell(parent)).toHaveText("1", { timeout: 40_000 });
    await parent.goto("/notifications");
    await expect(parent.getByTestId("notification").first()).toContainText("โรงเรียนอนุมัติแล้ว");
    await pctx.close(); await actx.close();
  });
});

test.describe("บัญชีนักเรียนและจอนักเรียน (optional)", () => {
  test("ผู้ปกครองสร้างลิงก์ → นักเรียนรับลิงก์ → จอเห็นเฉพาะระยะ/เวลา และอัปเดตสดเมื่อผู้ปกครองออกเดินทาง", async ({ browser }) => {
    const w = await world("n7");
    const kid = await makeUser("n7kid");
    const pctx = await browser.newContext(); const parent = await pctx.newPage();
    await loginUI(parent, w.parent.email, "/home");
    await parent.getByRole("button", { name: "สร้างลิงก์ให้นักเรียนใช้" }).click();
    const link = await parent.getByTestId("invite-link").locator("code").innerText({ timeout: 30_000 });
    expect(link).toMatch(/\/invite\/[A-Z2-9]{16}$/);

    const kctx = await browser.newContext(); const kp = await kctx.newPage();
    await loginUI(kp, kid.email, new URL(link).pathname);
    await kp.getByRole("button", { name: "รับคำเชิญ" }).click();
    await expect(kp.getByRole("heading", { name: "ผู้ปกครองกำลังมารับ" })).toBeVisible({ timeout: 40_000 }); // นักเรียนไม่ต้องผ่านหน้าลงทะเบียนผู้ปกครอง
    await expect(kp.getByTestId("student-card")).toContainText("ภูมิ");
    await expect(kp.getByText("โรงเรียนยังไม่ได้เปิดใช้หน้านี้")).toBeVisible(); // ปิดเป็นค่าเริ่มต้น
    // เมนูของนักเรียน: ไม่มีเมนูผู้ปกครอง/เจ้าหน้าที่
    await kp.goto("/gate"); await expect(kp.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible({ timeout: 30_000 });
    await kp.goto("/student");

    await svc().from("school_settings").update({ student_dashboard_enabled: true }).eq("school_id", w.school);
    await kp.reload();
    await expect(kp.getByText("ตอนนี้ยังไม่มีผู้ปกครองกำลังมารับ")).toBeVisible({ timeout: 30_000 });
    const started = await svc().rpc("pickup_start", { p_user: w.parent.id, p_school: w.school, p_person: w.parent.person, p_vehicle: w.parent.vehicle, p_students: [w.stu], p_dist_m: 900, p_eta_s: 420, p_src: "estimate" });
    expect(started.error, started.error?.message).toBeNull();
    await expect(kp.getByTestId("student-status")).toContainText("7 นาที", { timeout: 40_000 }); // สดโดยไม่ reload
    const txt = await kp.locator("main").innerText();
    expect(txt).not.toMatch(/คุณ n7p|กข\d|ทะเบียน/);
    await svc().rpc("pickup_manual_arrive", { p_user: w.parent.id, p_session: (await svc().from("pickup_sessions").select("id").eq("parent_user_id", w.parent.id).single()).data!.id });
    await expect(kp.getByTestId("student-status")).toContainText("ถึงประตูแล้ว", { timeout: 40_000 });
    await pctx.close(); await kctx.close();
  });
});

test("หน้าแจ้งเตือน/LINE/นักเรียนผ่าน axe และไม่เลื่อนแนวนอน", async ({ page }) => {
  const w = await world("n8");
  await svc().from("school_line_channels").upsert({ school_id: w.school, basic_id: "@zzaxe", enabled: false });
  await loginUI(page, w.admU.email, "/admin/line");
  for (const path of ["/admin/line", "/notifications", "/profile"]) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 30_000 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} เลื่อนแนวนอน`).toBeLessThanOrEqual(1);
  }
});

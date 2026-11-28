import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, PASSWORD, setSchoolLocation } from "../db/helpers";
import { loginUI } from "./helpers";

test.skip(!HAS_DB, "ต้องมีคีย์ Supabase (ดู CLAUDE.md)");
test.setTimeout(240_000);
test.afterAll(cleanup);
const svc = () => admin();

test.describe("CSP แบบ nonce", () => {
  test("ทุกหน้าสำคัญโหลดและทำงานได้ภายใต้ CSP เข้ม: ไม่มี violation, สคริปต์ inline ไม่มี 'unsafe-inline', nonce เปลี่ยนทุกคำขอ", async ({ page, request }) => {
    const r1 = await request.get("/login");
    const r2 = await request.get("/login");
    const csp1 = r1.headers()["content-security-policy"]!;
    const csp2 = r2.headers()["content-security-policy"]!;
    const nonce = (c: string) => /'nonce-([^']+)'/.exec(c)?.[1];
    expect(nonce(csp1)).toBeTruthy();
    expect(nonce(csp1)).not.toBe(nonce(csp2));
    const script = /script-src([^;]*)/.exec(csp1)![1]!;
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(csp1).toContain("frame-ancestors 'none'");
    expect(csp1).toContain("object-src 'none'");
    // สคริปต์ inline ของ Next ในหน้า HTML ต้องมี nonce เดียวกับหัว
    const html = await r1.text();
    expect(html).toContain(`nonce="${nonce(csp1)}"`);

    const violations: string[] = [];
    page.on("console", (m) => {
      if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) violations.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => violations.push("pageerror: " + e.message.slice(0, 160)));
    for (const p of ["/", "/login", "/signup", "/privacy", "/terms", "/preview/parent", "/preview/gate", "/offline"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
    }
    // หน้าที่ต้องใช้ JS (ฟอร์ม + spinner) ยังทำงาน: ส่งฟอร์มผิดแล้วต้องเห็นข้อความผิดพลาด (แปลว่า hydration + server action ทำงานภายใต้ CSP)
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill("nobody@kidguard.test");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill("wrong-password-1");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toBeVisible({ timeout: 30_000 });
    expect(violations).toEqual([]);
  });

  test("หัวความปลอดภัยครบ: HSTS, nosniff, frame, referrer, permissions, COOP", async ({ request }) => {
    const h = (await request.get("/login")).headers();
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("geolocation=(self)");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("จำกัดอัตรากันเดารหัส", () => {
  test("เข้าสู่ระบบผิดซ้ำ ๆ ต่ออีเมลเดียว: หลังเกินเพดานได้ข้อความ 'ทำรายการถี่เกินไป' (แม้ใส่รหัสถูก)", async ({ page }) => {
    const email = `zz_test_rl_${Date.now().toString(36)}@kidguard.test`;
    const { error } = await svc().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    expect(error).toBeNull();
    await page.goto("/login");
    let limited = false;
    for (let i = 0; i < 14 && !limited; i++) {
      await page.getByLabel("อีเมล").fill(email);
      await page.getByLabel("รหัสผ่าน", { exact: true }).fill("wrong-password-" + i);
      await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
      const alert = page.locator('main [role="alert"]');
      await expect(alert).toBeVisible({ timeout: 30_000 });
      limited = /ถี่เกินไป/.test((await alert.textContent()) ?? "");
      if (!limited) await page.reload();
    }
    expect(limited).toBe(true);
    // ล้างโควตาของอีเมลนี้เพื่อไม่ให้ค้างข้ามเทสต์
    await svc().from("rate_limits").delete().like("key", "login:em:%");
  });
});

test.describe("PDPA: ขอดูข้อมูล/ลบบัญชีของตัวเอง", () => {
  test("ดาวน์โหลดข้อมูลของตัวเองได้ครบและไม่มีของคนอื่น; ไม่ล็อกอิน = 401", async ({ page, request }) => {
    const school = await makeSchool("pd1");
    await setSchoolLocation(school);
    const room = await makeClassroom(school, "ป.1/1");
    const s1 = await makeStudent(school, room, "เอ", "หนึ่ง");
    const s2 = await makeStudent(school, room, "บี", "สอง");
    const me = await makeParent("pd1a", school, room, [s1]);
    const other = await makeParent("pd1b", school, room, [s2]);
    await svc().from("app_notifications").insert({ user_id: me.id, kind: "info", title: "แจ้งเตือนของฉัน", created_at: new Date().toISOString() });
    await svc().from("app_notifications").insert({ user_id: other.id, kind: "info", title: "ของคนอื่น-ห้ามเห็น", created_at: new Date().toISOString() });
    expect((await request.get("/api/me/export")).status()).toBe(401);
    await loginUI(page, me.email, "/profile");
    await expect(page.getByTestId("mydata-download")).toBeVisible({ timeout: 30_000 });
    const res = await page.request.get("/api/me/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("attachment");
    expect(res.headers()["cache-control"]).toContain("no-store");
    const j = await res.json();
    expect(j.account.email).toBe(me.email);
    expect(j.guardians.length).toBeGreaterThanOrEqual(1);
    expect(j.vehicles.length).toBeGreaterThanOrEqual(1);
    expect(j.notifications.some((n: { title: string }) => n.title === "แจ้งเตือนของฉัน")).toBe(true);
    const text = JSON.stringify(j);
    expect(text).not.toContain("ของคนอื่น-ห้ามเห็น");
    expect(text).not.toContain(other.email);
    expect(text).not.toMatch(/password|access_token|refresh_token|code_hash|secret/i);
    expect((await svc().from("audit_log").select("id").eq("action", "auth.data_export").eq("actor_id", me.id)).data?.length).toBe(1);
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });

  test("ลบบัญชี: ต้องพิมพ์ DELETE + รหัสผ่าน; ผู้ดูแลคนสุดท้ายลบไม่ได้; ลบแล้วข้อมูลหายและเข้าสู่ระบบไม่ได้ (audit คงอยู่)", async ({ page }) => {
    const school = await makeSchool("pd2");
    const room = await makeClassroom(school, "ป.2/1");
    const s1 = await makeStudent(school, room, "ซี", "สาม");
    const me = await makeParent("pd2a", school, room, [s1]);
    const adm = await makeUser("pd2adm");
    await addMember(school, adm.id, "school_admin");

    // ผู้ดูแลคนสุดท้าย: ลบไม่ได้
    await loginUI(page, adm.email, "/profile");
    const form = page.getByTestId("delete-account-form");
    await form.getByLabel("พิมพ์ DELETE เพื่อยืนยัน").fill("DELETE");
    await form.getByLabel("รหัสผ่านปัจจุบัน (ถ้ามี)").fill(PASSWORD);
    await form.getByRole("button", { name: "ลบบัญชีถาวร" }).click();
    await expect(form.getByRole("alert")).toContainText("ผู้ดูแลคนสุดท้าย", { timeout: 30_000 });
    expect((await svc().auth.admin.getUserById(adm.id)).data.user).toBeTruthy();

    // ผู้ปกครอง: ไม่พิมพ์ DELETE / รหัสผิด = ไม่ลบ
    await page.context().clearCookies();
    await loginUI(page, me.email, "/profile");
    const f2 = page.getByTestId("delete-account-form");
    await f2.getByLabel("พิมพ์ DELETE เพื่อยืนยัน").fill("delete me");
    await f2.getByLabel("รหัสผ่านปัจจุบัน (ถ้ามี)").fill(PASSWORD);
    await f2.getByRole("button", { name: "ลบบัญชีถาวร" }).click();
    await expect(f2.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await page.reload();
    const f3 = page.getByTestId("delete-account-form");
    await f3.getByLabel("พิมพ์ DELETE เพื่อยืนยัน").fill("DELETE");
    await f3.getByLabel("รหัสผ่านปัจจุบัน (ถ้ามี)").fill("รหัสผิด-12345");
    await f3.getByRole("button", { name: "ลบบัญชีถาวร" }).click();
    await expect(f3.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    expect((await svc().auth.admin.getUserById(me.id)).data.user).toBeTruthy();

    // ถูกต้อง → ลบ
    await page.reload();
    const f4 = page.getByTestId("delete-account-form");
    await f4.getByLabel("พิมพ์ DELETE เพื่อยืนยัน").fill("DELETE");
    await f4.getByLabel("รหัสผ่านปัจจุบัน (ถ้ามี)").fill(PASSWORD);
    await f4.getByRole("button", { name: "ลบบัญชีถาวร" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expect.poll(async () => (await svc().auth.admin.getUserById(me.id)).data.user, { timeout: 30_000 }).toBeNull();
    expect((await svc().from("guardian_links").select("id").eq("user_id", me.id)).data).toHaveLength(0);
    expect((await svc().from("guardian_persons").select("id").eq("user_id", me.id)).data).toHaveLength(0);
    expect((await svc().from("vehicles").select("id").eq("user_id", me.id)).data).toHaveLength(0);
    // นักเรียนของโรงเรียนยังอยู่; audit ยังอยู่ (ไม่มีข้อมูลส่วนบุคคล)
    expect((await svc().from("students").select("id").eq("id", s1)).data).toHaveLength(1);
    expect((await svc().from("audit_log").select("id").eq("action", "auth.account_delete").eq("actor_id", me.id)).data?.length).toBe(1);
    // เข้าสู่ระบบด้วยบัญชีเดิมไม่ได้
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(me.email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toBeVisible({ timeout: 30_000 });
  });

  test("หน้านโยบายและข้อตกลงครบหัวข้อ (ผู้ควบคุม, ใครเห็นอะไร, บริการภายนอก, ระยะเก็บ, สิทธิ, ความปลอดภัย) และผ่าน axe", async ({ page }) => {
    await page.goto("/privacy");
    for (const h of ["ผู้ควบคุมข้อมูลและวัตถุประสงค์", "ใครเห็นข้อมูลอะไร", "บริการภายนอกที่เกี่ยวข้อง", "ระยะเวลาเก็บรักษา", "สิทธิของคุณและวิธีใช้สิทธิ", "ความปลอดภัยของข้อมูล"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
    expect(await new AxeBuilder({ page }).analyze().then((r) => r.violations.filter((v) => v.impact === "critical" || v.impact === "serious"))).toEqual([]);
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "ข้อจำกัดของระบบ" })).toBeVisible();
  });
});

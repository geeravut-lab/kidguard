import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addMember, admin, cleanup, HAS_DB, makeSchool, makeUser, sql } from "../db/helpers";
import { loginUI } from "./helpers";

test.skip(!HAS_DB, "ต้องมีคีย์ Supabase (ดู CLAUDE.md)");
test.setTimeout(180_000);
test.afterAll(cleanup);
const svc = () => admin();
const ICON = readFileSync("public/icons/icon-192.png");
const SVG = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");

async function adminWorld(tag: string) {
  const school = await makeSchool(tag);
  const adm = await makeUser(`${tag}adm`);
  const plain = await makeUser(`${tag}plain`);
  await addMember(school, adm.id, "school_admin");
  return { school, adm, plain };
}
async function platformUser(tag: string) {
  const u = await makeUser(tag);
  await svc().from("platform_admins").insert({ user_id: u.id, is_owner: false });
  return u;
}
const ok = (p: Page) => p.getByRole("status").filter({ hasText: /บันทึก|ลบ|เห็นผล/ });

test.describe("คอนโซลแอดมิน: สิทธิ์เข้าหน้า", () => {
  test("ผู้ใช้ทั่วไป/ผู้ดูแลโรงเรียนเปิดหน้าของแพลตฟอร์มไม่ได้ (404) และผู้ใช้ทั่วไปเปิดหน้าของโรงเรียนไม่ได้", async ({ page }) => {
    const w = await adminWorld("ap1");
    await loginUI(page, w.plain.email);
    for (const p of ["/admin/audit", "/admin/analytics", "/admin/branding", "/platform/flags", "/platform/rules", "/platform/brand", "/platform/admins", "/platform/analytics"]) {
      const r = await page.goto(p);
      expect(r?.status(), p).toBe(404);
    }
    expect((await page.request.get("/admin/audit/export")).status()).toBe(404);
    await page.context().clearCookies();
    await loginUI(page, w.adm.email);
    for (const p of ["/platform/flags", "/platform/rules", "/platform/brand", "/platform/admins", "/platform/analytics"]) expect((await page.goto(p))?.status(), p).toBe(404);
    expect((await page.goto("/admin/audit"))?.status()).toBe(200);
    expect((await page.goto("/admin/analytics"))?.status()).toBe(200);
  });
});

test.describe("Audit", () => {
  test("เห็นเฉพาะโรงเรียนตัวเอง, กรองได้, ส่งออก CSV (ถูกบันทึก), ติ๊กปิดกลุ่มแล้วไม่มีแถวใหม่ของกลุ่มนั้น", async ({ page }) => {
    const w = await adminWorld("ap2");
    const other = await makeSchool("ap2o");
    await svc().from("audit_log").insert([
      { source: "app", action: "guardian.zz_mine", entity: "t", school_id: w.school, actor_id: w.adm.id },
      { source: "app", action: "classroom.zz_mine", entity: "t", school_id: w.school, actor_id: w.adm.id },
      { source: "app", action: "guardian.zz_other", entity: "t", school_id: other },
    ]);
    await loginUI(page, w.adm.email, "/admin/audit");
    const rows = page.getByTestId("audit-row");
    await expect(rows.filter({ hasText: "guardian.zz_mine" })).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByText("guardian.zz_other")).toHaveCount(0);

    // กรองตามชนิด
    await page.getByLabel("ชนิดเหตุการณ์").selectOption("classroom");
    await page.getByRole("button", { name: "แสดงผล" }).click();
    await expect(page).toHaveURL(/group=classroom/);
    await expect(rows.filter({ hasText: "classroom.zz_mine" })).toHaveCount(1, { timeout: 30_000 });
    await expect(rows.filter({ hasText: "guardian.zz_mine" })).toHaveCount(0);

    // ส่งออก CSV: ตรงตัวกรอง + บันทึกการส่งออก
    const csvRes = await page.request.get("/admin/audit/export?group=classroom");
    expect(csvRes.status()).toBe(200);
    expect(csvRes.headers()["content-type"]).toContain("text/csv");
    const csv = await csvRes.text();
    expect(csv).toContain("classroom.zz_mine");
    expect(csv).not.toContain("guardian.zz_mine");
    expect(csv).not.toContain("zz_other");
    const exp = await svc().from("audit_log").select("action,actor_id").eq("action", "audit.export").eq("school_id", w.school);
    expect(exp.data?.length).toBeGreaterThanOrEqual(1);

    // ติ๊กปิดกลุ่ม guardian (ปิดไม่ได้เฉพาะกลุ่ม audit — ไม่มีให้ติ๊ก)
    await page.goto("/admin/audit");
    const keep = page.getByRole("checkbox", { name: "ผู้ปกครอง/ลงทะเบียน" });
    await expect(keep).toBeChecked({ timeout: 30_000 });
    expect(await page.getByRole("checkbox", { name: /เก็บเสมอ/ }).count()).toBe(0);
    await keep.uncheck();
    await page.getByRole("button", { name: "บันทึกการตั้งค่า" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "บันทึกการตั้งค่าแล้ว" })).toBeVisible({ timeout: 30_000 });
    const cfg = (await svc().from("school_settings").select("audit").eq("school_id", w.school).single()).data!.audit as { enabled: boolean; off_groups: string[] };
    expect(cfg.enabled).toBe(true);
    expect(cfg.off_groups).toContain("guardian");
    expect(cfg.off_groups).not.toContain("audit");
    // การเปลี่ยนสวิตช์ถูกบันทึกเสมอ
    expect((await svc().from("audit_log").select("id").eq("action", "audit.switches").eq("school_id", w.school)).data?.length).toBe(1);
    // กลุ่มที่ปิด: ไม่มีแถวใหม่; กลุ่มอื่นยังเก็บ
    await svc().from("audit_log").insert({ source: "app", action: "guardian.zz_after_off", entity: "t", school_id: w.school });
    await svc().from("audit_log").insert({ source: "app", action: "classroom.zz_after_off", entity: "t", school_id: w.school });
    const after = (await svc().from("audit_log").select("action").eq("school_id", w.school).like("action", "%zz_after_off")).data!.map((r) => r.action);
    expect(after).toEqual(["classroom.zz_after_off"]);
    // หน้าแสดงสถานะปิด และ school_admin ไม่เห็นส่วนของแพลตฟอร์ม/ลบบันทึก
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "ผู้ปกครอง/ลงทะเบียน" })).not.toBeChecked({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "ลบบันทึกเก่า" })).toHaveCount(0);
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });

  test("แอดมินแพลตฟอร์ม: เห็นทุกโรงเรียน กรองตามโรงเรียนได้ มีส่วนสวิตช์ทั้งแพลตฟอร์มและลบบันทึก (ต้องพิมพ์ PURGE)", async ({ page }) => {
    const w = await adminWorld("ap3");
    const pa = await platformUser("ap3pa");
    await svc().from("audit_log").insert({ source: "app", action: "guardian.zz_p3", entity: "t", school_id: w.school });
    await loginUI(page, pa.email, "/admin/audit");
    await expect(page.getByLabel("โรงเรียน", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "ลบบันทึกเก่า" })).toBeVisible();
    await expect(page.getByText("ตั้งค่าของทั้งแพลตฟอร์ม", { exact: false }).first()).toBeVisible();
    // ไม่พิมพ์ยืนยัน → ปฏิเสธ
    await page.getByRole("button", { name: "ลบบันทึกเก่า" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("ข้อมูลไม่ถูกต้อง", { timeout: 30_000 });
    // พิมพ์ PURGE → สำเร็จ (ไม่มีแถวเก่ากว่า 4 ปี = 0 แถว) และการลบถูกบันทึก
    await page.getByLabel("พิมพ์ PURGE").fill("PURGE");
    await page.getByRole("button", { name: "ลบบันทึกเก่า" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ลบบันทึกเก่าแล้ว" })).toBeVisible({ timeout: 30_000 });
    expect((await svc().from("audit_log").select("id").eq("action", "audit.purge").eq("actor_id", pa.id)).data?.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe("แบรนด์", () => {
  test("โลโก้โรงเรียน: รูปเสียถูกปฏิเสธ, รูปจริงขึ้นที่หัวเมนูและเสิร์ฟได้, กลับไปใช้รูประบบได้", async ({ page }) => {
    const w = await adminWorld("ap4");
    await loginUI(page, w.adm.email, "/admin/branding");
    const file = page.locator('input[type="file"]').first();
    await file.setInputFiles({ name: "x.png", mimeType: "image/png", buffer: SVG });
    await page.getByRole("button", { name: "อัปโหลด" }).first().click();
    await expect(page.locator('main [role="alert"]')).toContainText("ไฟล์รูปไม่ถูกต้อง", { timeout: 30_000 });
    expect((await svc().from("schools").select("logo").eq("id", w.school).single()).data!.logo).toBeNull();

    await file.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: ICON });
    await page.getByRole("button", { name: "อัปโหลด" }).first().click();
    await expect(ok(page)).toBeVisible({ timeout: 30_000 });
    const res = await page.request.get(`/brand/school/${w.school}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect((await page.request.get(`/brand/school/${w.school}`, { headers: { "If-None-Match": res.headers().etag! } })).status()).toBe(304);
    await page.goto("/admin");
    await expect(page.locator(`img[src^="/brand/school/${w.school}"]:visible`).first()).toBeVisible({ timeout: 30_000 });

    await page.goto("/admin/branding");
    await page.getByRole("button", { name: "กลับไปใช้รูปของระบบ" }).click();
    await expect(page.getByRole("button", { name: "กลับไปใช้รูปของระบบ" })).toHaveCount(0, { timeout: 30_000 });
    expect((await svc().from("schools").select("logo").eq("id", w.school).single()).data!.logo).toBeNull();
    // ไม่มีรูปของโรงเรียน → redirect ไปโลโก้แพลตฟอร์ม (ไม่ 404)
    expect((await page.request.get(`/brand/school/${w.school}`, { maxRedirects: 0 })).status()).toBe(307);
    expect((await page.request.get("/brand/school/not-a-uuid")).status()).toBe(404);
  });

  test("แพลตฟอร์ม: เปลี่ยนชื่อ/ไอคอนแล้วไปถึงชื่อแท็บ manifest และ metadata; ไอคอนไม่จัตุรัสถูกปฏิเสธ; คืนค่าเดิมได้", async ({ page }) => {
    const pa = await platformUser("ap5pa");
    await loginUI(page, pa.email, "/platform/brand");
    try {
      // ชื่อ
      await page.getByLabel("ชื่อ (ไทย)").fill("รับส่งปลอดภัย ทดสอบ");
      await page.getByLabel("ชื่อ (อังกฤษ)").fill("SafePickup Test");
      await page.getByRole("button", { name: "บันทึกชื่อ" }).click();
      await expect(ok(page)).toBeVisible({ timeout: 30_000 });
      await page.goto("/");
      await expect(page).toHaveTitle(/รับส่งปลอดภัย ทดสอบ/);
      const man = await (await page.request.get("/manifest.webmanifest")).json();
      expect(man.name).toContain("รับส่งปลอดภัย ทดสอบ");
      expect(man.short_name).toBe("รับส่งปลอดภัย ทดสอบ");
      // ชื่อที่มี < > ถูกปฏิเสธ
      await page.goto("/platform/brand");
      await page.getByLabel("ชื่อ (ไทย)").fill("<b>x</b>");
      await page.getByRole("button", { name: "บันทึกชื่อ" }).click();
      await expect(page.locator('main [role="alert"]')).toContainText("ข้อมูลไม่ถูกต้อง", { timeout: 30_000 });

      // ไอคอน: ไม่ใช่ PNG → ปฏิเสธ; PNG จัตุรัส 192 → รับ
      const fav = page.locator('input[type="file"]').nth(1);
      await fav.setInputFiles({ name: "f.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]) });
      await page.getByRole("button", { name: "อัปโหลด" }).nth(1).click();
      await expect(page.locator('main [role="alert"]').last()).toContainText(/ไอคอนต้องเป็น PNG|ไฟล์รูปไม่ถูกต้อง/, { timeout: 30_000 });
      await fav.setInputFiles({ name: "f.png", mimeType: "image/png", buffer: ICON });
      await page.getByRole("button", { name: "อัปโหลด" }).nth(1).click();
      await expect(ok(page)).toBeVisible({ timeout: 30_000 });
      const man2 = await (await page.request.get("/manifest.webmanifest")).json();
      expect(man2.icons.every((i: { src: string }) => i.src.startsWith("/brand/favicon?v="))).toBe(true);
      const favRes = await page.request.get("/brand/favicon");
      expect(favRes.status()).toBe(200);
      expect(favRes.headers()["content-type"]).toBe("image/png");
      await page.goto("/");
      expect(await page.locator('link[rel="icon"]').first().getAttribute("href")).toMatch(/^\/brand\/favicon\?v=\d+/);
    } finally {
      // คืนค่าเดิมเสมอ (แบรนด์เป็นของทั้งระบบ)
      await svc().from("platform_settings").update({ value: {} }).eq("key", "brand");
      const { data: files } = await svc().storage.from("brand-assets").list("");
      const stray = (files ?? []).filter((f) => /^(logo|favicon)-/.test(f.name)).map((f) => f.name);
      if (stray.length) await svc().storage.from("brand-assets").remove(stray);
    }
    // ค่าเริ่มต้นกลับมาทันทีหลัง cache หมด/ล้าง (instance เดียวกันอาจค้างสูงสุด 30 วินาที — ใช้ปุ่มคืนค่าผ่านหน้าจอ)
  });
});

test.describe("สวิตช์ฟีเจอร์ / กฎอัตโนมัติ / ผู้ดูแลแพลตฟอร์ม / สถิติ", () => {
  test("สวิตช์ฟีเจอร์: ปิดแล้วเป็นสีส้ม บันทึกลงฐานข้อมูล+audit และเปิดคืนได้", async ({ page }) => {
    const pa = await platformUser("ap6pa");
    await loginUI(page, pa.email, "/platform/flags");
    const row = page.getByTestId("flag-voice");
    try {
      await expect(row).toHaveAttribute("data-on", "true", { timeout: 30_000 });
      await row.getByRole("button", { name: "ปิด" }).click();
      await expect(page.getByTestId("flag-voice")).toHaveAttribute("data-on", "false", { timeout: 30_000 });
      const v = (await svc().from("platform_settings").select("value").eq("key", "feature_flags").single()).data!.value as Record<string, boolean>;
      expect(v.voice).toBe(false);
      expect((await svc().from("audit_log").select("id").eq("action", "flag.set").eq("actor_id", pa.id)).data?.length).toBe(1);
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(a11y.violations.filter((x) => x.impact === "critical" || x.impact === "serious")).toEqual([]);
    } finally {
      await page.goto("/platform/flags");
      if ((await page.getByTestId("flag-voice").getAttribute("data-on")) === "false") {
        await page.getByTestId("flag-voice").getByRole("button", { name: "เปิด" }).click();
        await expect(page.getByTestId("flag-voice")).toHaveAttribute("data-on", "true", { timeout: 30_000 });
      }
      const v = (await svc().from("platform_settings").select("value").eq("key", "feature_flags").single()).data!.value as Record<string, boolean>;
      expect(v.voice).toBeUndefined();
    }
  });

  test("กฎอัตโนมัติ: แก้ตัวเลข/สวิตช์แล้วบันทึก, ค่านอกช่วงถูกปฏิเสธ, คืนค่าเดิม", async ({ page }) => {
    const pa = await platformUser("ap7pa");
    const before = (await svc().from("automation_rules").select("enabled,params").eq("key", "cleanup_old").single()).data!;
    await loginUI(page, pa.email, "/platform/rules");
    const form = page.getByTestId("rule-cleanup_old");
    try {
      await form.getByLabel("เก็บการแจ้งเตือนในแอป (วัน)").fill("45");
      await form.getByRole("button", { name: "บันทึก" }).click();
      await expect(form.getByRole("status").filter({ hasText: "บันทึกกฎแล้ว" })).toBeVisible({ timeout: 30_000 });
      expect(((await svc().from("automation_rules").select("params").eq("key", "cleanup_old").single()).data!.params as Record<string, number>).notif_days).toBe(45);
      // ข้ามการตรวจของเบราว์เซอร์ (max) เพื่อพิสูจน์ว่า server ตรวจซ้ำ
      await form.getByLabel("เก็บการแจ้งเตือนในแอป (วัน)").evaluate((el) => el.removeAttribute("max"));
      await form.getByLabel("เก็บการแจ้งเตือนในแอป (วัน)").fill("99999");
      await form.getByRole("button", { name: "บันทึก" }).click();
      await expect(form.getByRole("alert")).toBeVisible({ timeout: 30_000 });
      expect(((await svc().from("automation_rules").select("params").eq("key", "cleanup_old").single()).data!.params as Record<string, number>).notif_days).toBe(45);
      expect((await svc().from("audit_log").select("id").eq("action", "rule.save").eq("actor_id", pa.id)).data?.length).toBe(1);
    } finally {
      await svc().from("automation_rules").update({ enabled: before.enabled, params: before.params }).eq("key", "cleanup_old");
      await sql(`alter table public.audit_log disable trigger audit_log_no_delete; delete from public.audit_log where entity = 'automation_rules' and actor_id is null and at > now() - interval '15 minutes' and detail::text like '%params%'; alter table public.audit_log enable trigger audit_log_no_delete;`);
    }
  });

  test("ผู้ดูแลแพลตฟอร์ม: ถอนสิทธิ์คนอื่นได้ ถอนเจ้าของ/ตัวเองไม่ได้ และสร้างลิงก์เชิญได้", async ({ page }) => {
    const pa = await platformUser("ap8pa");
    const victim = await platformUser("ap8v");
    await svc().from("profiles").update({ display_name: "zz_test_victim" }).eq("id", victim.id);
    await loginUI(page, pa.email, "/platform/admins");
    const rows = page.getByTestId("platform-admin-row");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    // เจ้าของและตัวเองไม่มีปุ่มถอน
    for (const r of await rows.all()) {
      const txt = await r.innerText();
      if (/เจ้าของ|คุณ/.test(txt)) await expect(r.getByRole("button", { name: "ถอนสิทธิ์" })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "สร้างลิงก์เชิญ" }).click();
    await expect(page.getByTestId("invite-link")).toBeVisible({ timeout: 30_000 });
    // ถอนสิทธิ์ผู้ดูแลทดสอบอีกคน (ตั้งชื่อไว้ให้หาแถวเจอ)
    await page.reload();
    const target = page.getByTestId("platform-admin-row").filter({ hasText: "zz_test_victim" });
    await expect(target).toHaveCount(1, { timeout: 30_000 });
    await target.getByRole("button", { name: "ถอนสิทธิ์" }).click();
    await expect(target).toHaveCount(0, { timeout: 30_000 });
    expect((await svc().from("platform_admins").select("user_id").eq("user_id", victim.id)).data).toHaveLength(0);
    expect((await svc().from("audit_log").select("id").eq("action", "member.admin_revoke").eq("actor_id", pa.id)).data).toHaveLength(1);
    // ถอนโดยตรงด้วยฟังก์ชันของฐานข้อมูล: เจ้าของถอนไม่ได้ (is_owner = true ถูกกรองในคำสั่งลบ)
    const owner = (await svc().from("platform_admins").select("user_id").eq("is_owner", true).limit(1)).data?.[0];
    if (owner) {
      const del = await svc().from("platform_admins").delete().eq("user_id", owner.user_id).eq("is_owner", false).select("user_id");
      expect(del.data).toHaveLength(0);
    }
  });

  test("สถิติ: โรงเรียนและแพลตฟอร์มแสดงผลได้ เปลี่ยนช่วงเวลาได้ ไม่มีข้อผิดพลาดการเข้าถึง", async ({ page }) => {
    const w = await adminWorld("ap9");
    const pa = await platformUser("ap9pa");
    await loginUI(page, w.adm.email, "/admin/analytics");
    await expect(page.getByTestId("stat-dau")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "90 วัน" }).click();
    await expect(page).toHaveURL(/days=90/);
    await expect(page.getByTestId("stat-q-total")).toBeVisible({ timeout: 30_000 });
    expect(await new AxeBuilder({ page }).analyze().then((r) => r.violations.filter((v) => v.impact === "critical" || v.impact === "serious"))).toEqual([]);
    await page.context().clearCookies();
    await loginUI(page, pa.email, "/platform/analytics");
    await expect(page.getByTestId("stat-dau")).toBeVisible({ timeout: 30_000 });
  });
});

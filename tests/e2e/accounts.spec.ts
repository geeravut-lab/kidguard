import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeSchool, makeStudent, makeUser, PASSWORD, rid } from "../db/helpers";
import { isMobile, loginUI } from "./helpers";

test.skip(!HAS_DB, "ต้องมีคีย์ Supabase (ดู CLAUDE.md)");
// เครือข่ายของ sandbox ไป Supabase (โซล) หน่วง 0.4–0.6 วินาทีต่อการเรียก จึงให้เวลามากกว่าปกติ
test.setTimeout(120_000);
test.afterAll(cleanup);

test.describe("ผู้ปกครอง: สมัคร → ลงทะเบียน (A.1–A.3) → รออนุมัติ", () => {
  test("ทั้งขั้นตอนผ่านหน้าจอ", async ({ page }) => {
    // โรงเรียนทดสอบ: ห้อง + ครูประจำชั้น + นักเรียนในรายชื่อ
    const school = await makeSchool("onb");
    const room = await makeClassroom(school, "ป.2/1");
    const teacher = await makeUser("teach");
    await admin().from("profiles").update({ display_name: "ครูทดสอบ ใจดี" }).eq("id", teacher.id);
    await addMember(school, teacher.id, "teacher", room);
    const studentId = await makeStudent(school, room, "ทดสอบ", "เด็กดี");

    const email = `zz_test_parent_${rid()}@kidguard.test`;
    await page.goto("/signup");
    await page.getByLabel("ชื่อที่ใช้แสดง").fill("ผู้ปกครอง ทดสอบ");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "สมัครใช้งาน", exact: true }).click();

    // เลือกบทบาท (ยังไม่เลือก → ต้องเจอหน้าเลือก role ก่อน)
    await expect(page.getByRole("heading", { name: "คุณเป็นใคร" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /ฉันเป็นผู้ปกครอง/ }).click();
    await expect(page.getByRole("heading", { name: "ลงทะเบียนผู้ปกครอง" })).toBeVisible();

    // ขั้น 1: ผู้ปกครอง + รถ — ยังไปต่อไม่ได้จนกว่าจะครบ
    await expect(page.getByRole("button", { name: "ถัดไป" })).toBeDisabled();
    await page.getByLabel("ชื่อ-นามสกุล").fill("สมชาย ทดสอบ");
    await page.getByLabel("เบอร์โทร").fill("081-234-5678");
    await page.getByRole("button", { name: "เพิ่มผู้ปกครอง" }).click();
    await expect(page.getByText("สมชาย ทดสอบ")).toBeVisible();
    await expect(page.getByText("0812345678")).toBeVisible(); // ตัดขีดให้อัตโนมัติ
    // เบอร์ผิด → ข้อความผิดพลาด และไม่ล้างช่องที่กรอก
    await page.getByLabel("ชื่อ-นามสกุล").fill("คนที่สอง");
    await page.getByLabel("เบอร์โทร").fill("abc");
    await page.getByRole("button", { name: "เพิ่มผู้ปกครอง" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("เบอร์โทรไม่ถูกต้อง");
    await expect(page.getByLabel("ชื่อ-นามสกุล")).toHaveValue("คนที่สอง");
    await page.getByLabel("ชื่อ-นามสกุล").fill("");
    await page.getByLabel("เบอร์โทร").fill("");

    await page.getByLabel(/ทะเบียน \(เช่น/).fill("กข 1234");
    await page.getByLabel("จังหวัด").selectOption("กรุงเทพมหานคร");
    await page.getByRole("button", { name: "เพิ่มรถ" }).click();
    await expect(page.getByText("กข1234")).toBeVisible();
    await page.getByRole("button", { name: "ถัดไป" }).click();

    // ขั้น 2: นักเรียน — เห็นครูประจำชั้นอัตโนมัติเมื่อเลือกห้อง
    const schoolSelect = page.getByLabel("โรงเรียน");
    if (await schoolSelect.count()) await schoolSelect.selectOption({ label: "ทดสอบ onb" });
    await page.getByLabel("ห้องเรียน").selectOption({ label: "ป.2/1" });
    await expect(page.getByTestId("homeroom-teacher")).toContainText("ครูทดสอบ ใจดี");
    await page.getByLabel("ชื่อ-นามสกุลนักเรียน").fill("ทดสอบ  เด็กดี");
    await page.getByRole("button", { name: "ส่งคำขอผูกนักเรียน" }).click();
    await expect(page.getByText("รอโรงเรียนอนุมัติ")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "ถัดไป" }).click();

    // ขั้น 3: ตรวจครูประจำชั้น  ขั้น 4: ยินยอม PDPA (ต้องติ๊ก)
    await expect(page.getByRole("heading", { name: "ตรวจสอบครูประจำชั้น" })).toBeVisible();
    await expect(page.getByText("ครูทดสอบ ใจดี")).toBeVisible();
    await page.getByRole("button", { name: "ถัดไป" }).click();
    await expect(page.getByRole("heading", { name: "ความเป็นส่วนตัวและตำแหน่งที่ตั้ง" })).toBeVisible();
    await page.getByRole("button", { name: "เสร็จสิ้นการลงทะเบียน" }).click(); // ยังไม่ติ๊ก → ฟอร์มไม่ส่ง (required)
    await expect(page.getByRole("heading", { name: "ความเป็นส่วนตัวและตำแหน่งที่ตั้ง" })).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "เสร็จสิ้นการลงทะเบียน" }).click();

    // เสร็จแล้วเข้าหน้าบุตรหลาน: เห็นคำขอที่รออนุมัติ ยังไม่เห็นนักเรียนที่อนุมัติ
    await expect(page.getByRole("heading", { name: "บุตรหลานของฉัน" }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("รอโรงเรียนอนุมัติ")).toBeVisible();

    // ฐานข้อมูล: การผูกจับคู่กับนักเรียนในรายชื่อแล้วแต่ยังเป็น pending
    const user = (await admin().from("profiles").select("id").eq("onboarded_at", null as unknown as string)).data;
    void user;
    const a = admin();
    const { data: link } = await a.from("guardian_links").select("student_id,status,user_id").eq("school_id", school).single();
    expect(link).toMatchObject({ student_id: studentId, status: "pending" });
    const audit = await a.from("audit_log").select("action").eq("actor_id", link!.user_id).like("action", "guardian.%");
    expect(audit.data?.map((r) => r.action)).toEqual(expect.arrayContaining(["guardian.person_add", "guardian.vehicle_add", "guardian.claim", "guardian.onboarded"]));
    await a.auth.admin.deleteUser(link!.user_id);
  });

  test("เข้าสู่ระบบผิด: แจ้งข้อผิดพลาดทั่วไป และไม่ล้างอีเมลที่กรอก", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill("nobody@kidguard.test");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill("wrong-password-1");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    await expect(page.getByLabel("อีเมล")).toHaveValue("nobody@kidguard.test");
  });

  test("ไม่ล็อกอินแล้วเปิดหน้าที่ป้องกัน → ไปหน้าเข้าสู่ระบบพร้อม next และกลับมาหลังล็อกอิน; next นอกเว็บถูกเพิกเฉย", async ({ page }) => {
    const u = await makeUser("nxt");
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile/);
    await page.getByLabel("อีเมล").fill(u.email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "บัญชีของฉัน", exact: true })).toBeVisible({ timeout: 20_000 });
    await page.context().clearCookies();
    await page.goto("/login?next=https://evil.example/");
    await page.getByLabel("อีเมล").fill(u.email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page).toHaveURL(/kidguard|localhost/, { timeout: 20_000 });
    expect(new URL(page.url()).hostname).not.toContain("evil");
  });
});

test.describe("เจ้าหน้าที่โรงเรียน", () => {
  test("แอดมิน: เห็นคำขอ → อนุมัติ → ผู้ปกครองเห็นบุตรหลาน; คนนอกได้ 404; ครูห้องอื่นไม่เห็น", async ({ page, browser }) => {
    const school = await makeSchool("adm");
    const room1 = await makeClassroom(school, "ม.1/1");
    const room2 = await makeClassroom(school, "ม.1/2");
    const stu = await makeStudent(school, room1, "สมหมาย", "ตั้งใจ");
    const [adminU, t2, parent] = await Promise.all([makeUser("adm"), makeUser("t2"), makeUser("par")]);
    await addMember(school, adminU.id, "school_admin");
    await addMember(school, t2.id, "teacher", room2);
    // ผู้ปกครองส่งคำขอ (ผ่านฟังก์ชันจริงด้วยสิทธิ์ผู้ปกครอง)
    await parent.client.rpc("choose_role", { p_role: "parent" });
    await parent.client.from("guardian_persons").insert({ user_id: parent.id, name: "แม่สมหมาย", phone: "0899999999", is_primary: true });
    expect((await parent.client.rpc("claim_student", { p_school: school, p_classroom: room1, p_name: "สมหมาย ตั้งใจ", p_relation: "mother", p_teacher_name: null })).error).toBeNull();

    // แอดมินอนุมัติผ่านหน้าจอ
    await loginUI(page, adminU.email, "/admin");
    await expect(page.getByRole("heading", { name: "คำขอผูกนักเรียน" })).toBeVisible();
    const card = page.getByTestId("claim-card").filter({ hasText: "สมหมาย ตั้งใจ" });
    await expect(card).toContainText("แม่สมหมาย");
    await expect(card).toContainText("0899999999");
    await expect(card).toContainText("ตรงกับรายชื่อนักเรียน");
    await card.getByRole("button", { name: "อนุมัติ", exact: true }).click();
    await expect(page.getByText("ไม่มีคำขอที่รออนุมัติ")).toBeVisible({ timeout: 15_000 });
    expect((await admin().from("guardian_links").select("status,decided_by").eq("student_id", stu).single()).data).toMatchObject({ status: "approved", decided_by: adminU.id });
    expect((await parent.client.from("students").select("id")).data?.map((s) => s.id)).toEqual([stu]);

    // ผู้ใช้ทั่วไป (ผู้ปกครอง) เปิดหน้าแอดมิน = 404 (ไม่บอกว่ามีหน้านี้)
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await loginUI(p2, parent.email, "/admin");
    await expect(p2.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
    // ครูห้องอื่น: เปิด /admin ไม่ได้, /teacher ไม่เห็นนักเรียนห้องอื่น
    const ctx2 = await browser.newContext();
    const p3 = await ctx2.newPage();
    await loginUI(p3, t2.email, "/admin/students");
    await expect(p3.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
    await p3.goto("/teacher");
    await expect(p3.getByText("สมหมาย ตั้งใจ")).toHaveCount(0);
    await ctx.close();
    await ctx2.close();
  });

  test("แอดมินสร้างห้อง นำเข้า CSV เชิญครูด้วยลิงก์ → ครูรับคำเชิญแล้วเห็นห้องตัวเอง", async ({ page, browser }, info) => {
    const mobile = isMobile(info.project.name);
    const school = await makeSchool("mgmt");
    const adminU = await makeUser("adm2");
    const teacher = await makeUser("tch2");
    await addMember(school, adminU.id, "school_admin");
    await loginUI(page, adminU.email, "/admin/classrooms");

    await page.getByLabel("ชื่อห้อง").fill("อ.1/1");
    await page.getByRole("button", { name: "เพิ่มห้องเรียน" }).click();
    await expect(page.getByTestId("classroom-card").filter({ hasText: "อ.1/1" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/admin/students");
    const csv = "รหัส,ชื่อ,นามสกุล,ชื่อเล่น,ห้อง\nA001,ดาว,เด่น,ดาว,อ.1/1\nA002,เมฆ,ฝน,,ไม่มีห้องนี้\nA003,,ลม,,อ.1/1\n";
    await page.locator('input[type="file"]').setInputFiles({ name: "students.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.getByRole("button", { name: "นำเข้า", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "นำเข้าแล้ว 1 คน" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("student-row").filter({ hasText: "ดาว เด่น" })).toBeVisible();

    // เชิญครู: ลิงก์แสดงครั้งเดียว
    await page.goto("/admin/members");
    await page.getByLabel("ห้องประจำชั้น (เฉพาะครู)").selectOption({ label: "อ.1/1" });
    await page.getByRole("button", { name: "สร้างลิงก์เชิญ" }).click();
    const link = await page.getByTestId("invite-link").locator("code").innerText({ timeout: 15_000 });
    expect(link).toMatch(/\/invite\/[A-Z2-9]{16}$/);
    const hashInDb = (await admin().from("school_invites").select("code_hash").eq("school_id", school)).data!;
    expect(hashInDb.length).toBe(1);
    expect(link).not.toContain(hashInDb[0]!.code_hash); // เก็บเฉพาะ hash

    const ctx = await browser.newContext();
    const tp = await ctx.newPage();
    await loginUI(tp, teacher.email, new URL(link).pathname);
    await tp.getByRole("button", { name: "รับคำเชิญ" }).click();
    await expect(tp.getByRole("heading", { name: "ห้องเรียนของฉัน" })).toBeVisible({ timeout: 20_000 });
    await expect(tp.getByText("ดาว เด่น")).toBeVisible();
    // ใช้ซ้ำไม่ได้
    const ctx2 = await browser.newContext();
    const p3 = await ctx2.newPage();
    const other = await makeUser("tch3");
    await loginUI(p3, other.email, new URL(link).pathname);
    await p3.getByRole("button", { name: "รับคำเชิญ" }).click();
    await expect(p3.locator('main [role="alert"]')).toContainText("รหัสเชิญไม่ถูกต้อง");
    await ctx.close();
    await ctx2.close();
    void mobile;
  });

  test("ตั้งค่าโรงเรียน: บันทึกรัศมี/พิกัดได้ และค่าที่ผิดกติกาถูกปฏิเสธ", async ({ page }) => {
    const school = await makeSchool("cfg");
    const adminU = await makeUser("adm3");
    await addMember(school, adminU.id, "school_admin");
    await loginUI(page, adminU.email, "/admin/settings");
    await page.getByLabel("ละติจูด").fill("13.7563");
    await page.getByLabel("ลองจิจูด").fill("100.5018");
    await page.getByLabel(/ระยะที่ผู้ปกครอง check-in ได้/).fill("1500");
    await page.getByLabel(/แจ้งเตือนนักเรียนเมื่อผู้ปกครองใกล้ถึงอีก/).fill("7");
    await page.getByRole("button", { name: "บันทึกการตั้งค่า" }).click();
    await expect(page.getByRole("status")).toContainText("บันทึกแล้ว", { timeout: 15_000 });
    const s = (await admin().from("school_settings").select("checkin_radius_m,student_alert_min").eq("school_id", school).single()).data;
    expect(s).toEqual({ checkin_radius_m: 1500, student_alert_min: 7 });
    expect((await admin().from("schools").select("lat,lng").eq("id", school).single()).data).toEqual({ lat: 13.7563, lng: 100.5018 });

    await page.getByLabel(/ระยะที่นับว่า/).fill("1600"); // ต้องน้อยกว่าระยะ check-in
    await page.getByRole("button", { name: "บันทึกการตั้งค่า" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("ระยะ “ถึงประตู” ต้องน้อยกว่า");
    expect((await admin().from("school_settings").select("arrive_radius_m").eq("school_id", school).single()).data?.arrive_radius_m).toBe(150);
  });
});

test.describe("เมนูตามบทบาท + บัญชี + ออกจากระบบ", () => {
  test("แอดมินเห็นเมนูหลายรายการ; มือถือมี bottom bar ไม่เกิน 4 รายการ ที่เหลืออยู่ในแผ่น 'เพิ่มเติม' และปุ่ม Back ทำงานถูกต้อง", async ({ page }, info) => {
    const mobile = isMobile(info.project.name);
    const school = await makeSchool("nav");
    const adminU = await makeUser("adm4");
    await addMember(school, adminU.id, "school_admin");
    await loginUI(page, adminU.email, "/admin");
    if (mobile) {
      const bar = page.locator('nav[aria-label="เมนูหลัก"]:visible').first();
      expect(await bar.getByRole("link").count()).toBeLessThanOrEqual(4);
      await page.getByRole("button", { name: "เพิ่มเติม" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "ตั้งค่าโรงเรียน" }).click();
      await expect(page.getByRole("heading", { name: "ตั้งค่าโรงเรียน" })).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/admin\/settings$/);
      await page.goBack(); // ครั้งเดียวต้องกลับหน้าเดิม ไม่ใช่ติดแผ่นเมนูค้าง
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } else {
      for (const name of ["คำขอผูกนักเรียน", "ห้องเรียน", "นักเรียน", "เจ้าหน้าที่", "ตั้งค่าโรงเรียน", "บัญชีของฉัน"]) {
        await expect(page.locator("aside").getByRole("link", { name, exact: true })).toBeVisible();
      }
    }
  });

  test("เปลี่ยนรหัสผ่าน: ต้องใส่รหัสเดิมถูก, ใช้รหัสใหม่ล็อกอินได้, ออกจากระบบแล้วต้องล็อกอินใหม่", async ({ page }, info) => {
    const mobile = isMobile(info.project.name);
    const u = await makeUser("pw");
    await loginUI(page, u.email, "/profile");
    await page.getByLabel("รหัสผ่านปัจจุบัน", { exact: true }).fill("wrong-current-1");
    await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("New-pass-98765");
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill("New-pass-98765");
    await page.getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    // ช่องรหัสผ่านถูกล้างหลังผิดพลาด (ไม่คืนค่ารหัสผ่านโดยตั้งใจ) → กรอกใหม่ทั้งสามช่อง
    await expect(page.getByLabel("รหัสผ่านใหม่", { exact: true })).toHaveValue("");
    await page.getByLabel("รหัสผ่านปัจจุบัน", { exact: true }).fill(PASSWORD);
    await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("New-pass-98765");
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill("New-pass-98765");
    await page.getByRole("button", { name: "เปลี่ยนรหัสผ่าน", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "เปลี่ยนรหัสผ่านแล้ว" })).toBeVisible({ timeout: 15_000 });

    if (mobile) await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const scope = mobile ? page.getByRole("dialog") : page.locator("aside");
    await scope.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=/);
    const { error } = await (await import("@supabase/supabase-js")).createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!).auth.signInWithPassword({ email: u.email, password: "New-pass-98765" });
    expect(error).toBeNull();
  });

  test("เปลี่ยนภาษาขณะล็อกอิน: จำไว้ในโปรไฟล์", async ({ page }, info) => {
    const mobile = isMobile(info.project.name);
    const u = await makeUser("lang");
    await loginUI(page, u.email, "/profile");
    const sw = mobile ? page.locator('[role="group"][aria-label="เปลี่ยนภาษา"]:visible').first() : page.locator('[role="group"][aria-label="เปลี่ยนภาษา"]:visible').first();
    await sw.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "My account", exact: true })).toBeVisible({ timeout: 15_000 });
    expect((await admin().from("profiles").select("lang").eq("id", u.id).single()).data?.lang).toBe("en");
  });

  test("หน้าหลังล็อกอินผ่าน axe (serious/critical)", async ({ page }) => {
    const school = await makeSchool("axe");
    const adminU = await makeUser("adm5");
    await addMember(school, adminU.id, "school_admin");
    await makeClassroom(school, "ป.3/1");
    await loginUI(page, adminU.email, "/admin");
    for (const path of ["/admin", "/admin/classrooms", "/admin/students", "/admin/members", "/admin/settings", "/profile", "/privacy"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} เลื่อนแนวนอน`).toBeLessThanOrEqual(1);
    }
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      await page.context().clearCookies();
      await page.goto(path);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${path} ${v.id}`)).toEqual([]);
    }
  });
});

test.describe("SSO (Aivora) หน้า callback", () => {
  test("ไม่มีตั๋ว → แจ้งข้อผิดพลาดจริง ไม่หมุนค้าง และมีปุ่มกลับไปหน้าเข้าสู่ระบบ", async ({ page }) => {
    await page.goto("/sso/callback");
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ" })).toBeVisible();
    await page.getByRole("link", { name: "กลับไปหน้าเข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("ตั๋วไม่ถูกต้อง → ลบ sso_ticket ออกจาก URL ทันที, log checkpoint, แสดงข้อผิดพลาด (ไม่แลกซ้ำ)", async ({ page }) => {
    const logs: string[] = [];
    let exchanges = 0;
    page.on("console", (m) => logs.push(m.text()));
    await page.route("**/api/sso/exchange", async (route) => {
      exchanges++;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "invalid_ticket" }) });
    });
    await page.goto("/sso/callback?sso_ticket=FAKE-TICKET-123");
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ" })).toBeVisible();
    expect(page.url()).not.toContain("sso_ticket");
    expect(exchanges).toBe(1);
    expect(logs.some((l) => l.includes("[sso] 1/6 ticket found"))).toBe(true);
  });

  test("ตั๋วถูกต้อง (จำลอง): แลก → setSession → กระโดดเข้าระบบตามบทบาท", async ({ page }) => {
    const u = await makeUser("sso");
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD });
    await page.route("**/api/sso/exchange", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token }) }),
    );
    await page.goto("/sso/callback?sso_ticket=OK-TICKET");
    await expect(page.getByRole("heading", { name: "คุณเป็นใคร" })).toBeVisible({ timeout: 30_000 }); // ผู้ใช้ใหม่ → หน้าเลือก role
  });

  test("ปุ่ม Google ชี้ไปที่ Supabase authorize และปุ่ม LINE ชี้ไปที่ Aivora hub พร้อม callback ของเรา", async ({ page }) => {
    await page.goto("/login");
    const authorize: string[] = [];
    await page.route("**/auth/v1/authorize**", (route) => {
      authorize.push(route.request().url());
      return route.abort();
    });
    await page.getByRole("button", { name: /ดำเนินการต่อด้วย Google/ }).click();
    await expect.poll(() => authorize.length).toBeGreaterThan(0);
    const u = new URL(authorize[0]!);
    expect(u.searchParams.get("provider")).toBe("google");
    expect(u.searchParams.get("redirect_to")).toMatch(/\/auth\/callback\?next=/);

    await page.unroute("**/auth/v1/authorize**");
    await page.goto("/login"); // การนำทางที่ถูก abort ทำให้เบราว์เซอร์เข้าหน้า error — โหลดหน้าเดิมใหม่
    let hub = "";
    await page.route("https://aivora-lc.netlify.app/**", (route) => {
      hub = route.request().url();
      return route.abort();
    });
    await page.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/ }).click();
    await expect.poll(() => hub).not.toBe("");
    const h = new URL(hub);
    expect(h.pathname).toBe("/sso/authorize");
    expect(h.searchParams.get("app")).toBe("kidguard");
    expect(h.searchParams.get("return")).toBe("https://kidguards.vercel.app/sso/callback");
  });
});

test.describe("ผู้ดูแลแพลตฟอร์ม", () => {
  test("รับคำเชิญ super_admin → เห็นหน้าแพลตฟอร์ม → สร้างโรงเรียนและลิงก์เชิญแอดมินโรงเรียน; ผู้อื่นได้ 404", async ({ page, browser }) => {
    const { createHash } = await import("node:crypto");
    const code = "ZZTESTSUPERADMIN" + rid().toUpperCase().replace(/[01OI]/g, "2");
    const owner = await makeUser("owner");
    const { error } = await admin().from("school_invites").insert({ school_id: null, role: "super_admin", code_hash: createHash("sha256").update(code.toUpperCase()).digest("hex"), expires_at: new Date(Date.now() + 3600e3).toISOString(), created_by: owner.id });
    expect(error).toBeNull();

    await loginUI(page, owner.email, `/invite/${code}`);
    await page.getByRole("button", { name: "รับคำเชิญ" }).click();
    await expect(page.getByRole("heading", { name: "ผู้ดูแลแพลตฟอร์ม" })).toBeVisible({ timeout: 20_000 });

    const slug = `zz-test-new-${rid()}`;
    await page.getByLabel(/ตัวย่อสำหรับ URL/).fill(slug);
    await page.getByLabel("ชื่อโรงเรียน (ไทย)").fill("โรงเรียนใหม่ ทดสอบ");
    await page.getByRole("button", { name: "เพิ่มโรงเรียน" }).click();
    await expect(page.getByTestId("school-row").filter({ hasText: slug })).toBeVisible({ timeout: 15_000 });
    const sid = (await admin().from("schools").select("id").eq("slug", slug).single()).data!.id as string;
    await admin().from("school_settings").select("school_id").eq("school_id", sid).single(); // มีแถวตั้งค่าเริ่มต้นแล้ว

    await page.getByLabel("โรงเรียน", { exact: true }).selectOption(sid);
    await page.getByRole("button", { name: "สร้างลิงก์เชิญผู้ดูแลโรงเรียน" }).click();
    await expect(page.getByTestId("invite-link")).toContainText("/invite/", { timeout: 15_000 });

    // ผู้ใช้ทั่วไปเปิด /platform = 404
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    const other = await makeUser("nobody");
    await loginUI(p2, other.email, "/platform");
    await expect(p2.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
    await ctx.close();

    // เก็บกวาด (school ที่สร้างในหน้าจอ + audit ของมัน)
    await admin().from("schools").delete().eq("id", sid);
    const { sql } = await import("../db/helpers");
    await sql(`alter table public.audit_log disable trigger audit_log_no_delete; delete from public.audit_log where school_id = '${sid}' or entity_id = '${sid}'; alter table public.audit_log enable trigger audit_log_no_delete;`);
  });
});

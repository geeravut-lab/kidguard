// สคริปต์ถ่ายภาพหน้าจอจริงของระบบสำหรับทำคู่มือ (ข้อมูลสมมุติ ลบทิ้งท้ายรัน) — ไม่ใช่เทสต์ของระบบ
import { test, type Page } from "@playwright/test";
import { addMember, admin, cleanup, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation } from "../db/helpers";
import { encryptSecret } from "../../src/lib/crypto";
import { hashToken } from "../../src/lib/safety/pure-hash";
import { loginUI } from "../e2e/helpers";

test.setTimeout(900_000);
test.afterAll(cleanup);
const OUT = "docs/guides/shots";
const svc = () => admin();
const GEO = { latitude: 13.7563 + 0.0144, longitude: 100.5018, accuracy: 20 };

/** ภาพแผนที่ประกอบ (ไม่ใช่แผนที่จริง): กริดถนนต่อเนื่องข้ามกระเบื้อง ใช้เฉพาะตอนถ่ายภาพคู่มือ */
async function mockTiles(ctx: import("@playwright/test").BrowserContext, helper: Page) {
  await ctx.route("https://tile.openstreetmap.org/**", async (route) => {
    const m = route.request().url().match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    const [x, y] = m ? [Number(m[2]), Number(m[3])] : [0, 0];
    const b64 = await helper.evaluate(([tx, ty]) => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d")!;
      g.fillStyle = "#eaf0ec";
      g.fillRect(0, 0, 256, 256);
      const gx = tx * 256, gy = ty * 256;
      // สวนสาธารณะบางบล็อก
      for (let bx = Math.floor(gx / 128) - 1; bx <= Math.floor((gx + 256) / 128); bx++) for (let by = Math.floor(gy / 128) - 1; by <= Math.floor((gy + 256) / 128); by++) {
        if (((bx * 7 + by * 13) % 5) === 0) { g.fillStyle = "#d3e8cf"; g.fillRect(bx * 128 - gx + 10, by * 128 - gy + 10, 108, 108); }
        else if (((bx * 3 + by * 5) % 4) === 0) { g.fillStyle = "#f6f3ec"; g.fillRect(bx * 128 - gx + 14, by * 128 - gy + 14, 100, 100); }
      }
      const road = (w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w; };
      road(12, "#dfe3df");
      for (let k = Math.floor(gx / 128) - 1; k <= Math.ceil((gx + 256) / 128); k++) { g.beginPath(); g.moveTo(k * 128 - gx, 0); g.lineTo(k * 128 - gx, 256); g.stroke(); }
      for (let k = Math.floor(gy / 128) - 1; k <= Math.ceil((gy + 256) / 128); k++) { g.beginPath(); g.moveTo(0, k * 128 - gy); g.lineTo(256, k * 128 - gy); g.stroke(); }
      road(8, "#ffffff");
      for (let k = Math.floor(gx / 128) - 1; k <= Math.ceil((gx + 256) / 128); k++) { g.beginPath(); g.moveTo(k * 128 - gx, 0); g.lineTo(k * 128 - gx, 256); g.stroke(); }
      for (let k = Math.floor(gy / 128) - 1; k <= Math.ceil((gy + 256) / 128); k++) { g.beginPath(); g.moveTo(0, k * 128 - gy); g.lineTo(256, k * 128 - gy); g.stroke(); }
      return c.toDataURL("image/png").split(",")[1]!;
    }, [x, y] as [number, number]);
    await route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(b64, "base64") });
  });
}

async function shot(p: Page, name: string, o: { full?: boolean } = {}) {
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!o.full });
}

test("ถ่ายภาพคู่มือ", async ({ browser }) => {
  const school = await makeSchool("gd");
  await setSchoolLocation(school, { dismissal_time: "15:30", voice_enabled: true, tv_show_arriving: true });
  await svc().from("schools").update({ name_th: "โรงเรียนตัวอย่าง", short_name: "ตย." }).eq("id", school);
  await svc().from("school_line_channels").upsert({ school_id: school, basic_id: "@kidguard-demo", channel_secret_enc: encryptSecret("demo-secret"), access_token_enc: encryptSecret("demo-token"), enabled: true, monthly_quota: 100 });
  const r1 = await makeClassroom(school, "ป.1/1");
  const r2 = await makeClassroom(school, "ป.2/1");
  const z1 = (await svc().from("zones").insert({ school_id: school, name: "ประตู 1" }).select("id").single()).data!.id;
  await svc().from("classrooms").update({ zone_id: z1 }).eq("id", r1);
  const s1 = await makeStudent(school, r1, "สมชาย", "ใจดี");
  const s2 = await makeStudent(school, r2, "สมหญิง", "ใจดี");
  const s3 = await makeStudent(school, r1, "ภูมิ", "รักเรียน");
  await svc().from("students").update({ nickname: "น้องชาย" }).eq("id", s1);
  await svc().from("students").update({ nickname: "น้องหญิง" }).eq("id", s2);
  await svc().from("students").update({ nickname: "น้องภูมิ" }).eq("id", s3);
  const parent = await makeParent("gdp", school, r1, [s1, s2]);
  await svc().from("guardian_links").update({ claimed_classroom_id: r2 }).eq("user_id", parent.id).eq("student_id", s2);
  const parent2 = await makeParent("gdp2", school, r1, [s3]);
  await svc().from("profiles").update({ display_name: "คุณแม่ตัวอย่าง" }).eq("id", parent.id);
  await svc().from("profiles").update({ display_name: "คุณพ่อตัวอย่าง" }).eq("id", parent2.id);
  await svc().from("guardian_persons").update({ name: "คุณแม่ตัวอย่าง" }).eq("user_id", parent.id);
  await svc().from("guardian_persons").update({ name: "คุณพ่อตัวอย่าง" }).eq("user_id", parent2.id);
  const adm = await makeUser("gdadm");
  const gate = await makeUser("gdgate");
  const teacher = await makeUser("gdt");
  await addMember(school, adm.id, "school_admin");
  await addMember(school, gate.id, "gate_staff");
  await addMember(school, teacher.id, "teacher", r1);
  await svc().from("profiles").update({ display_name: "ครูตัวอย่าง" }).eq("id", teacher.id);
  await svc().from("profiles").update({ display_name: "ผู้ดูแลตัวอย่าง" }).eq("id", adm.id);
  await svc().from("profiles").update({ display_name: "เจ้าหน้าที่ประตู" }).eq("id", gate.id);
  const token = "G".repeat(24);
  await svc().from("tv_displays").insert({ school_id: school, name: "จอหน้าประตู", token_hash: hashToken(token) });
  // คำขอรออนุมัติ (ให้หน้าอนุมัติมีของ)
  const newbie = await makeUser("gdnew");
  await svc().from("profiles").update({ display_name: "คุณพ่อใหม่", role: "parent", onboarded_at: new Date().toISOString() }).eq("id", newbie.id);
  await svc().from("guardian_links").insert({ user_id: newbie.id, school_id: school, claimed_name: "ด.ช. ธนา สุขใจ", claimed_classroom_id: r2, status: "pending" });
  const newbie2 = await makeUser("gdnew2");
  await svc().from("profiles").update({ display_name: "คุณแม่ใหม่", role: "parent", onboarded_at: new Date().toISOString() }).eq("id", newbie2.id);
  await svc().from("guardian_links").insert({ user_id: newbie2.id, school_id: school, claimed_name: "ด.ญ. ใจดี มีสุข", claimed_classroom_id: r1, status: "pending" });

  // ---------- มือถือ (ผู้ปกครอง) ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, geolocation: GEO, permissions: ["geolocation"], locale: "th-TH" });
  const m = await mctx.newPage();
  await mockTiles(mctx, await mctx.newPage());
  await m.goto("/login");
  await shot(m, "m-login");
  await m.goto("/signup");
  await shot(m, "m-signup");
  // ผู้ปกครองใหม่ที่ยังลงทะเบียนไม่ครบ → onboarding
  const fresh = await makeUser("gdfresh");
  await svc().from("profiles").update({ role: "parent", display_name: "คุณแม่ตัวอย่าง" }).eq("id", fresh.id);
  const fctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "th-TH" });
  const f = await fctx.newPage();
  await loginUI(f, fresh.email, "/onboarding");
  await shot(f, "m-onboarding-1");
  await fctx.close();

  await loginUI(m, parent.email, "/home");
  await shot(m, "m-home");
  await m.goto("/home");
  await shot(m, "m-home-full", { full: true });
  await m.getByText("แจ้งล่วงหน้า").first().scrollIntoViewIfNeeded();
  await m.evaluate(() => window.scrollBy(0, -110));
  await shot(m, "m-plan");
  await m.goto("/home");
  await m.getByRole("button", { name: "สร้างลิงก์ให้นักเรียนใช้" }).first().click();
  await m.waitForTimeout(2500);
  await m.evaluate(() => document.querySelectorAll("code").forEach((c) => { c.textContent = (c.textContent ?? "").replace(/https?:\/\/[^/\s]+\/invite\/\w+/, "https://kidguards.vercel.app/invite/XXXXXXXXXXXX"); }));
  await m.getByRole("button", { name: "สร้างลิงก์ให้นักเรียนใช้" }).first().scrollIntoViewIfNeeded();
  await m.evaluate(() => window.scrollBy(0, -250));
  await shot(m, "m-student-link");
  await m.goto("/pickup");
  await shot(m, "m-pickup-start");
  await m.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
  await m.getByTestId("travel-view").waitFor({ timeout: 40_000 });
  await shot(m, "m-travel");
  await shot(m, "m-travel-full", { full: true });
  const sid = (await svc().from("pickup_sessions").select("id").eq("parent_user_id", parent.id).single()).data!.id;
  await svc().rpc("pickup_verify", { p_actor: gate.id, p_session: sid });
  await svc().rpc("pickup_call", { p_actor: gate.id, p_session: sid });
  await m.reload();
  await shot(m, "m-called");
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  await svc().from("app_notifications").insert([
    { user_id: parent.id, school_id: school, kind: "success", title: "โรงเรียนอนุมัติแล้ว", body: "สมชาย ใจดี ผูกกับบัญชีของคุณเรียบร้อย สามารถแจ้งมารับได้", fields: [], link: "/home", created_at: ago(1440) },
    { user_id: parent.id, school_id: school, kind: "info", title: "นักเรียนกำลังมาที่รถ", body: "น้องชาย ป.1/1, น้องหญิง ป.2/1 กำลังเดินมาหาคุณ", fields: [{ label: "เวลา", value: "15:42" }], link: "/pickup", created_at: ago(4) },
    { user_id: parent.id, school_id: school, kind: "success", title: "โรงเรียนส่งนักเรียนแล้ว", body: "น้องชาย, น้องหญิง ถูกส่งให้คุณเรียบร้อยแล้ว", fields: [{ label: "โดย", value: "เจ้าหน้าที่ประตู" }, { label: "เวลา", value: "15:45" }], link: "/pickup", created_at: ago(1) },
  ]);
  await m.goto("/notifications");
  await shot(m, "m-notifications");
  await m.goto("/profile");
  await svc().auth.admin.updateUserById(parent.id, { email: "somchai.mother@example.com", email_confirm: true });
  await m.reload();
  await shot(m, "m-profile");
  await m.getByText("แจ้งเตือนทาง LINE").first().scrollIntoViewIfNeeded();
  await m.evaluate(() => window.scrollBy(0, -110));
  await shot(m, "m-line-1");
  await m.getByRole("button", { name: /เชื่อมต่อ LINE|ผูก LINE/ }).first().click();
  await m.waitForTimeout(3000);
  await m.evaluate(() => window.scrollBy(0, 0));
  await shot(m, "m-line-2");
  await m.getByText("แจ้งเตือนทาง LINE").first().scrollIntoViewIfNeeded();
  await m.evaluate(() => window.scrollBy(0, 250));
  await shot(m, "m-line-3");
  await svc().auth.admin.updateUserById(parent.id, { email: parent.email, email_confirm: true });
  await m.goto("/passes");
  await m.getByLabel("ชื่อผู้รับแทน").fill("คุณลุงสมศักดิ์");
  await m.getByRole("checkbox").first().check();
  await m.getByLabel("ทะเบียนรถ (ถ้ามี)").fill("1กข 2345");
  await shot(m, "m-passes-form", { full: true });
  await m.getByRole("button", { name: "สร้างรหัส" }).click();
  await m.getByTestId("pass-reveal").waitFor({ timeout: 40_000 });
  await m.waitForTimeout(1200);
  await m.getByTestId("pass-reveal").scrollIntoViewIfNeeded();
  await shot(m, "m-passes-code");
  const passCode = (await m.getByTestId("pass-code").textContent())!.trim();

  // ---------- ผู้ปกครองคนที่ 2 ให้คิวมีหลายแถว ----------
  await svc().rpc("pickup_start", { p_user: parent2.id, p_school: school, p_person: parent2.person, p_vehicle: parent2.vehicle, p_students: [s3], p_dist_m: 1300, p_eta_s: 420, p_src: "google" });
  await svc().from("pickup_sessions").update({ eta_source: "google" }).eq("parent_user_id", parent2.id);

  // ---------- เดสก์ท็อป ----------
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "th-TH" });
  const g = await dctx.newPage();
  await loginUI(g, gate.email, "/gate");
  await g.getByTestId("queue-row").first().waitFor({ timeout: 40_000 });
  await shot(g, "d-gate");
  await g.getByTestId("pass-check").scrollIntoViewIfNeeded();
  await g.getByTestId("pass-check").getByLabel("รหัสผู้รับแทน").fill(passCode);
  await g.getByRole("button", { name: "ตรวจรหัส" }).click();
  await g.getByTestId("pass-result").waitFor({ timeout: 40_000 });
  await shot(g, "d-gate-pass");
  await dctx.clearCookies();
  // อาจารย์ประจำชั้นและนักเรียนใช้สมาร์ตโฟน
  const tctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "th-TH" });
  await mockTiles(tctx2, await tctx2.newPage());
  const tp = await tctx2.newPage();
  await loginUI(tp, teacher.email, "/teacher");
  await tp.getByTestId("queue-board").waitFor({ timeout: 30_000 });
  await shot(tp, "m-teacher");
  await tp.getByText("คำขอผูกนักเรียนของห้องคุณ").first().scrollIntoViewIfNeeded();
  await tp.evaluate(() => window.scrollBy(0, -110));
  await shot(tp, "m-teacher-claims");
  await tp.getByText(/^รายชื่อนักเรียน/).first().scrollIntoViewIfNeeded().catch(() => undefined);
  await shot(tp, "m-teacher-roster");
  await tctx2.close();
  const stu = await makeUser("gdstu");
  await svc().from("school_settings").update({ student_dashboard_enabled: true }).eq("school_id", school);
  await svc().from("student_accounts").insert({ user_id: stu.id, student_id: s3, school_id: school });
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "th-TH" });
  const sp = await sctx.newPage();
  await loginUI(sp, stu.email, "/student");
  await shot(sp, "m-student");
  await sctx.close();
  await loginUI(g, adm.email, "/admin");
  await shot(g, "d-admin-approvals");
  for (const [p, n] of [["/admin/settings", "d-admin-settings"], ["/admin/classrooms", "d-admin-classrooms"], ["/admin/members", "d-admin-members"], ["/admin/zones", "d-admin-zones"], ["/admin/custody", "d-admin-custody"], ["/admin/announce", "d-admin-announce"], ["/admin/audit", "d-admin-audit"], ["/admin/analytics", "d-admin-analytics"], ["/admin/tv", "d-admin-tv"], ["/admin/line", "d-admin-line"]] as const) {
    await g.goto(p);
    await shot(g, n, { full: n === "d-admin-settings" });
  }
  // ฟอร์มผู้ดูแลถ่ายที่จอแคบ (820px) เพื่อให้ตัวอักษรอ่านง่ายเมื่อย่อลงหน้ากระดาษ
  const nctx = await browser.newContext({ viewport: { width: 820, height: 1000 }, deviceScaleFactor: 1.5, locale: "th-TH" });
  const np = await nctx.newPage();
  await loginUI(np, adm.email, `/admin/custody?student=${s1}`);
  await np.getByLabel("บันทึกเหตุผล (เห็นเฉพาะผู้ดูแลโรงเรียน)").fill("ตามคำสั่งศาล (ตัวอย่าง)");
  await shot(np, "n-custody");
  await np.goto("/admin/announce");
  await np.getByLabel("หัวข้อ").fill("ฝนตกหนัก");
  await np.getByLabel("ข้อความ").fill("รับนักเรียนที่อาคาร A เท่านั้น ขออภัยในความไม่สะดวก");
  await np.getByRole("checkbox", { name: /พักการรับนักเรียนทั้งโรงเรียน/ }).check();
  await shot(np, "n-announce");
  await nctx.close();
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, locale: "th-TH" });
  const tv = await tctx.newPage();
  await tv.goto(`/tv/${token}`);
  await tv.getByTestId("tv-board").waitFor({ timeout: 30_000 });
  await shot(tv, "d-tv");
  await mctx.close();
  await dctx.close();
  await tctx.close();
});

// ---------- ภาพเพิ่มสำหรับคู่มือฉบับละเอียด (ทุกบทบาท) ----------
test("ถ่ายภาพคู่มือฉบับละเอียด", async ({ browser }) => {
  const school = await makeSchool("gm");
  await setSchoolLocation(school, { dismissal_time: "15:30", voice_enabled: true, tv_show_arriving: true, student_dashboard_enabled: true });
  await svc().from("schools").update({ name_th: "โรงเรียนตัวอย่าง", short_name: "ตย." }).eq("id", school);
  const r1 = await makeClassroom(school, "ป.1/1");
  const r2 = await makeClassroom(school, "ป.2/1");
  const r3 = await makeClassroom(school, "ป.3/1");
  const z1 = (await svc().from("zones").insert({ school_id: school, name: "ประตู 1" }).select("id").single()).data!.id;
  await svc().from("zones").insert({ school_id: school, name: "ประตู 2" });
  await svc().from("classrooms").update({ zone_id: z1 }).eq("id", r1);
  const names: [string, string, string, string][] = [["สมชาย", "ใจดี", "น้องชาย", r1], ["ภูมิ", "รักเรียน", "น้องภูมิ", r1], ["ธนา", "สุขใจ", "น้องธนา", r1], ["สมหญิง", "ใจดี", "น้องหญิง", r2], ["มาลี", "ศรีสุข", "น้องมะลิ", r2], ["พิชญา", "แก้วมณี", "น้องพิม", r3], ["กานต์", "วงศ์ดี", "น้องกานต์", r3]];
  const sids: string[] = [];
  for (const [f, l, n, r] of names) { const id = await makeStudent(school, r, f, l); await svc().from("students").update({ nickname: n }).eq("id", id); sids.push(id); }
  const parent = await makeParent("gmp", school, r1, [sids[0]!, sids[3]!]);
  await svc().from("guardian_links").update({ claimed_classroom_id: r2 }).eq("user_id", parent.id).eq("student_id", sids[3]!);
  await svc().from("profiles").update({ display_name: "คุณแม่ตัวอย่าง" }).eq("id", parent.id);
  await svc().from("guardian_persons").update({ name: "คุณแม่ตัวอย่าง" }).eq("user_id", parent.id);
  const adm = await makeUser("gmadm");
  const gate = await makeUser("gmgate");
  const teacher = await makeUser("gmt");
  const pa = await makeUser("gmpa");
  await addMember(school, adm.id, "school_admin");
  await addMember(school, gate.id, "gate_staff");
  await addMember(school, teacher.id, "teacher", r1);
  await svc().from("platform_admins").insert({ user_id: pa.id, is_owner: false });
  await svc().from("profiles").update({ display_name: "ผู้ดูแลตัวอย่าง" }).eq("id", adm.id);
  await svc().from("profiles").update({ display_name: "ผู้ดูแลแพลตฟอร์ม (ตัวอย่าง)" }).eq("id", pa.id);
  await svc().from("profiles").update({ display_name: "ครูตัวอย่าง" }).eq("id", teacher.id);
  await svc().from("profiles").update({ display_name: "เจ้าหน้าที่ประตู" }).eq("id", gate.id);

  const M2 = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "th-TH" as const };

  // ผู้ปกครองใหม่: ลงทะเบียนทีละขั้น
  const nu = await makeUser("gmnew");
  const nctx = await browser.newContext(M2);
  const np = await nctx.newPage();
  await np.goto("/signup");
  await np.getByLabel("ชื่อที่ใช้แสดง").fill("คุณแม่ตัวอย่าง");
  await np.getByLabel("อีเมล").fill(nu.email);
  await np.getByLabel("รหัสผ่าน", { exact: true }).fill("Zz-test-pass-" + "12345");
  await shot(np, "g-signup-filled");
  await np.getByRole("button", { name: "สมัครใช้งาน", exact: true }).click();
  await np.getByRole("heading", { name: "คุณเป็นใคร" }).waitFor({ timeout: 30_000 });
  await shot(np, "g-role");
  await np.getByRole("button", { name: /ฉันเป็นผู้ปกครอง/ }).click();
  await np.getByRole("heading", { name: "ลงทะเบียนผู้ปกครอง" }).waitFor();
  await np.getByLabel("ชื่อ-นามสกุล").fill("สุดา ตัวอย่าง");
  await np.getByLabel("เบอร์โทร").fill("081-234-5678");
  await np.getByRole("button", { name: "เพิ่มผู้ปกครอง" }).click();
  await np.getByLabel(/ทะเบียน \(เช่น/).fill("กข 1234");
  await np.getByLabel("จังหวัด").selectOption("กรุงเทพมหานคร");
  await np.getByRole("button", { name: "เพิ่มรถ" }).click();
  await np.getByText("กข1234").waitFor();
  await shot(np, "g-onb-1");
  await np.getByRole("button", { name: "ถัดไป" }).click();
  const sel = np.getByLabel("โรงเรียน");
  if (await sel.count()) await sel.selectOption({ label: "โรงเรียนตัวอย่าง" });
  await np.getByLabel("ห้องเรียน").selectOption({ label: "ป.1/1" });
  await np.getByLabel("ชื่อ-นามสกุลนักเรียน").fill("ธนา สุขใจ");
  await np.getByTestId("homeroom-teacher").waitFor({ timeout: 20_000 }).catch(() => undefined);
  await shot(np, "g-onb-2");
  await np.getByRole("button", { name: "ส่งคำขอผูกนักเรียน" }).click();
  await np.getByText("รอโรงเรียนอนุมัติ").waitFor({ timeout: 20_000 });
  await shot(np, "g-onb-2b");
  await np.getByRole("button", { name: "ถัดไป" }).click();
  await shot(np, "g-onb-3");
  await np.getByRole("button", { name: "ถัดไป" }).click();
  await shot(np, "g-onb-4");
  await np.getByRole("checkbox").check();
  await np.getByRole("button", { name: "เสร็จสิ้นการลงทะเบียน" }).click();
  await np.getByRole("heading", { name: "บุตรหลานของฉัน" }).first().waitFor({ timeout: 30_000 });
  await shot(np, "g-home-pending");
  await nctx.close();

  // ผู้ปกครอง: ข้อมูลของฉัน (PDPA) + แถบเมนูล่าง + แจ้งเตือนฉุกเฉิน
  const mctx = await browser.newContext({ ...M2, geolocation: GEO, permissions: ["geolocation"] });
  const m = await mctx.newPage();
  await loginUI(m, parent.email, "/home");
  await shot(m, "g-nav-parent");
  await m.goto("/profile");
  await m.getByText("ข้อมูลของฉัน").first().scrollIntoViewIfNeeded().catch(() => undefined);
  await m.evaluate(() => window.scrollBy(0, -80));
  await shot(m, "g-mydata");
  await m.getByRole("button", { name: "เพิ่มเติม" }).click();
  await m.waitForTimeout(600);
  await shot(m, "g-more-parent");
  await m.keyboard.press("Escape");
  await svc().from("broadcasts").insert({ school_id: school, title: "ฝนตกหนัก — พักการรับชั่วคราว", body: "ขอให้ผู้ปกครองรอในรถ ครูจะพานักเรียนไปส่งที่รถเมื่อฝนซา", severity: "danger", pause_pickups: true });
  await svc().from("school_settings").update({ pickup_paused: true, pickup_pause_note: "ฝนตกหนัก" }).eq("school_id", school);
  await m.goto("/home");
  await shot(m, "g-notice");
  await svc().from("school_settings").update({ pickup_paused: false, pickup_pause_note: null }).eq("school_id", school);
  await svc().from("broadcasts").delete().eq("school_id", school);
  await mctx.close();

  // ผู้ดูแลโรงเรียน (มือถือ): เมนู 'เพิ่มเติม' ยาว + ไฮไลต์เมนู
  const actx = await browser.newContext(M2);
  const ap = await actx.newPage();
  await loginUI(ap, adm.email, "/admin/audit");
  await shot(ap, "g-nav-admin-audit");
  await ap.getByRole("button", { name: "เพิ่มเติม" }).click();
  await ap.waitForTimeout(700);
  await shot(ap, "g-more-admin");
  await ap.getByTestId("more-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await ap.waitForTimeout(400);
  await shot(ap, "g-more-admin-bottom");
  await actx.close();

  // เจ้าหน้าที่ประตู: คิว + ธงห้ามปล่อย + พักการรับ + แจ้งล่วงหน้า
  const p2 = await makeParent("gmp2", school, r1, [sids[1]!]);
  await svc().from("guardian_persons").update({ name: "คุณพ่อตัวอย่าง" }).eq("user_id", p2.id);
  await svc().rpc("pickup_start", { p_user: parent.id, p_school: school, p_person: parent.person, p_vehicle: parent.vehicle, p_students: [sids[0], sids[3]], p_dist_m: 900, p_eta_s: 300, p_src: "google" });
  await svc().rpc("pickup_start", { p_user: p2.id, p_school: school, p_person: p2.person, p_vehicle: p2.vehicle, p_students: [sids[1]], p_dist_m: 1500, p_eta_s: 480, p_src: "estimate" });
  await svc().from("dismissal_plans").insert([{ school_id: school, student_id: sids[4]!, plan_date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }), mode: "bus" }, { school_id: school, student_id: sids[5]!, plan_date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }), mode: "absent" }]);
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "th-TH" });
  const g = await dctx.newPage();
  await loginUI(g, gate.email, "/gate");
  await g.getByTestId("queue-row").first().waitFor({ timeout: 40_000 });
  await shot(g, "g-gate-zones");
  await g.getByTestId("queue-row").first().scrollIntoViewIfNeeded();
  const planBox = g.getByTestId("plans-today");
  if (await planBox.count()) { await planBox.scrollIntoViewIfNeeded(); await shot(g, "g-gate-plans"); }
  await svc().from("custody_flags").insert({ school_id: school, student_id: sids[1]!, kind: "hold_all", note: "ตัวอย่าง" });
  await svc().from("school_settings").update({ pickup_paused: true, pickup_pause_note: "ฝนตกหนัก" }).eq("school_id", school);
  await g.reload();
  await g.getByTestId("held-badge").waitFor({ timeout: 30_000 });
  await g.evaluate(() => window.scrollTo(0, 0));
  await shot(g, "g-gate-held-paused");
  await svc().from("school_settings").update({ pickup_paused: false, pickup_pause_note: null }).eq("school_id", school);
  await svc().from("custody_flags").delete().eq("school_id", school);

  // ผู้ดูแลโรงเรียน (เดสก์ท็อป): หน้าเพิ่มเติม
  await dctx.clearCookies();
  await loginUI(g, adm.email, "/admin/students");
  await shot(g, "g-admin-students");
  await g.goto("/admin/members");
  await g.getByLabel("ห้องประจำชั้น (เฉพาะครู)").selectOption({ label: "ป.2/1" });
  await g.getByRole("button", { name: "สร้างลิงก์เชิญ" }).click();
  await g.getByTestId("invite-link").waitFor({ timeout: 30_000 });
  await g.evaluate(() => document.querySelectorAll("code").forEach((c) => { c.textContent = (c.textContent ?? "").replace(/https?:\/\/[^/\s]+\/invite\/\w+/, "https://kidguards.vercel.app/invite/XXXXXXXXXXXXXXXX"); }));
  await shot(g, "g-admin-invite");
  for (const [p, n] of [["/admin/branding", "g-admin-branding"], ["/admin/classrooms", "g-admin-classrooms"], ["/admin/zones", "g-admin-zones"], ["/admin/tv", "g-admin-tv"]] as const) { await g.goto(p); await shot(g, n); }

  // ผู้ดูแลแพลตฟอร์ม
  await dctx.clearCookies();
  await loginUI(g, pa.email, "/platform");
  await shot(g, "g-platform");
  for (const [p, n] of [["/platform/brand", "g-platform-brand"], ["/platform/flags", "g-platform-flags"], ["/platform/rules", "g-platform-rules"], ["/platform/admins", "g-platform-admins"], ["/platform/analytics", "g-platform-analytics"]] as const) { await g.goto(p); await shot(g, n); }
  await g.goto("/admin/audit");
  await shot(g, "g-platform-audit");
  await dctx.close();
});

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation } from "../db/helpers";
import { loginUI } from "./helpers";

test.skip(!HAS_DB, "ต้องมีคีย์ Supabase (ดู CLAUDE.md)");
test.setTimeout(180_000);
test.afterAll(cleanup);

const SCHOOL = { lat: 13.7563, lng: 100.5018 };
const NORTH_1_2KM = { latitude: SCHOOL.lat + 0.0108, longitude: SCHOOL.lng, accuracy: 20 };
const FAR_10KM = { latitude: SCHOOL.lat + 0.09, longitude: SCHOOL.lng, accuracy: 20 };
const svc = () => admin();

async function world(tag: string) {
  const school = await makeSchool(tag);
  await setSchoolLocation(school);
  const room1 = await makeClassroom(school, "ป.1/1");
  const room2 = await makeClassroom(school, "ป.1/2");
  const sA = await makeStudent(school, room1, "สมชาย", "ทดสอบเอ");
  const sB = await makeStudent(school, room2, "สมหญิง", "ทดสอบบี");
  const sC = await makeStudent(school, room1, "สมศรี", "ทดสอบซี");
  const parent = await makeParent(`${tag}p1`, school, room1, [sA, sB]);
  const parent2 = await makeParent(`${tag}p2`, school, room1, [sC]);
  const gate = await makeUser(`${tag}gate`);
  const t1 = await makeUser(`${tag}t1`);
  const t2 = await makeUser(`${tag}t2`);
  await addMember(school, gate.id, "gate_staff");
  await addMember(school, t1.id, "teacher", room1);
  await addMember(school, t2.id, "teacher", room2);
  return { school, room1, room2, sA, sB, sC, parent, parent2, gate, t1, t2 };
}

async function asParent(context: BrowserContext, page: Page, email: string, geo = NORTH_1_2KM) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(geo);
  await loginUI(page, email, "/pickup");
  await expect(page.getByRole("heading", { name: "แจ้งการเดินทางมารับ" })).toBeVisible({ timeout: 20_000 });
}

test.describe("แกนหลัก: check-in → คิว (Live) → check-out", () => {
  test("ผู้ปกครอง check-in ได้ในรัศมี; ไกลเกิน/สัญญาณไม่แม่นถูกปฏิเสธพร้อมข้อความที่ตั้งตามค่า Admin", async ({ page, context }) => {
    const w = await world("pk1");
    await asParent(context, page, w.parent.email, FAR_10KM);
    await page.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("ไม่เกิน 2.0 กม.", { timeout: 30_000 });
    await expect(page.locator('main [role="alert"]')).toContainText(/ห่างประมาณ \d+\.\d กม\./);
    // ค่ารัศมีมาจากการตั้งค่า ไม่ใช่ค่าตายตัวในหน้าเว็บ
    await svc().from("school_settings").update({ checkin_radius_m: 15000 }).eq("school_id", w.school);
    await context.setGeolocation({ ...FAR_10KM, accuracy: 1000 });
    await page.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("ยังไม่แม่นพอ", { timeout: 30_000 });
    await context.setGeolocation(FAR_10KM);
    await page.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
    await expect(page.getByTestId("travel-view")).toBeVisible({ timeout: 30_000 }); // อยู่ในรัศมี 15 กม. แล้ว
    await expect(page.getByTestId("eta")).toContainText("นาที");
    expect((await svc().from("pickup_sessions").select("status,eta_source,school_id").eq("parent_user_id", w.parent.id).single()).data).toMatchObject({ status: "on_the_way", eta_source: "estimate" });
  });

  test("Live sync: จอประตูเห็นผู้ปกครองใหม่ทันทีโดยไม่ refresh, ลำดับสลับสดเมื่อคนอื่นใกล้กว่า, ยืนยัน/เรียก/ส่งมอบสะท้อนไปที่ผู้ปกครองทันที", async ({ browser }) => {
    const w = await world("pk2");
    const gctx = await browser.newContext();
    const gate = await gctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    await expect(gate.getByTestId("queue-empty")).toBeVisible({ timeout: 30_000 });

    const pctx = await browser.newContext();
    const parent = await pctx.newPage();
    await asParent(pctx, parent, w.parent.email);
    await parent.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
    await expect(parent.getByTestId("travel-view")).toBeVisible({ timeout: 30_000 });

    // จอประตูไม่ได้ reload เอง (ไม่เรียก goto/reload) แต่แถวต้องโผล่ภายในไม่กี่วินาที
    const row1 = gate.getByTestId("queue-row").filter({ hasText: w.parent.person ? "คุณ pk2p1" : "" });
    await expect(row1).toBeVisible({ timeout: 30_000 });
    await expect(row1).toContainText("สมชาย ทดสอบเอ");
    await expect(row1).toContainText("สมหญิง ทดสอบบี"); // พี่น้องคนละห้อง = แถวเดียว เจ้าหน้าที่ประตูเห็นทั้งสอง
    await expect(row1).toContainText("ป.1/2");

    // ผู้ปกครองคนที่ 2 ใกล้กว่า → ขึ้นนำอัตโนมัติ
    const { data: s2 } = await svc().rpc("pickup_start", { p_user: w.parent2.id, p_school: w.school, p_person: w.parent2.person, p_vehicle: w.parent2.vehicle, p_students: [w.sC], p_dist_m: 300, p_eta_s: 40, p_src: "estimate" });
    await expect(gate.getByTestId("queue-row")).toHaveCount(2, { timeout: 30_000 });
    await expect(gate.getByTestId("queue-row").first()).toContainText("คุณ pk2p2");
    await expect(gate.getByTestId("queue-count")).toContainText("2 คัน");

    // เจ้าหน้าที่ยืนยันตัว → ผู้ปกครองเห็น
    await row1.getByRole("button", { name: "ยืนยันตัวที่ประตู" }).click();
    await expect(parent.getByText("เจ้าหน้าที่ยืนยันตัวแล้ว")).toBeVisible({ timeout: 30_000 });
    // เรียกนักเรียน → ผู้ปกครองเห็นว่าเรียกแล้ว
    await row1.getByRole("button", { name: "เรียกนักเรียน" }).click();
    await expect(parent.getByTestId("child-called").first()).toBeVisible({ timeout: 30_000 });
    // ส่งนักเรียนแล้ว (เจ้าหน้าที่กดก่อน) → ผู้ปกครองกลับหน้าแจ้งใหม่ พร้อมข้อความว่าโรงเรียนส่งแล้ว; แถวหายจากจอประตู
    await row1.getByRole("button", { name: "ส่งนักเรียนแล้ว" }).click();
    await expect(parent.getByTestId("pickup-last")).toContainText("โรงเรียนส่งนักเรียนให้เรียบร้อยแล้ว", { timeout: 30_000 });
    await expect(gate.getByTestId("queue-row")).toHaveCount(1, { timeout: 30_000 });
    expect((await svc().from("pickup_sessions").select("status,completed_by_role").eq("parent_user_id", w.parent.id).single()).data).toEqual({ status: "completed", completed_by_role: "gate_staff" });
    void s2;
    await gctx.close();
    await pctx.close();
  });

  test("ผู้ปกครองกด 'รับนักเรียนแล้ว' ก่อน → แถวหายจากจอประตูและครูทันที (D); 'ฉันถึงประตูแล้ว' ขึ้นเป็นแจ้งถึงเอง", async ({ browser }) => {
    const w = await world("pk3");
    const gctx = await browser.newContext();
    const gate = await gctx.newPage();
    await loginUI(gate, w.gate.email, "/gate");
    const tctx = await browser.newContext();
    const teacher = await tctx.newPage();
    await loginUI(teacher, w.t1.email, "/teacher");
    await expect(teacher.getByText("ผู้ปกครองที่กำลังมารับนักเรียนห้องของฉัน")).toBeVisible({ timeout: 30_000 });

    const pctx = await browser.newContext();
    const parent = await pctx.newPage();
    await asParent(pctx, parent, w.parent.email);
    await parent.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
    await expect(parent.getByTestId("travel-view")).toBeVisible({ timeout: 30_000 });
    await expect(gate.getByTestId("queue-row")).toHaveCount(1, { timeout: 30_000 });
    // ครู ป.1/1 เห็นเฉพาะเด็กห้องตัวเอง (สมชาย) ไม่เห็นสมหญิง (ป.1/2)
    const trow = teacher.getByTestId("queue-row");
    await expect(trow).toHaveCount(1, { timeout: 30_000 });
    await expect(trow).toContainText("สมชาย ทดสอบเอ");
    await expect(trow).not.toContainText("สมหญิง");

    await parent.getByRole("button", { name: "ฉันถึงประตูแล้ว" }).click();
    await expect(gate.getByTestId("queue-row")).toContainText("แจ้งถึงเอง", { timeout: 30_000 });
    await expect(gate.getByTestId("queue-row")).toHaveAttribute("data-status", "arrived");

    await parent.getByRole("button", { name: "รับนักเรียนแล้ว" }).click();
    await expect(gate.getByTestId("queue-row")).toHaveCount(0, { timeout: 30_000 });
    await expect(teacher.getByTestId("queue-row")).toHaveCount(0, { timeout: 30_000 });
    await expect(parent.getByTestId("pickup-last")).toContainText("คุณกดรับนักเรียนเรียบร้อยแล้ว", { timeout: 30_000 });
    expect((await svc().from("pickup_sessions").select("completed_by_role").eq("parent_user_id", w.parent.id).single()).data?.completed_by_role).toBe("parent");
    await gctx.close(); await tctx.close(); await pctx.close();
  });

  test("ทางสำรอง: ปิด WebSocket แล้วจอประตูยังอัปเดตเองด้วย polling", async ({ browser }) => {
    const w = await world("pk4");
    const gctx = await browser.newContext();
    const gate = await gctx.newPage();
    await gate.routeWebSocket(/.*/, (ws) => ws.close()); // บล็อก socket ทุกชนิด
    await loginUI(gate, w.gate.email, "/gate");
    await expect(gate.getByTestId("queue-empty")).toBeVisible({ timeout: 30_000 });
    await expect(gate.getByTestId("live-status")).toHaveAttribute("data-state", "poll", { timeout: 30_000 });
    await svc().rpc("pickup_start", { p_user: w.parent.id, p_school: w.school, p_person: w.parent.person, p_vehicle: w.parent.vehicle, p_students: [w.sA], p_dist_m: 900, p_eta_s: 200, p_src: "estimate" });
    await expect(gate.getByTestId("queue-row")).toHaveCount(1, { timeout: 40_000 });
    await gctx.close();
  });

  test("สิทธิ์หน้าจอ: ผู้ปกครองเปิด /gate ไม่ได้ (404), เจ้าหน้าที่ประตูเปิด /pickup แล้วถูกส่งกลับหน้าทำงานของตน, ครูอีกห้องไม่เห็นเด็กห้องอื่น", async ({ browser }) => {
    const w = await world("pk5");
    await svc().rpc("pickup_start", { p_user: w.parent.id, p_school: w.school, p_person: w.parent.person, p_vehicle: w.parent.vehicle, p_students: [w.sA], p_dist_m: 500, p_eta_s: 100, p_src: "estimate" });
    const a = await browser.newContext(); const pa = await a.newPage();
    await loginUI(pa, w.parent.email, "/gate");
    await expect(pa.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible({ timeout: 30_000 });
    const b = await browser.newContext(); const pb = await b.newPage();
    await loginUI(pb, w.gate.email, "/pickup");
    await expect(pb).toHaveURL(/\/gate$/, { timeout: 30_000 });
    await expect(pb.getByTestId("queue-row")).toHaveCount(1, { timeout: 30_000 });
    const c = await browser.newContext(); const pc = await c.newPage();
    await loginUI(pc, w.t2.email, "/teacher"); // ครู ป.1/2 — session นี้มีแต่เด็ก ป.1/1
    await expect(pc.getByText("ผู้ปกครองที่กำลังมารับนักเรียนห้องของฉัน")).toBeVisible({ timeout: 30_000 });
    await expect(pc.getByTestId("queue-row")).toHaveCount(0);
    await a.close(); await b.close(); await c.close();
  });

  test("API: ไม่ล็อกอิน = 401, ข้อมูลผิดรูป = 422; cron ต้องมี secret", async ({ request }) => {
    const r1 = await request.post("/api/pickup/start", { data: { lat: 1 } });
    expect(r1.status()).toBe(401);
    expect((await request.post("/api/pickup/update", { data: {} })).status()).toBe(401);
    expect((await request.get("/api/live/token")).status()).toBe(401);
    expect((await request.get("/api/live?scope=school&id=00000000-0000-0000-0000-000000000000")).status()).toBe(401);
    expect((await request.get("/api/cron/tick")).status()).toBe(401);
    expect((await request.get("/api/cron/tick", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  });

  test("cron หมดอายุ: session ที่ค้างถูกปิดและผู้ปกครองเห็นข้อความว่าหมดอายุ", async ({ page, context, request }) => {
    test.skip(!!process.env.E2E_BASE_URL, "ไม่รู้ CRON_SECRET ของ production");
    const w = await world("pk6");
    const { data } = await svc().rpc("pickup_start", { p_user: w.parent.id, p_school: w.school, p_person: w.parent.person, p_vehicle: w.parent.vehicle, p_students: [w.sA], p_dist_m: 900, p_eta_s: 200, p_src: "estimate" });
    await svc().from("pickup_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", data);
    const r = await request.get("/api/cron/tick", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(r.status()).toBe(200);
    expect((await r.json()).expired).toBeGreaterThanOrEqual(1);
    expect((await svc().from("pickup_sessions").select("status").eq("id", data).single()).data?.status).toBe("expired");
    await asParent(context, page, w.parent.email);
    await expect(page.getByTestId("pickup-last")).toContainText("หมดอายุ", { timeout: 30_000 });
  });
});

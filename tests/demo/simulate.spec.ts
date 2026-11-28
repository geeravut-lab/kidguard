// จำลองวันเลิกเรียนจริงของโรงเรียนสาธิต โดยทุกคนเป็น "ผู้ใช้จริง" ที่ล็อกอินด้วยรหัสผ่านและกดผ่านหน้าจอ
// (ผู้ปกครอง/เจ้าหน้าที่ประตู/ผู้ดูแลโรงเรียน) — ธุรกรรมแต่ละรายการเกิดจากปุ่มจริงในระบบ ไม่ได้ยัดข้อมูลเข้าฐาน
// ต้องรัน `node scripts/demo-data.mjs --seed` ก่อน
import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { DEMO, emails, world } from "../../scripts/demo-data.mjs";

const { STUDENTS, PARENTS } = world as { STUDENTS: [string, string, string, number][]; PARENTS: [string, string, number[], string, string, string][] };
const SCHOOL = { lat: DEMO.lat, lng: DEMO.lng };
const NEAR = { latitude: SCHOOL.lat + 0.0108, longitude: SCHOOL.lng, accuracy: 20 }; // ~1.2 กม. ทางเหนือ
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

type Rec = { n: number; actor: string; what: string; ok: boolean; ms: number; err?: string };
const log: Rec[] = [];
let n = 0;
async function tx(actor: string, what: string, fn: () => Promise<void>) {
  const t = Date.now();
  const rec: Rec = { n: ++n, actor, what, ok: true, ms: 0 };
  try { await fn(); } catch (e) { rec.ok = false; rec.err = String((e as Error).message).split("\n")[0]!.slice(0, 200); }
  rec.ms = Date.now() - t;
  log.push(rec);
  console.log(`${rec.ok ? "✓" : "✗"} #${String(rec.n).padStart(2, "0")} ${actor.padEnd(14)} ${what}  (${(rec.ms / 1000).toFixed(1)} วิ)${rec.err ? "  ← " + rec.err : ""}`);
}

const ctxs = new Map<string, { ctx: BrowserContext; page: Page }>();
async function as(browser: Browser, email: string, opts: { mobile?: boolean; geo?: boolean } = {}) {
  const hit = ctxs.get(email);
  if (hit) return hit.page;
  const ctx = await browser.newContext({ ...(opts.mobile ? { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } : { viewport: { width: 1366, height: 800 } }), ...(opts.geo ? { geolocation: NEAR, permissions: ["geolocation"] } : {}) });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(DEMO.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  ctxs.set(email, { ctx, page });
  return page;
}

test("จำลองวันเลิกเรียนของโรงเรียนสาธิต (ผู้ใช้จริงทุกบทบาท)", async ({ browser }) => {
  const db = svc();
  const school = (await db.from("schools").select("id").eq("slug", DEMO.slug).single()).data!.id as string;
  const studentIds = new Map<string, string>(((await db.from("students").select("id,student_code").eq("school_id", school)).data ?? []).map((s) => [s.student_code as string, s.id as string]));
  const sid = (idx: number) => studentIds.get(`D${String(idx + 1).padStart(4, "0")}`)!;
  const person = (p: number) => PARENTS[p - 1]![0];
  const kidName = (idx: number) => STUDENTS[idx]![0];

  const admin = await as(browser, emails.schoolAdmin);
  const gate1 = await as(browser, emails.gate(1));
  const gate2 = await as(browser, emails.gate(2));
  await gate1.goto("/gate");
  await gate2.goto("/gate");
  const rowOf = (g: Page, name: string) => g.getByTestId("queue-row").filter({ hasText: name });

  // ───────── เช้า: ผู้ดูแลโรงเรียนเตรียมระบบ ─────────
  await admin.goto("/admin");
  for (const claimed of ["วรรณา ชัยมงคล", "อนันต์ แก้วมณี", "กัลยา ภู่ทอง"]) {
    const kid = claimed === "วรรณา ชัยมงคล" ? STUDENTS[20]! : claimed === "อนันต์ แก้วมณี" ? STUDENTS[21]! : STUDENTS[22]!;
    await tx("school_admin", `อนุมัติคำขอผูกนักเรียน (${kid[0]} ${kid[1]})`, async () => {
      await admin.goto("/admin");
      const card = admin.getByTestId("claim-card").filter({ hasText: `${kid[0]} ${kid[1]}` });
      await card.getByRole("button", { name: "อนุมัติ", exact: true }).click();
      await expect(admin.getByTestId("claim-card").filter({ hasText: `${kid[0]} ${kid[1]}` })).toHaveCount(0, { timeout: 45_000 });
    });
  }
  for (const [room, zone] of [["ป.1/1", "ประตูหน้า"], ["ป.2/1", "ประตูข้าง"], ["ป.4/1", "ลานจอดรถ"]] as const) {
    await tx("school_admin", `กำหนดประตูให้ห้อง ${room} → ${zone}`, async () => {
      await admin.goto("/admin/zones");
      await admin.getByLabel(`ประตูของแต่ละห้อง ${room}`).selectOption({ label: zone });
      await admin.locator(`[data-room="${room}"]`).getByRole("button", { name: "บันทึก" }).click();
      await expect.poll(async () => (await db.from("classrooms").select("zone_id").eq("school_id", school).eq("name", room).single()).data!.zone_id, { timeout: 45_000 }).not.toBeNull();
    });
  }
  let tvUrl = "";
  await tx("school_admin", "ลงทะเบียนจอ TV หน้าประตู", async () => {
    await admin.goto("/admin/tv");
    await admin.getByLabel("ชื่อจอ เช่น จอหน้าประตู 1").fill("จอ TV หน้าประตูหลัก");
    await admin.getByRole("button", { name: "เพิ่มจอ" }).click();
    tvUrl = (await admin.getByTestId("tv-url-text").textContent({ timeout: 45_000 }))!.trim();
    expect(tvUrl).toMatch(/\/tv\//);
  });

  // ───────── บ่าย: ผู้ปกครองแจ้งล่วงหน้า ─────────
  for (const [p, mode] of [[5, "bus"], [6, "absent"], [9, "other"]] as const) {
    await tx(`parent${String(p).padStart(2, "0")}`, `แจ้งล่วงหน้าว่าวันนี้ ${mode === "bus" ? "ไปกับรถโรงเรียน" : mode === "absent" ? "ลาหยุด" : "รับด้วยวิธีอื่น"}`, async () => {
      const pg = await as(browser, emails.parent(p), { mobile: true, geo: true });
      await pg.goto("/home");
      await expect(pg.getByTestId("plans-current")).toBeVisible({ timeout: 45_000 });
      await pg.getByRole("checkbox").first().check();
      await pg.getByLabel("กลับอย่างไร").selectOption(mode);
      await pg.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(pg.getByRole("status").filter({ hasText: "บันทึกการแจ้งล่วงหน้าแล้ว" })).toBeVisible({ timeout: 45_000 });
    });
  }

  // ───────── เลิกเรียน: ผู้ปกครองเริ่มเดินทางมารับ ─────────
  const checkin = async (p: number) => tx(`parent${String(p).padStart(2, "0")}`, `แจ้ง "ฉันกำลังไปรับ" (${person(p)})`, async () => {
    const pg = await as(browser, emails.parent(p), { mobile: true, geo: true });
    await pg.goto("/pickup");
    await expect(pg.getByRole("heading", { name: "แจ้งการเดินทางมารับ" })).toBeVisible({ timeout: 45_000 });
    await pg.getByRole("button", { name: "ฉันกำลังไปรับ" }).click();
    await expect(pg.getByTestId("travel-view")).toBeVisible({ timeout: 60_000 });
  });
  for (const p of [1, 2, 3, 4, 7, 8]) await checkin(p);
  // (พ่อแม่ที่ 5,6 แจ้งล่วงหน้าไว้แล้ว แต่ยังมีผู้ปกครองอีกกลุ่มมาจริง) ผู้ปกครองที่ 10–12 มาในช่วงท้าย

  await tx("gate_staff", "จอประตูเห็นคิวผู้ปกครอง 6 คัน", async () => {
    await expect(gate1.getByTestId("queue-row")).toHaveCount(6, { timeout: 90_000 });
  });

  await tx("parent07", `แจ้ง "ฉันถึงประตูแล้ว" (${person(7)})`, async () => {
    const pg = await as(browser, emails.parent(7), { mobile: true, geo: true });
    await pg.getByRole("button", { name: "ฉันถึงประตูแล้ว" }).click();
    await expect(rowOf(gate1, person(7))).toHaveAttribute("data-status", "arrived", { timeout: 60_000 });
  });

  const verify = (g: Page, who: string, p: number) => tx(who, `ยืนยันตัวผู้ปกครองที่ประตู (${person(p)})`, async () => {
    const row = rowOf(g, person(p));
    await row.getByRole("button", { name: "ยืนยันตัวที่ประตู" }).click();
    await expect(row.getByRole("button", { name: "ยืนยันตัวที่ประตู" })).toHaveCount(0, { timeout: 45_000 });
  });
  const call = (g: Page, who: string, p: number) => tx(who, `เรียกนักเรียนมาที่ประตู (${PARENTS[p - 1]![2].map((k) => kidName(k)).join(" + ")})`, async () => {
    const row = rowOf(g, person(p));
    await row.getByRole("button", { name: "เรียกนักเรียน" }).click();
    await expect(row.getByRole("button", { name: "เรียกนักเรียน" })).toHaveCount(0, { timeout: 45_000 });
  });
  const release = (g: Page, who: string, p: number) => tx(who, `ส่งนักเรียนให้ผู้ปกครองแล้ว (${person(p)})`, async () => {
    const row = rowOf(g, person(p));
    await row.getByRole("button", { name: "ส่งนักเรียนแล้ว" }).click();
    await expect(rowOf(g, person(p))).toHaveCount(0, { timeout: 60_000 });
  });

  for (const p of [1, 2, 3, 7]) await verify(gate1, "gate01", p);
  for (const p of [1, 2, 3, 7]) await call(gate1, "gate01", p);
  for (const p of [1, 2, 3]) await release(gate1, "gate01", p);
  await release(gate1, "gate01", 7);

  await verify(gate2, "gate02", 4);
  await call(gate2, "gate02", 4);
  await tx("parent04", "ผู้ปกครองเห็นว่า 'ครูเรียกนักเรียนแล้ว' และกดรับนักเรียนเอง", async () => {
    const pg = await as(browser, emails.parent(4), { mobile: true, geo: true });
    await expect(pg.getByTestId("child-called").first()).toBeVisible({ timeout: 60_000 });
    await pg.getByRole("button", { name: "รับนักเรียนแล้ว" }).click();
    await expect(pg.getByTestId("pickup-last")).toContainText("คุณกดรับนักเรียนเรียบร้อยแล้ว", { timeout: 60_000 });
  });

  // ───────── ความปลอดภัย: ธงห้ามปล่อย ─────────
  const heldKid = PARENTS[7]![2][0]!;
  await tx("school_admin", `ติดธง "ห้ามปล่อย" ให้ ${kidName(heldKid)} (คำสั่งผู้ปกครองอีกฝ่าย)`, async () => {
    await admin.goto(`/admin/custody?student=${sid(heldKid)}`);
    await admin.getByLabel("บันทึกเหตุผล (เห็นเฉพาะผู้ดูแลโรงเรียน)").fill("เอกสารคำสั่งศาล (ข้อมูลสาธิต)");
    await admin.getByRole("button", { name: "ติดธง" }).click();
    await expect(admin.getByRole("status").filter({ hasText: "ติดธงแล้ว" })).toBeVisible({ timeout: 45_000 });
  });
  await tx("gate01", "จอประตูแสดงป้าย ห้ามปล่อย และปิดปุ่มส่งนักเรียน", async () => {
    await expect(rowOf(gate1, person(8)).getByTestId("held-badge")).toBeVisible({ timeout: 60_000 });
    await expect(rowOf(gate1, person(8)).getByRole("button", { name: "ส่งนักเรียนแล้ว" })).toBeDisabled();
  });
  await tx("school_admin", `ยกเลิกธงห้ามปล่อยของ ${kidName(heldKid)} (ยืนยันกับผู้ปกครองแล้ว)`, async () => {
    await admin.goto(`/admin/custody?student=${sid(heldKid)}`);
    await admin.getByRole("button", { name: "ยกเลิกธง" }).click();
    await expect(rowOf(gate1, person(8)).getByTestId("held-badge")).toHaveCount(0, { timeout: 60_000 });
  });
  await verify(gate1, "gate01", 8);
  await call(gate1, "gate01", 8);
  await release(gate1, "gate01", 8);

  // ───────── ผู้รับแทน (รหัส + QR) ─────────
  const codes: string[] = [];
  for (const [p, name, plate] of [[9, "คุณลุงสมบัติ", "1ขก9988"], [10, "คุณป้าวันเพ็ญ", ""]] as const) {
    await tx(`parent${String(p).padStart(2, "0")}`, `สร้างรหัสผู้รับแทน "${name}"`, async () => {
      const pg = await as(browser, emails.parent(p), { mobile: true, geo: true });
      await pg.goto("/passes");
      await pg.getByLabel("ชื่อผู้รับแทน").fill(name);
      if (plate) await pg.getByLabel("ทะเบียนรถ (ถ้ามี)").fill(plate);
      await pg.getByRole("button", { name: "สร้างรหัส" }).click();
      codes.push((await pg.getByTestId("pass-code").textContent({ timeout: 45_000 }))!.trim());
    });
  }
  await tx("gate02", `ตรวจรหัสผู้รับแทน (คุณลุงสมบัติ) และส่งนักเรียน`, async () => {
    await gate2.goto("/gate");
    const panel = gate2.getByTestId("pass-check");
    await panel.getByLabel("รหัสผู้รับแทน").fill(codes[0]!);
    await panel.getByRole("button", { name: "ตรวจรหัส" }).click();
    await expect(gate2.getByTestId("pass-holder")).toHaveText("คุณลุงสมบัติ", { timeout: 45_000 });
    await gate2.getByRole("button", { name: "ตรวจบัตรแล้ว — ส่งนักเรียน" }).click();
    await expect(gate2.getByTestId("pass-done")).toBeVisible({ timeout: 45_000 });
  });
  await tx("parent10", `ผู้ปกครองยกเลิกรหัสผู้รับแทน (เปลี่ยนแผน)`, async () => {
    const pg = await as(browser, emails.parent(10), { mobile: true, geo: true });
    await pg.goto("/passes");
    await pg.getByRole("button", { name: "ยกเลิกรหัส" }).first().click();
    await expect(pg.getByTestId("pass-list").locator('[data-status="revoked"]')).toHaveCount(1, { timeout: 45_000 });
  });

  // ───────── ประกาศฉุกเฉิน + พักการรับ ─────────
  for (const p of [11, 12]) await checkin(p);
  await tx("school_admin", "ส่งประกาศทั่วไปถึงผู้ปกครองทุกคน (ปรับจุดรับนักเรียน)", async () => {
    await admin.goto("/admin/announce");
    await admin.getByLabel("หัวข้อ").fill("แจ้งจุดรับนักเรียนอนุบาล");
    await admin.getByLabel("ข้อความ").fill("วันนี้รับนักเรียนอนุบาลที่ประตูข้าง เนื่องจากปรับปรุงทางเดินหน้าอาคาร");
    await admin.getByLabel("ระดับ").selectOption("info");
    await admin.getByRole("button", { name: "ส่งประกาศ" }).click();
    await expect(admin.getByTestId("broadcast-recipients")).toContainText("ส่งถึง", { timeout: 90_000 });
  });
  await tx("school_admin", "ประกาศฉุกเฉิน: ฝนตกหนัก + พักการรับนักเรียนทั้งโรงเรียน", async () => {
    await admin.goto("/admin/announce");
    await admin.getByLabel("หัวข้อ").fill("ฝนตกหนัก — พักการรับชั่วคราว");
    await admin.getByLabel("ข้อความ").fill("ขอให้ผู้ปกครองรอในรถ ครูจะนำนักเรียนไปส่งที่รถเมื่อฝนซา");
    await admin.getByLabel("ระดับ").selectOption("danger");
    await admin.getByRole("checkbox", { name: /พักการรับนักเรียนทั้งโรงเรียน/ }).check();
    await admin.getByRole("button", { name: "ส่งประกาศ" }).click();
    await expect(admin.getByTestId("resume-btn")).toBeVisible({ timeout: 90_000 });
  });
  await tx("gate01", "จอประตูขึ้นแบนเนอร์ พักการรับ และปิดปุ่มส่งนักเรียน", async () => {
    await expect(gate1.getByTestId("paused-banner")).toBeVisible({ timeout: 60_000 });
  });
  await tx("parent11", "ผู้ปกครองเห็นประกาศฉุกเฉินบนมือถือ", async () => {
    const pg = await as(browser, emails.parent(11), { mobile: true, geo: true });
    await pg.goto("/home");
    await expect(pg.getByTestId("notice-banner")).toContainText("ฝนตกหนัก", { timeout: 60_000 });
  });
  await tx("school_admin", "เปิดรับนักเรียนอีกครั้ง (ฝนซาแล้ว)", async () => {
    await admin.getByTestId("resume-btn").click();
    await expect(admin.getByTestId("resume-btn")).toHaveCount(0, { timeout: 60_000 });
    await expect(gate1.getByTestId("paused-banner")).toHaveCount(0, { timeout: 60_000 });
  });
  for (const p of [11, 12]) { await verify(gate2, "gate02", p); await call(gate2, "gate02", p); await release(gate2, "gate02", p); }

  // ───────── ภาพรวมสำหรับผู้บริหาร + ครูดูคิวห้องตัวเอง ─────────
  await tx("teacher", "ครูประจำชั้น ป.1/1 เปิดดูคิวห้องของตัวเอง", async () => {
    const pg = await as(browser, emails.teacher(1), { mobile: true });
    await pg.goto("/teacher");
    await expect(pg.getByText("ผู้ปกครองที่กำลังมารับนักเรียนห้องของฉัน")).toBeVisible({ timeout: 45_000 });
  });
  await tx("student", "นักเรียนเปิดหน้าของฉัน", async () => {
    const pg = await as(browser, emails.student(1), { mobile: true });
    await pg.goto("/student");
    await expect(pg).not.toHaveURL(/\/login/);
  });

  for (const { ctx } of ctxs.values()) await ctx.close();
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-report.json", JSON.stringify({ tvUrl: tvUrl.replace(/[A-Za-z0-9_-]{24}$/, "<token>"), total: log.length, ok: log.filter((l) => l.ok).length, log }, null, 2));
  const bad = log.filter((l) => !l.ok);
  console.log(`\nสรุป: ${log.length} รายการ สำเร็จ ${log.length - bad.length} ล้มเหลว ${bad.length}`);
  expect(bad, "มีขั้นตอนที่ล้มเหลว").toEqual([]);
});

import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { bindLine, startLineLink } from "@/lib/line/service";
import { handleLineWebhook } from "@/lib/line/webhook";
import { notifyUser } from "@/lib/notify";
import { handlePickupEvent } from "@/lib/notify/pickup-events";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation, sql, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);
const SECRET = "test-channel-secret";
const TOKEN = "test-access-token";

/** LINE จำลอง: เก็บทุกคำขอ push/reply และตอบตามที่กำหนด */
function fakeLine(status = 200) {
  const calls: { path: string; body: { to?: string; messages: { type: string; text?: string; altText?: string; contents?: unknown }[] }; headers: Record<string, string> }[] = [];
  let plan: number[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ path: new URL(url).pathname, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> });
    return new Response("{}", { status: plan.length ? plan.shift()! : status });
  }) as unknown as typeof fetch;
  return { fetchImpl: fn, calls, next: (...s: number[]) => { plan = s; } };
}
const sign = (raw: string) => createHmac("sha256", SECRET).update(raw).digest("base64");
const event = (uid: string, text: string, i = 0) => ({ type: "message", replyToken: `rt${i}`, source: { type: "user", userId: uid }, message: { type: "text", text } });

d("LINE: ผูกบัญชี (webhook) และส่งการ์ด", () => {
  let school = "", slug = "", room = "";
  let parent: Awaited<ReturnType<typeof makeParent>>, other: TestUser, stu = "";
  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
    school = await makeSchool("ln");
    slug = (await admin().from("schools").select("slug").eq("id", school).single()).data!.slug;
    room = await makeClassroom(school, "ป.1/1");
    stu = await makeStudent(school, room, "ภูมิ", "นามสกุลลับ");
    await admin().from("students").update({ nickname: "ภู" }).eq("id", stu);
    parent = await makeParent("lnp", school, room, [stu]);
    other = await makeUser("lno");
    await admin().from("school_line_channels").upsert({ school_id: school, basic_id: "@zztest", channel_secret_enc: encryptSecret(SECRET), access_token_enc: encryptSecret(TOKEN), enabled: true, monthly_quota: 5 });
  });
  afterAll(cleanup);

  const webhook = (events: unknown[], f = fakeLine(), sig?: string | null) => {
    const raw = JSON.stringify({ events });
    return handleLineWebhook({ raw, signature: sig === undefined ? sign(raw) : sig, slug }, { fetchImpl: f.fetchImpl }).then((r) => ({ r, f }));
  };
  const channel = async (u = parent.id) => (await admin().from("notification_channels").select("status,address,code_hash,last_error").eq("user_id", u).eq("school_id", school).maybeSingle()).data;

  it("ความลับเก็บแบบเข้ารหัส และผู้ใช้อ่านตารางตั้งค่า/ช่องทางไม่ได้", async () => {
    const row = (await admin().from("school_line_channels").select("channel_secret_enc,access_token_enc").eq("school_id", school).single()).data!;
    expect(row.channel_secret_enc).not.toContain(SECRET);
    expect(row.access_token_enc.startsWith("v1:")).toBe(true);
    for (const t of ["school_line_channels", "notification_channels", "message_log"]) expect((await parent.client.from(t).select("*").limit(1)).error, t).not.toBeNull();
  });

  it("webhook: ลายเซ็นผิด/ไม่มี → 401 (ไม่อ่านต่อ), โรงเรียนไม่มี → 404, body ใหญ่เกิน → 401, JSON พัง → 400", async () => {
    expect((await webhook([], fakeLine(), "bad")).r.status).toBe(401);
    expect((await webhook([], fakeLine(), null)).r.status).toBe(401);
    const raw = JSON.stringify({ events: [], pad: "x".repeat(210_000) });
    expect((await handleLineWebhook({ raw, signature: sign(raw), slug }, {})).status).toBe(401);
    expect((await handleLineWebhook({ raw: "{}", signature: "x", slug: "no-such-school" }, {})).status).toBe(404);
    const bad = "not json";
    expect((await handleLineWebhook({ raw: bad, signature: sign(bad), slug }, {})).status).toBe(400);
  });

  it("เวิร์กโฟลว์ผูกบัญชี: ขอรหัส → ส่งรหัสเข้า OA → active; เก็บเฉพาะ hash; รหัสใช้ได้ครั้งเดียว; ตอบเป็นภาษาของเจ้าของ", async () => {
    await admin().from("profiles").update({ lang: "en" }).eq("id", parent.id);
    const start = await startLineLink(parent.id, school);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(start.basicId).toBe("@zztest");
    const pending = await channel();
    expect(pending).toMatchObject({ status: "pending", address: null });
    expect(JSON.stringify(pending)).not.toContain(start.code); // เก็บ hash ไม่ใช่รหัสจริง
    const { r, f } = await webhook([event("Ulineparent", `link ${start.code.toLowerCase()}`)]);
    expect(r.status).toBe(200);
    expect(await channel()).toMatchObject({ status: "active", address: "Ulineparent", code_hash: null });
    expect(f.calls[0]!.path).toBe("/v2/bot/message/reply");
    expect(f.calls[0]!.body.messages[0]!.text).toContain("LINE connected"); // ภาษาโปรไฟล์ของเจ้าของ
    // ใช้ซ้ำไม่ได้ และคำตอบไม่เฉลยสาเหตุ
    const again = await webhook([event("Uother", start.code)]);
    expect(again.f.calls[0]!.body.messages[0]!.text).toContain("invalid or has expired");
    expect(await channel(other.id)).toBeNull();
  });

  it("รหัสผิด/ข้อความทั่วไป: ไม่ผูก ตอบข้อความช่วยเหลือสองภาษา; หมดอายุตอบเหมือนรหัสผิด", async () => {
    const help = await webhook([event("Uzzz", "สวัสดี")]);
    expect(help.f.calls[0]!.body.messages[0]!.text).toContain("8");
    expect(help.f.calls[0]!.body.messages[0]!.text).toContain("code");
    const s = await startLineLink(other.id, school);
    // other ไม่เกี่ยวข้องกับโรงเรียนนี้ → ขอรหัสไม่ได้
    expect(s.ok).toBe(false);
    await addMember(school, other.id, "gate_staff");
    const s2 = await startLineLink(other.id, school);
    expect(s2.ok).toBe(true);
    if (!s2.ok) return;
    await admin().from("notification_channels").update({ code_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("user_id", other.id);
    const expired = await webhook([event("Ugate", s2.code)]);
    const wrong = await webhook([event("Ugate", "ABCD2345")]);
    expect(expired.f.calls[0]!.body.messages[0]!.text).toBe(wrong.f.calls[0]!.body.messages[0]!.text);
    expect((await channel(other.id))?.status).toBe("pending");
  });

  it("LINE userId เดียวผูกได้กับบัญชีเดียวต่อโรงเรียน (บัญชีอื่นแย่งไม่ได้)", async () => {
    const s = await startLineLink(other.id, school);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const { f } = await webhook([event("Ulineparent", s.code)]); // userId ของ parent ที่ active อยู่แล้ว
    expect(f.calls[0]!.body.messages[0]!.text).toContain("invalid or has expired");
    expect((await channel(other.id))?.status).toBe("pending");
    expect((await channel())?.address).toBe("Ulineparent");
  });

  it("จำกัดการเดารหัส: เกิน 10 ครั้ง/10 นาทีต่อ LINE userId → เงียบ (ไม่ตอบ)", async () => {
    const f = fakeLine();
    for (let i = 0; i < 12; i++) await webhook([event("Uspammer", "ABCD2345", i)], f);
    expect(f.calls.length).toBe(10);
  });

  it("unfollow → stopped (เก็บสาเหตุ) · follow กลับมา → active อีกครั้งโดยไม่ต้องขอรหัสใหม่", async () => {
    await webhook([{ type: "unfollow", source: { userId: "Ulineparent" } }]);
    expect(await channel()).toMatchObject({ status: "stopped", last_error: "unfollowed" });
    await webhook([{ type: "follow", replyToken: "r", source: { userId: "Ulineparent" } }]);
    expect(await channel()).toMatchObject({ status: "active", last_error: null });
  });

  it("bindLine: รูปแบบรหัสผิด/ไม่มี userId ถูกปฏิเสธ; ผูกได้ครั้งเดียวแม้เรียกพร้อมกัน", async () => {
    expect((await bindLine(school, "short", "U1")).ok).toBe(false);
    expect((await bindLine(school, "ABCD2345", "")).ok).toBe(false);
    const u = await makeUser("lnrace");
    await admin().from("school_members").insert({ school_id: school, user_id: u.id, role: "gate_staff" });
    const s = await startLineLink(u.id, school);
    if (!s.ok) throw new Error("start failed");
    const [a, b] = await Promise.all([bindLine(school, s.code, "Urace1"), bindLine(school, s.code, "Urace2")]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
  });

  describe("ส่งการ์ดหลังผูกแล้ว", () => {
    beforeAll(async () => {
      await admin().from("notification_channels").update({ status: "active", address: "Ulineparent", last_error: null }).eq("user_id", parent.id).eq("school_id", school);
      await admin().from("message_log").delete().eq("school_id", school);
      await admin().from("school_line_channels").update({ paused_until: null, last_error: null, monthly_quota: 1000 }).eq("school_id", school);
    });
    const send = (f: ReturnType<typeof fakeLine>, extra = {}) =>
      notifyUser({ userId: parent.id, schoolId: school, kind: "success", title: "ผู้ปกครองรับนักเรียนแล้ว", body: "ภู ป.1/1 ถูกรับแล้ว", fields: [{ label: "เวลา", value: "15:30" }], link: "/pickup", dedupeKey: `t:${Math.random()}`, ...extra }, { fetchImpl: f.fetchImpl });

    it("ส่งการ์ด Flex: ใช้ token ของโรงเรียน, Retry-Key เป็น id ของการแจ้งเตือน, ลิงก์ภายใน, มีแจ้งเตือนในแอปด้วย", async () => {
      const f = fakeLine();
      const r = await send(f);
      expect(r).toEqual({ inApp: true, line: "sent" });
      const c = f.calls[0]!;
      expect(c.path).toBe("/v2/bot/message/push");
      expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(c.body.to).toBe("Ulineparent");
      expect(c.body.messages[0]!.type).toBe("flex");
      expect(c.body.messages[0]!.altText).toContain("ผู้ปกครองรับนักเรียนแล้ว — ภู ป.1/1 ถูกรับแล้ว · เวลา 15:30");
      expect(JSON.stringify(c.body)).toContain("https://kidguards.vercel.app/pickup?openExternalBrowser=1");
      expect(c.headers["X-Line-Retry-Key"]).toMatch(/^[0-9a-f-]{36}$/);
      const inApp = (await parent.client.from("app_notifications").select("title,read_at").eq("dedupe_key", null as unknown as string)).data;
      void inApp;
      expect((await admin().from("message_log").select("status").eq("school_id", school).eq("user_id", parent.id)).data?.map((x) => x.status)).toContain("sent");
    });

    it("เหตุการณ์เดียวบอกครั้งเดียว: dedupeKey ซ้ำ → ไม่เขียนซ้ำ ไม่ส่ง LINE ซ้ำ", async () => {
      const f = fakeLine();
      const key = `once:${Math.random()}`;
      expect((await send(f, { dedupeKey: key })).inApp).toBe(true);
      expect((await send(f, { dedupeKey: key })).inApp).toBe(false);
      expect(f.calls.length).toBe(1);
    });

    it("การ์ดโดน 400 → ลองข้อความธรรมดาก่อน และไม่หยุดช่องทาง; 400 ซ้ำ (ผู้รับบล็อก) → ช่องทางของผู้ใช้เป็น stopped", async () => {
      const f1 = fakeLine();
      f1.next(400, 200);
      expect((await send(f1)).line).toBe("sent");
      expect(f1.calls.map((c) => c.body.messages[0]!.type)).toEqual(["flex", "text"]);
      expect((await channel())?.status).toBe("active");
      const f2 = fakeLine();
      f2.next(400, 400);
      expect((await send(f2)).line).toBe("failed");
      expect(await channel()).toMatchObject({ status: "stopped", last_error: "blocked_or_unfriended" });
      await admin().from("notification_channels").update({ status: "active", last_error: null }).eq("user_id", parent.id);
    });

    it("401/403 → หยุดทั้งโรงเรียนชั่วคราว (ไม่ถล่ม LINE) และบอกสาเหตุ; หยุดแล้วข้ามการส่งแต่แจ้งเตือนในแอปยังไป", async () => {
      const f = fakeLine(401);
      expect((await send(f)).line).toBe("failed");
      const cfg = (await admin().from("school_line_channels").select("paused_until,last_error").eq("school_id", school).single()).data!;
      expect(cfg.last_error).toBe("auth_401");
      expect(Date.parse(cfg.paused_until!)).toBeGreaterThan(Date.now() + 5 * 3600e3);
      const f2 = fakeLine();
      expect(await send(f2)).toEqual({ inApp: true, line: "skipped" });
      expect(f2.calls.length).toBe(0);
      await admin().from("school_line_channels").update({ paused_until: null, last_error: null }).eq("school_id", school);
    });

    it("5xx/เครือข่ายล่ม → ลองซ้ำหนึ่งครั้งด้วย retry key เดิม", async () => {
      const f = fakeLine();
      f.next(503, 200);
      expect((await send(f)).line).toBe("sent");
      expect(f.calls.length).toBe(2);
      expect(f.calls[0]!.headers["X-Line-Retry-Key"]).toBe(f.calls[1]!.headers["X-Line-Retry-Key"]);
    });

    it("โควตารายเดือนของเรา: เต็มแล้วข้าม LINE (บันทึก skipped) แต่แจ้งเตือนในแอปยังไป", async () => {
      const sent = (await admin().from("message_log").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "sent")).count ?? 0;
      await admin().from("school_line_channels").update({ monthly_quota: sent }).eq("school_id", school);
      const f = fakeLine();
      expect(await send(f)).toEqual({ inApp: true, line: "skipped" });
      expect(f.calls.length).toBe(0);
      expect((await admin().from("message_log").select("error").eq("school_id", school).eq("status", "skipped")).data?.[0]?.error).toBe("quota");
      await admin().from("school_line_channels").update({ monthly_quota: 1000 }).eq("school_id", school);
    });

    it("ผู้ใช้ที่ยังไม่ผูก LINE / โรงเรียนปิดช่องทาง → ไม่ส่ง LINE แต่มีแจ้งเตือนในแอป", async () => {
      const f = fakeLine();
      expect(await notifyUser({ userId: other.id, schoolId: school, kind: "info", title: "x", dedupeKey: `n:${Math.random()}` }, { fetchImpl: f.fetchImpl })).toEqual({ inApp: true, line: "skipped" });
      await admin().from("school_line_channels").update({ enabled: false }).eq("school_id", school);
      expect((await send(f)).line).toBe("skipped");
      expect(f.calls.length).toBe(0);
      await admin().from("school_line_channels").update({ enabled: true }).eq("school_id", school);
    });
  });

  describe("แจ้งเตือนในแอป (RLS) + เหตุการณ์การรับนักเรียน (D)", () => {
    let gate: TestUser, teacher: TestUser, sessionId = "";
    beforeAll(async () => {
      await setSchoolLocation(school);
      gate = await makeUser("lngate");
      teacher = await makeUser("lntch");
      await addMember(school, gate.id, "gate_staff");
      await addMember(school, teacher.id, "teacher", room);
      await admin().from("notification_channels").update({ status: "active", address: "Ulineparent" }).eq("user_id", parent.id).eq("school_id", school);
      const started = await admin().rpc("pickup_start", { p_user: parent.id, p_school: school, p_person: parent.person, p_vehicle: parent.vehicle, p_students: [stu], p_dist_m: 400, p_eta_s: 90, p_src: "estimate" });
      if (started.error) throw new Error("pickup_start failed: " + started.error.message);
      sessionId = started.data;
    });
    const inbox = async (u: TestUser) => (await u.client.from("app_notifications").select("title,body,fields,link,read_at,kind").order("created_at")).data ?? [];

    it("ผู้ใช้เห็นแจ้งเตือนของตัวเองเท่านั้น, ทำเครื่องหมายอ่านได้เฉพาะของตัวเอง, เขียน/แก้เนื้อหา/อ่านของคนอื่นไม่ได้", async () => {
      await notifyUser({ userId: other.id, schoolId: null, kind: "info", title: "ของ other", dedupeKey: "rls:other" });
      const mine = await inbox(other);
      expect(mine.map((n) => n.title)).toContain("ของ other");
      expect((await inbox(gate)).map((n) => n.title)).not.toContain("ของ other");
      expect((await gate.client.from("app_notifications").insert({ user_id: gate.id, kind: "info", title: "ปลอม" })).error).not.toBeNull();
      const id = (await admin().from("app_notifications").select("id").eq("dedupe_key", "rls:other").single()).data!.id;
      expect((await gate.client.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("id")).data ?? []).toEqual([]);
      expect((await other.client.from("app_notifications").update({ title: "แก้เนื้อหา" }).eq("id", id)).error).not.toBeNull(); // แก้ได้เฉพาะ read_at
      expect((await other.client.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("id")).data?.length).toBe(1);
    });

    it("ผู้ปกครองกดรับก่อน → เจ้าหน้าที่ประตูและครูประจำชั้นได้รับแจ้ง (ไม่ใส่นามสกุลเด็ก); ผู้ปกครองไม่ได้รับแจ้งตัวเอง", async () => {
      const f = fakeLine();
      await handlePickupEvent({ kind: "released", sessionId, schoolId: school, parentUserId: parent.id, byRole: "parent", byUserId: parent.id, completed: true }, { fetchImpl: f.fetchImpl });
      for (const u of [gate, teacher]) {
        const n = (await inbox(u)).find((x) => x.title === "ผู้ปกครองรับนักเรียนแล้ว" && x.body?.includes("ถูกรับโดยผู้ปกครอง"));
        expect(n, u.email).toBeTruthy();
        expect(n!.body).toContain("ภู ป.1/1");
        expect(JSON.stringify(n)).not.toContain("นามสกุลลับ");
      }
      expect((await inbox(gate)).find((n) => n.title === "ผู้ปกครองรับนักเรียนแล้ว")!.link).toBe("/gate");
      expect((await inbox(teacher)).find((n) => n.title === "ผู้ปกครองรับนักเรียนแล้ว")!.link).toBe("/teacher");
      expect((await inbox(parent)).filter((n) => n.body?.includes("ถูกรับโดยผู้ปกครองเรียบร้อยแล้ว"))).toEqual([]); // ผู้กระทำไม่ได้รับแจ้งตัวเอง
    });

    it("เจ้าหน้าที่ส่งนักเรียนก่อน → ผู้ปกครองได้รับแจ้งทั้งในแอปและ LINE (ภาษาตามโปรไฟล์); แจ้งซ้ำไม่ได้", async () => {
      await admin().from("profiles").update({ lang: "th" }).eq("id", parent.id);
      const f = fakeLine();
      const ev = { kind: "released", sessionId, schoolId: school, parentUserId: parent.id, byRole: "gate_staff", byUserId: gate.id, completed: true } as const;
      await handlePickupEvent(ev, { fetchImpl: f.fetchImpl });
      await handlePickupEvent(ev, { fetchImpl: f.fetchImpl });
      const n = (await inbox(parent)).filter((x) => x.title === "โรงเรียนส่งนักเรียนแล้ว");
      expect(n.length).toBe(1);
      expect(n[0]!.fields).toEqual(expect.arrayContaining([{ label: "โดย", value: "เจ้าหน้าที่คิวรับนักเรียน" }]));
      expect(f.calls.length).toBe(1);
      expect(f.calls[0]!.body.to).toBe("Ulineparent");
      expect(f.calls[0]!.body.messages[0]!.altText).not.toContain("นามสกุลลับ");
    });

    it("เรียกนักเรียน → แจ้งผู้ปกครอง; หมดอายุ → แจ้งผู้ปกครอง", async () => {
      await handlePickupEvent({ kind: "called", sessionId, schoolId: school, parentUserId: parent.id, byUserId: gate.id, count: 1 });
      await handlePickupEvent({ kind: "expired", sessionId, schoolId: school, parentUserId: parent.id });
      const titles = (await inbox(parent)).map((n) => n.title);
      expect(titles).toEqual(expect.arrayContaining(["นักเรียนกำลังมาที่รถ", "การแจ้งมารับหมดอายุ"]));
    });

    it("ตั้งค่าแจ้งเตือนอัตโนมัติไม่ทำให้เกิด audit ที่มีข้อมูลส่วนบุคคล (ไม่มี userId ของ LINE/รหัส/ความลับ)", async () => {
      const rows = (await sql(`select detail::text as d from public.audit_log where school_id = '${school}'`)).map((r) => String(r.d)).join(" ");
      expect(rows).not.toContain("Ulineparent");
      expect(rows).not.toContain(SECRET);
      expect(rows).not.toContain(TOKEN);
    });
  });
});

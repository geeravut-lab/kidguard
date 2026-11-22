import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeSchool, makeUser, rid, sql, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);
const hash = (code: string) => createHash("sha256").update(code.toUpperCase()).digest("hex");
const newInvite = async (row: Record<string, unknown>) => {
  const code = randomBytes(8).toString("hex").toUpperCase();
  const { error } = await admin().from("school_invites").insert({ code_hash: hash(code), expires_at: new Date(Date.now() + 3600e3).toISOString(), ...row });
  if (error) throw new Error(error.message);
  return code;
};

d("คำเชิญเจ้าหน้าที่ (รหัสครั้งเดียว)", () => {
  let school = "", room = "";
  let creator: TestUser, u1: TestUser, u2: TestUser, u3: TestUser;
  beforeAll(async () => {
    school = await makeSchool("inv");
    room = await makeClassroom(school, "อ.2/1");
    [creator, u1, u2, u3] = await Promise.all([makeUser("creator"), makeUser("u1"), makeUser("u2"), makeUser("u3")]);
  });
  afterAll(cleanup);

  it("รหัสถูกต้อง ใช้ได้ครั้งเดียว; ครูถูกผูกกับห้องประจำชั้น", async () => {
    const code = await newInvite({ school_id: school, role: "teacher", classroom_id: room, created_by: creator.id });
    const r = await u1.client.rpc("redeem_invite", { p_code: code.toLowerCase() }); // ไม่สนตัวพิมพ์
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ role: "teacher", school_id: school });
    const me = await u1.client.rpc("kg_me");
    expect(me.data.classroom_ids).toEqual([room]);
    const reuse = await u2.client.rpc("redeem_invite", { p_code: code });
    expect(reuse.error).not.toBeNull();
    expect((await u2.client.rpc("kg_me")).data.memberships).toEqual([]);
  });

  it("รหัสผิด / หมดอายุ → ถูกปฏิเสธ และข้อความไม่บอกสาเหตุต่างกัน", async () => {
    const bad = await u2.client.rpc("redeem_invite", { p_code: "NOPE" + rid() });
    const expired = await newInvite({ school_id: school, role: "gate_staff", expires_at: new Date(Date.now() - 1000).toISOString() });
    const exp = await u2.client.rpc("redeem_invite", { p_code: expired });
    expect(bad.error?.message).toBe(exp.error?.message);
  });

  it("คำเชิญ school_admin ให้สิทธิ์แอดมินเฉพาะโรงเรียนนั้น", async () => {
    const code = await newInvite({ school_id: school, role: "school_admin", created_by: creator.id });
    expect((await u2.client.rpc("redeem_invite", { p_code: code })).error).toBeNull();
    const me = (await u2.client.rpc("kg_me")).data;
    expect(me.memberships[0].role).toBe("school_admin");
    expect(me.platform_admin).toBe(false);
    expect((await u2.client.rpc("is_school_admin", { p_school: school })).data).toBe(true);
  });

  it("คำเชิญ super_admin ให้สิทธิ์แพลตฟอร์ม และ is_platform_admin เห็นทุกโรงเรียน", async () => {
    const code = await newInvite({ school_id: null, role: "super_admin", created_by: creator.id });
    expect((await u3.client.rpc("redeem_invite", { p_code: code })).error).toBeNull();
    expect((await u3.client.rpc("kg_me")).data.platform_admin).toBe(true);
    expect((await u3.client.rpc("is_school_admin", { p_school: school })).data).toBe(true);
    const other = await makeSchool("inv2");
    const settings = await u3.client.from("school_settings").update({ student_alert_min: 9 }).eq("school_id", other).select("school_id");
    expect(settings.data?.length).toBe(1);
  });

  it("รับพร้อมกัน 2 คน → สำเร็จได้คนเดียว", async () => {
    const code = await newInvite({ school_id: school, role: "gate_staff", created_by: creator.id });
    const [a, b] = await Promise.all([u1.client.rpc("redeem_invite", { p_code: code }), u2.client.rpc("redeem_invite", { p_code: code })]);
    expect([a.error, b.error].filter(Boolean).length).toBe(1);
  });

  it("ผู้ใช้ปลอมแปลงคำเชิญเองไม่ได้ (ไม่มีสิทธิ์เขียน)", async () => {
    const { error } = await u1.client.from("school_invites").insert({ school_id: school, role: "school_admin", code_hash: hash("X"), expires_at: new Date(Date.now() + 1e6).toISOString() });
    expect(error).not.toBeNull();
  });
});

d("Audit Trail", () => {
  let actor: TestUser;
  let original: unknown;
  beforeAll(async () => {
    actor = await makeUser("audit");
    original = (await admin().from("platform_settings").select("value").eq("key", "audit").single()).data?.value;
  });
  afterAll(async () => {
    await admin().from("platform_settings").update({ value: original }).eq("key", "audit"); // คืนค่าเดิมเสมอ
    await cleanup();
  });
  const log = (action: string, extra: Record<string, unknown> = {}) =>
    admin().from("audit_log").insert({ action, entity: "test", actor_id: actor.id, entity_id: actor.id, ...extra });
  const count = async (action: string) =>
    (await admin().from("audit_log").select("id", { count: "exact", head: true }).eq("action", action).eq("actor_id", actor.id)).count ?? 0;
  const setAudit = (v: unknown) => admin().from("platform_settings").update({ value: v }).eq("key", "audit");

  it("เพิ่มได้ แต่แก้/ลบ/ล้างตารางไม่ได้ แม้ด้วย service role", async () => {
    await setAudit({ enabled: true, off_groups: [] });
    expect((await log("test.created")).error).toBeNull();
    expect(await count("test.created")).toBe(1);
    const upd = await admin().from("audit_log").update({ action: "test.hacked" }).eq("actor_id", actor.id);
    expect(upd.error).not.toBeNull();
    const del = await admin().from("audit_log").delete().eq("actor_id", actor.id);
    expect(del.error).not.toBeNull();
    await expect(sql("truncate public.audit_log")).rejects.toThrow();
    expect(await count("test.created")).toBe(1);
  });

  it("client ของผู้ใช้อ่าน/เขียน audit ไม่ได้", async () => {
    expect((await actor.client.from("audit_log").insert({ action: "test.x", entity: "t" })).error).not.toBeNull();
    expect((await actor.client.from("audit_log").select("id").limit(1)).error).not.toBeNull();
  });

  it("ปิดกลุ่ม event ที่ติ๊กไว้ → กลุ่มนั้นไม่ถูกบันทึก กลุ่มอื่นยังบันทึก", async () => {
    await setAudit({ enabled: true, off_groups: ["test"] });
    await log("test.off_group");
    await log("guardian.keep");
    expect(await count("test.off_group")).toBe(0);
    expect(await count("guardian.keep")).toBe(1);
  });

  it("ปิดการบันทึกทั้งระบบ → ไม่บันทึก ยกเว้นกลุ่ม audit.* ที่บันทึกเสมอ (ปิดไม่ได้)", async () => {
    await setAudit({ enabled: false, off_groups: [] });
    await log("test.disabled");
    await log("audit.switches");
    await log("audit.export");
    expect(await count("test.disabled")).toBe(0);
    expect(await count("audit.switches")).toBe(1);
    expect(await count("audit.export")).toBe(1);
  });

  it("ค่าตั้งค่าเสีย/อ่านไม่ได้ → บันทึกต่อ (fail-open)", async () => {
    await setAudit({ enabled: "ไม่ใช่ boolean", off_groups: "ผิดรูป" });
    await log("test.failopen");
    expect(await count("test.failopen")).toBe(1);
  });

  it("detail ต้องเป็น object และไม่เกิน 4KB", async () => {
    await setAudit({ enabled: true, off_groups: [] });
    expect((await log("test.big", { detail: { x: "a".repeat(5000) } })).error).not.toBeNull();
    expect((await log("test.arr", { detail: [1, 2] as unknown as object })).error).not.toBeNull();
  });

  it("trigger ฐานข้อมูลบันทึกการเปลี่ยนสิทธิ์ (กลุ่ม db) โดยไม่เก็บข้อมูลส่วนบุคคล", async () => {
    await setAudit({ enabled: true, off_groups: [] });
    const school = await makeSchool("audit");
    await addMember(school, actor.id, "teacher");
    const rows = (await admin().from("audit_log").select("action, school_id, detail").eq("school_id", school).eq("action", "db.school_members.insert")).data!;
    expect(rows.length).toBe(1);
    expect(JSON.stringify(rows[0]!.detail)).not.toMatch(/@|phone|email/i);
    await setAudit({ enabled: true, off_groups: ["db"] });
    await admin().from("school_members").delete().eq("school_id", school).eq("user_id", actor.id);
    expect(((await admin().from("audit_log").select("id").eq("school_id", school).eq("action", "db.school_members.delete")).data ?? []).length).toBe(0);
  });

  it("admin_purge_audit: เฉพาะแอดมินแพลตฟอร์ม และบันทึกการลบไว้", async () => {
    const r = await admin().rpc("admin_purge_audit", { p_actor: actor.id });
    expect(r.error).not.toBeNull(); // ไม่ใช่แอดมินแพลตฟอร์ม
    expect((await actor.client.rpc("admin_purge_audit", { p_actor: actor.id })).error).not.toBeNull(); // client เรียกไม่ได้
  });
});

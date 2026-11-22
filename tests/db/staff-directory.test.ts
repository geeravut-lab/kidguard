import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeSchool, makeUser, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);

d("รายชื่อเจ้าหน้าที่ / คำเชิญ / เอาออก (migration 0007)", () => {
  let school = "", room = "";
  let adm: TestUser, t1: TestUser, gate: TestUser, outsider: TestUser;
  beforeAll(async () => {
    school = await makeSchool("dir");
    room = await makeClassroom(school, "ป.5/1");
    [adm, t1, gate, outsider] = await Promise.all([makeUser("dadm"), makeUser("dt1"), makeUser("dgate"), makeUser("dout")]);
    await admin().from("profiles").update({ display_name: "ครูหนึ่ง" }).eq("id", t1.id);
    await addMember(school, adm.id, "school_admin");
    await addMember(school, t1.id, "teacher", room);
    await addMember(school, gate.id, "gate_staff");
  });
  afterAll(cleanup);

  it("school_staff: แอดมินเห็นชื่อ/บทบาท/ห้อง; คนอื่นถูกปฏิเสธ", async () => {
    const r = await adm.client.rpc("school_staff", { p_school: school });
    expect(r.error).toBeNull();
    const t = r.data.find((x: { user_id: string }) => x.user_id === t1.id);
    expect(t).toMatchObject({ role: "teacher", display_name: "ครูหนึ่ง", classrooms: ["ป.5/1"] });
    for (const u of [t1, gate, outsider]) expect((await u.client.rpc("school_staff", { p_school: school })).error, u.email).not.toBeNull();
  });

  it("คำเชิญค้าง: แอดมินเห็นและเพิกถอนได้ ใช้แล้วหรือหมดอายุไม่แสดง; คนอื่นทำไม่ได้", async () => {
    const mk = async (extra: Record<string, unknown> = {}) =>
      (await admin().from("school_invites").insert({ school_id: school, role: "gate_staff", code_hash: createHash("sha256").update(Math.random().toString()).digest("hex"), expires_at: new Date(Date.now() + 3600e3).toISOString(), created_by: adm.id, ...extra }).select("id").single()).data!.id as string;
    const open = await mk();
    await mk({ expires_at: new Date(Date.now() - 1000).toISOString() });
    await mk({ used_at: new Date().toISOString(), used_by: gate.id });
    const list = await adm.client.rpc("school_open_invites", { p_school: school });
    expect(list.data.map((i: { id: string }) => i.id)).toEqual([open]);
    expect((await gate.client.rpc("revoke_invite", { p_invite: open })).error).not.toBeNull();
    expect((await outsider.client.rpc("school_open_invites", { p_school: school })).error).not.toBeNull();
    expect((await adm.client.rpc("revoke_invite", { p_invite: open })).data).toBe(true);
    expect((await adm.client.rpc("school_open_invites", { p_school: school })).data).toEqual([]);
  });

  it("remove_member: ห้ามเอาแอดมินคนสุดท้ายออก; เอาครูออกแล้วการมอบหมายห้องสิ้นสุด", async () => {
    const last = await adm.client.rpc("remove_member", { p_school: school, p_user: adm.id, p_role: "school_admin" });
    expect(last.error?.message).toContain("last_admin");
    const ok = await adm.client.rpc("remove_member", { p_school: school, p_user: t1.id, p_role: "teacher" });
    expect(ok.data).toBe(true);
    const cur = await admin().from("classroom_teachers").select("id").eq("user_id", t1.id).is("ended_at", null);
    expect(cur.data).toEqual([]);
    expect((await gate.client.rpc("remove_member", { p_school: school, p_user: adm.id, p_role: "school_admin" })).error).not.toBeNull();
  });

  it("สวิตช์ audit ระดับโรงเรียน: ปิดกลุ่ม db ของโรงเรียนนี้ → trigger ของโรงเรียนนี้ไม่ถูกบันทึก (ของโรงเรียนอื่นไม่กระทบ)", async () => {
    const a = admin();
    await a.from("school_settings").update({ audit: { enabled: true, off_groups: ["db"] } }).eq("school_id", school);
    await addMember(school, outsider.id, "gate_staff"); // เกิด db.school_members.insert
    expect(((await a.from("audit_log").select("id").eq("school_id", school).eq("action", "db.school_members.insert").eq("entity_id", outsider.id)).data ?? []).length).toBe(0);
    await a.from("school_settings").update({ audit: {} }).eq("school_id", school);
    await a.from("school_members").delete().eq("school_id", school).eq("user_id", outsider.id);
    await addMember(school, outsider.id, "gate_staff");
    expect(((await a.from("audit_log").select("id").eq("school_id", school).eq("action", "db.school_members.insert").eq("entity_id", outsider.id)).data ?? []).length).toBeGreaterThan(0);
  });

  it("client แก้สวิตช์ audit ของโรงเรียนเองไม่ได้ (คอลัมน์ audit ถูกถอนสิทธิ์)", async () => {
    const r = await adm.client.from("school_settings").update({ audit: { enabled: false } }).eq("school_id", school);
    expect(r.error).not.toBeNull();
  });
});

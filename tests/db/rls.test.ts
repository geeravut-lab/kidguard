import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { addMember, admin, ANON, cleanup, HAS_DB, makeClassroom, makeSchool, makeStudent, makeUser, URL_, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);

d("สิทธิ์และการแยกโรงเรียน (RLS)", () => {
  let schoolA = "", schoolB = "";
  let roomA1 = "", roomA2 = "", roomB1 = "";
  let studentA1 = "", studentA2 = "", studentB1 = "";
  let adminA: TestUser, teacherA1: TestUser, teacherA2: TestUser, gateA: TestUser, adminB: TestUser;
  let parent: TestUser, parent2: TestUser;

  beforeAll(async () => {
    schoolA = await makeSchool("a");
    schoolB = await makeSchool("b");
    roomA1 = await makeClassroom(schoolA, "ป.1/1");
    roomA2 = await makeClassroom(schoolA, "ป.1/2");
    roomB1 = await makeClassroom(schoolB, "ป.1/1");
    studentA1 = await makeStudent(schoolA, roomA1, "ภูมิ", "ใจดี");
    studentA2 = await makeStudent(schoolA, roomA2, "มะลิ", "รักดี");
    studentB1 = await makeStudent(schoolB, roomB1, "กานต์", "สุขใจ");
    [adminA, teacherA1, teacherA2, gateA, adminB, parent, parent2] = await Promise.all([
      makeUser("adminA"), makeUser("t1"), makeUser("t2"), makeUser("gate"), makeUser("adminB"), makeUser("parent"), makeUser("parent2"),
    ]);
    await addMember(schoolA, adminA.id, "school_admin");
    await addMember(schoolA, teacherA1.id, "teacher", roomA1);
    await addMember(schoolA, teacherA2.id, "teacher", roomA2);
    await addMember(schoolA, gateA.id, "gate_staff");
    await addMember(schoolB, adminB.id, "school_admin");
  });
  afterAll(async () => {
    await cleanup();
  });

  it("ไม่ล็อกอิน (anon) อ่านตารางสำคัญไม่ได้", async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    for (const t of ["profiles", "students", "guardian_links", "guardian_persons", "vehicles", "school_members", "audit_log", "platform_admins", "school_invites"]) {
      const { data, error } = await anon.from(t).select("*").limit(1);
      expect(data?.length ?? 0, t).toBe(0);
      expect(error, t).not.toBeNull(); // permission denied (ไม่ใช่แค่ว่างเปล่า)
    }
  });

  it("โปรไฟล์ถูกสร้างอัตโนมัติ และ role เริ่มต้นเป็น null", async () => {
    const { data } = await parent.client.from("profiles").select("role, onboarded_at").eq("id", parent.id).single();
    expect(data).toEqual({ role: null, onboarded_at: null });
  });

  it("ผู้ใช้แก้ role / onboarded_at ของตัวเองตรง ๆ ไม่ได้ (ไม่ผ่านหน้าจอ)", async () => {
    for (const patch of [{ role: "admin" }, { role: "parent" }, { onboarded_at: new Date().toISOString() }]) {
      const { error } = await parent.client.from("profiles").update(patch).eq("id", parent.id);
      expect(error, JSON.stringify(patch)).not.toBeNull();
    }
    const ok = await parent.client.from("profiles").update({ display_name: "ผู้ปกครองทดสอบ" }).eq("id", parent.id).select("id");
    expect(ok.data?.length).toBe(1);
  });

  it("choose_role: อนุญาตเฉพาะ parent, ตั้งได้ครั้งเดียว", async () => {
    const bad = await parent.client.rpc("choose_role", { p_role: "school_admin" });
    expect(bad.error).not.toBeNull();
    const bad2 = await parent.client.rpc("choose_role", { p_role: "super_admin" });
    expect(bad2.error).not.toBeNull();
    const ok = await parent.client.rpc("choose_role", { p_role: "parent" });
    expect(ok.data).toBe("parent");
    const again = await parent.client.rpc("choose_role", { p_role: "parent" });
    expect(again.data).toBe("parent");
  });

  it("ผู้ใช้เขียนตารางสิทธิ์เองไม่ได้ (members / platform_admins / invites)", async () => {
    const r1 = await parent.client.from("school_members").insert({ school_id: schoolA, user_id: parent.id, role: "school_admin" });
    const r2 = await parent.client.from("platform_admins").insert({ user_id: parent.id });
    const r3 = await parent.client.from("school_invites").insert({ school_id: schoolA, role: "school_admin", code_hash: "x", expires_at: new Date(Date.now() + 1e6).toISOString() });
    expect(r1.error).not.toBeNull();
    expect(r2.error).not.toBeNull();
    expect(r3.error).not.toBeNull();
  });

  it("ข้ามโรงเรียน: แอดมิน B มองไม่เห็น/แก้ข้อมูลโรงเรียน A", async () => {
    const stu = await adminB.client.from("students").select("id").eq("school_id", schoolA);
    expect(stu.data).toEqual([]);
    const upd = await adminB.client.from("schools").update({ name_th: "ถูกแก้" }).eq("id", schoolA).select("id");
    expect(upd.data ?? []).toEqual([]);
    const ins = await adminB.client.from("students").insert({ school_id: schoolA, first_name: "x", last_name: "y" });
    expect(ins.error).not.toBeNull();
    const claims = await adminB.client.rpc("school_claims", { p_school: schoolA });
    expect(claims.error).not.toBeNull();
  });

  it("ครู: เห็นนักเรียนเฉพาะห้องตัวเอง; ผู้ดูแลเห็นทั้งโรงเรียน; พนักงานประตูอ่านได้แต่เขียนไม่ได้", async () => {
    const t1 = await teacherA1.client.from("students").select("id");
    expect(t1.data?.map((r) => r.id)).toEqual([studentA1]);
    const t2 = await teacherA2.client.from("students").select("id");
    expect(t2.data?.map((r) => r.id)).toEqual([studentA2]);
    const ad = await adminA.client.from("students").select("id");
    expect(new Set(ad.data?.map((r) => r.id))).toEqual(new Set([studentA1, studentA2]));
    const gate = await gateA.client.from("students").select("id");
    expect(gate.data?.length).toBe(2);
    const w = await gateA.client.from("students").insert({ school_id: schoolA, first_name: "z", last_name: "z" });
    expect(w.error).not.toBeNull();
    const tw = await teacherA1.client.from("students").update({ nickname: "x" }).eq("id", studentA1).select("id");
    expect(tw.data ?? []).toEqual([]);
  });

  it("แอดมินแก้ได้เฉพาะคอลัมน์ที่อนุญาตของโรงเรียน (ไม่แตะ slug/active)", async () => {
    const ok = await adminA.client.from("schools").update({ short_name: "TA", lat: 13.7, lng: 100.5 }).eq("id", schoolA).select("id");
    expect(ok.data?.length).toBe(1);
    const bad = await adminA.client.from("schools").update({ active: false }).eq("id", schoolA);
    expect(bad.error).not.toBeNull();
    const bad2 = await adminA.client.from("school_settings").update({ checkin_radius_m: 100, arrive_radius_m: 500 }).eq("school_id", schoolA);
    expect(bad2.error).not.toBeNull(); // arrive ต้องน้อยกว่า radius
    const ok2 = await adminA.client.from("school_settings").update({ checkin_radius_m: 1500, student_alert_min: 7 }).eq("school_id", schoolA).select("school_id");
    expect(ok2.data?.length).toBe(1);
  });

  it("ผู้ปกครองแต่ละคนเห็นเฉพาะผู้ปกครอง/รถของตัวเอง", async () => {
    const a = await parent.client.from("guardian_persons").insert({ user_id: parent.id, name: "พ่อ", phone: "0812345678", is_primary: true }).select("id");
    expect(a.data?.length).toBe(1);
    const v = await parent.client.from("vehicles").insert({ user_id: parent.id, plate: "กข1234", province: "กรุงเทพมหานคร" }).select("id");
    expect(v.data?.length).toBe(1);
    const spoof = await parent2.client.from("guardian_persons").insert({ user_id: parent.id, name: "x", phone: "0812345678" });
    expect(spoof.error).not.toBeNull();
    expect((await parent2.client.from("guardian_persons").select("id")).data).toEqual([]);
    expect((await parent2.client.from("vehicles").select("id")).data).toEqual([]);
    const badPhone = await parent.client.from("guardian_persons").insert({ user_id: parent.id, name: "x", phone: "abc" });
    expect(badPhone.error).not.toBeNull();
    const badPlate = await parent.client.from("vehicles").insert({ user_id: parent.id, plate: "<script>", province: "x" });
    expect(badPlate.error).not.toBeNull();
  });

  it("ห้องเรียนมองเห็นได้เพื่อลงทะเบียน และแสดงชื่อครูประจำชั้น แต่ไม่เปิดข้อมูลอื่น", async () => {
    await admin().from("profiles").update({ display_name: "ครูสมศรี" }).eq("id", teacherA1.id);
    const { data, error } = await parent.client.rpc("classroom_options", { p_school: schoolA });
    expect(error).toBeNull();
    const r1 = data.find((c: { id: string }) => c.id === roomA1);
    expect(r1.teachers).toEqual(["ครูสมศรี"]);
    expect(Object.keys(r1).sort()).toEqual(["id", "level", "name", "sort", "teachers"]);
  });

  describe("ขอผูกนักเรียน → อนุมัติ", () => {
    let linkId = "";
    it("ผู้ปกครองขอผูก: จับคู่ชื่อตรงกับรายชื่อ แต่ยังไม่เห็นข้อมูลนักเรียนจนกว่าอนุมัติ", async () => {
      const { data, error } = await parent.client.rpc("claim_student", {
        p_school: schoolA, p_classroom: roomA1, p_name: "ภูมิ  ใจดี", p_relation: "mother", p_teacher_name: null,
      });
      expect(error).toBeNull();
      linkId = data;
      const row = (await admin().from("guardian_links").select("status, student_id").eq("id", linkId).single()).data;
      expect(row).toEqual({ status: "pending", student_id: studentA1 });
      expect((await parent.client.from("students").select("id")).data).toEqual([]);
      const dup = await parent.client.rpc("claim_student", { p_school: schoolA, p_classroom: roomA1, p_name: "ภูมิใจดี", p_relation: "mother", p_teacher_name: null });
      expect(dup.data).toBe(linkId); // idempotent
    });

    it("ชื่อที่ไม่ตรงรายชื่อ: ได้ผลลัพธ์รูปแบบเดียวกัน (ไม่เปิดเผยว่ามี/ไม่มีนักเรียน)", async () => {
      const r = await parent2.client.rpc("claim_student", { p_school: schoolA, p_classroom: roomA1, p_name: "ไม่มีชื่อนี้", p_relation: "father", p_teacher_name: "ครูเอ" });
      expect(r.error).toBeNull();
      expect(typeof r.data).toBe("string");
      const row = (await admin().from("guardian_links").select("student_id, status").eq("id", r.data).single()).data;
      expect(row).toEqual({ student_id: null, status: "pending" });
    });

    it("ห้องหรือโรงเรียนไม่ตรงกัน → ถูกปฏิเสธ", async () => {
      const r = await parent2.client.rpc("claim_student", { p_school: schoolA, p_classroom: roomB1, p_name: "กานต์ สุขใจ", p_relation: "father", p_teacher_name: null });
      expect(r.error).not.toBeNull();
    });

    it("ครูห้องอื่นและแอดมินโรงเรียนอื่นไม่เห็นคำขอ; ครูห้องที่เกี่ยวข้องและแอดมินเห็น", async () => {
      const t2 = await teacherA2.client.rpc("school_claims", { p_school: schoolA });
      expect(t2.data.filter((c: { link_id: string }) => c.link_id === linkId)).toEqual([]);
      const t1 = await teacherA1.client.rpc("school_claims", { p_school: schoolA });
      const c = t1.data.find((x: { link_id: string }) => x.link_id === linkId);
      expect(c.claimed_name).toBe("ภูมิ  ใจดี");
      expect(c.parent_phone).toBe("0812345678");
      expect(c.student_name).toBe("ภูมิ ใจดี");
      const ad = await adminA.client.rpc("school_claims", { p_school: schoolA });
      expect(ad.data.length).toBeGreaterThanOrEqual(2);
      const gate = await gateA.client.rpc("school_claims", { p_school: schoolA });
      expect(gate.error).not.toBeNull();
      const par = await parent.client.rpc("school_claims", { p_school: schoolA });
      expect(par.error).not.toBeNull();
    });

    it("ผู้ที่ไม่มีสิทธิ์อนุมัติไม่ได้ (ครูห้องอื่น, ผู้ปกครองเอง, พนักงานประตู)", async () => {
      for (const u of [teacherA2, parent, gateA, adminB]) {
        const r = await u.client.rpc("decide_claim", { p_link: linkId, p_approve: true });
        expect(r.error, u.email).not.toBeNull();
      }
      expect((await admin().from("guardian_links").select("status").eq("id", linkId).single()).data?.status).toBe("pending");
    });

    it("ครูประจำชั้นอนุมัติได้ → ผู้ปกครองเห็นนักเรียนคนนั้นเท่านั้น; อนุมัติซ้ำไม่ได้", async () => {
      const r = await teacherA1.client.rpc("decide_claim", { p_link: linkId, p_approve: true });
      expect(r.error).toBeNull();
      expect(r.data.status).toBe("approved");
      const kids = await parent.client.from("students").select("id");
      expect(kids.data?.map((k) => k.id)).toEqual([studentA1]);
      const again = await teacherA1.client.rpc("decide_claim", { p_link: linkId, p_approve: false });
      expect(again.error).not.toBeNull();
      expect((await parent2.client.from("students").select("id")).data).toEqual([]);
    });

    it("ครูอนุมัติเลือกนักเรียนนอกห้องตัวเองไม่ได้; แอดมินเลือกได้และต้องเป็นนักเรียนโรงเรียนเดียวกัน", async () => {
      const links = (await parent2.client.from("guardian_links").select("id")).data!;
      const l2 = links[0]!.id;
      const t = await teacherA1.client.rpc("decide_claim", { p_link: l2, p_approve: true, p_student: studentA2 });
      expect(t.error).not.toBeNull();
      const wrongSchool = await adminA.client.rpc("decide_claim", { p_link: l2, p_approve: true, p_student: studentB1 });
      expect(wrongSchool.error).not.toBeNull();
      const noStudent = await adminA.client.rpc("decide_claim", { p_link: l2, p_approve: true });
      expect(noStudent.error).not.toBeNull(); // ไม่มีคู่ที่จับได้ ต้องระบุนักเรียน
      const ok = await adminA.client.rpc("decide_claim", { p_link: l2, p_approve: true, p_student: studentA1 });
      expect(ok.error).toBeNull();
      expect((await parent2.client.from("students").select("id")).data?.map((k) => k.id)).toEqual([studentA1]);
    });

    it("ผู้ปกครองลบคำขอที่ยัง pending ได้ แต่ลบที่อนุมัติแล้วไม่ได้", async () => {
      const mine = (await parent.client.from("guardian_links").select("id, status")).data!;
      expect(mine.every((m) => m.status === "approved")).toBe(true);
      const del = await parent.client.from("guardian_links").delete().eq("id", linkId).select("id");
      expect(del.data ?? []).toEqual([]);
    });
  });

  it("complete_onboarding ต้องมีครบทุกข้อ (รวมความยินยอม PDPA)", async () => {
    const before = await parent.client.rpc("complete_onboarding");
    expect(before.data).toBe(false);
    const c = await parent.client.from("consents").insert({ user_id: parent.id, kind: "privacy", version: "2026-11" });
    expect(c.error).toBeNull();
    const spoof = await parent.client.from("consents").insert({ user_id: parent2.id, kind: "privacy", version: "2026-11" });
    expect(spoof.error).not.toBeNull();
    const after = await parent.client.rpc("complete_onboarding");
    expect(after.data).toBe(true);
    const me = await parent.client.rpc("kg_me");
    expect(me.data.onboarded).toBe(true);
    expect(me.data.role).toBe("parent");
  });

  it("kg_me แสดงสมาชิกภาพและห้องที่สอน", async () => {
    const me = await teacherA1.client.rpc("kg_me");
    expect(me.data.memberships.map((m: { role: string }) => m.role)).toEqual(["teacher"]);
    expect(me.data.classroom_ids).toEqual([roomA1]);
    expect(me.data.platform_admin).toBe(false);
  });
});

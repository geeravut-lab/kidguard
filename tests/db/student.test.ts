import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);
const hash = (c: string) => createHash("sha256").update(c).digest("hex");

d("บัญชีนักเรียน + จอนักเรียน (optional, ปิดเป็นค่าเริ่มต้น)", () => {
  let school = "", room = "", s1 = "", s2 = "";
  let parent: Awaited<ReturnType<typeof makeParent>>, parent2: Awaited<ReturnType<typeof makeParent>>, kid1: TestUser, kid2: TestUser, gate: TestUser;
  const invite = async (student: string, code: string) =>
    admin().from("school_invites").insert({ school_id: school, role: "student", student_id: student, code_hash: hash(code), expires_at: new Date(Date.now() + 3600e3).toISOString() });

  beforeAll(async () => {
    school = await makeSchool("st");
    await setSchoolLocation(school);
    room = await makeClassroom(school, "ม.1/1");
    s1 = await makeStudent(school, room, "นักเรียน", "หนึ่ง");
    s2 = await makeStudent(school, room, "นักเรียน", "สอง");
    await admin().from("students").update({ nickname: "หนึ่ง" }).eq("id", s1);
    [parent, parent2, kid1, kid2, gate] = await Promise.all([makeParent("stp1", school, room, [s1]), makeParent("stp2", school, room, [s2]), makeUser("kid1"), makeUser("kid2"), makeUser("stgate")]);
    await addMember(school, gate.id, "gate_staff");
  });
  afterAll(cleanup);

  it("รับลิงก์นักเรียน: ผูกบัญชีกับเด็กคนนั้น (ใช้ได้ครั้งเดียว) และไม่ได้สิทธิ์อื่น", async () => {
    expect((await invite(s1, "ZZSTUDENTONE0001")).error).toBeNull();
    expect((await kid1.client.rpc("redeem_invite", { p_code: "ZZSTUDENTONE0001" })).data).toEqual({ role: "student", school_id: school });
    expect((await kid2.client.rpc("redeem_invite", { p_code: "ZZSTUDENTONE0001" })).error).not.toBeNull();
    const me = (await kid1.client.rpc("kg_me")).data;
    expect(me.students).toEqual([{ student_id: s1, school_id: school }]);
    expect(me.memberships).toEqual([]);
    expect(me.platform_admin).toBe(false);
    // นักเรียนเข้าถึงข้อมูลนักเรียนทั้งโรงเรียนไม่ได้
    expect((await kid1.client.from("students").select("id")).data).toEqual([]);
    expect((await kid1.client.rpc("pickup_queue", { p_school: school })).error).not.toBeNull();
  });

  it("ลิงก์นักเรียนต้องมี student_id (และมีเฉพาะบทบาท student)", async () => {
    const bad = await admin().from("school_invites").insert({ school_id: school, role: "student", code_hash: hash("X1"), expires_at: new Date(Date.now() + 1e6).toISOString() });
    expect(bad.error).not.toBeNull();
    const bad2 = await admin().from("school_invites").insert({ school_id: school, role: "teacher", student_id: s1, code_hash: hash("X2"), expires_at: new Date(Date.now() + 1e6).toISOString() });
    expect(bad2.error).not.toBeNull();
  });

  it("โรงเรียนยังไม่เปิดจอนักเรียน (ค่าเริ่มต้น): ไม่เห็นข้อมูลการมารับแม้มี session", async () => {
    await admin().rpc("pickup_start", { p_user: parent.id, p_school: school, p_person: parent.person, p_vehicle: parent.vehicle, p_students: [s1], p_dist_m: 800, p_eta_s: 180, p_src: "estimate" });
    const r = (await kid1.client.rpc("student_pickup_status")).data;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ student_id: s1, enabled: false, session_id: null, status: null, eta_s: null });
  });

  it("เปิดแล้ว: เห็นเฉพาะ ระยะ/เวลา/สถานะ ของเด็กตัวเอง ไม่มีชื่อผู้ปกครอง ทะเบียน หรือพิกัด; เด็กคนอื่นไม่เห็น", async () => {
    await admin().from("school_settings").update({ student_dashboard_enabled: true }).eq("school_id", school);
    const r = (await kid1.client.rpc("student_pickup_status")).data[0];
    expect(r).toMatchObject({ student_label: "หนึ่ง", enabled: true, status: "on_the_way", eta_s: 180, distance_m: 800, student_status: "waiting" });
    expect(Object.keys(r).sort()).toEqual(["distance_m", "enabled", "eta_s", "last_seen_at", "school_id", "session_id", "status", "student_id", "student_label", "student_status"]);
    expect(JSON.stringify(r)).not.toMatch(/คุณ stp|กข|plate|driver/i);
    expect((await kid2.client.rpc("student_pickup_status")).data).toEqual([]); // ยังไม่ผูกเด็กคนไหน
  });

  it("เรียกนักเรียนแล้ว จอเห็นสถานะ 'called'; จบคิวแล้วจอกลับว่าง", async () => {
    const sess = (await admin().from("pickup_sessions").select("id").eq("parent_user_id", parent.id).single()).data!.id;
    await admin().rpc("pickup_call", { p_actor: gate.id, p_session: sess });
    expect((await kid1.client.rpc("student_pickup_status")).data[0].student_status).toBe("called");
    await admin().rpc("pickup_release", { p_actor: gate.id, p_session: sess });
    expect((await kid1.client.rpc("student_pickup_status")).data[0]).toMatchObject({ session_id: null, status: null });
  });

  it("แจ้งเตือน 'ใกล้ถึง' ไปที่บัญชีนักเรียนที่ผูกกับเด็กในคิวเท่านั้น (ครั้งเดียว)", async () => {
    const { handlePickupEvent } = await import("@/lib/notify/pickup-events");
    const s = (await admin().rpc("pickup_start", { p_user: parent.id, p_school: school, p_person: parent.person, p_vehicle: parent.vehicle, p_students: [s1], p_dist_m: 500, p_eta_s: 240, p_src: "estimate" })).data;
    await invite(s2, "ZZSTUDENTTWO0002");
    await kid2.client.rpc("redeem_invite", { p_code: "ZZSTUDENTTWO0002" }); // เด็กอีกคน ไม่อยู่ในคิวนี้
    await handlePickupEvent({ kind: "student_alert", sessionId: s, schoolId: school, parentUserId: parent.id });
    await handlePickupEvent({ kind: "student_alert", sessionId: s, schoolId: school, parentUserId: parent.id });
    const mine = (await kid1.client.from("app_notifications").select("title,body")).data ?? [];
    expect(mine.length).toBe(1);
    expect(mine[0]).toMatchObject({ title: "ผู้ปกครองใกล้ถึงแล้ว" });
    expect(mine[0]!.body).toContain("4 นาที");
    expect((await kid2.client.from("app_notifications").select("id")).data).toEqual([]);
    void parent2;
  });

  it("ลบนักเรียน → บัญชีนักเรียนที่ผูกกับเด็กคนนั้นถูกลบตาม (cascade)", async () => {
    await admin().from("students").delete().eq("id", s2);
    expect((await admin().from("student_accounts").select("user_id").eq("student_id", s2)).data).toEqual([]);
  });
});

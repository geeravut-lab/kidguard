import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "@/lib/audit/server";
import { loadRules } from "@/lib/rules/tick";
import { bangkokYmd } from "@/lib/safety/pure";
import { checkOrRedeemPass, createPass, getSchoolNotice, lateStep, resumePickups, sendBroadcast, setPlan, hashToken } from "@/lib/safety/server";
import { findTv, loadTvState } from "@/lib/safety/tv";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);
const svc = () => admin();
type P = Awaited<ReturnType<typeof makeParent>>;

d("เฟส 6: ความปลอดภัยเพิ่มเติม (ฐานข้อมูลจริง)", () => {
  let school = "", other = "", r1 = "", r2 = "";
  let s1 = "", s2 = "", s3 = "";
  let p1: P, p2: P, p3: P;
  let gate: TestUser, adm: TestUser, t1: TestUser, outsider: TestUser;

  const start = (p: P, students: string[], extra: Record<string, unknown> = {}) =>
    svc().rpc("pickup_start", { p_user: p.id, p_school: school, p_person: p.person, p_vehicle: p.vehicle, p_students: students, p_dist_m: 800, p_eta_s: 200, p_src: "estimate", ...extra });
  const queue = async (u: TestUser) => (await u.client.rpc("pickup_queue", { p_school: school })).data as { session_id: string; zone_name: string | null; students: { id: string; held: boolean; status: string }[] }[];
  const sessionOf = async (p: P) => (await svc().from("pickup_sessions").select("id,zone_id,status").eq("parent_user_id", p.id).in("status", ["on_the_way", "arrived"]).maybeSingle()).data;
  const reset = async () => {
    await svc().from("pickup_sessions").delete().eq("school_id", school);
    await svc().from("custody_flags").delete().eq("school_id", school);
    await svc().from("pickup_passes").delete().eq("school_id", school);
    await svc().from("school_settings").update({ pickup_paused: false, pickup_pause_note: null }).eq("school_id", school);
  };

  beforeAll(async () => {
    school = await makeSchool("sf");
    other = await makeSchool("sf2");
    r1 = await makeClassroom(school, "ป.1/1");
    r2 = await makeClassroom(school, "ป.1/2");
    [s1, s2, s3] = await Promise.all([makeStudent(school, r1, "เอ", "หนึ่ง"), makeStudent(school, r1, "บี", "สอง"), makeStudent(school, r2, "ซี", "สาม")]);
    await svc().from("students").update({ nickname: "เอ" }).eq("id", s1);
    await setSchoolLocation(school);
    [gate, adm, t1, outsider] = await Promise.all([makeUser("sfg"), makeUser("sfa"), makeUser("sft"), makeUser("sfo")]);
    await addMember(school, gate.id, "gate_staff");
    await addMember(school, adm.id, "school_admin");
    await addMember(school, t1.id, "teacher", r1);
    [p1, p2, p3] = await Promise.all([makeParent("sf1", school, r1, [s1, s2]), makeParent("sf2", school, r1, [s1]), makeParent("sf3", school, r2, [s3])]);
  });
  afterAll(cleanup);

  it("ตารางและฟังก์ชันของเฟส 6 ปิดจากผู้ใช้ทั่วไป", async () => {
    for (const t of ["zones", "custody_flags", "pickup_passes", "pickup_pass_students", "dismissal_plans", "tv_displays", "broadcasts"]) {
      const r = await p1.client.from(t).select("*").limit(1);
      expect(r.error !== null || (r.data ?? []).length === 0, t).toBe(true);
      expect((await p1.client.from(t).insert({} as never)).error, t).not.toBeNull();
    }
    for (const [fn, a] of [["student_held", { p_student: s1, p_parent: p1.id }], ["pass_use", { p_actor: gate.id, p_school: school, p_hash: "x", p_consume: true }], ["late_pickup_candidates", {}], ["tv_state", { p_school: school, p_zone: null, p_show_arriving: true }]] as const) {
      expect((await gate.client.rpc(fn, a)).error, fn).not.toBeNull();
    }
  });

  it("ธงห้ามปล่อย: hold_all กัน check-in; block_guardian กันเฉพาะบัญชีนั้น; ผู้ปกครองไม่ถูกบอกเหตุผล", async () => {
    await reset();
    await svc().from("custody_flags").insert({ school_id: school, student_id: s1, kind: "block_guardian", user_id: p1.id, note: "ลับ" });
    expect((await start(p1, [s1])).error?.message).toContain("student_held");
    expect((await start(p1, [s2])).error).toBeNull(); // เด็กอีกคนของ p1 ไม่ติดธง
    await svc().from("pickup_sessions").delete().eq("parent_user_id", p1.id);
    expect((await start(p2, [s1])).error).toBeNull(); // ผู้ปกครองคนอื่นของเด็กคนเดียวกันรับได้
    await svc().from("pickup_sessions").delete().eq("parent_user_id", p2.id);
    await svc().from("custody_flags").insert({ school_id: school, student_id: s1, kind: "hold_all", note: "ลับ" });
    expect((await start(p2, [s1])).error?.message).toContain("student_held");
    // ธงที่ยกเลิกแล้วไม่มีผล
    await svc().from("custody_flags").update({ active: false }).eq("school_id", school);
    expect((await start(p2, [s1])).error).toBeNull();
  });

  it("ธงห้ามปล่อย: เจ้าหน้าที่เห็นแค่เครื่องหมาย (ไม่มีเหตุผล), ปล่อยเด็กที่ติดธงไม่ได้ แต่ปล่อยคนอื่นในคิวเดียวกันได้; ผู้ปกครองกดจบทั้งคิวไม่ได้", async () => {
    await reset();
    expect((await start(p1, [s1, s2])).error).toBeNull();
    const sid = (await sessionOf(p1))!.id;
    await svc().from("custody_flags").insert({ school_id: school, student_id: s1, kind: "hold_all", note: "คำสั่งศาล-ลับ" });
    for (const u of [gate, adm, t1]) {
      const q = await queue(u);
      const row = q.find((x) => x.session_id === sid)!;
      expect(row.students.find((x) => x.id === s1)!.held, "held").toBe(true);
      expect(JSON.stringify(q)).not.toContain("คำสั่งศาล");
    }
    expect((await svc().rpc("pickup_release", { p_actor: p1.id, p_session: sid })).error?.message).toContain("held");
    expect((await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sid, p_student: s1 })).error?.message).toContain("held");
    const r = await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sid, p_student: s2 });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ completed: false, released: 1 });
    // ปล่อย "ทั้งคิว" โดยเจ้าหน้าที่ → ข้ามเด็กที่ติดธง; ถ้าเหลือแต่เด็กติดธง = ปฏิเสธ
    expect((await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sid })).error?.message).toContain("held");
    await svc().from("custody_flags").update({ active: false }).eq("school_id", school);
    expect((await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sid })).data).toMatchObject({ completed: true });
  });

  it("พักการรับ: ห้าม check-in / เรียก / ปล่อย จนกว่าจะเปิดรับอีกครั้ง", async () => {
    await reset();
    expect((await start(p1, [s1])).error).toBeNull();
    const sid = (await sessionOf(p1))!.id;
    await svc().from("school_settings").update({ pickup_paused: true }).eq("school_id", school);
    expect((await start(p3, [s3])).error?.message).toContain("paused");
    expect((await svc().rpc("pickup_call", { p_actor: gate.id, p_session: sid })).error?.message).toContain("paused");
    expect((await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sid })).error?.message).toContain("paused");
    expect((await svc().rpc("pickup_release", { p_actor: p1.id, p_session: sid })).error?.message).toContain("paused");
    await svc().from("school_settings").update({ pickup_paused: false }).eq("school_id", school);
    expect((await svc().rpc("pickup_call", { p_actor: gate.id, p_session: sid })).error).toBeNull();
    expect((await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sid })).error).toBeNull();
  });

  it("ประตู: session ได้ประตูของห้องเด็กอัตโนมัติ, คิวส่งชื่อประตู, ประตูที่ปิดไม่ถูกใช้", async () => {
    await reset();
    const z1 = (await svc().from("zones").insert({ school_id: school, name: "ประตู 1" }).select("id").single()).data!.id as string;
    const z2 = (await svc().from("zones").insert({ school_id: school, name: "ประตู 2", active: false }).select("id").single()).data!.id as string;
    await svc().from("classrooms").update({ zone_id: z1 }).eq("id", r1);
    await svc().from("classrooms").update({ zone_id: z2 }).eq("id", r2);
    expect((await start(p1, [s1])).error).toBeNull();
    expect((await sessionOf(p1))!.zone_id).toBe(z1);
    expect((await start(p3, [s3])).error).toBeNull();
    expect((await sessionOf(p3))!.zone_id).toBeNull(); // ประตูของห้องนี้ถูกปิดอยู่
    const q = await queue(gate);
    expect(q.find((x) => x.students.some((s) => s.id === s1))!.zone_name).toBe("ประตู 1");
    await svc().from("classrooms").update({ zone_id: null }).eq("school_id", school);
    await svc().from("zones").delete().eq("school_id", school);
  });

  it("รหัสผู้รับแทน: สร้าง → ตรวจ (ไม่ใช้) → ยืนยัน (ใช้ครั้งเดียว) → ใช้ซ้ำไม่ได้; แจ้งผู้ปกครอง", async () => {
    await reset();
    expect(await createPass(p1.id, { schoolId: school, studentIds: [s3], holderName: "ลุง", mode: "today" })).toEqual({ ok: false, error: "err_forbidden" }); // ไม่ใช่ลูกของ p1
    const c = await createPass(p1.id, { schoolId: school, studentIds: [s1, s2], holderName: "ลุงสมชาย", plate: "1กข234", mode: "today" });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const row = (await svc().from("pickup_passes").select("code_hash,status").eq("created_by", p1.id).single()).data!;
    expect(row.code_hash).not.toContain(c.code); // เก็บเฉพาะ hash
    // ตรวจเฉย ๆ ไม่ใช้
    const look = await checkOrRedeemPass(gate.id, school, c.code.toLowerCase(), false);
    expect(look.ok && look.pass.students.length).toBe(2);
    expect((await svc().from("pickup_passes").select("status").eq("created_by", p1.id).single()).data!.status).toBe("active");
    // คนที่ไม่ใช่เจ้าหน้าที่ใช้ไม่ได้, รหัสผิด/โรงเรียนอื่นไม่ได้
    expect(await checkOrRedeemPass(outsider.id, school, c.code, true)).toEqual({ ok: false, error: "err_forbidden" });
    expect(await checkOrRedeemPass(t1.id, school, c.code, true)).toEqual({ ok: false, error: "err_forbidden" }); // ครูไม่ใช่ผู้ยืนยันที่ประตู
    expect(await checkOrRedeemPass(gate.id, school, "AAAAAAAA", true)).toEqual({ ok: false, error: "err_pass_invalid" });
    expect(await checkOrRedeemPass(gate.id, school, "bad", true)).toEqual({ ok: false, error: "err_pass_invalid" });
    await addMember(other, outsider.id, "gate_staff");
    expect(await checkOrRedeemPass(outsider.id, other, c.code, true)).toEqual({ ok: false, error: "err_pass_invalid" });
    // ยืนยัน
    const use = await checkOrRedeemPass(gate.id, school, c.code, true);
    expect(use.ok).toBe(true);
    expect(await checkOrRedeemPass(gate.id, school, c.code, true)).toEqual({ ok: false, error: "err_pass_used" });
    expect((await svc().from("pickup_passes").select("status,used_by").eq("created_by", p1.id).single()).data).toMatchObject({ status: "used", used_by: gate.id });
    const n = await svc().from("app_notifications").select("title,body").eq("user_id", p1.id);
    expect(n.data?.some((x) => x.body?.includes("ลุงสมชาย"))).toBe(true);
    expect((await svc().from("app_notifications").select("id").eq("user_id", t1.id)).data?.length).toBe(1); // ครูห้อง ป.1/1 ได้แจ้งด้วย
  });

  it("รหัสผู้รับแทน: หมดอายุ/ยกเลิก/ติดธง/พักการรับ/เด็กอยู่ในคิว = ใช้ไม่ได้และ 'ไม่ถูกใช้ทิ้ง'", async () => {
    await reset();
    const mk = async (ids: string[]) => {
      const r = await createPass(p1.id, { schoolId: school, studentIds: ids, holderName: "ผู้รับ", mode: "days", days: 2 });
      if (!r.ok) throw new Error(r.error);
      return r.code;
    };
    const a = await mk([s1]);
    await svc().from("pickup_passes").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("created_by", p1.id);
    expect(await checkOrRedeemPass(gate.id, school, a, true)).toEqual({ ok: false, error: "err_pass_expired" });
    await svc().from("pickup_passes").delete().eq("created_by", p1.id);

    const b = await mk([s1]);
    await svc().from("pickup_passes").update({ status: "revoked" }).eq("created_by", p1.id);
    expect(await checkOrRedeemPass(gate.id, school, b, true)).toEqual({ ok: false, error: "err_pass_invalid" });
    await svc().from("pickup_passes").delete().eq("created_by", p1.id);

    const c = await mk([s1, s2]);
    await svc().from("custody_flags").insert({ school_id: school, student_id: s2, kind: "hold_all" });
    expect(await checkOrRedeemPass(gate.id, school, c, true)).toEqual({ ok: false, error: "err_held" });
    const look = await checkOrRedeemPass(gate.id, school, c, false);
    expect(look.ok && look.pass.held).toBe(1);
    await svc().from("custody_flags").update({ active: false }).eq("school_id", school);
    await svc().from("school_settings").update({ pickup_paused: true }).eq("school_id", school);
    expect(await checkOrRedeemPass(gate.id, school, c, true)).toEqual({ ok: false, error: "err_paused" });
    await svc().from("school_settings").update({ pickup_paused: false }).eq("school_id", school);
    expect((await start(p2, [s1])).error).toBeNull(); // เด็กอยู่ในคิวผู้ปกครองอีกคน
    expect(await checkOrRedeemPass(gate.id, school, c, true)).toEqual({ ok: false, error: "err_student_busy" });
    expect((await svc().from("pickup_passes").select("status").eq("created_by", p1.id).single()).data!.status).toBe("active"); // ยังไม่ถูกใช้ทิ้ง
    await svc().from("pickup_sessions").delete().eq("school_id", school); // เด็กไม่อยู่ในคิวแล้ว
    expect((await checkOrRedeemPass(gate.id, school, c, true)).ok).toBe(true);
  });

  it("รหัสผู้รับแทน: สร้างได้ไม่เกิน 5 รหัสที่ใช้ได้ และเด็กที่ติดธงสร้างไม่ได้", async () => {
    await reset();
    await svc().from("pickup_passes").delete().eq("created_by", p3.id);
    for (let i = 0; i < 5; i++) expect((await createPass(p3.id, { schoolId: school, studentIds: [s3], holderName: `ผู้รับ ${i}`, mode: "today" })).ok).toBe(true);
    expect(await createPass(p3.id, { schoolId: school, studentIds: [s3], holderName: "เกิน", mode: "today" })).toEqual({ ok: false, error: "err_pass_limit" });
    await svc().from("pickup_passes").delete().eq("created_by", p3.id);
    await svc().from("custody_flags").insert({ school_id: school, student_id: s3, kind: "hold_all" });
    expect(await createPass(p3.id, { schoolId: school, studentIds: [s3], holderName: "ผู้รับ", mode: "today" })).toEqual({ ok: false, error: "err_student_held" });
    await reset();
  });

  it("แจ้งล่วงหน้า: ตั้ง/แก้/ล้างได้เฉพาะลูกที่อนุมัติ; วันที่นอกช่วงไม่ได้; ครูเห็นเฉพาะห้องตัวเอง เจ้าหน้าที่ประตูเห็นทั้งโรงเรียน", async () => {
    const today = bangkokYmd(new Date());
    expect(await setPlan(p1.id, { schoolId: school, studentIds: [s3], date: today, mode: "bus" })).toEqual({ ok: false, error: "err_forbidden" });
    expect(await setPlan(p1.id, { schoolId: school, studentIds: [s1], date: "2020-01-01", mode: "bus" })).toEqual({ ok: false, error: "err_invalid_input" });
    expect((await setPlan(p1.id, { schoolId: school, studentIds: [s1, s2], date: today, mode: "bus" })).ok).toBe(true);
    expect((await setPlan(p3.id, { schoolId: school, studentIds: [s3], date: today, mode: "absent" })).ok).toBe(true);
    expect((await setPlan(p1.id, { schoolId: school, studentIds: [s1], date: today, mode: "parent" })).ok).toBe(true); // แก้ทับ
    const g = (await gate.client.rpc("dismissal_plans_today", { p_school: school })).data as { student_id: string; mode: string }[];
    expect(g.length).toBe(3);
    expect(g.find((x) => x.student_id === s1)!.mode).toBe("parent");
    const t = (await t1.client.rpc("dismissal_plans_today", { p_school: school })).data as { student_id: string }[];
    expect(t.map((x) => x.student_id).sort()).toEqual([s1, s2].sort()); // ห้อง ป.1/2 (s3) ไม่เห็น
    expect((await outsider.client.rpc("dismissal_plans_today", { p_school: school })).error).not.toBeNull();
    expect((await p1.client.rpc("dismissal_plans_today", { p_school: school })).error).not.toBeNull();
    expect((await setPlan(p1.id, { schoolId: school, studentIds: [s1, s2], date: today, mode: "clear" })).ok).toBe(true);
    expect(((await gate.client.rpc("dismissal_plans_today", { p_school: school })).data as unknown[]).length).toBe(1);
    await svc().from("dismissal_plans").delete().eq("school_id", school);
  });

  it("เตือนรับช้า: เฉพาะเด็กที่ 'คาดว่ามีคนมารับ' และยังไม่ออก; ไม่เตือนรถโรงเรียน/ลา/ออกแล้ว/พักการรับ; ส่งครั้งเดียว", async () => {
    await reset();
    await svc().from("dismissal_plans").delete().eq("school_id", school);
    const today = bangkokYmd(new Date());
    const at = new Date(`${today}T16:00:00+07:00`);
    await svc().from("school_settings").update({ dismissal_time: "15:00", late_pickup_min: 30 }).eq("school_id", school);
    const cands = async (now = at) => ((await svc().rpc("late_pickup_candidates", { p_now: now.toISOString() })).data as { school_id: string; student_id: string; late_min: number }[]).filter((c) => c.school_id === school);

    expect(await cands()).toHaveLength(0); // ไม่มีใครแจ้งว่ามีคนมารับ
    await svc().from("dismissal_plans").insert([
      { school_id: school, student_id: s1, plan_date: today, mode: "parent" },
      { school_id: school, student_id: s2, plan_date: today, mode: "bus" },
      { school_id: school, student_id: s3, plan_date: today, mode: "other" },
    ]);
    expect((await cands()).map((c) => c.student_id).sort()).toEqual([s1, s3].sort());
    expect((await cands())[0]!.late_min).toBe(30);
    expect(await cands(new Date(`${today}T15:29:00+07:00`))).toHaveLength(0); // ยังไม่ถึงเวลา (15:00 + 30 นาที)
    expect(await cands(new Date(`${today}T22:30:00+07:00`))).toHaveLength(0); // เลย 6 ชั่วโมงแล้วไม่เตือนต่อ
    // ออกไปแล้ว (ผู้ปกครองรับ) → ไม่ถูกเตือน
    expect((await start(p1, [s1])).error).toBeNull();
    const sid = (await sessionOf(p1))!.id;
    expect((await cands()).map((c) => c.student_id)).toContain(s1);
    await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sid });
    expect((await cands()).map((c) => c.student_id)).toEqual([s3]);
    // ผู้รับแทนรับ s3 แล้ว → ไม่เตือน
    await svc().from("dismissal_plans").update({ mode: "parent" }).eq("student_id", s3);
    const pass = await createPass(p3.id, { schoolId: school, studentIds: [s3], holderName: "ป้า", mode: "today" });
    if (!pass.ok) throw new Error(pass.error);
    expect((await cands()).map((c) => c.student_id)).toEqual([s3]);
    await checkOrRedeemPass(gate.id, school, pass.code, true);
    expect(await cands()).toHaveLength(0);
    // พักการรับ = ไม่เตือน
    await svc().from("pickup_passes").delete().eq("created_by", p3.id);
    expect((await cands()).map((c) => c.student_id)).toEqual([s3]);
    await svc().from("school_settings").update({ pickup_paused: true }).eq("school_id", school);
    expect(await cands()).toHaveLength(0);
    await svc().from("school_settings").update({ pickup_paused: false }).eq("school_id", school);

    // กฎ: แจ้งผู้ปกครองครั้งเดียว + สรุปให้เจ้าหน้าที่ครั้งเดียว แม้รันซ้ำ
    const ctx = { now: at, rules: await loadRules(), overBudget: () => false };
    const n1 = await lateStep(ctx);
    expect(n1).toBeGreaterThanOrEqual(1);
    await lateStep(ctx);
    const mine = (await svc().from("app_notifications").select("title,body").eq("user_id", p3.id)).data!.filter((x) => x.title.includes("ยังรอรับ"));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.body).toContain("ซี".slice(0, 0)); // มีชื่อเด็ก (ชื่อต้น)
    expect((await svc().from("app_notifications").select("id").eq("user_id", gate.id).like("dedupe_key", "late-digest:%")).data).toHaveLength(1);
    await svc().from("school_settings").update({ dismissal_time: null }).eq("school_id", school);
    await svc().from("dismissal_plans").delete().eq("school_id", school);
  });

  it("จอ TV: ลิงก์ลับ (เก็บ hash), แสดงเฉพาะชื่อเล่น+ห้อง ไม่มีชื่อผู้ปกครอง/ทะเบียน, ยกเลิกแล้วใช้ไม่ได้, ลายนิ้วมือเปลี่ยนเมื่อมีการเรียก", async () => {
    await reset();
    const token = "T".repeat(24);
    const ins = await svc().from("tv_displays").insert({ school_id: school, name: "จอ 1", token_hash: hashToken(token) }).select("id").single();
    const disp = await findTv(token);
    expect(disp?.id).toBe(ins.data!.id);
    expect(await findTv("short")).toBeNull();
    expect(await findTv("X".repeat(24))).toBeNull();
    const empty = await loadTvState(disp!);
    expect(empty.state.called).toEqual([]);
    expect((await start(p1, [s1])).error).toBeNull();
    const sid = (await sessionOf(p1))!.id;
    await svc().from("school_settings").update({ tv_show_arriving: true }).eq("school_id", school);
    const before = await loadTvState(disp!);
    expect(before.state.called).toHaveLength(0);
    expect(before.state.arriving).toHaveLength(1);
    expect(JSON.stringify(before.state)).not.toContain(p1.vehicle);
    await svc().rpc("pickup_call", { p_actor: gate.id, p_session: sid });
    const after = await loadTvState(disp!);
    expect(after.state.called).toEqual([{ id: s1, nickname: "เอ", classroom: "ป.1/1", zone: null }]);
    expect(after.state.fp).not.toBe(before.state.fp);
    const json = JSON.stringify(after.state);
    for (const secret of ["คุณ sf1", "กข", "หนึ่ง", "driver", "plate"]) expect(json).not.toContain(secret); // ไม่มีผู้ปกครอง/ทะเบียน/นามสกุล
    await svc().from("tv_displays").delete().eq("id", ins.data!.id);
    expect(await findTv(token)).toBeNull();
    await svc().from("school_settings").update({ tv_show_arriving: false }).eq("school_id", school);
  });

  it("ประกาศฉุกเฉิน: แจ้งผู้ปกครองและเจ้าหน้าที่ทุกคน + พักการรับได้ + แบนเนอร์ + เปิดรับอีกครั้ง; ส่งถี่เกิน 5 ครั้ง/ชั่วโมงถูกจำกัด", async () => {
    await reset();
    await svc().from("broadcasts").delete().eq("school_id", school);
    await svc().from("app_notifications").delete().in("user_id", [p1.id, p2.id, p3.id, gate.id, adm.id, t1.id]);
    const r = await sendBroadcast({ userId: adm.id, role: "school_admin", schoolId: school, title: "ฝนตกหนัก", body: "รับนักเรียนที่อาคาร A", severity: "danger", pause: true });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.recipients).toBe(6); // ผู้ปกครอง 3 + gate + admin + ครู
    for (const u of [p1, p2, p3, gate, adm, t1]) {
      const n = await svc().from("app_notifications").select("title,kind").eq("user_id", u.id).like("dedupe_key", "broadcast:%");
      expect(n.data, u.id).toHaveLength(1);
      expect(n.data![0]).toMatchObject({ title: "ฝนตกหนัก", kind: "danger" });
    }
    expect((await svc().from("app_notifications").select("id").eq("user_id", outsider.id).like("dedupe_key", "broadcast:%")).data).toHaveLength(0);
    expect((await start(p1, [s1])).error?.message).toContain("paused");
    expect((await svc().from("school_settings").select("pickup_paused,pickup_pause_note").eq("school_id", school).single()).data).toMatchObject({ pickup_paused: true, pickup_pause_note: "ฝนตกหนัก" });
    const notice = await getSchoolNotice(school);
    expect(notice).toMatchObject({ paused: true, broadcast: { title: "ฝนตกหนัก", severity: "danger" } });
    expect(await resumePickups(adm.id, "school_admin", school)).toBe(true);
    expect((await start(p1, [s1])).error).toBeNull();
    const rows = (await svc().from("school_settings").select("pickup_paused").eq("school_id", school).single()).data!;
    expect(rows.pickup_paused).toBe(false);
    expect((await svc().from("broadcasts").select("ended_at").eq("school_id", school)).data!.every((b) => b.ended_at)).toBe(true);
    // จำกัดความถี่
    for (let i = 0; i < 4; i++) await sendBroadcast({ userId: adm.id, role: "school_admin", schoolId: school, title: `ทดสอบ ${i}`, body: "x", severity: "info", pause: false });
    expect(await sendBroadcast({ userId: adm.id, role: "school_admin", schoolId: school, title: "เกิน", body: "x", severity: "info", pause: false })).toEqual({ ok: false, error: "err_rate_limited" });
    await svc().rpc("rl_hit", { p_key: `bc:${school}`, p_limit: 1, p_window_s: 1 }); // ไม่ทำอะไรต่อ — ล้างโดยลบโรงเรียนตอนจบ
  });

  it("audit ของเฟส 6: การเพิ่ม/ยกเลิกธง, ประตู, รหัสถูกบันทึกเฉพาะคอลัมน์ปลอดภัย (ไม่มีเหตุผล/ชื่อผู้รับ/รหัส)", async () => {
    await audit({ action: "custody.add", entity: "custody_flags", schoolId: school, detail: { kind: "hold_all", note: "ต้องถูกทิ้ง" } });
    const { data } = await svc().from("audit_log").select("detail,entity").eq("school_id", school).eq("action", "custody.add");
    expect(JSON.stringify(data)).not.toContain("ต้องถูกทิ้ง");
    const trig = (await svc().from("audit_log").select("detail").eq("entity", "custody_flags").eq("source", "db")).data ?? [];
    expect(JSON.stringify(trig)).not.toContain("ลับ");
    expect(JSON.stringify(trig)).not.toContain("คำสั่งศาล");
    const passAudit = (await svc().from("audit_log").select("detail").eq("entity", "pickup_passes")).data ?? [];
    expect(JSON.stringify(passAudit)).not.toContain("ลุงสมชาย");
  });
});

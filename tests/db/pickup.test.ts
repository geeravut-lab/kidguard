import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, setSchoolLocation, sql, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);
const svc = () => admin();
type P = Awaited<ReturnType<typeof makeParent>>;

d("แกนหลัก check-in → คิว → check-out (ฐานข้อมูลจริง)", () => {
  let school = "", other = "";
  let r1 = "", r2 = "";
  let s1 = "", s2 = "", s3 = "", s4 = "", sx = "";
  let p1: P, p2: P, p3: P, p4: P, pSame: P;
  let t1: TestUser, t2: TestUser, gate: TestUser, adm: TestUser, outGate: TestUser, outsider: TestUser;

  const start = (p: P, students: string[], dist = 1200, eta = 300, extra: Record<string, unknown> = {}) =>
    svc().rpc("pickup_start", { p_user: p.id, p_school: school, p_person: p.person, p_vehicle: p.vehicle, p_students: students, p_dist_m: dist, p_eta_s: eta, p_src: "estimate", ...extra });
  const queue = async (u: TestUser) => (await u.client.rpc("pickup_queue", { p_school: school })).data as { session_id: string; status: string; students: { id: string; status: string }[] }[];

  beforeAll(async () => {
    school = await makeSchool("pk");
    other = await makeSchool("pk2");
    r1 = await makeClassroom(school, "ป.1/1");
    r2 = await makeClassroom(school, "ป.1/2");
    [s1, s2, s3, s4, sx] = await Promise.all([
      makeStudent(school, r1, "เอ", "หนึ่ง"), makeStudent(school, r1, "บี", "สอง"), makeStudent(school, r2, "ซี", "สาม"), makeStudent(school, r2, "ดี", "สี่"), makeStudent(school, r1, "อี", "ห้า"),
    ]);
    await setSchoolLocation(school);
    [t1, t2, gate, adm, outGate, outsider] = await Promise.all([makeUser("pt1"), makeUser("pt2"), makeUser("pgate"), makeUser("padm"), makeUser("pout"), makeUser("pnobody")]);
    await addMember(school, t1.id, "teacher", r1);
    await addMember(school, t2.id, "teacher", r2);
    await addMember(school, gate.id, "gate_staff");
    await addMember(school, adm.id, "school_admin");
    await addMember(other, outGate.id, "gate_staff");
    [p1, p2, p3, p4, pSame] = await Promise.all([
      makeParent("pa1", school, r1, [s1, s2]), makeParent("pa2", school, r2, [s3]), makeParent("pa3", school, r1, [sx]), makeParent("pa4", school, r2, [s4]), makeParent("pa5", school, r1, [s1]),
    ]);
  });
  afterAll(cleanup);

  it("ผู้ใช้ทั่วไปเรียกฟังก์ชันเขียนตรง ๆ ไม่ได้ (ไม่ผ่านเซิร์ฟเวอร์ = ไม่ผ่าน)", async () => {
    const args: [string, Record<string, unknown>][] = [
      ["pickup_start", { p_user: p1.id, p_school: school, p_person: p1.person, p_vehicle: p1.vehicle, p_students: [s1], p_dist_m: 0, p_eta_s: 0, p_src: "estimate" }],
      ["pickup_update", { p_user: p1.id, p_session: p1.id, p_dist_m: 0, p_eta_s: 0, p_src: "estimate" }],
      ["pickup_release", { p_actor: p1.id, p_session: p1.id }],
      ["pickup_cancel", { p_user: p1.id, p_session: p1.id }],
      ["pickup_expire", {}],
    ];
    for (const [fn, a] of args) expect((await p1.client.rpc(fn, a)).error, fn).not.toBeNull();
    expect((await p1.client.from("pickup_sessions").insert({ school_id: school, parent_user_id: p1.id })).error).not.toBeNull();
  });

  it("เงื่อนไขก่อน check-in: ไกลเกินรัศมี / โรงเรียนยังไม่ตั้งตำแหน่ง / เด็กไม่ได้รับอนุมัติ / ผู้ขับหรือรถของคนอื่น", async () => {
    expect((await start(p1, [s1], 2500)).error?.message).toContain("too_far");
    expect((await start(p1, [s1], 2000)).error?.message ?? "").not.toContain("too_far"); // ขอบเขตพอดีรัศมี 2000 ใช้ได้
    await svc().from("pickup_sessions").delete().eq("parent_user_id", p1.id);
    expect((await svc().rpc("pickup_start", { p_user: p1.id, p_school: other, p_person: p1.person, p_vehicle: p1.vehicle, p_students: [s1], p_dist_m: 10, p_eta_s: 10, p_src: "estimate" })).error?.message).toContain("school_not_ready");
    expect((await start(p1, [s3])).error?.message).toContain("student_not_linked"); // ลูกของคนอื่น
    expect((await start(p1, [])).error?.message).toContain("no_students");
    expect((await svc().rpc("pickup_start", { p_user: p1.id, p_school: school, p_person: p2.person, p_vehicle: p1.vehicle, p_students: [s1], p_dist_m: 10, p_eta_s: 10, p_src: "estimate" })).error?.message).toContain("invalid_person");
    expect((await svc().rpc("pickup_start", { p_user: p1.id, p_school: school, p_person: p1.person, p_vehicle: p2.vehicle, p_students: [s1], p_dist_m: 10, p_eta_s: 10, p_src: "estimate" })).error?.message).toContain("invalid_vehicle");
  });

  it("ช่วงเวลา check-in ต่อวัน: นอกช่วง → ปฏิเสธ, ในช่วง → ผ่าน, ช่วงข้ามเที่ยงคืนตัดสินถูก, เว้นว่าง = ทุกเวลา", async () => {
    const hhmm = (offMin: number) => new Date(Date.now() + offMin * 60e3 + 7 * 3600e3).toISOString().slice(11, 16); // เวลาไทย
    const set = (a: string | null, b: string | null) => svc().from("school_settings").update({ checkin_start: a, checkin_end: b }).eq("school_id", school);
    const tryStart = async () => {
      const r = await start(p1, [s1]);
      if (!r.error) await svc().from("pickup_sessions").delete().eq("id", r.data);
      return r.error?.message ?? "ok";
    };
    try {
      await set(hhmm(60), hhmm(120));
      expect(await tryStart()).toContain("outside_window");
      await set(hhmm(-60), hhmm(60));
      expect(await tryStart()).toBe("ok");
      // ช่วงข้ามเที่ยงคืน 22:00–06:00 (เวลาไทย): ผลต้องตรงกับเวลาปัจจุบันจริง
      await set("22:00", "06:00");
      const bkk = hhmm(0);
      const inside = bkk >= "22:00" || bkk <= "06:00";
      expect(await tryStart()).toEqual(inside ? "ok" : expect.stringContaining("outside_window"));
      await set(null, null);
      expect(await tryStart()).toBe("ok");
    } finally {
      await set(null, null); // คืนค่าเสมอ แม้เทสต์ล้ม
    }
  });

  let sess1 = "", sess2 = "", sess3 = "", sess4 = "";
  it("check-in สำเร็จ: พี่น้องในรถเดียว (คนละห้อง) = 1 แถว; ถึงประตูทันทีถ้าอยู่ในรัศมีประตู; คนเดียวมี session ได้ครั้งเดียว", async () => {
    const a = await start(p1, [s1, s2], 1200, 300);
    expect(a.error).toBeNull();
    sess1 = a.data;
    const row = (await svc().from("pickup_sessions").select("status,driver_name,plate_province,vehicle_desc,arrived_at,expires_at").eq("id", sess1).single()).data!;
    expect(row).toMatchObject({ status: "on_the_way", driver_name: "คุณ pa1", plate_province: "กรุงเทพมหานคร", vehicle_desc: "ขาว Civic", arrived_at: null });
    expect((await start(p1, [s1])).error?.message).toContain("already_active");
    const near = await start(p3, [sx], 80, 30);
    expect((await svc().from("pickup_sessions").select("status,arrived_at").eq("id", near.data).single()).data?.status).toBe("arrived");
    sess3 = near.data;
  });

  it("เด็กที่อยู่ในคิวอยู่แล้ว ผู้ปกครองอีกคนแจ้งซ้ำไม่ได้ (กันสองคนมาพร้อมกัน)", async () => {
    expect((await start(pSame, [s1])).error?.message).toContain("student_busy");
  });

  it("ผู้ปกครองเห็นเฉพาะ session ของตัวเอง; คนนอก/ผู้ปกครองคนอื่นไม่เห็น", async () => {
    expect((await p1.client.from("pickup_sessions").select("id")).data?.map((r) => r.id)).toEqual([sess1]);
    expect((await p1.client.from("pickup_session_students").select("student_id")).data?.length).toBe(2);
    expect((await p2.client.from("pickup_sessions").select("id")).data).toEqual([]);
    expect((await outsider.client.from("pickup_sessions").select("id")).data).toEqual([]);
  });

  it("คิวโรงเรียน: เรียง ถึงประตู → ETA น้อย→มาก → ระยะ; ลำดับเปลี่ยนสดเมื่อ ETA เปลี่ยน", async () => {
    sess2 = (await start(p2, [s3], 900, 120)).data;
    sess4 = (await start(p4, [s4], 700, 120)).data; // ETA เท่ากัน ระยะน้อยกว่า
    let q = await queue(gate);
    expect(q.map((x) => x.session_id)).toEqual([sess3, sess4, sess2, sess1]);
    // ผู้ปกครอง 1 ถึงเร็วขึ้นกว่าทุกคน (ยังไม่ถึงประตู)
    expect((await svc().rpc("pickup_update", { p_user: p1.id, p_session: sess1, p_dist_m: 400, p_eta_s: 60, p_src: "estimate" })).error).toBeNull();
    q = await queue(gate);
    expect(q.map((x) => x.session_id)).toEqual([sess3, sess1, sess4, sess2]);
    // ผู้ปกครอง 2 ถึงประตู → ขึ้นนำ (เรียงตามเวลาถึง: sess3 ถึงก่อน)
    const u = await svc().rpc("pickup_update", { p_user: p2.id, p_session: sess2, p_dist_m: 60, p_eta_s: 10, p_src: "estimate" });
    expect(u.data.status).toBe("arrived");
    q = await queue(adm);
    expect(q.map((x) => x.session_id).slice(0, 2)).toEqual([sess3, sess2]);
    expect(q.find((x) => x.session_id === sess2)!.status).toBe("arrived");
  });

  it("ครูเห็นเฉพาะนักเรียนในห้องตัวเอง (ไม่เห็นเด็กห้องอื่นแม้อยู่ในรถเดียวกัน); เจ้าหน้าที่ประตูเห็นทั้งหมด", async () => {
    const tq1 = await queue(t1);
    const mine = tq1.find((x) => x.session_id === sess1)!;
    expect(new Set(mine.students.map((s) => s.id))).toEqual(new Set([s1, s2])); // ทั้งสองคนอยู่ ป.1/1
    const tq2 = await queue(t2);
    expect(tq2.map((x) => x.session_id).sort()).toEqual([sess2, sess4].sort()); // t2 ไม่เห็น sess1/sess3 ที่เป็นเด็ก ป.1/1
    for (const s of tq2) for (const st of s.students) expect([s3, s4]).toContain(st.id);
    expect((await queue(gate)).length).toBe(4);
  });

  it("ผู้ที่ไม่เกี่ยวข้องอ่านคิวไม่ได้ (โรงเรียนอื่น, ผู้ปกครอง, คนนอก)", async () => {
    for (const u of [outGate, p1, outsider]) expect((await u.client.rpc("pickup_queue", { p_school: school })).error, u.email).not.toBeNull();
    for (const u of [outGate, p1]) expect((await u.client.rpc("pickup_fingerprint", { p_school: school })).error, u.email).not.toBeNull();
  });

  it("ตำแหน่งเก่า (stale) ถูกทำเครื่องหมาย; update ของ session คนอื่น/ที่จบแล้วไม่ได้", async () => {
    await svc().from("pickup_sessions").update({ last_seen_at: new Date(Date.now() - 10 * 60e3).toISOString() }).eq("id", sess4);
    const q = await queue(gate);
    expect(q.find((x) => x.session_id === sess4)).toMatchObject({ stale: true });
    expect(q.find((x) => x.session_id === sess2)).toMatchObject({ stale: false });
    expect((await svc().rpc("pickup_update", { p_user: p2.id, p_session: sess4, p_dist_m: 1, p_eta_s: 1, p_src: "estimate" })).error?.message).toContain("not_active");
  });

  it("แจ้งเตือนนักเรียน 'ใกล้ถึง': due ครั้งเดียวต่อ session เมื่อเปิดใช้และ ETA ≤ นาทีที่ตั้ง", async () => {
    await svc().from("school_settings").update({ student_dashboard_enabled: true, student_alert_min: 5 }).eq("school_id", school);
    const a = await svc().rpc("pickup_update", { p_user: p4.id, p_session: sess4, p_dist_m: 500, p_eta_s: 200, p_src: "estimate" });
    expect(a.data.student_alert_due).toBe(true);
    const b = await svc().rpc("pickup_update", { p_user: p4.id, p_session: sess4, p_dist_m: 400, p_eta_s: 150, p_src: "estimate" });
    expect(b.data.student_alert_due).toBe(false);
  });

  it("ยืนยันตัวที่ประตู: เจ้าหน้าที่ประตู/แอดมินได้ ครูและคนนอกไม่ได้; ยืนยันได้ครั้งเดียว", async () => {
    for (const u of [t1, p1, outGate]) expect((await svc().rpc("pickup_verify", { p_actor: u.id, p_session: sess1 })).error, u.email).not.toBeNull();
    expect((await svc().rpc("pickup_verify", { p_actor: gate.id, p_session: sess1 })).data).toBe(true);
    expect((await svc().rpc("pickup_verify", { p_actor: gate.id, p_session: sess1 })).data).toBe(false);
    expect((await svc().from("pickup_sessions").select("verified_by").eq("id", sess1).single()).data?.verified_by).toBe(gate.id);
  });

  it("เรียกนักเรียน: เจ้าหน้าที่ประตูเรียกทั้งคิว; ครูเรียกเฉพาะห้องตัวเอง; ผู้ปกครอง/คนนอกเรียกไม่ได้", async () => {
    for (const u of [p1, outGate, outsider]) expect((await svc().rpc("pickup_call", { p_actor: u.id, p_session: sess1 })).error, u.email).not.toBeNull();
    expect((await svc().rpc("pickup_call", { p_actor: t2.id, p_session: sess1 })).data).toBe(0); // ไม่มีเด็กห้อง ป.1/2 ใน sess1
    expect((await svc().rpc("pickup_call", { p_actor: t1.id, p_session: sess1, p_student: s1 })).data).toBe(1);
    expect((await svc().rpc("pickup_call", { p_actor: gate.id, p_session: sess1 })).data).toBe(1); // เหลือ s2
    const q = await queue(gate);
    expect(q.find((x) => x.session_id === sess1)!.students.every((s) => s.status === "called")).toBe(true);
  });

  it("check-out: ครูปล่อยเด็กห้องตัวเอง (คิวยังไม่จบถ้ายังเหลือเด็ก) → ผู้ปกครองกดรับแล้วจบทั้งคิว; ซ้ำไม่ได้", async () => {
    const r = await svc().rpc("pickup_release", { p_actor: t1.id, p_session: sess1, p_student: s1 });
    expect(r.data).toMatchObject({ completed: false, released: 1, by_role: "teacher" });
    expect((await svc().rpc("pickup_release", { p_actor: outGate.id, p_session: sess1 })).error).not.toBeNull();
    const done = await svc().rpc("pickup_release", { p_actor: p1.id, p_session: sess1 });
    expect(done.data).toMatchObject({ completed: true, by_role: "parent", parent_user_id: p1.id });
    expect((await svc().from("pickup_sessions").select("status,completed_by,completed_by_role").eq("id", sess1).single()).data).toEqual({ status: "completed", completed_by: p1.id, completed_by_role: "parent" });
    expect((await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sess1 })).error?.message).toContain("not_active");
    expect((await queue(gate)).find((x) => x.session_id === sess1)).toBeUndefined();
    // เด็กถูกปล่อยแล้ว ผู้ปกครองอีกคนแจ้งมารับได้
    expect((await start(pSame, [s1], 500, 90)).error).toBeNull();
  });

  it("check-out โดยเจ้าหน้าที่ก่อน: ครูปล่อยเด็กคนสุดท้าย → คิวจบเอง บันทึกว่าครูเป็นผู้ปิด และคืนข้อมูลให้แจ้งผู้ปกครอง", async () => {
    const r = await svc().rpc("pickup_release", { p_actor: t2.id, p_session: sess2 });
    expect(r.data).toMatchObject({ completed: true, by_role: "teacher", parent_user_id: p2.id });
    const row = (await svc().from("pickup_sessions").select("status,completed_by_role").eq("id", sess2).single()).data;
    expect(row).toEqual({ status: "completed", completed_by_role: "teacher" });
  });

  it("เจ้าหน้าที่ประตูปิดคิว (ทั้งคิว) และยกเลิกโดยผู้ปกครองเฉพาะของตัวเอง", async () => {
    expect((await svc().rpc("pickup_cancel", { p_user: p3.id, p_session: sess4 })).data).toBe(false); // ของคนอื่น
    expect((await svc().rpc("pickup_cancel", { p_user: p4.id, p_session: sess4 })).data).toBe(true);
    expect((await svc().rpc("pickup_cancel", { p_user: p4.id, p_session: sess4 })).data).toBe(false); // ซ้ำ
    const g = await svc().rpc("pickup_release", { p_actor: gate.id, p_session: sess3 });
    expect(g.data).toMatchObject({ completed: true, by_role: "gate_staff" });
  });

  it("หมดอายุอัตโนมัติ: คืนรายการให้แจ้งผู้ปกครอง ปล่อยเด็กให้แจ้งใหม่ได้; ไม่แตะ session ที่ยังไม่หมดอายุ", async () => {
    const fresh = await start(p4, [s4], 800, 200);
    expect(fresh.error).toBeNull();
    const old = (await start(p2, [s3], 800, 200)).data;
    await svc().from("pickup_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", old);
    const ex = await svc().rpc("pickup_expire");
    const mine = (ex.data as { session_id: string; parent_user_id: string }[]).filter((r) => [old, fresh.data].includes(r.session_id));
    expect(mine).toEqual([{ session_id: old, parent_user_id: p2.id, school_id: school }]);
    expect((await svc().from("pickup_sessions").select("status").eq("id", old).single()).data?.status).toBe("expired");
    expect((await svc().from("pickup_sessions").select("status").eq("id", fresh.data).single()).data?.status).toBe("on_the_way");
    expect((await start(p2, [s3])).error).toBeNull(); // นักเรียนถูกปล่อยจากคิวที่หมดอายุแล้ว
  });

  it("audit: บันทึกเฉพาะการเปลี่ยนสถานะ ไม่ท่วมด้วยการอัปเดต ETA และไม่มีพิกัด/ข้อมูลส่วนบุคคล", async () => {
    const cur = (await svc().from("pickup_sessions").select("id").eq("parent_user_id", p4.id).eq("status", "on_the_way").single()).data!.id;
    const count = async () => (await svc().from("audit_log").select("id", { count: "exact", head: true }).eq("entity_id", cur).eq("action", "db.pickup_sessions.update")).count ?? 0;
    const before = await count();
    for (let i = 0; i < 5; i++) await svc().rpc("pickup_update", { p_user: p4.id, p_session: cur, p_dist_m: 700 - i * 50, p_eta_s: 300 - i * 20, p_src: "google", p_route_eta: 300, p_route_straight: 700, p_route_road: 900 });
    expect(await count()).toBe(before); // ไม่มีแถวใหม่แม้อัปเดต 5 ครั้ง (นาที ETA เปลี่ยน แต่ไม่เปลี่ยนสถานะ)
    const rows = (await svc().from("audit_log").select("detail").eq("entity_id", cur)).data ?? [];
    expect(JSON.stringify(rows)).not.toMatch(/lat|lng|13\.7|100\.5|phone|0812345678/i);
    await svc().rpc("pickup_manual_arrive", { p_user: p4.id, p_session: cur });
    expect(await count()).toBeGreaterThan(before);
  });

  it("ปุ่ม 'ฉันถึงประตูแล้ว' (กรณี GPS ไม่แม่น): ทำได้เฉพาะ session ของตัวเอง และทำเครื่องหมาย manual", async () => {
    const cur = (await svc().from("pickup_sessions").select("id").eq("parent_user_id", p2.id).eq("status", "on_the_way").single()).data!.id;
    expect((await svc().rpc("pickup_manual_arrive", { p_user: p4.id, p_session: cur })).data).toBe(false);
    expect((await svc().rpc("pickup_manual_arrive", { p_user: p2.id, p_session: cur })).data).toBe(true);
    expect((await svc().from("pickup_sessions").select("status,manual_arrival,eta_source").eq("id", cur).single()).data).toEqual({ status: "arrived", manual_arrival: true, eta_source: "manual" });
  });

  it("ลายนิ้วมือสำรอง: เปลี่ยนเมื่อมีการเปลี่ยนแปลง, ผู้ปกครองมีของตัวเอง, ไม่มีชื่อหรือข้อความ", async () => {
    const f1 = (await gate.client.rpc("pickup_fingerprint", { p_school: school })).data as string;
    expect(f1).toMatch(/^[0-9/]+$/);
    await svc().rpc("pickup_call", { p_actor: gate.id, p_session: (await svc().from("pickup_sessions").select("id").eq("parent_user_id", p2.id).eq("status", "arrived").single()).data!.id });
    const f2 = (await gate.client.rpc("pickup_fingerprint", { p_school: school })).data as string;
    expect(f2).not.toBe(f1);
    expect(((await p2.client.rpc("pickup_my_fingerprint")).data as string)).toContain("arrived");
  });

  it("Live sync: ปลุกเฉพาะ topic ที่เกี่ยวข้อง และมีนโยบายผู้ฟังบน realtime.messages", async () => {
    const pol = await sql("select policyname from pg_policies where schemaname='realtime' and tablename='messages' and policyname='live_signals_listen'");
    expect(pol.length).toBe(1);
    // ฟังก์ชันตัดสินผู้ฟัง (ใช้ในนโยบาย): ตรวจกับสิทธิ์จริงของผู้ใช้
    const may = async (u: TestUser, topic: string) => (await u.client.rpc("live_may_hear", { p_topic: topic })).data;
    expect(await may(gate, `school:${school}`)).toBe(true);
    expect(await may(adm, `school:${school}`)).toBe(true);
    expect(await may(t1, `school:${school}`)).toBe(false); // ครูฟังห้องของตัวเองเท่านั้น
    expect(await may(t1, `class:${r1}`)).toBe(true);
    expect(await may(t1, `class:${r2}`)).toBe(false);
    expect(await may(outGate, `school:${school}`)).toBe(false);
    expect(await may(outGate, `class:${r1}`)).toBe(false);
    expect(await may(p1, `school:${school}`)).toBe(false);
    expect(await may(gate, "school:not-a-uuid")).toBe(false);
    expect(await may(gate, "admin")).toBe(false);
  });

  it("ลบบัญชีผู้ปกครอง → session ของเขาถูกลบตาม (PDPA/cascade)", async () => {
    await admin().auth.admin.deleteUser(p3.id);
    expect((await svc().from("pickup_sessions").select("id").eq("parent_user_id", p3.id)).data).toEqual([]);
  });
});

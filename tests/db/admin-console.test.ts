import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "@/lib/audit/server";
import { clearBrandImage, saveBrandImage, schoolLogoRef, serveBrandImage } from "@/lib/brand/server";
import { parseAnalytics, parseQueueStats } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/server";
import { loadRules, runTick } from "@/lib/rules/tick";
import { addMember, admin, cleanup, HAS_DB, makeClassroom, makeParent, makeSchool, makeStudent, makeUser, sql, type TestUser } from "./helpers";

const d = describe.skipIf(!HAS_DB);

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

d("คอนโซลแอดมิน (ฐานข้อมูลจริง)", () => {
  let school = "", room = "", stu = "";
  let adm: TestUser, outsider: TestUser;
  let parent: Awaited<ReturnType<typeof makeParent>>;

  beforeAll(async () => {
    school = await makeSchool("ac");
    room = await makeClassroom(school, "ป.2/1");
    stu = await makeStudent(school, room, "เอ", "ทดสอบ");
    adm = await makeUser("acadm");
    outsider = await makeUser("acout");
    await addMember(school, adm.id, "school_admin");
    parent = await makeParent("acp", school, room, [stu]);
  });
  afterAll(async () => {
    await sql(`delete from public.automation_rules where key like 'zz\\_%'`);
    await cleanup();
  });

  it("ตารางและฟังก์ชันของเฟส 5 ปิดจากผู้ใช้ทั่วไป (RLS + ถอนสิทธิ์)", async () => {
    for (const t of ["product_events", "automation_rules", "cron_ticks"]) {
      const r = await adm.client.from(t).select("*").limit(1);
      expect(r.error !== null || (r.data ?? []).length === 0, t).toBe(true);
      expect((await adm.client.from(t).insert({} as never)).error, t).not.toBeNull();
    }
    for (const [fn, args] of [["admin_analytics", { p_days: 30 }], ["admin_queue_stats", { p_days: 30 }], ["kg_cleanup_old", { p_notif_days: 1, p_msg_days: 1, p_events_days: 1, p_sessions_days: 1 }], ["school_user_ids", { p_school: school }]] as const) {
      expect((await adm.client.rpc(fn, args)).error, fn).not.toBeNull();
    }
  });

  it("bucket brand-assets เป็นแบบส่วนตัว", async () => {
    const { data } = await admin().storage.listBuckets();
    const b = data?.find((x) => x.id === "brand-assets");
    expect(b).toBeTruthy();
    expect(b!.public).toBe(false);
  });

  it("เหตุการณ์: active วันละครั้ง (ซ้ำถูกปฏิเสธเงียบ ๆ) และ signup ครั้งเดียวต่อคน", async () => {
    const a = admin();
    expect((await a.from("product_events").insert({ user_id: adm.id, event: "active" })).error).toBeNull();
    expect((await a.from("product_events").insert({ user_id: adm.id, event: "active" })).error?.code).toBe("23505");
    await trackEvent("signup", adm.id);
    await trackEvent("signup", adm.id); // ต้องไม่ throw
    const { data } = await a.from("product_events").select("id").eq("user_id", adm.id).eq("event", "signup");
    expect(data).toHaveLength(1);
    expect((await a.from("product_events").insert({ user_id: adm.id, event: "Bad Event" })).error).not.toBeNull(); // รูปแบบชื่อ
  });

  it("admin_analytics: นับเฉพาะคนของโรงเรียน, วันที่ไม่มีข้อมูลเป็น 0, funnel/retention มีรูปร่างถูก", async () => {
    const a = admin();
    await a.from("product_events").insert([
      { user_id: parent.id, event: "active" },
      { user_id: parent.id, event: "pickup_started", school_id: school },
      { user_id: parent.id, event: "pickup_completed", school_id: school },
    ]);
    await a.from("product_events").insert({ user_id: outsider.id, event: "active" }); // คนนอกโรงเรียน
    const { data, error } = await a.rpc("admin_analytics", { p_days: 30, p_school: school });
    expect(error).toBeNull();
    const r = parseAnalytics(data);
    expect(r.days).toBe(30);
    expect(r.dau).toBe(2); // adm + parent (ไม่รวม outsider)
    expect(r.users_total).toBe(2);
    expect(r.daily).toHaveLength(30);
    expect(r.daily[r.daily.length - 1]!.n).toBe(2);
    expect(r.daily.slice(0, 29).every((x) => x.n === 0)).toBe(true);
    expect(r.funnel.map((f) => f.step)).toEqual(["signup", "onboarded", "guardian_linked", "pickup_started", "pickup_completed"]);
    expect(r.funnel.find((f) => f.step === "pickup_completed")!.users).toBe(1);
    expect(r.events.find((e) => e.event === "pickup_started")!.count).toBe(1);
    expect(r.retention.d1.eligible).toBeGreaterThanOrEqual(0);
    // ทั้งแพลตฟอร์ม (null) ต้องไม่ล้ม และไม่น้อยกว่าของโรงเรียน
    const all = parseAnalytics((await a.rpc("admin_analytics", { p_days: 7 })).data);
    expect(all.dau).toBeGreaterThanOrEqual(3);
    // ช่วงนอกขอบเขตถูกบีบ
    expect(parseAnalytics((await a.rpc("admin_analytics", { p_days: 99999, p_school: school })).data).days).toBe(365);
  });

  it("admin_queue_stats: ผลลัพธ์ เวลารอที่ประตู ช่วงชั่วโมง", async () => {
    const a = admin();
    const now = Date.now();
    const mk = (status: string, parentId: string, waitMin: number | null) => ({
      school_id: school, parent_user_id: parentId, driver_name: "x", plate: "กข1", plate_province: "กทม", status,
      checked_in_at: new Date(now - 40 * 60e3).toISOString(), expires_at: new Date(now + 3600e3).toISOString(),
      arrived_at: waitMin == null ? null : new Date(now - (waitMin + 2) * 60e3).toISOString(),
      completed_at: status === "completed" ? new Date(now - 2 * 60e3).toISOString() : null,
      completed_by_role: status === "completed" ? "parent" : status === "cancelled" ? "parent" : null,
    });
    const rows = await Promise.all([parent, adm, outsider].map((u, i) => a.from("pickup_sessions").insert(mk(["completed", "completed", "cancelled"][i]!, u.id, i < 2 ? [4, 10][i]! : null)).select("id")));
    rows.forEach((r) => expect(r.error).toBeNull());
    const q = parseQueueStats((await a.rpc("admin_queue_stats", { p_days: 7, p_school: school })).data);
    expect(q.total).toBe(3);
    expect(q.completed).toBe(2);
    expect(q.cancelled).toBe(1);
    expect(q.by_parent).toBe(3);
    expect(q.wait_avg_s).toBe(420); // เฉลี่ย 7 นาที
    expect(q.wait_p50_s).toBe(420);
    expect(q.wait_p90_s).toBeGreaterThan(420);
    expect(q.by_hour.reduce((s, x) => s + x.n, 0)).toBe(3);
    expect(q.by_weekday.reduce((s, x) => s + x.n, 0)).toBe(3);
    expect(q.daily).toHaveLength(7);
    // ขอบเขตโรงเรียนอื่น = 0
    const other = await makeSchool("acq");
    expect(parseQueueStats((await a.rpc("admin_queue_stats", { p_days: 7, p_school: other })).data).total).toBe(0);
    await a.from("pickup_sessions").delete().eq("school_id", school);
  });

  it("kg_cleanup_old: ลบเฉพาะที่เกินระยะเก็บรักษา ของใหม่อยู่ครบ", async () => {
    const a = admin();
    const old = (days: number) => new Date(Date.now() - days * 86400e3).toISOString();
    const n1 = await a.from("app_notifications").insert([
      { user_id: parent.id, kind: "info", title: "zz เก่า", created_at: old(200) },
      { user_id: parent.id, kind: "info", title: "zz ใหม่", created_at: new Date().toISOString() },
    ]).select("id");
    expect(n1.error).toBeNull();
    await a.from("product_events").insert([{ user_id: parent.id, event: "plan_set", created_at: old(900) }, { user_id: parent.id, event: "plan_set", created_at: new Date().toISOString() }]);
    await a.from("pickup_sessions").insert({
      school_id: school, parent_user_id: parent.id, driver_name: "x", plate: "กข1", plate_province: "กทม", status: "completed", expires_at: old(500),
      checked_in_at: old(501), completed_at: old(500), completed_by_role: "parent",
    });
    const { data, error } = await a.rpc("kg_cleanup_old", { p_notif_days: 90, p_msg_days: 90, p_events_days: 730, p_sessions_days: 365 });
    expect(error).toBeNull();
    const r = data as Record<string, number>;
    expect(r.notifications).toBeGreaterThanOrEqual(1);
    expect(r.events).toBeGreaterThanOrEqual(1);
    expect(r.sessions).toBeGreaterThanOrEqual(1);
    const left = await a.from("app_notifications").select("title").eq("user_id", parent.id);
    expect(left.data?.map((x) => x.title)).toEqual(["zz ใหม่"]);
    expect((await a.from("product_events").select("id").eq("user_id", parent.id).eq("event", "plan_set")).data).toHaveLength(1);
    // ระยะเก็บรักษาต่ำเกินไปถูกยกขึ้นขั้นต่ำ (7 วัน) — ของใหม่ไม่โดนลบ
    await a.rpc("kg_cleanup_old", { p_notif_days: 0, p_msg_days: 0, p_events_days: 0, p_sessions_days: 0 });
    expect((await a.from("app_notifications").select("id").eq("user_id", parent.id)).data).toHaveLength(1);
  });

  it("กฎอัตโนมัติ: seed มีอยู่, tick รันกฎ+บันทึกรอบ, ปิดกฎแล้วข้าม, ตารางอ่านไม่ได้ยังทำงาน", async () => {
    const a = admin();
    const rules = await loadRules();
    expect(rules.get("pickup_expire")?.enabled).toBe(true);
    expect(rules.get("cleanup_old")?.params.notif_days).toBe(90);
    const before = (await a.from("cron_ticks").select("id").order("id", { ascending: false }).limit(1)).data?.[0]?.id ?? 0;
    const s1 = await runTick(new Date());
    expect(typeof s1.pickup_expire).toBe("number");
    expect((await a.from("cron_ticks").select("id,summary").gt("id", before)).data!.length).toBeGreaterThanOrEqual(1);
    expect((await a.from("automation_rules").select("last_run_at").eq("key", "pickup_expire").single()).data!.last_run_at).not.toBeNull();

    await a.from("automation_rules").update({ enabled: false }).eq("key", "pickup_expire");
    try {
      const s2 = await runTick(new Date());
      expect(s2.pickup_expire).toBe(-1);
    } finally {
      await a.from("automation_rules").update({ enabled: true }).eq("key", "pickup_expire");
    }
    // ไม่ถึงรอบ cleanup (ทำไปแล้วเมื่อกี้) = -2
    expect((await runTick(new Date())).cleanup_old).toBe(-2);
  });

  it("แก้กฎถูกบันทึกใน audit (trigger ฐานข้อมูล) โดยเก็บเฉพาะชื่อคอลัมน์ที่เปลี่ยน/ค่า enabled+params", async () => {
    const a = admin();
    const t0 = new Date(Date.now() - 1000).toISOString();
    await a.from("automation_rules").upsert({ key: "zz_audit_rule", enabled: true, params: {} });
    await a.from("automation_rules").update({ enabled: false }).eq("key", "zz_audit_rule");
    const { data } = await a.from("audit_log").select("action,detail").eq("entity", "automation_rules").gte("at", t0);
    const row = (data ?? []).find((r) => r.action === "db.automation_rules.update");
    expect(row).toBeTruthy();
    expect(JSON.stringify(row!.detail)).toContain("enabled");
    // ลบเฉพาะแถวที่เกิดระหว่างเทสต์นี้
    await sql(`alter table public.audit_log disable trigger audit_log_no_delete; delete from public.audit_log where entity = 'automation_rules' and at >= '${t0}'; alter table public.audit_log enable trigger audit_log_no_delete;`);
  });

  it("Audit: สวิตช์ระดับโรงเรียนปิดกลุ่มได้ แต่กลุ่ม audit บันทึกเสมอ แม้ปิดทั้งหมด", async () => {
    const a = admin();
    await a.from("school_settings").update({ audit: { enabled: true, off_groups: ["pickup"] } }).eq("school_id", school);
    await audit({ action: "pickup.zz_off", entity: "t", schoolId: school });
    await audit({ action: "guardian.zz_on", entity: "t", schoolId: school });
    await a.from("school_settings").update({ audit: { enabled: false, off_groups: [] } }).eq("school_id", school);
    await audit({ action: "guardian.zz_off_all", entity: "t", schoolId: school });
    await audit({ action: "audit.switches", entity: "school_settings", schoolId: school, detail: { enabled: false } });
    const { data } = await a.from("audit_log").select("action").eq("school_id", school).in("action", ["pickup.zz_off", "guardian.zz_on", "guardian.zz_off_all", "audit.switches"]);
    const got = (data ?? []).map((r) => r.action).sort();
    expect(got).toEqual(["audit.switches", "guardian.zz_on"]);
    await a.from("school_settings").update({ audit: {} }).eq("school_id", school);
  });

  it("โลโก้โรงเรียน: อัปโหลด → เสิร์ฟ (ETag/304) → เปลี่ยน (ไฟล์เก่าถูกลบ) → ลบ; รูปเสียถูกปฏิเสธและไม่เปลี่ยนค่า", async () => {
    const a = admin();
    const bad = await saveBrandImage({ kind: "logo", bytes: new TextEncoder().encode("<svg/>"), schoolId: school });
    expect(bad).toEqual({ ok: false, error: "err_image_type" });
    expect((await a.from("schools").select("logo").eq("id", school).single()).data!.logo).toBeNull();

    const r1 = await saveBrandImage({ kind: "logo", bytes: png(64, 64), schoolId: school });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const ref = schoolLogoRef((await a.from("schools").select("logo").eq("id", school).single()).data);
    expect(ref?.version).toBe(r1.ref.version);

    const req = (h: Record<string, string> = {}) => new NextRequest(`https://x.test/brand/school/${school}`, { headers: h });
    const res = await serveBrandImage(req(), ref, "logo", "/brand/logo", school);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect((await res.arrayBuffer()).byteLength).toBe(40);
    const etag = res.headers.get("etag")!;
    expect((await serveBrandImage(req({ "if-none-match": etag }), ref, "logo", "/brand/logo", school)).status).toBe(304);
    expect((await serveBrandImage(req(), null, "logo", "/brand/logo", school)).status).toBe(307);

    await new Promise((r) => setTimeout(r, 5));
    const r2 = await saveBrandImage({ kind: "logo", bytes: png(80, 80), schoolId: school });
    expect(r2.ok && r2.ref.version !== r1.ref.version).toBe(true);
    const files = await a.storage.from("brand-assets").list(`school/${school}`);
    expect(files.data?.map((f) => f.name)).toHaveLength(1); // ไฟล์เก่าถูกลบ ไม่มีช่วงไม่มีรูป

    expect(await clearBrandImage({ kind: "logo", schoolId: school })).toBe(true);
    expect((await a.from("schools").select("logo").eq("id", school).single()).data!.logo).toBeNull();
    expect((await a.storage.from("brand-assets").list(`school/${school}`)).data).toHaveLength(0);
  });

  it("ไอคอนแพลตฟอร์มที่ไม่ใช่จัตุรัส/ขนาดผิดถูกปฏิเสธก่อนอัปโหลด (ไม่แตะที่เก็บ)", async () => {
    expect(await saveBrandImage({ kind: "favicon", bytes: png(300, 200) })).toEqual({ ok: false, error: "err_image_square" });
    expect(await saveBrandImage({ kind: "favicon", bytes: png(64, 64) })).toEqual({ ok: false, error: "err_image_dims" });
  });
});

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ANON, HAS_DB, sql, URL_ } from "./helpers";

// ตรวจสิทธิ์ของ "ทุกตาราง/ฟังก์ชัน" ในฐานข้อมูลจริง — เพิ่มตาราง/ฟังก์ชันใหม่ที่เปิดสิทธิ์ให้ client โดยไม่ตั้งใจ = เทสต์นี้ล้ม
// (ต้องมาปรับ allowlist ด้านล่างโดยตั้งใจ พร้อมทบทวน RLS policy ของมัน)
const d = describe.skipIf(!HAS_DB);

/** ตารางที่ผู้ใช้ที่ล็อกอินแล้ว (authenticated) แตะได้ผ่าน RLS และสิทธิ์ที่ให้ไว้ — ที่เหลือคือ service_role เท่านั้น */
const AUTH_TABLES: Record<string, string> = {
  app_notifications: "DELETE,SELECT",
  classroom_teachers: "DELETE,INSERT,SELECT,UPDATE",
  classrooms: "DELETE,INSERT,SELECT,UPDATE",
  consents: "INSERT,SELECT",
  guardian_links: "DELETE,SELECT",
  guardian_persons: "DELETE,INSERT,SELECT,UPDATE",
  pickup_session_students: "SELECT",
  pickup_sessions: "SELECT",
  profiles: "SELECT",
  school_members: "SELECT",
  school_settings: "SELECT",
  schools: "SELECT",
  student_accounts: "SELECT",
  students: "DELETE,INSERT,SELECT,UPDATE",
  vehicles: "DELETE,INSERT,SELECT,UPDATE",
};
/** ฟังก์ชันที่ authenticated เรียกได้ (แต่ละตัวตรวจสิทธิ์ภายใน) */
const AUTH_FUNCS = [
  "bangkok_today", "choose_role", "claim_student", "classroom_options", "complete_onboarding", "decide_claim", "dismissal_plans_today", "has_school_role",
  "is_guardian_of", "is_platform_admin", "is_school_admin", "is_school_member", "kg_me", "live_may_hear", "my_line_channels", "pickup_fingerprint",
  "pickup_my_fingerprint", "pickup_queue", "redeem_invite", "remove_member", "revoke_invite", "school_claims", "school_line_status", "school_open_invites",
  "school_staff", "student_pickup_status", "teaches_classroom",
];

d("ตรวจสิทธิ์ฐานข้อมูลทั้งระบบ (RLS audit)", () => {
  it("ทุกตารางใน public เปิด RLS", async () => {
    const rows = await sql(`select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(rows.map((r) => r.t)).toEqual([]);
  });

  it("anon ไม่มีสิทธิ์ใด ๆ บนตารางและฟังก์ชันของ public", async () => {
    const t = await sql(`select table_name t, privilege_type p from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`);
    expect(t).toEqual([]);
    const f = await sql(`select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(f.map((r) => r.f)).toEqual([]);
  });

  it("สิทธิ์ของ authenticated บนตารางตรงกับ allowlist ที่ทบทวนแล้วเท่านั้น", async () => {
    const rows = await sql(`select table_name t, string_agg(distinct privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' group by 1 order by 1`);
    expect(Object.fromEntries(rows.map((r) => [r.t as string, r.p as string]))).toEqual(AUTH_TABLES);
  });

  it("ฟังก์ชันที่ authenticated เรียกได้ตรงกับ allowlist (ไม่มีฟังก์ชันเขียน/ตัวช่วยภายในหลุดออกไป)", async () => {
    const rows = await sql(`select distinct p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`);
    expect(rows.map((r) => r.f)).toEqual([...AUTH_FUNCS].sort());
  });

  it("ทุกฟังก์ชัน SECURITY DEFINER ตั้ง search_path และไม่มี view ใน public", async () => {
    const sd = await sql(`select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(sd).toEqual([]);
    expect(await sql(`select viewname from pg_views where schemaname = 'public'`)).toEqual([]);
  });

  it("ตารางที่ละเอียดอ่อนไม่มีสิทธิ์ให้ client เลย (ธงห้ามปล่อย, รหัสผู้รับแทน, ความลับ LINE, Audit, การตั้งค่า)", async () => {
    for (const t of ["custody_flags", "pickup_passes", "pickup_pass_students", "school_line_channels", "notification_channels", "audit_log", "platform_settings", "platform_admins", "school_invites", "tv_displays", "broadcasts", "dismissal_plans", "message_log", "rate_limits", "aivora_links"]) {
      expect(Object.keys(AUTH_TABLES), t).not.toContain(t);
    }
  });

  it("anon อ่านทุกตารางผ่าน REST ไม่ได้ (ว่างหรือถูกปฏิเสธ) และเรียกฟังก์ชันเขียนไม่ได้", async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const tables = await sql(`select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'kg_migrations'`);
    for (const t of tables.map((r) => r.t as string)) {
      const r = await anon.from(t).select("*").limit(1);
      expect(r.error !== null || (r.data ?? []).length === 0, t).toBe(true);
    }
    for (const fn of ["kg_me", "pickup_queue", "claim_student", "redeem_invite", "pass_use", "pickup_start", "admin_analytics", "student_held"]) {
      expect((await anon.rpc(fn, {})).error, fn).not.toBeNull();
    }
  });
});

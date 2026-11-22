// ตัวช่วยเทสต์ฐานข้อมูลจริง (Supabase ของ KidGuard) — ข้อมูลทดสอบใช้คำนำหน้า zz_test_ และลบทุกครั้งใน afterAll
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const HAS_DB = Boolean(URL_ && ANON && SERVICE);

export const admin = (): SupabaseClient => createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
export const rid = () => randomBytes(4).toString("hex");
export const PASSWORD = "Zz-test-pass-" + "12345";

export type TestUser = { id: string; email: string; client: SupabaseClient };

const created: { users: string[]; schools: string[] } = { users: [], schools: [] };

export async function makeUser(tag: string): Promise<TestUser> {
  const email = `zz_test_${tag}_${rid()}@kidguard.test`;
  const a = admin();
  const { data, error } = await a.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error("createUser failed: " + error?.message);
  created.users.push(data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw new Error("signIn failed: " + e2.message);
  return { id: data.user.id, email, client };
}

export async function makeSchool(tag: string) {
  const a = admin();
  const { data, error } = await a.from("schools").insert({ slug: `zz-test-${tag}-${rid()}`, name_th: `ทดสอบ ${tag}` }).select("id").single();
  if (error || !data) throw new Error("makeSchool failed: " + error?.message);
  created.schools.push(data.id);
  await a.from("school_settings").insert({ school_id: data.id });
  return data.id as string;
}

export async function makeClassroom(school: string, name: string) {
  const { data, error } = await admin().from("classrooms").insert({ school_id: school, name }).select("id").single();
  if (error || !data) throw new Error("makeClassroom failed: " + error?.message);
  return data.id as string;
}

export async function makeStudent(school: string, classroom: string, first: string, last: string) {
  const { data, error } = await admin().from("students").insert({ school_id: school, classroom_id: classroom, first_name: first, last_name: last }).select("id").single();
  if (error || !data) throw new Error("makeStudent failed: " + error?.message);
  return data.id as string;
}

export async function addMember(school: string, user: string, role: "school_admin" | "gate_staff" | "teacher", classroom?: string) {
  const a = admin();
  const { error } = await a.from("school_members").insert({ school_id: school, user_id: user, role });
  if (error) throw new Error("addMember failed: " + error.message);
  if (role === "teacher" && classroom) {
    const { error: e2 } = await a.from("classroom_teachers").insert({ classroom_id: classroom, school_id: school, user_id: user });
    if (e2) throw new Error("assign teacher failed: " + e2.message);
  }
}

/** รัน SQL ผ่าน Management API (เฉพาะงานเก็บกวาดข้อมูลทดสอบ) */
export async function sql(query: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.SUPABASE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  const res = await fetch("https://api.supabase.com/v1/projects/ileermgqcuuduoglhfbf/database/query", { method: "POST", headers, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error("sql failed: " + (await res.text()).slice(0, 300));
  return res.json() as Promise<Record<string, unknown>[]>;
}

/** กวาดข้อมูลทดสอบทั้งหมดตาม "คำนำหน้า" (zz_test_ / zz-test-) ไม่พึ่งตัวติดตามในหน่วยความจำ
 *  (Playwright เริ่ม worker ใหม่เมื่อเทสต์ล้ม ทำให้ตัวติดตามหาย) — รวมแถว audit ที่เกิดจากข้อมูลทดสอบ
 *  audit_log ปกติแก้/ลบไม่ได้: ปิด trigger เฉพาะงานเก็บกวาดนี้ และลบเฉพาะแถวที่ผูกกับข้อมูลทดสอบ */
export async function cleanup() {
  await sql(`
    create temp table _t_users on commit drop as select id from auth.users where email like 'zz\\_test\\_%@kidguard.test';
    create temp table _t_schools on commit drop as select id from public.schools where slug like 'zz-test-%';
    create temp table _t_invites on commit drop as select id from public.school_invites
      where created_by in (select id from _t_users) or used_by in (select id from _t_users) or school_id in (select id from _t_schools);
    delete from public.school_invites where id in (select id from _t_invites);
    alter table public.audit_log disable trigger audit_log_no_delete;
    delete from public.audit_log where actor_id in (select id from _t_users) or school_id in (select id from _t_schools)
       or entity_id in (select id::text from _t_users) or entity_id in (select id::text from _t_invites) or entity_id in (select id::text from _t_schools)
       or action like 'test.%';
    delete from public.schools where id in (select id from _t_schools);
    delete from auth.users where id in (select id from _t_users);
    delete from public.audit_log where school_id in (select id from _t_schools) or actor_id in (select id from _t_users) or entity_id in (select id::text from _t_users);
    alter table public.audit_log enable trigger audit_log_no_delete;`);
  created.users.length = 0;
  created.schools.length = 0;
}

/** ผู้ปกครองที่มีผู้ปกครอง+รถ+การผูกนักเรียนที่อนุมัติแล้ว (พร้อม check-in) */
export async function makeParent(tag: string, school: string, classroom: string, students: string[]) {
  const u = await makeUser(tag);
  const a = admin();
  await a.from("profiles").update({ display_name: `ผู้ปกครอง ${tag}`, role: "parent", onboarded_at: new Date().toISOString() }).eq("id", u.id);
  const person = (await a.from("guardian_persons").insert({ user_id: u.id, name: `คุณ ${tag}`, phone: "0812345678", is_primary: true }).select("id").single()).data!.id as string;
  const vehicle = (await a.from("vehicles").insert({ user_id: u.id, plate: "กข" + rid().slice(0, 4).replace(/[a-f]/g, "1"), province: "กรุงเทพมหานคร", color: "ขาว", model: "Civic" }).select("id").single()).data!.id as string;
  for (const s of students) {
    const { error } = await a.from("guardian_links").insert({ user_id: u.id, school_id: school, student_id: s, claimed_name: "เด็ก " + tag, claimed_classroom_id: classroom, status: "approved" });
    if (error) throw new Error("link failed: " + error.message);
  }
  return { ...u, person, vehicle };
}

export async function setSchoolLocation(school: string, patch: Record<string, unknown> = {}) {
  await admin().from("schools").update({ lat: 13.7563, lng: 100.5018 }).eq("id", school);
  if (Object.keys(patch).length) await admin().from("school_settings").update(patch).eq("school_id", school);
}

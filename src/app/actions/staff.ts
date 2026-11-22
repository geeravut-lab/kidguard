"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, mapDbError, ok, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { guardSchool, roleOfCtx } from "@/lib/auth/action-guard";
import { parseStudentRows } from "@/lib/csv";
import { notifyClaimDecision } from "@/lib/notify/claims";
import { hashInviteCode, INVITE_TTL_DAYS, makeInviteCode } from "@/lib/invites";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { str, uuidSchema } from "@/lib/validation";

const guard = guardSchool;
const roleOf = roleOfCtx;

// ===== คำขอผูกนักเรียน =====
export async function decideClaimAction(fd: FormData): Promise<void> {
  const c = await guard(["school_admin", "teacher"]);
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const approve = str(fd, "decision") === "approve";
  const student = uuidSchema.safeParse(str(fd, "student"));
  const { data, error } = await c.supabase.rpc("decide_claim", { p_link: id.data, p_approve: approve, p_student: student.success ? student.data : null });
  if (!error) {
    await audit({ by: c.me.user_id, role: roleOf(c), action: "guardian.claim_decide", entity: "guardian_links", entityId: id.data, schoolId: c.school.id, detail: { approved: approve, student_id: (data as { student_id?: string })?.student_id ?? null } });
    await notifyClaimDecision(id.data);
  } else console.error("decide_claim failed", error.code, error.message.slice(0, 80));
  revalidatePath("/", "layout");
}

// ===== ห้องเรียน =====
export async function createClassroomAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guard(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const p = z.object({ name: z.string().trim().min(1).max(30), level: z.string().trim().max(30) }).safeParse({ name: str(fd, "name"), level: str(fd, "level") });
  if (!p.success) return fail("err_invalid_input");
  const { data, error } = await c.supabase.from("classrooms").insert({ school_id: c.school.id, name: p.data.name, level: p.data.level || null }).select("id");
  if (error || data?.length !== 1) return fail(mapDbError(error));
  await audit({ by: c.me.user_id, role: roleOf(c), action: "classroom.create", entity: "classrooms", entityId: data[0]!.id, schoolId: c.school.id });
  revalidatePath("/", "layout");
  return ok();
}

export async function assignTeacherAction(fd: FormData): Promise<void> {
  const c = await guard(["school_admin"]);
  const classroom = uuidSchema.safeParse(str(fd, "classroom"));
  const teacher = uuidSchema.safeParse(str(fd, "teacher"));
  if (!c || !classroom.success || !teacher.success) return;
  // ครูต้องเป็นสมาชิก (บทบาท teacher) ของโรงเรียนนี้
  const { data: staff } = await c.supabase.rpc("school_staff", { p_school: c.school.id });
  if (!(staff as { user_id: string; role: string }[] | null)?.some((s) => s.user_id === teacher.data && s.role === "teacher")) return;
  const { data } = await c.supabase.from("classroom_teachers").insert({ classroom_id: classroom.data, school_id: c.school.id, user_id: teacher.data }).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOf(c), action: "classroom.teacher_assign", entity: "classroom_teachers", entityId: data[0]!.id, schoolId: c.school.id });
  revalidatePath("/", "layout");
}

export async function unassignTeacherAction(fd: FormData): Promise<void> {
  const c = await guard(["school_admin"]);
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const { data } = await c.supabase.from("classroom_teachers").update({ ended_at: new Date().toISOString() }).eq("id", id.data).is("ended_at", null).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOf(c), action: "classroom.teacher_unassign", entity: "classroom_teachers", entityId: id.data, schoolId: c.school.id });
  revalidatePath("/", "layout");
}

// ===== นักเรียน =====
const studentSchema = z.object({
  first: z.string().trim().min(1).max(80),
  last: z.string().trim().max(80),
  nickname: z.string().trim().max(30),
  code: z.string().trim().max(30),
  classroom: z.union([uuidSchema, z.literal("")]),
});

export async function createStudentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guard(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const p = studentSchema.safeParse({ first: str(fd, "first"), last: str(fd, "last"), nickname: str(fd, "nickname"), code: str(fd, "code"), classroom: str(fd, "classroom") });
  if (!p.success) return fail("err_invalid_input");
  const { data, error } = await c.supabase
    .from("students")
    .insert({ school_id: c.school.id, first_name: p.data.first, last_name: p.data.last, nickname: p.data.nickname || null, student_code: p.data.code || null, classroom_id: p.data.classroom || null })
    .select("id");
  if (error || data?.length !== 1) return fail(mapDbError(error));
  await audit({ by: c.me.user_id, role: roleOf(c), action: "student.create", entity: "students", entityId: data[0]!.id, schoolId: c.school.id });
  revalidatePath("/", "layout");
  return ok();
}

export async function updateStudentAction(fd: FormData): Promise<void> {
  const c = await guard(["school_admin"]);
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const patch: Record<string, unknown> = {};
  const classroom = str(fd, "classroom");
  if (fd.has("classroom")) patch.classroom_id = classroom === "" ? null : uuidSchema.safeParse(classroom).success ? classroom : undefined;
  if (str(fd, "status") === "left") patch.status = "left";
  if (str(fd, "status") === "active") patch.status = "active";
  if (Object.values(patch).includes(undefined) || Object.keys(patch).length === 0) return;
  const { data } = await c.supabase.from("students").update(patch).eq("id", id.data).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOf(c), action: "student.update", entity: "students", entityId: id.data, schoolId: c.school.id, detail: { fields: Object.keys(patch) } });
  revalidatePath("/", "layout");
}

export async function importStudentsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guard(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 300_000) return fail("err_invalid_input");
  const { rows, errors } = parseStudentRows(await file.text());
  if (rows.length > 1000) return fail("err_invalid_input");

  const { data: rooms } = await c.supabase.from("classrooms").select("id,name").eq("school_id", c.school.id);
  const roomByName = new Map((rooms ?? []).map((r) => [r.name.trim().toLowerCase(), r.id as string]));
  const { data: existing } = await c.supabase.from("students").select("student_code").eq("school_id", c.school.id).not("student_code", "is", null);
  const seen = new Set((existing ?? []).map((s) => s.student_code as string));

  const good: Record<string, unknown>[] = [];
  const bad: { row: number; reason: string }[] = errors.map((e) => ({ row: e.row, reason: e.reason }));
  for (const { row, data } of rows) {
    const classroom = roomByName.get(data.classroom.toLowerCase());
    if (!classroom) { bad.push({ row, reason: "unknown_classroom" }); continue; }
    if (data.code && seen.has(data.code)) { bad.push({ row, reason: "duplicate_code" }); continue; }
    if (data.code) seen.add(data.code);
    good.push({ school_id: c.school.id, student_code: data.code, first_name: data.first, last_name: data.last, nickname: data.nickname, classroom_id: classroom });
  }
  let inserted = 0;
  for (let i = 0; i < good.length; i += 200) {
    const { data, error } = await c.supabase.from("students").insert(good.slice(i, i + 200)).select("id");
    if (error) return fail(mapDbError(error));
    inserted += data?.length ?? 0;
  }
  await audit({ by: c.me.user_id, role: roleOf(c), action: "student.import", entity: "students", schoolId: c.school.id, detail: { inserted, skipped: bad.length } });
  revalidatePath("/", "layout");
  return ok({ data: { inserted, skipped: bad.length, errors: bad.slice(0, 20) } });
}

// ===== เจ้าหน้าที่และคำเชิญ =====
export async function createInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guard(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const p = z.object({ role: z.enum(["school_admin", "gate_staff", "teacher"]), classroom: z.union([uuidSchema, z.literal("")]) }).safeParse({ role: str(fd, "role"), classroom: str(fd, "classroom") });
  if (!p.success) return fail("err_invalid_input");
  if (p.data.classroom && p.data.role !== "teacher") return fail("err_invalid_input");
  if (p.data.classroom) {
    const { data: room } = await c.supabase.from("classrooms").select("id").eq("id", p.data.classroom).eq("school_id", c.school.id).maybeSingle();
    if (!room) return fail("err_invalid_input");
  }
  const code = makeInviteCode();
  const { data, error } = await supabaseAdmin()
    .from("school_invites")
    .insert({ school_id: c.school.id, role: p.data.role, classroom_id: p.data.classroom || null, code_hash: hashInviteCode(code), expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86400e3).toISOString(), created_by: c.me.user_id })
    .select("id");
  if (error || data?.length !== 1) return fail("err_generic");
  await audit({ by: c.me.user_id, role: roleOf(c), action: "member.invite_create", entity: "school_invites", entityId: data[0]!.id, schoolId: c.school.id, detail: { role: p.data.role } });
  revalidatePath("/", "layout");
  return ok({ data: { code } }); // แสดงครั้งเดียว — ไม่เก็บโค้ดจริงในฐานข้อมูล (เก็บเฉพาะ hash)
}

export async function revokeInviteAction(fd: FormData): Promise<void> {
  const c = await guard(["school_admin"]);
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const { data } = await c.supabase.rpc("revoke_invite", { p_invite: id.data });
  if (data === true) await audit({ by: c.me.user_id, role: roleOf(c), action: "member.invite_revoke", entity: "school_invites", entityId: id.data, schoolId: c.school.id });
  revalidatePath("/", "layout");
}

export async function removeMemberAction(fd: FormData): Promise<void> {
  const c = await guard(["school_admin"]);
  const user = uuidSchema.safeParse(str(fd, "user"));
  const role = z.enum(["school_admin", "gate_staff", "teacher"]).safeParse(str(fd, "role"));
  if (!c || !user.success || !role.success) return;
  const { data, error } = await c.supabase.rpc("remove_member", { p_school: c.school.id, p_user: user.data, p_role: role.data });
  if (!error && data === true) await audit({ by: c.me.user_id, role: roleOf(c), action: "member.remove", entity: "school_members", entityId: user.data, schoolId: c.school.id, detail: { role: role.data } });
  revalidatePath("/", "layout");
}

// ===== ตั้งค่าโรงเรียน =====
const num = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const settingsSchema = z
  .object({
    name_th: z.string().trim().min(1).max(120),
    name_en: z.string().trim().max(120),
    short_name: z.string().trim().max(20),
    lat: z.string().trim(),
    lng: z.string().trim(),
    checkin_radius_m: num(100, 50000),
    arrive_radius_m: num(20, 2000),
    student_alert_min: num(0, 120),
    checkin_ttl_min: num(10, 480),
    stale_location_sec: num(20, 600),
    late_pickup_min: num(5, 240),
    checkin_start: z.string().trim(),
    checkin_end: z.string().trim(),
  })
  .refine((v) => v.arrive_radius_m < v.checkin_radius_m)
  .refine((v) => (v.checkin_start === "") === (v.checkin_end === ""))
  .refine((v) => (v.lat === "") === (v.lng === ""));

export async function updateSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guard(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const raw = Object.fromEntries(["name_th", "name_en", "short_name", "lat", "lng", "checkin_radius_m", "arrive_radius_m", "student_alert_min", "checkin_ttl_min", "stale_location_sec", "late_pickup_min", "checkin_start", "checkin_end"].map((k) => [k, str(fd, k)]));
  const p = settingsSchema.safeParse(raw);
  if (!p.success) return fail("err_invalid_input");
  const lat = p.data.lat === "" ? null : Number(p.data.lat);
  const lng = p.data.lng === "" ? null : Number(p.data.lng);
  if ((lat !== null && !(lat >= -90 && lat <= 90)) || (lng !== null && !(lng >= -180 && lng <= 180)) || Number.isNaN(lat) || Number.isNaN(lng)) return fail("err_invalid_input");
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (p.data.checkin_start && (!time.test(p.data.checkin_start) || !time.test(p.data.checkin_end))) return fail("err_invalid_input");

  const s1 = await c.supabase.from("schools").update({ name_th: p.data.name_th, name_en: p.data.name_en || null, short_name: p.data.short_name || null, lat, lng }).eq("id", c.school.id).select("id");
  if (s1.error || s1.data?.length !== 1) return fail(mapDbError(s1.error));
  const s2 = await c.supabase
    .from("school_settings")
    .update({
      checkin_radius_m: p.data.checkin_radius_m, arrive_radius_m: p.data.arrive_radius_m, student_alert_min: p.data.student_alert_min,
      student_dashboard_enabled: str(fd, "student_dashboard_enabled") === "on", checkin_ttl_min: p.data.checkin_ttl_min,
      stale_location_sec: p.data.stale_location_sec, late_pickup_min: p.data.late_pickup_min,
      checkin_start: p.data.checkin_start || null, checkin_end: p.data.checkin_end || null,
    })
    .eq("school_id", c.school.id)
    .select("school_id");
  if (s2.error || s2.data?.length !== 1) return fail(mapDbError(s2.error));
  await audit({ by: c.me.user_id, role: roleOf(c), action: "school.settings", entity: "school_settings", entityId: c.school.id, schoolId: c.school.id, detail: { checkin_radius_m: p.data.checkin_radius_m, arrive_radius_m: p.data.arrive_radius_m, student_alert_min: p.data.student_alert_min } });
  revalidatePath("/", "layout");
  return ok({ message: "settings_saved" });
}

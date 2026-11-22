"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { guardSchool, roleOfCtx } from "@/lib/auth/action-guard";
import { getAuthInfo } from "@/lib/auth/me";
import { featureOff } from "@/lib/flags/server";
import { createPass, hashToken, makeTvToken, resumePickups, revokePass, sendBroadcast, setPlan, checkOrRedeemPass } from "@/lib/safety/server";
import { isPlanMode } from "@/lib/safety/pure";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { str, uuidSchema } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");
const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://kidguards.vercel.app").replace(/\/+$/, "");

// ===== ผู้ปกครอง: รหัสผู้รับแทน =====
const passSchema = z.object({
  school: uuidSchema,
  holder: z.string().trim().min(1).max(80),
  plate: z.string().trim().max(20),
  valid: z.enum(["today", "days"]),
  days: z.coerce.number().int().min(1).max(7).catch(1),
});

export async function createPassAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const info = await getAuthInfo();
  if (!info) return fail("err_forbidden");
  const off = await featureOff("pickup_passes");
  if (off) return fail(off);
  const p = passSchema.safeParse({ school: str(fd, "school"), holder: str(fd, "holder"), plate: str(fd, "plate"), valid: str(fd, "valid") || "today", days: str(fd, "days") });
  const students = fd.getAll("student").map(String).filter((s) => uuidSchema.safeParse(s).success);
  if (!p.success || !students.length) return fail("err_invalid_input");
  const r = await createPass(info.id, { schoolId: p.data.school, studentIds: students, holderName: p.data.holder, plate: p.data.plate || null, mode: p.data.valid, days: p.data.days });
  if (!r.ok) return fail(r.error);
  refresh();
  return ok({ data: { code: r.code, expiresAt: r.expiresAt } });
}

export async function revokePassAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!info || !id.success) return;
  await revokePass(info.id, id.data);
  refresh();
}

// ===== ผู้ปกครอง: แจ้งล่วงหน้า =====
export async function setPlanAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const info = await getAuthInfo();
  if (!info) return fail("err_forbidden");
  const off = await featureOff("advance_notice");
  if (off) return fail(off);
  const school = uuidSchema.safeParse(str(fd, "school"));
  const mode = str(fd, "mode");
  const students = fd.getAll("student").map(String).filter((s) => uuidSchema.safeParse(s).success);
  if (!school.success || !students.length || !(mode === "clear" || isPlanMode(mode))) return fail("err_invalid_input");
  const r = await setPlan(info.id, { schoolId: school.data, studentIds: students, date: str(fd, "date"), mode });
  if (!r.ok) return fail(r.error);
  refresh();
  return ok({ message: "plans_saved" });
}

// ===== ประตู: ตรวจ/ใช้รหัสผู้รับแทน =====
export async function checkPassAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["gate_staff", "school_admin"]);
  if (!c) return fail("err_forbidden");
  const off = await featureOff("pickup_passes");
  if (off) return fail(off);
  const r = await checkOrRedeemPass(c.me.user_id, c.school.id, str(fd, "code"), str(fd, "confirm") === "yes");
  if (!r.ok) return fail(r.error);
  if (str(fd, "confirm") === "yes") refresh();
  return ok({ data: { pass: r.pass, consumed: str(fd, "confirm") === "yes" } });
}

// ===== ประตู/โซน =====
export async function createZoneAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const off = await featureOff("zones");
  if (off) return fail(off);
  const name = z.string().trim().min(1).max(30).safeParse(str(fd, "name"));
  if (!name.success) return fail("err_invalid_input");
  const { data, error } = await supabaseAdmin().from("zones").insert({ school_id: c.school.id, name: name.data }).select("id");
  if (error || data?.length !== 1) return fail(error?.code === "23505" ? "err_duplicate" : "err_generic");
  await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "zone.create", entity: "zones", entityId: data[0]!.id, schoolId: c.school.id });
  refresh();
  return ok();
}

export async function toggleZoneAction(fd: FormData): Promise<void> {
  const c = await guardSchool(["school_admin"]);
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success || (await featureOff("zones"))) return;
  const active = str(fd, "active") === "true";
  const { data } = await supabaseAdmin().from("zones").update({ active }).eq("id", id.data).eq("school_id", c.school.id).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "zone.active", entity: "zones", entityId: id.data, schoolId: c.school.id, detail: { active } });
  refresh();
}

export async function assignClassroomZoneAction(fd: FormData): Promise<void> {
  const c = await guardSchool(["school_admin"]);
  const room = uuidSchema.safeParse(str(fd, "classroom"));
  if (!c || !room.success || (await featureOff("zones"))) return;
  const zone = uuidSchema.safeParse(str(fd, "zone"));
  const a = supabaseAdmin();
  if (zone.success) {
    const { data: z1 } = await a.from("zones").select("id").eq("id", zone.data).eq("school_id", c.school.id).maybeSingle();
    if (!z1) return;
  }
  const { data } = await a.from("classrooms").update({ zone_id: zone.success ? zone.data : null }).eq("id", room.data).eq("school_id", c.school.id).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "zone.assign", entity: "classrooms", entityId: room.data, schoolId: c.school.id });
  refresh();
}

/** เจ้าหน้าที่ย้ายคิวไปอีกประตู */
export async function setSessionZoneAction(fd: FormData): Promise<void> {
  const c = await guardSchool(["gate_staff", "school_admin"]);
  const id = uuidSchema.safeParse(str(fd, "session"));
  if (!c || !id.success || (await featureOff("zones"))) return;
  const zone = uuidSchema.safeParse(str(fd, "zone"));
  const a = supabaseAdmin();
  if (zone.success) {
    const { data: z1 } = await a.from("zones").select("id").eq("id", zone.data).eq("school_id", c.school.id).eq("active", true).maybeSingle();
    if (!z1) return;
  }
  const { data } = await a.from("pickup_sessions").update({ zone_id: zone.success ? zone.data : null }).eq("id", id.data).eq("school_id", c.school.id).in("status", ["on_the_way", "arrived"]).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "zone.move", entity: "pickup_sessions", entityId: id.data, schoolId: c.school.id });
  refresh();
}

// ===== ธงห้ามปล่อย (เฉพาะผู้ดูแลโรงเรียน) =====
const flagSchema = z.object({ student: uuidSchema, kind: z.enum(["hold_all", "block_guardian"]), note: z.string().trim().max(300) });

export async function addCustodyFlagAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const off = await featureOff("custody_flags");
  if (off) return fail(off);
  const p = flagSchema.safeParse({ student: str(fd, "student"), kind: str(fd, "kind"), note: str(fd, "note") });
  if (!p.success) return fail("err_invalid_input");
  const a = supabaseAdmin();
  const { data: st } = await a.from("students").select("id").eq("id", p.data.student).eq("school_id", c.school.id).maybeSingle();
  if (!st) return fail("err_forbidden");
  let userId: string | null = null;
  if (p.data.kind === "block_guardian") {
    const g = uuidSchema.safeParse(str(fd, "guardian"));
    if (!g.success) return fail("err_invalid_input");
    const { data: link } = await a.from("guardian_links").select("id").eq("user_id", g.data).eq("student_id", p.data.student).eq("school_id", c.school.id).in("status", ["approved", "pending"]).limit(1);
    if (!link?.length) return fail("err_invalid_input");
    userId = g.data;
  }
  const { data, error } = await a.from("custody_flags").insert({ school_id: c.school.id, student_id: p.data.student, kind: p.data.kind, user_id: userId, note: p.data.note || null, created_by: c.me.user_id }).select("id");
  if (error || data?.length !== 1) return fail("err_generic");
  await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "custody.add", entity: "custody_flags", entityId: data[0]!.id, schoolId: c.school.id, detail: { kind: p.data.kind } });
  refresh();
  return ok({ message: "custody_added" });
}

export async function endCustodyFlagAction(fd: FormData): Promise<void> {
  const c = await guardSchool(["school_admin"]);
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success || (await featureOff("custody_flags"))) return;
  const { data } = await supabaseAdmin().from("custody_flags").update({ active: false, ended_by: c.me.user_id, ended_at: new Date().toISOString() }).eq("id", id.data).eq("school_id", c.school.id).eq("active", true).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "custody.end", entity: "custody_flags", entityId: id.data, schoolId: c.school.id });
  refresh();
}

// ===== จอ TV =====
export async function createTvAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const off = await featureOff("tv_mode");
  if (off) return fail(off);
  const name = z.string().trim().min(1).max(40).safeParse(str(fd, "name"));
  if (!name.success) return fail("err_invalid_input");
  const a = supabaseAdmin();
  const zone = uuidSchema.safeParse(str(fd, "zone"));
  if (zone.success) {
    const { data: z1 } = await a.from("zones").select("id").eq("id", zone.data).eq("school_id", c.school.id).maybeSingle();
    if (!z1) return fail("err_invalid_input");
  }
  const token = makeTvToken();
  const { data, error } = await a.from("tv_displays").insert({ school_id: c.school.id, name: name.data, zone_id: zone.success ? zone.data : null, token_hash: hashToken(token), created_by: c.me.user_id }).select("id");
  if (error || data?.length !== 1) return fail("err_generic");
  await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "tv.create", entity: "tv_displays", entityId: data[0]!.id, schoolId: c.school.id });
  refresh();
  return ok({ data: { url: `${site()}/tv/${token}` } });
}

export async function revokeTvAction(fd: FormData): Promise<void> {
  const c = await guardSchool(["school_admin"]);
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const { data } = await supabaseAdmin().from("tv_displays").delete().eq("id", id.data).eq("school_id", c.school.id).select("id");
  if (data?.length === 1) await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "tv.revoke", entity: "tv_displays", entityId: id.data, schoolId: c.school.id });
  refresh();
}

// ===== ประกาศฉุกเฉิน / พักการรับ (ผู้ดูแลโรงเรียนและเจ้าหน้าที่ประตู) =====
const bcSchema = z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(400), severity: z.enum(["info", "warning", "danger"]) });

export async function sendBroadcastAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["school_admin", "gate_staff"]);
  if (!c) return fail("err_forbidden");
  const off = await featureOff("broadcast");
  if (off) return fail(off);
  const p = bcSchema.safeParse({ title: str(fd, "title"), body: str(fd, "body"), severity: str(fd, "severity") || "warning" });
  if (!p.success) return fail("err_invalid_input");
  const r = await sendBroadcast({ userId: c.me.user_id, role: roleOfCtx(c) ?? "school_admin", schoolId: c.school.id, ...p.data, pause: str(fd, "pause") === "on" });
  if (!r.ok) return fail(r.error);
  refresh();
  return ok({ message: "announce_sent", data: { recipients: r.recipients } });
}

export async function resumePickupsAction(): Promise<void> {
  const c = await guardSchool(["school_admin", "gate_staff"]);
  if (!c || (await featureOff("broadcast"))) return;
  await resumePickups(c.me.user_id, roleOfCtx(c) ?? "school_admin", c.school.id);
  refresh();
}

// ===== ตั้งค่า: เวลาเลิกเรียน/เสียงเรียก/จอ TV =====
export async function saveSafetySettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const time = str(fd, "dismissal_time");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail("err_invalid_input");
  const { data, error } = await supabaseAdmin().from("school_settings")
    .update({ dismissal_time: time || null, voice_enabled: str(fd, "voice_enabled") === "on", tv_show_arriving: str(fd, "tv_show_arriving") === "on" })
    .eq("school_id", c.school.id).select("school_id");
  if (error || data?.length !== 1) return fail("err_save_failed");
  await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "school.settings", entity: "school_settings", entityId: c.school.id, schoolId: c.school.id, detail: { safety: true } });
  refresh();
  return ok({ message: "settings_saved" });
}

import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { cache } from "react";
import { trackEvent } from "@/lib/analytics/server";
import { audit } from "@/lib/audit/server";
import { hmacCode } from "@/lib/crypto";
import { featureEnabled } from "@/lib/flags/server";
import { fmt } from "@/lib/i18n/dict";
import { pushNoticeToUser } from "@/lib/line/service";
import { dictFor, notifyUser } from "@/lib/notify";
import { ruleNumber } from "@/lib/rules/rules";
import type { TickCtx } from "@/lib/rules/tick";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lateBucket, makePassCode, normalizePassCode, PASS_MAX_ACTIVE, passExpiry, planDateOk, type PlanMode } from "./pure";

const bkkTime = (lang: string) => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date());

// ===== ตั้งค่าความปลอดภัยของโรงเรียน (ทนช่วงที่คอลัมน์ยังไม่มี) =====
export type SafetyCfg = { dismissal_time: string | null; pickup_paused: boolean; pickup_pause_note: string | null; voice_enabled: boolean; tv_show_arriving: boolean };
export const DEFAULT_SAFETY: SafetyCfg = { dismissal_time: null, pickup_paused: false, pickup_pause_note: null, voice_enabled: false, tv_show_arriving: false };

export async function loadSafetyCfg(schoolId: string): Promise<SafetyCfg> {
  const { data, error } = await supabaseAdmin().from("school_settings").select("dismissal_time,pickup_paused,pickup_pause_note,voice_enabled,tv_show_arriving").eq("school_id", schoolId).maybeSingle();
  if (error || !data) return DEFAULT_SAFETY;
  return { ...DEFAULT_SAFETY, ...data };
}

export type SchoolNotice = { paused: boolean; pauseNote: string | null; broadcast: { id: string; title: string; body: string; severity: "info" | "warning" | "danger"; created_at: string } | null };
/** แบนเนอร์ฉุกเฉินของโรงเรียน (พักการรับ + ประกาศล่าสุดที่ยังไม่หมดอายุ) — อ่านไม่ได้ = ไม่แสดง (ไม่ทำให้หน้าพัง) */
export const getSchoolNotice = cache(async (schoolId: string | null | undefined): Promise<SchoolNotice | null> => {
  if (!schoolId || !(await featureEnabled("broadcast"))) return null;
  try {
    const a = supabaseAdmin();
    const [cfg, b] = await Promise.all([
      loadSafetyCfg(schoolId),
      a.from("broadcasts").select("id,title,body,severity,created_at").eq("school_id", schoolId).is("ended_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1),
    ]);
    const broadcast = (b.data?.[0] as SchoolNotice["broadcast"]) ?? null;
    return cfg.pickup_paused || broadcast ? { paused: cfg.pickup_paused, pauseNote: cfg.pickup_pause_note, broadcast } : null;
  } catch {
    return null;
  }
});

// ===== รหัส/QR ผู้รับแทน =====
export type PassError = "err_invalid_input" | "err_rate_limited" | "err_pass_limit" | "err_student_held" | "err_forbidden" | "err_generic" | "err_pass_invalid" | "err_pass_used" | "err_pass_expired" | "err_paused" | "err_student_busy" | "err_held";

export async function createPass(userId: string, i: { schoolId: string; studentIds: string[]; holderName: string; plate?: string | null; mode: "today" | "days"; days?: number }): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: PassError }> {
  const a = supabaseAdmin();
  const rl = await a.rpc("rl_hit", { p_key: `pass:create:${userId}`, p_limit: 10, p_window_s: 3600 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };
  const ids = [...new Set(i.studentIds)];
  if (!ids.length || ids.length > 6) return { ok: false, error: "err_invalid_input" };
  const { data: links } = await a.from("guardian_links").select("student_id").eq("user_id", userId).eq("school_id", i.schoolId).eq("status", "approved").in("student_id", ids);
  if ((links ?? []).length !== ids.length) return { ok: false, error: "err_forbidden" };
  const { count } = await a.from("pickup_passes").select("id", { count: "exact", head: true }).eq("created_by", userId).eq("status", "active").gt("expires_at", new Date().toISOString());
  if ((count ?? 0) >= PASS_MAX_ACTIVE) return { ok: false, error: "err_pass_limit" };
  for (const s of ids) {
    const h = await a.rpc("student_held", { p_student: s, p_parent: userId });
    if (h.data === true) return { ok: false, error: "err_student_held" };
  }
  const code = makePassCode();
  const expires = passExpiry(new Date(), i.mode, i.days);
  const ins = await a.from("pickup_passes").insert({ school_id: i.schoolId, created_by: userId, holder_name: i.holderName, plate: i.plate || null, code_hash: hmacCode(i.schoolId, code), expires_at: expires.toISOString() }).select("id");
  if (ins.error || ins.data?.length !== 1) return { ok: false, error: "err_generic" };
  const id = ins.data[0]!.id;
  const st = await a.from("pickup_pass_students").insert(ids.map((s) => ({ pass_id: id, student_id: s }))).select("student_id");
  if (st.error || st.data?.length !== ids.length) {
    await a.from("pickup_passes").delete().eq("id", id);
    return { ok: false, error: "err_generic" };
  }
  await audit({ by: userId, role: "parent", action: "pass.create", entity: "pickup_passes", entityId: id, schoolId: i.schoolId, detail: { students: ids.length, mode: i.mode } });
  await trackEvent("pass_created", userId, { schoolId: i.schoolId });
  return { ok: true, code, expiresAt: expires.toISOString() };
}

export async function revokePass(userId: string, passId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("pickup_passes").update({ status: "revoked" }).eq("id", passId).eq("created_by", userId).eq("status", "active").select("id,school_id");
  if (data?.length === 1) await audit({ by: userId, role: "parent", action: "pass.revoke", entity: "pickup_passes", entityId: passId, schoolId: data[0]!.school_id });
  return data?.length === 1;
}

export type PassInfo = { pass_id: string; created_by: string; holder_name: string; plate: string | null; expires_at: string; students: { id: string; nickname: string; classroom: string | null; classroom_id: string | null; held: boolean }[]; held: number; busy: number; paused: boolean };

function passError(message: string | undefined): PassError {
  const m = message ?? "";
  if (m.includes("invalid_pass")) return "err_pass_invalid";
  if (m.includes("pass_used")) return "err_pass_used";
  if (m.includes("pass_expired")) return "err_pass_expired";
  if (m.includes("student_busy")) return "err_student_busy";
  if (m.includes("paused")) return "err_paused";
  if (m.includes("held")) return "err_held";
  if (m.includes("forbidden")) return "err_forbidden";
  return "err_generic";
}

/** ที่ประตู: ตรวจรหัส (consume=false) หรือยืนยันรับ (consume=true; ใช้ได้ครั้งเดียว ตรวจธง/พักการรับ/คิวซ้อนใน SQL) */
export async function checkOrRedeemPass(actorId: string, schoolId: string, raw: string, consume: boolean): Promise<{ ok: true; pass: PassInfo } | { ok: false; error: PassError }> {
  const code = normalizePassCode(raw);
  if (!code) return { ok: false, error: "err_pass_invalid" };
  const a = supabaseAdmin();
  const rl = await a.rpc("rl_hit", { p_key: `pass:use:${actorId}`, p_limit: 40, p_window_s: 600 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };
  const { data, error } = await a.rpc("pass_use", { p_actor: actorId, p_school: schoolId, p_hash: hmacCode(schoolId, code), p_consume: consume });
  if (error) return { ok: false, error: passError(error.message) };
  const pass = data as PassInfo;
  if (consume) {
    await audit({ by: actorId, action: "pass.use", entity: "pickup_passes", entityId: pass.pass_id, schoolId, detail: { students: pass.students.length } });
    await trackEvent("pass_used", pass.created_by, { schoolId });
    await notifyPassUsed(schoolId, pass);
  }
  return { ok: true, pass };
}

async function notifyPassUsed(schoolId: string, pass: PassInfo) {
  try {
    const names = pass.students.map((s) => `${s.nickname}${s.classroom ? ` ${s.classroom}` : ""}`).join(", ");
    const a = supabaseAdmin();
    const rooms = [...new Set(pass.students.map((s) => s.classroom_id).filter((x): x is string => !!x))];
    const { data: teachers } = rooms.length ? await a.from("classroom_teachers").select("user_id").in("classroom_id", rooms).is("ended_at", null) : { data: [] as { user_id: string }[] };
    const targets = new Map<string, "parent" | "teacher">([[pass.created_by, "parent"]]);
    for (const t of teachers ?? []) if (!targets.has(t.user_id)) targets.set(t.user_id, "teacher");
    await Promise.allSettled([...targets].map(async ([uid, kind]) => {
      const { t, lang } = await dictFor(uid);
      return notifyUser({
        userId: uid, schoolId, kind: "success", title: kind === "parent" ? t.notif_pass_parent_title : t.notif_pass_staff_title,
        body: fmt(kind === "parent" ? t.notif_pass_parent_body : t.notif_pass_staff_body, { names, holder: pass.holder_name }),
        fields: [{ label: t.notif_f_time, value: bkkTime(lang) }], link: kind === "parent" ? "/passes" : "/teacher", dedupeKey: `pass:${pass.pass_id}:${kind}`,
      });
    }));
  } catch (e) {
    console.error("notifyPassUsed failed:", e instanceof Error ? e.name : "unknown");
  }
}

// ===== แจ้งล่วงหน้า =====
export async function setPlan(userId: string, i: { schoolId: string; studentIds: string[]; date: string; mode: PlanMode | "clear" }): Promise<{ ok: true; count: number } | { ok: false; error: "err_invalid_input" | "err_forbidden" | "err_generic" }> {
  if (!planDateOk(i.date, new Date())) return { ok: false, error: "err_invalid_input" };
  const ids = [...new Set(i.studentIds)];
  if (!ids.length || ids.length > 10) return { ok: false, error: "err_invalid_input" };
  const a = supabaseAdmin();
  const { data: links } = await a.from("guardian_links").select("student_id").eq("user_id", userId).eq("school_id", i.schoolId).eq("status", "approved").in("student_id", ids);
  if ((links ?? []).length !== ids.length) return { ok: false, error: "err_forbidden" };
  if (i.mode === "clear") {
    await a.from("dismissal_plans").delete().eq("school_id", i.schoolId).eq("plan_date", i.date).in("student_id", ids);
    return { ok: true, count: ids.length };
  }
  const { data, error } = await a.from("dismissal_plans").upsert(ids.map((s) => ({ school_id: i.schoolId, student_id: s, plan_date: i.date, mode: i.mode, created_by: userId })), { onConflict: "student_id,plan_date" }).select("id");
  if (error || data?.length !== ids.length) return { ok: false, error: "err_generic" };
  await audit({ by: userId, role: "parent", action: "plan.set", entity: "dismissal_plans", schoolId: i.schoolId, detail: { students: ids.length, mode: i.mode, date: i.date } });
  await trackEvent("plan_set", userId, { schoolId: i.schoolId });
  return { ok: true, count: ids.length };
}

// ===== จอ TV =====
export { hashToken } from "./pure-hash";
export const makeTvToken = () => randomBytes(18).toString("base64url");

// ===== ประกาศฉุกเฉิน / พักการรับ =====
const toneOf = { info: "info", warning: "warning", danger: "danger" } as const;

export async function sendBroadcast(i: { userId: string; role: string; schoolId: string; title: string; body: string; severity: "info" | "warning" | "danger"; pause: boolean }): Promise<{ ok: true; recipients: number } | { ok: false; error: "err_rate_limited" | "err_generic" }> {
  const a = supabaseAdmin();
  const rl = await a.rpc("rl_hit", { p_key: `bc:${i.schoolId}`, p_limit: 5, p_window_s: 3600 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };
  const ins = await a.from("broadcasts").insert({ school_id: i.schoolId, created_by: i.userId, title: i.title, body: i.body, severity: i.severity, pause_pickups: i.pause }).select("id");
  if (ins.error || ins.data?.length !== 1) return { ok: false, error: "err_generic" };
  const id = ins.data[0]!.id;
  if (i.pause) await a.from("school_settings").update({ pickup_paused: true, pickup_pause_note: i.title.slice(0, 200) }).eq("school_id", i.schoolId);

  // ผู้รับ: ผู้ปกครองที่อนุมัติแล้ว + เจ้าหน้าที่ของโรงเรียน
  const [g, m] = await Promise.all([
    a.from("guardian_links").select("user_id").eq("school_id", i.schoolId).eq("status", "approved"),
    a.from("school_members").select("user_id").eq("school_id", i.schoolId),
  ]);
  const users = [...new Set([...(g.data ?? []), ...(m.data ?? [])].map((r) => r.user_id))];
  const rows = users.map((uid) => ({ user_id: uid, school_id: i.schoolId, kind: toneOf[i.severity], title: i.title.slice(0, 120), body: i.body.slice(0, 400), fields: [], link: "/home", dedupe_key: `broadcast:${id}` }));
  for (let n = 0; n < rows.length; n += 400) await a.from("app_notifications").insert(rows.slice(n, n + 400));
  await a.from("broadcasts").update({ recipients: users.length }).eq("id", id);
  await audit({ by: i.userId, role: i.role, action: "broadcast.send", entity: "broadcasts", entityId: id, schoolId: i.schoolId, detail: { severity: i.severity, pause: i.pause, recipients: users.length } });
  await trackEvent("broadcast_sent", i.userId, { schoolId: i.schoolId });

  // LINE: ส่งหลังตอบผู้ใช้ (เฉพาะคนที่ผูกไว้) ทีละ 10 — โควตา/การหยุดช่องทางจัดการใน pushNoticeToUser
  const sendLine = async () => {
    try {
      const { data: ch } = await a.from("notification_channels").select("user_id").eq("school_id", i.schoolId).eq("channel", "line").eq("status", "active");
      const targets = [...new Set((ch ?? []).map((c) => c.user_id))].filter((u) => users.includes(u));
      const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://kidguards.vercel.app").replace(/\/+$/, "");
      for (let n = 0; n < targets.length; n += 10) {
        await Promise.allSettled(targets.slice(n, n + 10).map(async (uid) => {
          const { t } = await dictFor(uid);
          return pushNoticeToUser(uid, i.schoolId, { kind: toneOf[i.severity], title: i.title, summary: i.body, link: "/home" }, { appUrl: site, defaultCta: t.notif_open, retryKey: crypto.randomUUID() });
        }));
      }
    } catch (e) {
      console.error("broadcast line failed:", e instanceof Error ? e.name : "unknown");
    }
  };
  try {
    after(sendLine);
  } catch {
    await sendLine(); // นอก request (เช่นเทสต์/สคริปต์): ทำทันที
  }
  return { ok: true, recipients: users.length };
}

/** เปิดรับอีกครั้ง + ปิดประกาศที่ค้างอยู่ */
export async function resumePickups(userId: string, role: string, schoolId: string): Promise<boolean> {
  const a = supabaseAdmin();
  const { data } = await a.from("school_settings").update({ pickup_paused: false, pickup_pause_note: null }).eq("school_id", schoolId).select("school_id");
  await a.from("broadcasts").update({ ended_at: new Date().toISOString() }).eq("school_id", schoolId).is("ended_at", null);
  if (data?.length === 1) await audit({ by: userId, role, action: "broadcast.resume", entity: "school_settings", entityId: schoolId, schoolId });
  return data?.length === 1;
}

// ===== กฎ: เตือนรับช้า (ทุก tick; กันซ้ำด้วย dedupe key ต่อคน/วัน/ช่วง) =====
type Candidate = { school_id: string; student_id: string; nickname: string; classroom_id: string | null; classroom: string | null; date: string; late_min: number };

export async function lateStep(ctx: TickCtx): Promise<number> {
  if (!(await featureEnabled("late_alerts"))) return 0;
  const a = supabaseAdmin();
  const { data, error } = await a.rpc("late_pickup_candidates", { p_now: ctx.now.toISOString() });
  if (error) throw error;
  const cands = (data ?? []) as Candidate[];
  if (!cands.length) return 0;
  const repeat = ruleNumber(ctx.rules, "late_pickup", "repeat_min");
  const bySchool = new Map<string, Candidate[]>();
  for (const c of cands) bySchool.set(c.school_id, [...(bySchool.get(c.school_id) ?? []), c]);

  let sent = 0;
  for (const [schoolId, list] of bySchool) {
    if (ctx.overBudget()) break;
    const bucket = lateBucket(Math.min(...list.map((c) => c.late_min)), repeat);
    const { data: links } = await a.from("guardian_links").select("user_id,student_id").eq("school_id", schoolId).eq("status", "approved").in("student_id", list.map((c) => c.student_id));
    const byUser = new Map<string, Candidate[]>();
    for (const l of links ?? []) {
      const c = list.find((x) => x.student_id === l.student_id);
      if (c) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), c]);
    }
    for (const [uid, kids] of byUser) {
      const { t } = await dictFor(uid);
      const names = kids.map((k) => `${k.nickname}${k.classroom ? ` ${k.classroom}` : ""}`).join(", ");
      const r = await notifyUser({
        userId: uid, schoolId, kind: "warning", title: t.notif_late_parent_title, body: fmt(t.notif_late_parent_body, { names, min: Math.max(...kids.map((k) => k.late_min)) }),
        link: "/pickup", dedupeKey: `late:${kids.map((k) => k.student_id).sort().join(",").slice(0, 100)}:${list[0]!.date}:${bucket}`,
      });
      if (r.inApp) sent++;
    }
    // สรุปให้เจ้าหน้าที่ประตู/แอดมินครั้งเดียวต่อช่วง
    const { data: staff } = await a.from("school_members").select("user_id").eq("school_id", schoolId).in("role", ["gate_staff", "school_admin"]);
    const sample = list.slice(0, 5).map((c) => `${c.nickname}${c.classroom ? ` ${c.classroom}` : ""}`).join(", ");
    for (const uid of new Set((staff ?? []).map((s) => s.user_id))) {
      const { t } = await dictFor(uid);
      await notifyUser({
        userId: uid, schoolId, kind: "warning", title: t.notif_late_staff_title, body: fmt(t.notif_late_staff_body, { n: list.length, names: sample }),
        link: "/gate", dedupeKey: `late-digest:${schoolId}:${list[0]!.date}:${bucket}`,
      });
    }
  }
  return sent;
}

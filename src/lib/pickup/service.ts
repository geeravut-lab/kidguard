import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit/server";
import { isLat, isLng, haversineM } from "@/lib/eta/geo";
import { resolveEta, type EtaResult, type RouteMemo } from "@/lib/eta/resolve";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitPickupEvent } from "./events";

export const MAX_ACCURACY_M = 300;

export type PickupError =
  | "err_invalid_input" | "err_rate_limited" | "err_school_not_ready" | "err_gps_inaccurate" | "err_too_far" | "err_outside_window"
  | "err_student_busy" | "err_already_active" | "err_pickup_not_active" | "err_no_children" | "err_forbidden" | "err_generic";
export type PickupFail = { ok: false; error: PickupError; data?: Record<string, number | string | null> };

function mapRpcError(message: string | undefined): PickupError {
  const m = message ?? "";
  if (m.includes("school_not_ready")) return "err_school_not_ready";
  if (m.includes("too_far")) return "err_too_far";
  if (m.includes("outside_window")) return "err_outside_window";
  if (m.includes("student_busy")) return "err_student_busy";
  if (m.includes("already_active")) return "err_already_active";
  if (m.includes("not_active")) return "err_pickup_not_active";
  if (m.includes("student_not_linked") || m.includes("no_students") || m.includes("invalid_person") || m.includes("invalid_vehicle")) return "err_invalid_input";
  if (m.includes("forbidden")) return "err_forbidden";
  return "err_generic";
}

/** เพดานการเรียก API ภายนอกต่อวัน (คุมต้นทุน) — เกินแล้วใช้ค่าประมาณแทน */
async function allowExternalCall(): Promise<boolean> {
  const cap = Number(process.env.ETA_DAILY_CAP ?? 20000);
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin().rpc("rl_hit", { p_key: `eta:google:${day}`, p_limit: cap, p_window_s: 86400 });
  return data !== false;
}
const etaDeps = () => ({ apiKey: process.env.GOOGLE_ROUTES_API_KEY || undefined, allowExternal: allowExternalCall });

const posSchema = z.object({ lat: z.number().refine(isLat), lng: z.number().refine(isLng), accuracy: z.number().min(0).max(100000) });
const startSchema = posSchema.extend({
  school_id: z.string().uuid(), person_id: z.string().uuid(), vehicle_id: z.string().uuid(), student_ids: z.array(z.string().uuid()).min(1).max(6),
});
const updateSchema = posSchema.extend({ session_id: z.string().uuid() });

type SchoolRow = { id: string; lat: number | null; lng: number | null; checkin_radius_m: number; checkin_start: string | null; checkin_end: string | null };
async function loadSchool(id: string): Promise<SchoolRow | null> {
  const a = supabaseAdmin();
  const [s, c] = await Promise.all([
    a.from("schools").select("id,lat,lng").eq("id", id).eq("active", true).maybeSingle(),
    a.from("school_settings").select("checkin_radius_m,checkin_start,checkin_end").eq("school_id", id).maybeSingle(),
  ]);
  if (!s.data || !c.data) return null;
  return { ...s.data, ...c.data } as SchoolRow;
}

export type PickupLive = { session_id: string; status: string; distance_m: number; eta_s: number; eta_source: string; polyline: string | null };

/** เริ่ม check-in: server คำนวณระยะเอง (ไม่เชื่อตัวเลขจาก client) และไม่เก็บพิกัด */
export async function startPickup(userId: string, input: unknown): Promise<({ ok: true } & PickupLive) | PickupFail> {
  const p = startSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "err_invalid_input" };
  const admin = supabaseAdmin();
  const rl = await admin.rpc("rl_hit", { p_key: `ps:${userId}`, p_limit: 12, p_window_s: 600 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };

  const school = await loadSchool(p.data.school_id);
  if (!school || school.lat == null || school.lng == null) return { ok: false, error: "err_school_not_ready" };
  if (p.data.accuracy > MAX_ACCURACY_M) return { ok: false, error: "err_gps_inaccurate", data: { accuracy_m: Math.round(p.data.accuracy), max_m: MAX_ACCURACY_M } };

  const straight = haversineM(p.data, { lat: school.lat, lng: school.lng });
  if (straight > school.checkin_radius_m) return { ok: false, error: "err_too_far", data: { distance_m: straight, radius_m: school.checkin_radius_m } };

  const eta: EtaResult = await resolveEta(p.data, { lat: school.lat, lng: school.lng }, null, etaDeps());
  const { data, error } = await admin.rpc("pickup_start", {
    p_user: userId, p_school: school.id, p_person: p.data.person_id, p_vehicle: p.data.vehicle_id, p_students: p.data.student_ids,
    p_dist_m: Math.min(eta.straight_m, eta.distance_m), p_eta_s: eta.eta_s, p_src: eta.source,
    p_route_eta: eta.route?.eta ?? null, p_route_straight: eta.route?.straight ?? null, p_route_road: eta.route?.road ?? null,
  });
  if (error) {
    const code = mapRpcError(error.message);
    return { ok: false, error: code, data: code === "err_outside_window" ? { start: school.checkin_start, end: school.checkin_end } : undefined };
  }
  const sessionId = data as string;
  await audit({ by: userId, role: "parent", action: "pickup.start", entity: "pickup_sessions", entityId: sessionId, schoolId: school.id, detail: { students: p.data.student_ids.length, source: eta.source } });
  await emitPickupEvent({ kind: "started", sessionId, schoolId: school.id, parentUserId: userId });
  const status = eta.straight_m <= 0 ? "arrived" : "on_the_way";
  return { ok: true, session_id: sessionId, status, distance_m: eta.distance_m, eta_s: eta.eta_s, eta_source: eta.source, polyline: eta.polyline };
}

/** อัปเดตตำแหน่งระหว่างเดินทาง (ทุก ~15 วินาที): เขียนเฉพาะ ระยะ+ETA */
export async function updatePickup(userId: string, input: unknown): Promise<({ ok: true } & PickupLive) | PickupFail> {
  const p = updateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "err_invalid_input" };
  const admin = supabaseAdmin();
  const rl = await admin.rpc("rl_hit", { p_key: `pu:${p.data.session_id}`, p_limit: 12, p_window_s: 60 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };
  if (p.data.accuracy > MAX_ACCURACY_M) return { ok: false, error: "err_gps_inaccurate", data: { accuracy_m: Math.round(p.data.accuracy), max_m: MAX_ACCURACY_M } };

  const { data: s } = await admin
    .from("pickup_sessions")
    .select("school_id,status,route_at,route_eta_s,route_straight_m,route_road_m")
    .eq("id", p.data.session_id).eq("parent_user_id", userId).in("status", ["on_the_way", "arrived"]).maybeSingle();
  if (!s) return { ok: false, error: "err_pickup_not_active" };
  const school = await loadSchool(s.school_id);
  if (!school || school.lat == null || school.lng == null) return { ok: false, error: "err_school_not_ready" };

  const eta = await resolveEta(p.data, { lat: school.lat, lng: school.lng }, s as RouteMemo, etaDeps());
  const { data, error } = await admin.rpc("pickup_update", {
    p_user: userId, p_session: p.data.session_id, p_dist_m: Math.min(eta.straight_m, eta.distance_m), p_eta_s: eta.eta_s, p_src: eta.source,
    p_route_eta: eta.route?.eta ?? null, p_route_straight: eta.route?.straight ?? null, p_route_road: eta.route?.road ?? null,
  });
  if (error) return { ok: false, error: mapRpcError(error.message) };
  const r = data as { status: string; student_alert_due: boolean; school_id: string };
  if (r.student_alert_due) await emitPickupEvent({ kind: "student_alert", sessionId: p.data.session_id, schoolId: r.school_id, parentUserId: userId });
  return { ok: true, session_id: p.data.session_id, status: r.status, distance_m: eta.distance_m, eta_s: eta.eta_s, eta_source: eta.source, polyline: eta.polyline };
}

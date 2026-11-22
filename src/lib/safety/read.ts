import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { featureEnabled } from "@/lib/flags/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSafetyCfg } from "./server";

export type Zone = { id: string; name: string; active: boolean; sort: number };

/** ประตูของโรงเรียน (ปิดสวิตช์ zones = ไม่มีประตู; อ่านไม่ได้ = ว่าง) */
export async function loadZones(schoolId: string, onlyActive = true): Promise<Zone[]> {
  if (!(await featureEnabled("zones"))) return [];
  let q = supabaseAdmin().from("zones").select("id,name,active,sort").eq("school_id", schoolId).order("sort").order("name");
  if (onlyActive) q = q.eq("active", true);
  const { data, error } = await q;
  return error ? [] : (data as Zone[]);
}

export type PlanRow = { student_id: string; nickname: string; classroom: string | null; classroom_id: string | null; mode: "parent" | "bus" | "absent" | "other" };
export async function loadPlansToday(supabase: SupabaseClient, schoolId: string): Promise<PlanRow[]> {
  if (!(await featureEnabled("advance_notice"))) return [];
  const { data, error } = await supabase.rpc("dismissal_plans_today", { p_school: schoolId });
  return error ? [] : ((data ?? []) as PlanRow[]);
}

/** ทุกอย่างที่จอคิว (ประตู/ครู) ต้องรู้เพิ่ม: ประตู, พักการรับ, เสียงเรียก */
export async function loadBoardExtras(schoolId: string) {
  const [zones, cfg, voiceFlag, pauseFlag] = await Promise.all([loadZones(schoolId), loadSafetyCfg(schoolId), featureEnabled("voice"), featureEnabled("broadcast")]);
  return {
    zones: zones.map((z) => ({ id: z.id, name: z.name })),
    paused: pauseFlag && cfg.pickup_paused ? { note: cfg.pickup_pause_note } : null,
    voice: voiceFlag && cfg.voice_enabled,
    cfg,
  };
}

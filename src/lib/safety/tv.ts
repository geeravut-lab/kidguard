import "server-only";
import { featureEnabled } from "@/lib/flags/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashToken, loadSafetyCfg } from "./server";

export type TvState = { called: { id: string; nickname: string; classroom: string | null; zone: string | null }[]; arriving: { id: string; nickname: string; classroom: string | null; eta_min: number | null; arrived: boolean }[]; paused: boolean; fp: string };
export type TvDisplay = { id: string; school_id: string; zone_id: string | null; name: string; last_seen_at: string | null };

/** โทเคนในลิงก์ → จอที่ยังใช้ได้ (เทียบ hash; ฟีเจอร์ถูกปิด/จอถูกยกเลิก = ไม่พบ) */
export async function findTv(token: string): Promise<TvDisplay | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token) || !(await featureEnabled("tv_mode"))) return null;
  const { data } = await supabaseAdmin().from("tv_displays").select("id,school_id,zone_id,name,last_seen_at").eq("token_hash", hashToken(token)).eq("active", true).maybeSingle();
  return (data as TvDisplay | null) ?? null;
}

export async function loadTvState(d: TvDisplay): Promise<{ state: TvState; showArriving: boolean; voice: boolean; school: { name_th: string; name_en: string | null; logo: unknown } | null }> {
  const a = supabaseAdmin();
  const cfg = await loadSafetyCfg(d.school_id);
  const [{ data }, { data: school }, voiceOn] = await Promise.all([
    a.rpc("tv_state", { p_school: d.school_id, p_zone: d.zone_id as never, p_show_arriving: cfg.tv_show_arriving }),
    a.from("schools").select("name_th,name_en,logo").eq("id", d.school_id).maybeSingle(),
    featureEnabled("voice"),
  ]);
  const s = (data ?? { called: [], arriving: [], paused: false, fp: "" }) as TvState;
  return { state: s, showArriving: cfg.tv_show_arriving, voice: voiceOn && cfg.voice_enabled, school };
}

/** ทำเครื่องหมายว่าจอยังเปิดอยู่ (ไม่เขียนทุกรอบ: ห่างกันอย่างน้อย 5 นาที) */
export async function touchTv(d: TvDisplay): Promise<void> {
  if (d.last_seen_at && Date.now() - Date.parse(d.last_seen_at) < 300_000) return;
  await supabaseAdmin().from("tv_displays").update({ last_seen_at: new Date().toISOString() }).eq("id", d.id);
}

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanTag, parseAnalytics, parseQueueStats, type ProductEvent } from "./events";

const G = globalThis as unknown as { __kgActiveDay?: Map<string, string> };

/**
 * บันทึกเหตุการณ์ — ไม่เคย throw และไม่หน่วงงานของผู้ใช้ (ผู้เรียกใช้ after() ได้)
 * `active` วันละครั้งต่อคน: จำใน instance ว่าวันนี้เขียนแล้ว (ไม่ยิงฐานข้อมูลทุกหน้า) + unique index กันซ้ำอีกชั้น
 */
export async function trackEvent(event: ProductEvent, userId: string | null | undefined, o: { schoolId?: string | null; detail?: string } = {}): Promise<void> {
  if (!userId) return;
  if (event === "active") {
    const day = new Date().toISOString().slice(0, 10);
    const map = (G.__kgActiveDay ??= new Map<string, string>());
    if (map.get(userId) === day) return;
    if (map.size > 5000) map.clear();
    map.set(userId, day);
  }
  try {
    const { error } = await supabaseAdmin().from("product_events").insert({ event, user_id: userId, school_id: o.schoolId ?? null, detail: cleanTag(o.detail) });
    // 23505 = ซ้ำ (ปกติของเหตุการณ์ครั้งเดียว) · 23503 = ผู้ใช้ถูกลบระหว่างนั้น
    if (error && error.code !== "23505" && error.code !== "23503") console.error("track failed:", event, error.code);
  } catch (e) {
    console.error("track failed:", event, e instanceof Error ? e.name : "unknown");
  }
}

export async function loadAnalytics(days: number, schoolId: string | null) {
  const { data, error } = await supabaseAdmin().rpc("admin_analytics", { p_days: days, p_school: schoolId as never });
  return { ...parseAnalytics(error ? null : data), failed: !!error };
}

export async function loadQueueStats(days: number, schoolId: string | null) {
  const { data, error } = await supabaseAdmin().rpc("admin_queue_stats", { p_days: days, p_school: schoolId as never });
  return { ...parseQueueStats(error ? null : data), failed: !!error };
}

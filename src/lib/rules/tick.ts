import "server-only";
import { audit } from "@/lib/audit/server";
import { emitPickupEvent } from "@/lib/pickup/events";
import { lateStep } from "@/lib/safety/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dueEvery, parseRules, RULE_DEFS, ruleEnabled, ruleNumber, type RuleKey, type RuleSet } from "./rules";

const BUDGET_MS = 20_000;

export type TickCtx = { now: Date; rules: RuleSet; overBudget: () => boolean };
type Step = (ctx: TickCtx) => Promise<number>;

/** หมดอายุ check-in ที่ค้าง + แจ้งผู้ปกครอง */
const pickupExpire: Step = async () => {
  const { data, error } = await supabaseAdmin().rpc("pickup_expire");
  if (error) throw error;
  const rows = (data ?? []) as { session_id: string; parent_user_id: string; school_id: string }[];
  for (const r of rows) {
    await emitPickupEvent({ kind: "expired", sessionId: r.session_id, schoolId: r.school_id, parentUserId: r.parent_user_id });
    await audit({ action: "pickup.expire", entity: "pickup_sessions", entityId: r.session_id, schoolId: r.school_id, role: "system" });
  }
  return rows.length;
};

/** ลบข้อมูลเก่าตามระยะเก็บรักษา (ไม่ต้องทุกนาที: ทุก every_h ชั่วโมง) */
const cleanupOld: Step = async ({ now, rules }) => {
  if (!dueEvery(rules.get("cleanup_old")?.last_run_at, ruleNumber(rules, "cleanup_old", "every_h", 168) || 6, now)) return -2; // -2 = ยังไม่ถึงรอบ
  const { data, error } = await supabaseAdmin().rpc("kg_cleanup_old", {
    p_notif_days: ruleNumber(rules, "cleanup_old", "notif_days"),
    p_msg_days: ruleNumber(rules, "cleanup_old", "msg_days"),
    p_events_days: ruleNumber(rules, "cleanup_old", "events_days"),
    p_sessions_days: ruleNumber(rules, "cleanup_old", "sessions_days"),
  });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, number>;
  return Object.values(r).reduce((a, b) => a + (Number(b) || 0), 0);
};

/** ลำดับกฎ: งานเก็บกวาดไว้ท้าย (ถ้าเวลาหมดจะไม่ไปบังกฎที่ต้องทันเวลา) */
export const STEPS: [RuleKey, Step][] = [
  ["pickup_expire", pickupExpire],
  ["late_pickup", lateStep],
  ["cleanup_old", cleanupOld],
];

export async function loadRules(): Promise<RuleSet> {
  try {
    const { data, error } = await supabaseAdmin().from("automation_rules").select("key,enabled,params,last_run_at,last_count");
    if (error) throw error;
    return parseRules(data);
  } catch {
    return new Map(); // อ่านไม่ได้ = ทุกกฎเปิด + ค่าเริ่มต้นในโค้ด
  }
}

/**
 * tick เดียว (Vercel Cron ทุกนาที): รันกฎตามลำดับ; กฎหนึ่งล้มไม่ลากกฎอื่น; งบเวลา 20 วินาที
 * summary: จำนวนที่ทำต่อกฎ; -1 = ปิดอยู่; -2 = ยังไม่ถึงรอบ; stopped = หยุดเพราะเกินเวลาที่กฎไหน
 */
export async function runTick(now = new Date(), extraSteps: [RuleKey, Step][] = []): Promise<Record<string, number | string>> {
  const t0 = Date.now();
  const rules = await loadRules();
  const ctx: TickCtx = { now, rules, overBudget: () => Date.now() - t0 > BUDGET_MS };
  const summary: Record<string, number | string> = {};
  const a = supabaseAdmin();
  for (const [key, step] of [...STEPS, ...extraSteps].sort((x, y) => orderOf(x[0]) - orderOf(y[0]))) {
    if (ctx.overBudget()) {
      summary.stopped = key;
      break;
    }
    if (!ruleEnabled(rules, key)) {
      summary[key] = -1;
      continue;
    }
    try {
      const n = await step(ctx);
      summary[key] = n;
      if (n !== -2) await a.from("automation_rules").update({ last_run_at: now.toISOString(), last_count: n }).eq("key", key);
    } catch (e) {
      console.error(`rule ${key} failed:`, e instanceof Error ? e.message.slice(0, 120) : "unknown");
      summary[key] = 0;
      summary[`${key}_error`] = "failed";
    }
  }
  summary.ms = Date.now() - t0;
  try {
    await a.from("cron_ticks").insert({ started_at: now.toISOString(), finished_at: new Date().toISOString(), summary });
  } catch {
    /* บันทึกรอบไม่ได้ ไม่เป็นไร */
  }
  return summary;
}

const orderOf = (k: RuleKey) => RULE_DEFS[k].sort;

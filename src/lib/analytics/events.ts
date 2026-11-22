import { z } from "zod";

// รายชื่อเหตุการณ์อยู่ในโค้ด (พิมพ์ผิด = คอมไพล์ไม่ผ่าน) — เหตุการณ์ไม่มีเนื้อหา: ชื่อ + วัน + ผู้ใช้ + แท็กสั้น ๆ เท่านั้น
export const EVENTS = [
  "active", // วันละครั้งต่อคน
  "signup",
  "onboarded",
  "guardian_linked",
  "pickup_started",
  "pickup_completed",
  "pickup_cancelled",
  "line_linked",
  "pass_created",
  "pass_used",
  "plan_set",
  "broadcast_sent",
] as const;
export type ProductEvent = (typeof EVENTS)[number];

/** แท็ก ≤ 40 ตัว [a-z0-9_] — อย่างอื่นถูกทิ้ง */
export function cleanTag(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40);
  return t || null;
}

const n = z.number().catch(0);
const day = z.string().catch("");
export const analyticsSchema = z.object({
  days: n,
  users_total: n,
  dau: n,
  wau: n,
  mau: n,
  daily: z.array(z.object({ day, n })).catch([]),
  events: z.array(z.object({ event: z.string().catch(""), count: n, users: n })).catch([]),
  funnel: z.array(z.object({ step: z.string().catch(""), users: n })).catch([]),
  retention: z
    .object({
      d1: z.object({ eligible: n, returned: n }).catch({ eligible: 0, returned: 0 }),
      d7: z.object({ eligible: n, returned: n }).catch({ eligible: 0, returned: 0 }),
    })
    .catch({ d1: { eligible: 0, returned: 0 }, d7: { eligible: 0, returned: 0 } }),
});
export type Analytics = z.infer<typeof analyticsSchema>;

/** ข้อมูลเพี้ยนบางส่วน = แสดงเป็น 0 แทนหน้าแตก */
export function parseAnalytics(raw: unknown): Analytics {
  return analyticsSchema.catch(analyticsSchema.parse({})).parse(raw ?? {});
}

export const queueStatsSchema = z.object({
  days: n,
  total: n,
  completed: n,
  cancelled: n,
  expired: n,
  manual_arrival: n,
  verified: n,
  by_parent: n,
  by_staff: n,
  students_released: n,
  wait_avg_s: z.number().nullable().catch(null),
  wait_p50_s: z.number().nullable().catch(null),
  wait_p90_s: z.number().nullable().catch(null),
  by_hour: z.array(z.object({ hour: n, n })).catch([]),
  by_weekday: z.array(z.object({ dow: n, n })).catch([]),
  daily: z.array(z.object({ day, n })).catch([]),
});
export type QueueStats = z.infer<typeof queueStatsSchema>;
export function parseQueueStats(raw: unknown): QueueStats {
  return queueStatsSchema.catch(queueStatsSchema.parse({})).parse(raw ?? {});
}

/** % ของขั้นก่อนหน้า (หารศูนย์ = null; ขั้นหลังอาจมากกว่าขั้นก่อน เพราะไม่ใช่ cohort — แสดงตามจริง) + ความยาวแท่ง 0–100 */
export function buildFunnel(steps: { step: string; users: number }[]): { step: string; users: number; pct: number | null; bar: number }[] {
  const max = Math.max(1, ...steps.map((s) => s.users));
  return steps.map((s, i) => {
    const prev = steps[i - 1]?.users;
    return { ...s, pct: i === 0 || !prev ? null : Math.round((s.users / prev) * 100), bar: Math.min(100, Math.round((s.users / max) * 100)) };
  });
}

export const retentionRate = (r: { eligible: number; returned: number }): number | null => (r.eligible > 0 ? Math.round((r.returned / r.eligible) * 100) : null);

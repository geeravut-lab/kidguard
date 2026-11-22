// กฎอัตโนมัติ (docs/AUTOMATION-RULES-KNOWLEDGE.md): ตารางบอกแค่ "รันไหม" + "ตัวเลข"; เงื่อนไขอยู่ในโค้ดที่มีเทส
// กฎที่ไม่มีแถว = เปิด + ตัวเลขค่าเริ่มต้นในโค้ด (อ่านตารางไม่ได้ก็ยังทำงาน)

export const RULE_DEFS = {
  pickup_expire: { sort: 10, params: {} as Record<string, number> },
  late_pickup: { sort: 20, params: { repeat_min: 0 } as Record<string, number> },
  cleanup_old: { sort: 90, params: { notif_days: 90, msg_days: 90, events_days: 730, sessions_days: 365, every_h: 6 } as Record<string, number> },
} as const;
export type RuleKey = keyof typeof RULE_DEFS;
export const RULE_KEYS = Object.keys(RULE_DEFS) as RuleKey[];
export const isRuleKey = (v: unknown): v is RuleKey => typeof v === "string" && v in RULE_DEFS;

export type RuleRow = { key: string; enabled: boolean; params: Record<string, unknown>; last_run_at: string | null; last_count: number | null };
export type RuleSet = Map<string, RuleRow>;

export function parseRules(rows: unknown): RuleSet {
  const out: RuleSet = new Map();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r !== "object" || typeof (r as RuleRow).key !== "string") continue;
    const x = r as Partial<RuleRow>;
    out.set(x.key as string, {
      key: x.key as string,
      enabled: x.enabled !== false,
      params: x.params && typeof x.params === "object" && !Array.isArray(x.params) ? (x.params as Record<string, unknown>) : {},
      last_run_at: typeof x.last_run_at === "string" ? x.last_run_at : null,
      last_count: typeof x.last_count === "number" ? x.last_count : null,
    });
  }
  return out;
}

export const ruleEnabled = (rules: RuleSet, key: string): boolean => rules.get(key)?.enabled ?? true;

/** ค่าผิด/นอกช่วง = ค่าเริ่มต้นในโค้ด */
export function ruleNumber(rules: RuleSet, key: RuleKey, param: string, max = 10_000): number {
  const fallback = RULE_DEFS[key].params[param] ?? 0;
  const raw = rules.get(key)?.params[param];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : fallback;
}

/** ถึงรอบหรือยัง (กฎหนักที่ไม่ต้องรันทุกนาที): ไม่เคยรัน = ถึงรอบ */
export function dueEvery(lastRunAt: string | null | undefined, hours: number, now: Date): boolean {
  if (!lastRunAt) return true;
  const t = Date.parse(lastRunAt);
  return !Number.isFinite(t) || now.getTime() - t >= hours * 3600_000;
}

/** รับเฉพาะ key ที่กฎมีอยู่แล้ว + ค่าเป็นจำนวนเต็ม 0–10,000 (ค่าผิดรูปทิ้ง) */
export function sanitizeParams(key: RuleKey, input: Record<string, unknown>): Record<string, number> | null {
  const allowed = Object.keys(RULE_DEFS[key].params);
  const out: Record<string, number> = {};
  for (const p of allowed) {
    if (!(p in input)) continue;
    const n = Number(input[p]);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) return null;
    out[p] = Math.round(n);
  }
  return out;
}

/** เวลาไทย (server อยู่ UTC) */
export function bangkokHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(now)) % 24;
}
export const bangkokDate = (now: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);

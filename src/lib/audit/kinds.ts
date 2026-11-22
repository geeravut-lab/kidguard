// กลุ่ม event ของ audit = คำแรกของ action (หรือ "db" สำหรับ trigger) — Admin ติ๊กเลือกกลุ่มที่จะเก็บได้
// กลุ่ม "audit" (เปลี่ยนสวิตช์/ส่งออก/ลบ) บันทึกเสมอ ปิดไม่ได้ (บังคับที่ฐานข้อมูล: audit_log_gate)
export const AUDIT_KINDS = [
  "auth", "guardian", "member", "school", "classroom", "student", "pickup", "channel", "settings",
  "brand", "flag", "rule", "pass", "custody", "plan", "zone", "tv", "broadcast", "db", "audit",
] as const;
export const ALWAYS_ON_GROUP = "audit";
const GROUP_RE = /^[a-z][a-z0-9_]{0,30}$/;

export const isGroupName = (v: unknown): v is string => typeof v === "string" && GROUP_RE.test(v);
export const groupOfAction = (action: string, source: string): string => (source === "db" ? "db" : action.split(".")[0] ?? "");

/** รายการที่ให้ติ๊ก = กลุ่มที่รู้จัก + กลุ่มที่ "เคยเห็น" ในบันทึกล่าสุด + กลุ่มที่ปิดอยู่ (ไม่หายจากรายการ); ไม่รวมกลุ่มที่ปิดไม่ได้ */
export function switchableGroups(seen: Iterable<string>, off: Iterable<string>): string[] {
  const set = new Set<string>(AUDIT_KINDS);
  for (const g of seen) if (isGroupName(g)) set.add(g);
  for (const g of off) if (isGroupName(g)) set.add(g);
  set.delete(ALWAYS_ON_GROUP);
  return [...set].sort();
}

export type AuditSwitch = { enabled: boolean; off_groups: string[] };
export function parseSwitch(raw: unknown, fallback: AuditSwitch = { enabled: true, off_groups: [] }): AuditSwitch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const o = raw as Record<string, unknown>;
  const off = Array.isArray(o.off_groups) ? [...new Set(o.off_groups.filter(isGroupName))].filter((g) => g !== ALWAYS_ON_GROUP) : fallback.off_groups;
  return { enabled: typeof o.enabled === "boolean" ? o.enabled : fallback.enabled, off_groups: off };
}

/** ตัวกรองหน้า audit (จาก URL; CSV ใช้ตัวกรองเดียวกัน) */
export type AuditFilter = { from?: string; to?: string; group?: string; actor?: string; entity?: string; school?: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function parseFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const f: AuditFilter = {};
  const from = one("from");
  const to = one("to");
  if (from && DATE_RE.test(from)) f.from = from;
  if (to && DATE_RE.test(to)) f.to = to;
  const group = one("group");
  if (group && isGroupName(group)) f.group = group;
  const actor = one("actor");
  if (actor && /^[0-9a-f-]{36}$/i.test(actor)) f.actor = actor.toLowerCase();
  const entity = one("entity");
  if (entity && /^[a-z_]{1,40}$/.test(entity)) f.entity = entity;
  const school = one("school");
  if (school && /^[0-9a-f-]{36}$/i.test(school)) f.school = school.toLowerCase();
  return f;
}
export const filterToQuery = (f: AuditFilter, extra: Record<string, string> = {}): string => {
  const p = new URLSearchParams({ ...(Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>), ...extra });
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** วันที่ไทย (YYYY-MM-DD) → ช่วงเวลา UTC [เที่ยงคืน, เที่ยงคืนถัดไป) */
export const bangkokDayStart = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString();
export const bangkokDayEnd = (d: string) => new Date(new Date(`${d}T00:00:00+07:00`).getTime() + 86400_000).toISOString();

/** ชื่อกลุ่มที่อ่านง่าย (ไม่รู้จัก = แสดงชื่อกลุ่มตามที่เป็น) */
export const kindLabel = (t: Record<string, string>, g: string): string => t[`audit_kind_${g}`] ?? g;

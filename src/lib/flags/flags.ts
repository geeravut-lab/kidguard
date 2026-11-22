// สวิตช์ฟีเจอร์ (docs/FEATURE-FLAGS-KNOWLEDGE.md): รายชื่ออยู่ในโค้ด ค่าอยู่ในฐานข้อมูล
// เก็บเฉพาะสวิตช์ที่ "ปิด" ({"voice": false}) — key ที่ไม่มี = เปิด → เพิ่มสวิตช์ใหม่ไม่มีวันปิดของที่ใช้อยู่แล้วโดยไม่ตั้งใจ

export const FEATURE_FLAGS = [
  "line", // แจ้งเตือนผ่าน LINE
  "student_dashboard", // จอนักเรียน (ยังต้องเปิดรายโรงเรียนด้วย)
  "advance_notice", // แจ้งล่วงหน้า รับเอง/รถโรงเรียน/ลา
  "pickup_passes", // รหัส/QR ผู้รับแทน
  "custody_flags", // ธงห้ามปล่อย
  "late_alerts", // เตือนรับช้า
  "voice", // เสียงเรียก
  "tv_mode", // โหมดจอ TV
  "zones", // หลายประตู
  "broadcast", // ประกาศฉุกเฉิน/พักการรับ
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type Flags = Partial<Record<FeatureFlag, boolean>>;

export const isFeatureFlag = (v: unknown): v is FeatureFlag => typeof v === "string" && (FEATURE_FLAGS as readonly string[]).includes(v);

/** ไม่มี key = เปิด */
export const isEnabled = (flags: Flags | null | undefined, flag: FeatureFlag): boolean => flags?.[flag] !== false;

/** เก็บเฉพาะ key ที่รู้จักและเป็น false; ทิ้งอย่างอื่น */
export function normalizeFlags(raw: unknown): Flags {
  const out: Flags = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isFeatureFlag(k) && v === false) out[k] = false;
  return out;
}

/** เปิด = ลบ key, ปิด = เขียน false */
export function withFlag(flags: Flags, flag: FeatureFlag, enabled: boolean): Flags {
  const next = { ...flags };
  if (enabled) delete next[flag];
  else next[flag] = false;
  return next;
}

/** href ของเมนูที่ "ทุก" flag ของมันปิด (เมนูที่ไม่มี flag ไม่เข้าข่าย) */
export function disabledNavHrefs(items: { href: string; flags?: readonly FeatureFlag[] }[], flags: Flags): Set<string> {
  const out = new Set<string>();
  for (const i of items) if (i.flags?.length && i.flags.every((f) => !isEnabled(flags, f))) out.add(i.href);
  return out;
}

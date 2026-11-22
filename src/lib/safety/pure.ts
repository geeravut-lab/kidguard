import { randomInt } from "node:crypto";

// ===== รหัส/QR ผู้รับแทน =====
const SAFE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ไม่มี 0/O/1/I (คนอ่านจากหน้าจอแล้วพิมพ์ที่ประตู)
export const PASS_LEN = 8;
export const PASS_MAX_DAYS = 7;
export const PASS_MAX_ACTIVE = 5;
export const makePassCode = (): string => Array.from({ length: PASS_LEN }, () => SAFE[randomInt(SAFE.length)]).join("");

/** รับได้ทั้งรหัสที่พิมพ์ (มีช่องว่าง/ขีด/ตัวเล็ก) และข้อความจาก QR ("KG:XXXXXXXX") — ไม่ถูกต้อง = null */
export function normalizePassCode(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/^KG[:\s]+/, "").replace(/[\s-]/g, "");
  return new RegExp(`^[${SAFE}]{${PASS_LEN}}$`).test(t) ? t : null;
}
export const passQrText = (code: string): string => `KG:${code}`;

/** วันหมดอายุของรหัส: "today" = สิ้นวันตามเวลาไทย; "days" = N วันนับจากนี้ (1–7) */
export function passExpiry(now: Date, mode: "today" | "days", days = 1): Date {
  if (mode === "days") return new Date(now.getTime() + Math.min(Math.max(Math.trunc(days) || 1, 1), PASS_MAX_DAYS) * 86400_000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
  return new Date(new Date(`${ymd}T23:59:59+07:00`).getTime());
}

// ===== แจ้งล่วงหน้า =====
export const PLAN_MODES = ["parent", "bus", "absent", "other"] as const;
export type PlanMode = (typeof PLAN_MODES)[number];
export const isPlanMode = (v: unknown): v is PlanMode => typeof v === "string" && (PLAN_MODES as readonly string[]).includes(v);
export const PLAN_DAYS_AHEAD = 14;

export const bangkokYmd = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
/** วันที่ที่เลือกแจ้งได้: วันนี้ถึง +14 วัน (ตามเวลาไทย) */
export function planDateOk(ymd: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const today = bangkokYmd(now);
  const max = bangkokYmd(new Date(now.getTime() + PLAN_DAYS_AHEAD * 86400_000));
  return ymd >= today && ymd <= max && !Number.isNaN(Date.parse(`${ymd}T00:00:00Z`));
}

// ===== เสียงเรียก =====
export type CallTarget = { nickname: string; classroom?: string | null; zone?: string | null };
/** ประโยคที่พูด: ชื่อเล่น + ห้อง (ไม่พูดนามสกุล) + ประตู ถ้ามี */
export function callPhrase(t: CallTarget, lang: "th" | "en"): string {
  if (lang === "th") {
    const room = t.classroom ? ` ห้อง ${t.classroom}` : "";
    return `น้อง${t.nickname}${room} ผู้ปกครองมารับแล้ว เชิญที่${t.zone || "ประตู"}`;
  }
  const room = t.classroom ? `, class ${t.classroom}` : "";
  return `${t.nickname}${room}, your guardian has arrived. Please come to ${t.zone || "the gate"}.`;
}

// ===== เตือนรับช้า =====
/** ช่วงของการเตือนซ้ำ: repeat=0 → ครั้งเดียวต่อวัน; ไม่งั้นเตือนซ้ำทุก repeat นาที (กุญแจกันซ้ำเปลี่ยนตามช่วง) */
export const lateBucket = (lateMin: number, repeatMin: number): number => (repeatMin > 0 ? Math.floor(Math.max(lateMin, 0) / repeatMin) : 0);

/** สถานะที่แสดงของรหัส: active ที่เลยเวลาแล้ว = expired */
export const passStatus = (status: string, expiresAt: string): string => (status === "active" && Date.parse(expiresAt) < Date.now() ? "expired" : status);

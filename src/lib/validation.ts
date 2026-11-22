import { z } from "zod";

/** เบอร์โทร: ตัดช่องว่าง/ขีด/วงเล็บ; รับ 0xxxxxxxxx หรือ +66… (8–15 หลัก) */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, "");
  return /^\+?[0-9]{8,15}$/.test(s) ? s : null;
}

/** ทะเบียนรถ: ตัดช่องว่าง/ขีด ให้เหลือตัวอักษรไทย/อังกฤษและตัวเลข 1–12 ตัว */
export function normalizePlate(raw: string): string | null {
  const s = raw.replace(/[\s\-.]/g, "");
  return /^[0-9A-Za-zก-ฮ๐-๙]{1,12}$/.test(s) ? s.toUpperCase() : null;
}

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8).max(72);
export const nameSchema = z.string().trim().min(1).max(80);
export const uuidSchema = z.string().uuid();

export const RELATIONS = ["father", "mother", "guardian", "relative", "driver", "other"] as const;
export type Relation = (typeof RELATIONS)[number];
export const relationSchema = z.enum(RELATIONS);

/** อ่านค่าสตริงจาก FormData (ไม่ใช่ไฟล์) */
export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** IP ของผู้เรียก (Vercel ใส่ x-forwarded-for ให้; ค่าแรก = ผู้ใช้จริง) — ใช้เป็นกุญแจจำกัดอัตราเท่านั้น ไม่ใช่การยืนยันตัวตน */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0]!.trim().slice(0, 64) || "unknown";
}

export const hashKey = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex").slice(0, 24);

/**
 * จำกัดอัตราผ่านฟังก์ชันฐานข้อมูล rl_hit: คืน false เมื่อเกินโควตา
 * อ่านไม่ได้ (ฐานข้อมูลช้า/ล่ม) = ปล่อยผ่าน (fail-open) เพื่อไม่ให้ผู้ใช้จริงเข้าไม่ได้ — Supabase Auth มีตัวจำกัดของตัวเองซ้อนอีกชั้น
 */
export async function allow(key: string, limit: number, windowS: number): Promise<boolean> {
  // เฉพาะชุดทดสอบ e2e บนเครื่อง (ทุกเทสต์มาจาก IP เดียว): ข้ามโควตาที่ผูกกับ IP — โควตาต่ออีเมลยังทำงานปกติ
  if (process.env.KG_RL_IGNORE_IP === "1" && /^(signup:|login:ip:|forgot:ip:)/.test(key)) return true;
  try {
    const { data, error } = await supabaseAdmin().rpc("rl_hit", { p_key: key, p_limit: limit, p_window_s: windowS });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

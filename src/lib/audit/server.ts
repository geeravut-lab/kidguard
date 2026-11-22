import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ACTION_RE = /^[a-z]+(\.[a-z_]+)+$/;
// key ที่ชื่อสื่อถึงข้อมูลส่วนบุคคล/ความลับ ถูกทิ้งเสมอ (ใส่ id แล้วไปเปิดดูจากตารางต้นทาง)
const PII_KEY = /name|email|phone|address|passw|token|secret|note|text|plate|lat|lng|coord|code|link/i;

/** ทำความสะอาด detail: ≤20 key, สตริง ≤120, array ≤20 ค่า primitive, ไม่รับ object ซ้อน */
export function cleanDetail(d: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!d) return out;
  for (const [k, v] of Object.entries(d).slice(0, 20)) {
    if (PII_KEY.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => ["string", "number", "boolean"].includes(typeof x)).slice(0, 20).map((x) => (typeof x === "string" ? x.slice(0, 120) : x));
  }
  return out;
}

export type AuditInput = {
  by?: string | null;
  role?: string | null;
  action: string; // เช่น "guardian.claim" — คำแรก = กลุ่มที่ Admin เปิด/ปิดได้
  entity: string;
  entityId?: string | null;
  schoolId?: string | null;
  detail?: Record<string, unknown>;
};

/** เรียก "หลัง" งานสำเร็จ — ไม่เคย throw (เขียนพลาด = log; trigger ฝั่งฐานข้อมูลยังเก็บการเปลี่ยนไว้) */
export async function audit(i: AuditInput): Promise<void> {
  try {
    if (!ACTION_RE.test(i.action) || i.action.length > 120) {
      console.error("audit: bad action", i.action);
      return;
    }
    const { error } = await supabaseAdmin().from("audit_log").insert({
      source: "app",
      actor_id: i.by ?? null,
      actor_role: i.role ?? null,
      action: i.action,
      entity: i.entity,
      entity_id: i.entityId ?? null,
      school_id: i.schoolId ?? null,
      detail: cleanDetail(i.detail),
    });
    if (error) console.error("audit: insert failed", error.code);
  } catch (e) {
    console.error("audit: failed", e instanceof Error ? e.name : "unknown");
  }
}

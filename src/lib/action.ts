import { th, type Dict } from "@/lib/i18n/dict";

/** ผลลัพธ์ของ server action: ส่งรหัส err_* ไม่ส่งประโยค/stack (แปลฝั่งหน้าจอ) */
export type ActionState = { ok: boolean; error?: string; message?: string; data?: Record<string, unknown> } | null;

export const ok = (extra?: Partial<NonNullable<ActionState>>): NonNullable<ActionState> => ({ ok: true, ...extra });
export const fail = (error: string): NonNullable<ActionState> => ({ ok: false, error });

/** รหัสที่ไม่รู้จัก = ข้อความทั่วไป (ห้ามโชว์ error ดิบ) */
export function errorText(t: Dict, code: string | undefined): string {
  if (!code) return "";
  return code in th && code.startsWith("err_") ? (t[code as keyof Dict] as string) : t.err_generic;
}

/** แปลง error ของ Postgres/RPC เป็นรหัส err_* */
export function mapDbError(e: { code?: string; message?: string } | null | undefined): string {
  const m = e?.message ?? "";
  if (/not_authenticated/.test(m)) return "err_forbidden";
  if (/rate_limited/.test(m) || e?.code === "54000") return "err_rate_limited";
  if (/invalid_invite/.test(m)) return "err_invalid_invite";
  if (/already_decided/.test(m)) return "err_already_decided";
  if (/student_required/.test(m)) return "err_student_required";
  if (/last_admin/.test(m)) return "err_last_admin";
  if (/invalid_(student|target|name)/.test(m) || e?.code === "22023") return "err_invalid_input";
  if (e?.code === "42501" || /forbidden|permission denied|row-level security/.test(m)) return "err_forbidden";
  if (e?.code === "23505") return "err_duplicate";
  if (e?.code === "23514" || e?.code === "22P02") return "err_invalid_input";
  if (e?.code === "P0002") return "err_not_found";
  return "err_generic";
}

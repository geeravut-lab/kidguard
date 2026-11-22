import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bangkokDayEnd, bangkokDayStart, groupOfAction, type AuditFilter } from "./kinds";

export type AuditRow = {
  id: number; at: string; source: string; actor_id: string | null; actor_role: string | null; action: string;
  entity: string; entity_id: string | null; school_id: string | null; detail: Record<string, unknown>;
};
export type AuditScope = { platform: boolean; schoolId: string | null };

export const PAGE_SIZE = 50;
export const CSV_MAX_ROWS = 5000;

/** ขอบเขต: แอดมินแพลตฟอร์ม = ทุกโรงเรียน (กรองเองได้); school_admin = เฉพาะโรงเรียนของตน (บังคับที่นี่ ไม่เชื่อ URL) */
function build(f: AuditFilter, scope: AuditScope) {
  let q = supabaseAdmin().from("audit_log").select("id,at,source,actor_id,actor_role,action,entity,entity_id,school_id,detail");
  if (!scope.platform) q = q.eq("school_id", scope.schoolId ?? "00000000-0000-0000-0000-000000000000");
  else if (f.school) q = q.eq("school_id", f.school);
  if (f.from) q = q.gte("at", bangkokDayStart(f.from));
  if (f.to) q = q.lt("at", bangkokDayEnd(f.to));
  if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.entity) q = q.eq("entity", f.entity);
  if (f.group) q = f.group === "db" ? q.eq("source", "db") : q.eq("source", "app").like("action", `${f.group}.%`);
  return q;
}

/** แบ่งหน้าด้วย cursor (id สุดท้าย) ไม่ใช่ offset — ตารางโตเร็ว */
export async function queryAudit(f: AuditFilter, scope: AuditScope, before?: number, limit = PAGE_SIZE): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  let q = build(f, scope).order("id", { ascending: false }).limit(limit + 1);
  if (before && Number.isSafeInteger(before)) q = q.lt("id", before);
  const { data } = await q;
  const rows = (data ?? []) as AuditRow[];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function queryAuditForCsv(f: AuditFilter, scope: AuditScope): Promise<AuditRow[]> {
  const { data } = await build(f, scope).order("id", { ascending: false }).limit(CSV_MAX_ROWS);
  return (data ?? []) as AuditRow[];
}

/** ชื่อผู้กระทำ (ชื่อไม่ได้อยู่ในบันทึก — เรียกครั้งเดียวต่อหน้า) */
export async function actorNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter((x): x is string => !!x))];
  if (!u.length) return new Map();
  const { data } = await supabaseAdmin().from("profiles").select("id,display_name").in("id", u);
  return new Map((data ?? []).map((p) => [p.id, p.display_name ?? ""]));
}

/** กลุ่มที่เคยเห็นในบันทึกล่าสุด (กลุ่มใหม่โผล่ให้ปิดได้เองโดยไม่ต้องแก้โค้ด) */
export async function seenGroups(scope: AuditScope): Promise<string[]> {
  let q = supabaseAdmin().from("audit_log").select("action,source").order("id", { ascending: false }).limit(1500);
  if (!scope.platform) q = q.eq("school_id", scope.schoolId ?? "00000000-0000-0000-0000-000000000000");
  const { data } = await q;
  return [...new Set((data ?? []).map((r) => groupOfAction(r.action, r.source)))].filter(Boolean);
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // กัน CSV injection เมื่อเปิดใน Excel
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function auditToCsv(rows: AuditRow[], names: Map<string, string>): string {
  const head = ["id", "at", "source", "actor_id", "actor_name", "actor_role", "action", "entity", "entity_id", "school_id", "detail"];
  const lines = rows.map((r) => [r.id, r.at, r.source, r.actor_id, r.actor_id ? names.get(r.actor_id) ?? "" : "", r.actor_role, r.action, r.entity, r.entity_id, r.school_id, JSON.stringify(r.detail)].map(csvCell).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n"); // BOM ให้ Excel อ่านภาษาไทยถูก
}

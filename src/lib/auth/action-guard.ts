import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveSchool, type SchoolCtx } from "./guards";
import { getMe, type Me, type SchoolRole } from "./me";

export type SchoolActionCtx = { me: Me; school: SchoolCtx; supabase: Awaited<ReturnType<typeof createClient>> };

/** ตรวจสิทธิ์เป็นบรรทัดแรกของทุก action ของโรงเรียน (การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์) — RLS/ฟังก์ชัน SQL ตรวจซ้ำอีกชั้น */
export async function guardSchool(roles: SchoolRole[]): Promise<SchoolActionCtx | null> {
  const me = await getMe();
  if (!me) return null;
  const school = await resolveSchool(me);
  if (!school) return null;
  if (!me.platform_admin && !school.roles.some((r) => roles.includes(r))) return null;
  return { me, school, supabase: await createClient() };
}
export const roleOfCtx = (c: SchoolActionCtx) => (c.me.platform_admin ? "super_admin" : c.school.roles[0]);

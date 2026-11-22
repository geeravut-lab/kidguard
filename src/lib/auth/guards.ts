import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMe, rolesOf, type Me, type SchoolRole } from "./me";

export const SCHOOL_COOKIE = "kg_school";

export async function requireMe(next = "/start"): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  return me;
}

export type SchoolCtx = { id: string; name_th: string; name_en: string | null; short_name: string | null; roles: SchoolRole[] };

/** โรงเรียนที่กำลังทำงานอยู่: คุกกี้ที่ผู้ใช้เลือก (ต้องอยู่ในสมาชิกภาพของตน) → ไม่งั้นโรงเรียนแรก; แอดมินแพลตฟอร์มเลือกโรงเรียนใดก็ได้ */
export async function resolveSchool(me: Me): Promise<SchoolCtx | null> {
  const wanted = (await cookies()).get(SCHOOL_COOKIE)?.value;
  const mineIds = me.memberships.map((m) => m.school_id);
  const supabase = await createClient();
  let id: string | undefined = wanted && (mineIds.includes(wanted) || me.platform_admin) ? wanted : mineIds[0];
  if (!id && me.platform_admin) {
    const { data } = await supabase.from("schools").select("id").eq("active", true).order("created_at").limit(1);
    id = data?.[0]?.id;
  }
  if (!id) return null;
  const { data: s } = await supabase.from("schools").select("id, name_th, name_en, short_name").eq("id", id).maybeSingle();
  if (!s) return null;
  return { ...s, roles: me.memberships.filter((m) => m.school_id === id).map((m) => m.role) };
}

/** หน้าสำหรับเจ้าหน้าที่: คนนอกได้ 404 (ไม่บอกว่ามีหน้านี้) — ต้องเรียกที่หน้าและบรรทัดแรกของ action ทุกตัว */
export async function requireSchoolRole(roles: SchoolRole[], next: string) {
  const me = await requireMe(next);
  const school = await resolveSchool(me);
  if (!school) notFound();
  const allowed = me.platform_admin || school.roles.some((r) => roles.includes(r));
  if (!allowed) notFound();
  return { me, school };
}

export async function requirePlatformAdmin(next: string) {
  const me = await requireMe(next);
  if (!me.platform_admin) notFound();
  return me;
}

export function hasRole(me: Me, role: SchoolRole) {
  return rolesOf(me).has(role);
}

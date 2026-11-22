import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { resolveSchool } from "./guards";
import type { Me } from "./me";
import { parseImageRef, type ImageRef } from "@/lib/brand/brand";

export type ShellSchool = { id: string; name_th: string; name_en: string | null; short_name: string | null; logo: ImageRef | null };

/** โรงเรียนที่แสดงบนหัวเมนู: เจ้าหน้าที่ = โรงเรียนที่กำลังทำงาน; ผู้ปกครอง/นักเรียน = โรงเรียนของบุตรหลาน; ไม่มี = null (ใช้ข้อความกลาง) */
export const getShellSchool = cache(async (me: Me | null): Promise<ShellSchool | null> => {
  if (!me) return null;
  const supabase = await createClient();
  const pick = (s: { id: string; name_th: string; name_en: string | null; short_name: string | null; logo: unknown } | null): ShellSchool | null =>
    s ? { id: s.id, name_th: s.name_th, name_en: s.name_en, short_name: s.short_name, logo: parseImageRef(s.logo) } : null;
  if (me.memberships.length > 0 || me.platform_admin) {
    const ctx = await resolveSchool(me);
    if (!ctx) return null;
    const { data } = await supabase.from("schools").select("id,name_th,name_en,short_name,logo").eq("id", ctx.id).maybeSingle();
    return pick(data);
  }
  const sid = me.students?.[0]?.school_id;
  if (sid) {
    const { data } = await supabase.from("schools").select("id,name_th,name_en,short_name,logo").eq("id", sid).maybeSingle();
    return pick(data);
  }
  const { data } = await supabase
    .from("guardian_links")
    .select("schools(id,name_th,name_en,short_name,logo)")
    .eq("status", "approved")
    .order("created_at")
    .limit(1);
  const s = (data?.[0] as unknown as { schools: Parameters<typeof pick>[0] } | undefined)?.schools ?? null;
  return pick(s);
});

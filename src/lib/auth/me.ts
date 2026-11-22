import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SchoolRole = "school_admin" | "gate_staff" | "teacher";
export type Membership = { school_id: string; role: SchoolRole; name_th: string; name_en: string | null; short_name: string | null; slug: string };
export type Me = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  lang: "th" | "en";
  role: "parent" | null;
  onboarded: boolean;
  platform_admin: boolean;
  is_owner: boolean;
  memberships: Membership[];
  classroom_ids: string[];
  students: { student_id: string; school_id: string }[];
};
export type AuthInfo = { id: string; email: string | null; hasPassword: boolean };

/** ผู้ใช้ปัจจุบัน (ตรวจกับ Auth server ทุกครั้ง ไม่เชื่อ cookie อย่างเดียว) — cache ต่อ request */
export const getAuthInfo = cache(async (): Promise<AuthInfo | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const providers = (data.user.app_metadata?.providers as string[] | undefined) ?? [];
  return { id: data.user.id, email: data.user.email ?? null, hasPassword: providers.includes("email") };
});

export const getMe = cache(async (): Promise<Me | null> => {
  const info = await getAuthInfo();
  if (!info) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kg_me");
  if (error || !data) return null;
  return data as Me;
});

export const isStaff = (me: Me) => me.platform_admin || me.memberships.length > 0;
export const isStudent = (me: Me) => (me.students?.length ?? 0) > 0;

/** จำนวนแจ้งเตือนที่ยังไม่อ่าน (RLS: เห็นเฉพาะของตัวเอง) */
export const getUnreadCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("app_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
});
export const rolesOf = (me: Me) => new Set(me.memberships.map((m) => m.role));

/** หน้าแรกหลังล็อกอิน: เจ้าหน้าที่ไปหน้าทำงานตามสิทธิ์; ผู้ปกครองไปลงทะเบียน/หน้าบุตรหลาน */
export function postLoginPath(me: Me): string {
  const r = rolesOf(me);
  if (r.has("school_admin")) return "/admin";
  if (r.has("teacher")) return "/teacher";
  if (r.has("gate_staff")) return "/gate";
  if (me.platform_admin) return "/platform";
  if (isStudent(me) && !me.role) return "/student";
  return me.role === "parent" && me.onboarded ? "/home" : "/onboarding";
}

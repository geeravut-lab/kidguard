import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bangkokYmd } from "./pure";

export type ApprovedKid = { id: string; school_id: string; label: string };

/** นักเรียนที่ผู้ปกครองคนนี้ผูกและอนุมัติแล้ว (ชื่อเล่น/ชื่อ + ห้อง) */
export async function loadApprovedKids(userId: string): Promise<ApprovedKid[]> {
  const { data } = await supabaseAdmin()
    .from("guardian_links")
    .select("school_id,student_id,students(first_name,nickname,classrooms:classroom_id(name))")
    .eq("user_id", userId)
    .eq("status", "approved")
    .not("student_id", "is", null);
  return ((data ?? []) as unknown as { school_id: string; student_id: string; students: { first_name: string; nickname: string | null; classrooms: { name: string } | null } | null }[]).map((r) => ({
    id: r.student_id, school_id: r.school_id, label: `${r.students?.nickname || r.students?.first_name || "—"}${r.students?.classrooms?.name ? ` · ${r.students.classrooms.name}` : ""}`,
  }));
}

export function planDates(now: Date, lang: string, n = 7): { value: string; label: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() + i * 86400_000);
    const label = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(d);
    return { value: bangkokYmd(d), label };
  });
}

export async function loadMyPlans(studentIds: string[], dates: string[]): Promise<Record<string, string>> {
  if (!studentIds.length) return {};
  const { data } = await supabaseAdmin().from("dismissal_plans").select("student_id,plan_date,mode").in("student_id", studentIds).in("plan_date", dates);
  return Object.fromEntries((data ?? []).map((p) => [`${p.student_id}|${p.plan_date}`, p.mode]));
}

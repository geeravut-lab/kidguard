import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Claim, ClassroomOption, Person, SchoolOption, Vehicle } from "@/components/parent/sections";
import type { Lang } from "@/lib/i18n/dict";

type LinkRow = {
  id: string;
  status: Claim["status"];
  claimed_name: string;
  claimed_teacher_name: string | null;
  claimed_classroom_id: string;
  student_id: string | null;
  school_id: string;
  classrooms: { name: string } | null;
  students: { first_name: string; last_name: string; nickname: string | null } | null;
};

export type ParentData = {
  persons: Person[];
  vehicles: Vehicle[];
  claims: (Claim & { classroom_id: string; school_id: string; claimed_teacher_name: string | null; student_id: string | null })[];
  schools: SchoolOption[];
  classrooms: Record<string, ClassroomOption[]>;
  consented: boolean;
};

/** ข้อมูลของผู้ปกครองคนนี้ทั้งหมด (ผ่าน RLS ด้วยสิทธิ์ของตัวเอง) */
export async function loadParentData(supabase: SupabaseClient, userId: string, lang: Lang): Promise<ParentData> {
  const [persons, vehicles, links, schools, consent] = await Promise.all([
    supabase.from("guardian_persons").select("id,name,phone,relation,is_primary").order("created_at"),
    supabase.from("vehicles").select("id,plate,province,color,model").order("created_at"),
    supabase
      .from("guardian_links")
      .select("id,status,claimed_name,claimed_teacher_name,claimed_classroom_id,student_id,school_id,classrooms:claimed_classroom_id(name),students(first_name,last_name,nickname)")
      .order("created_at"),
    supabase.from("schools").select("id,name_th,name_en").eq("active", true).order("created_at"),
    supabase.from("consents").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "privacy"),
  ]);
  const schoolOptions: SchoolOption[] = (schools.data ?? []).map((s) => ({ id: s.id, name: lang === "en" && s.name_en ? s.name_en : s.name_th }));
  const classrooms: Record<string, ClassroomOption[]> = {};
  await Promise.all(
    schoolOptions.map(async (s) => {
      const { data } = await supabase.rpc("classroom_options", { p_school: s.id });
      classrooms[s.id] = ((data ?? []) as { id: string; name: string; teachers: string[] }[]).map((c) => ({ id: c.id, name: c.name, teachers: c.teachers }));
    }),
  );
  const rows = (links.data ?? []) as unknown as LinkRow[];
  return {
    persons: (persons.data ?? []) as Person[],
    vehicles: (vehicles.data ?? []) as Vehicle[],
    claims: rows.map((r) => ({
      id: r.id,
      status: r.status,
      claimed_name: r.claimed_name,
      claimed_teacher_name: r.claimed_teacher_name,
      classroom_id: r.claimed_classroom_id,
      student_id: r.student_id,
      school_id: r.school_id,
      classroom_name: r.classrooms?.name ?? "",
      student_label: r.students ? `${r.students.first_name} ${r.students.last_name}`.trim() : null,
    })),
    schools: schoolOptions,
    classrooms,
    consented: (consent.count ?? 0) > 0,
  };
}

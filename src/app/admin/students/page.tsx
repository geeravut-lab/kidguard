import { Card } from "@/components/parent/sections";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { ImportForm, StudentForm, StudentRowActions } from "@/components/staff/manage-forms";
import { AsyncLink } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requireSchoolRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "นักเรียน", robots: { index: false } };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/students");
  const room = (await searchParams).room;
  const { lang, t } = await getT();
  const supabase = await createClient();
  const [rooms, students] = await Promise.all([
    supabase.from("classrooms").select("id,name").eq("school_id", school.id).order("sort").order("name"),
    supabase.from("students").select("id,student_code,first_name,last_name,nickname,classroom_id,status").eq("school_id", school.id).order("first_name").limit(500),
  ]);
  const classrooms = rooms.data ?? [];
  const list = (students.data ?? []).filter((s) => !room || s.classroom_id === room);
  const roomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name ?? "—";
  const chip = (active: boolean) => cn("inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium", active ? "bg-primary text-primary-fg" : "bg-surface-2 text-ink");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHead title={t.students_title} lead={t.students_lead} school={schoolName(school, lang)} />
      <Card title={t.students_add}>
        <StudentForm classrooms={classrooms} />
      </Card>
      <Card title={t.students_import_title}>
        <ImportForm />
      </Card>
      <nav aria-label={t.students_classroom} className="flex flex-wrap gap-2">
        <AsyncLink href="/admin/students" className={chip(!room)}>
          {t.students_filter_all}
        </AsyncLink>
        {classrooms.map((c) => (
          <AsyncLink key={c.id} href={`/admin/students?room=${c.id}`} className={chip(room === c.id)}>
            {c.name}
          </AsyncLink>
        ))}
      </nav>
      {list.length === 0 && <p className="text-ink-soft">{t.students_empty}</p>}
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3" data-testid="student-row">
            <div>
              <p className="font-medium">
                {`${s.first_name} ${s.last_name}`.trim()} {s.nickname && <span className="text-ink-soft">({s.nickname})</span>}
              </p>
              <p className="text-sm text-ink-soft">
                {roomName(s.classroom_id)} {s.student_code && `· ${s.student_code}`} {s.status === "left" && `· ${t.students_status_left}`}
              </p>
            </div>
            <StudentRowActions id={s.id} classroomId={s.classroom_id} status={s.status} classrooms={classrooms} />
          </li>
        ))}
      </ul>
    </div>
  );
}

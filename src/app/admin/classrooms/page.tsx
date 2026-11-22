import { GraduationCap, UserMinus } from "lucide-react";
import { assignTeacherAction, unassignTeacherAction } from "@/app/actions/staff";
import { SelectField } from "@/components/forms/fields";
import { Card } from "@/components/parent/sections";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { ClassroomForm } from "@/components/staff/manage-forms";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requireSchoolRole } from "@/lib/auth/guards";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "ห้องเรียน", robots: { index: false } };

export default async function ClassroomsPage() {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/classrooms");
  const { lang, t } = await getT();
  const supabase = await createClient();
  const [rooms, assigned, staff, students] = await Promise.all([
    supabase.from("classrooms").select("id,name,level").eq("school_id", school.id).order("sort").order("name"),
    supabase.from("classroom_teachers").select("id,classroom_id,user_id").eq("school_id", school.id).is("ended_at", null),
    supabase.rpc("school_staff", { p_school: school.id }),
    supabase.from("students").select("classroom_id").eq("school_id", school.id).eq("status", "active"),
  ]);
  const teachers = ((staff.data ?? []) as { user_id: string; role: string; display_name: string | null }[]).filter((s) => s.role === "teacher");
  const nameOf = (uid: string) => teachers.find((x) => x.user_id === uid)?.display_name ?? t.members_unnamed;
  const count = (id: string) => (students.data ?? []).filter((s) => s.classroom_id === id).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.classroom_title} lead={t.classroom_lead} school={schoolName(school, lang)} />
      <Card title={t.classroom_add}>
        <ClassroomForm />
      </Card>
      {(rooms.data ?? []).length === 0 && <p className="text-ink-soft">{t.classroom_empty}</p>}
      <ul className="space-y-3">
        {(rooms.data ?? []).map((r) => {
          const mine = (assigned.data ?? []).filter((a) => a.classroom_id === r.id);
          const free = teachers.filter((tc) => !mine.some((m) => m.user_id === tc.user_id));
          return (
            <li key={r.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="classroom-card">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{r.name}</h2>
                <span className="text-sm text-ink-soft">{fmt(t.classroom_students_count, { n: count(r.id) })}</span>
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-sm text-ink-soft">
                  <GraduationCap className="size-4" aria-hidden="true" /> {t.classroom_teachers}
                </p>
                {mine.length === 0 ? (
                  <p className="text-sm">{t.classroom_no_teacher}</p>
                ) : (
                  <ul className="space-y-1">
                    {mine.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                        <span className="font-medium">{nameOf(m.user_id)}</span>
                        <AsyncForm action={unassignTeacherAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <SubmitButton size="sm" variant="ghost" leading={<UserMinus className="size-4" aria-hidden="true" />}>
                            {t.classroom_unassign}
                          </SubmitButton>
                        </AsyncForm>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {teachers.length === 0 ? (
                <p className="text-xs text-ink-soft">{t.classroom_need_teacher_member}</p>
              ) : (
                free.length > 0 && (
                  <AsyncForm action={assignTeacherAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="classroom" value={r.id} />
                    <div className="min-w-48 flex-1">
                      <SelectField label={t.classroom_assign} id={`assign-${r.id}`} name="teacher" defaultValue="">
                        <option value="" disabled>
                          {t.classroom_assign_choose}
                        </option>
                        {free.map((f) => (
                          <option key={f.user_id} value={f.user_id}>
                            {f.display_name ?? t.members_unnamed}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <SubmitButton variant="secondary">{t.classroom_assign}</SubmitButton>
                  </AsyncForm>
                )
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

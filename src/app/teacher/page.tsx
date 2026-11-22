import { ClaimCards, type ClaimRow, type StudentOption } from "@/components/staff/claim-cards";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { QueueBoard } from "@/components/pickup/queue-board";
import { requireSchoolRole } from "@/lib/auth/guards";
import { loadQueue } from "@/lib/pickup/queue";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "ห้องเรียนของฉัน", robots: { index: false } };

export default async function TeacherPage() {
  const { me, school } = await requireSchoolRole(["teacher"], "/teacher");
  const { lang, t } = await getT();
  const supabase = await createClient();
  const myRooms = me.classroom_ids;
  const [queue, rooms, students, claims] = await Promise.all([
    loadQueue(supabase, school.id), // ฐานข้อมูลกรองให้เหลือเฉพาะนักเรียนห้องของครูคนนี้
    myRooms.length ? supabase.from("classrooms").select("id,name").in("id", myRooms).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    // RLS: ครูเห็นเฉพาะนักเรียนในห้องที่ตัวเองเป็นครูประจำชั้น
    supabase.from("students").select("id,first_name,last_name,nickname,classroom_id").eq("status", "active").order("first_name"),
    supabase.rpc("school_claims", { p_school: school.id, p_status: "pending" }),
  ]);
  const options: StudentOption[] = (students.data ?? []).map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim(), classroom_id: s.classroom_id }));
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHead title={t.teacher_title} school={schoolName(school, lang)} />
      {myRooms.length === 0 && <p className="rounded-xl bg-warn-bg px-4 py-3 text-warn">{t.teacher_no_class}</p>}
      {myRooms.length > 0 && (
        <QueueBoard rows={queue} topics={myRooms.map((id) => `class:${id}`)} fingerprintUrl={`/api/live?scope=school&id=${school.id}`} canVerify={false} title={t.queue_teacher_title} />
      )}
      {myRooms.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.teacher_claims_title}</h2>
          <ClaimCards claims={(claims.data ?? []) as ClaimRow[]} students={options} />
        </section>
      )}
      {(rooms.data ?? []).map((r) => {
        const list = (students.data ?? []).filter((s) => s.classroom_id === r.id);
        return (
          <section key={r.id} className="space-y-2" aria-label={r.name}>
            <h2 className="text-lg font-semibold">
              {t.teacher_roster} · {r.name}
            </h2>
            {list.length === 0 ? (
              <p className="text-ink-soft">{t.teacher_roster_empty}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((s) => (
                  <li key={s.id} className="rounded-xl border border-line bg-surface px-4 py-2">
                    {`${s.first_name} ${s.last_name}`.trim()} {s.nickname && <span className="text-ink-soft">({s.nickname})</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

import { redirect } from "next/navigation";
import { CarFront, Clock3, GraduationCap } from "lucide-react";
import { ChildrenSection, StatusChip } from "@/components/parent/sections";
import { AsyncLink } from "@/components/ui";
import { StudentInviteButton } from "@/components/notify/student-invite-button";
import { requireMe } from "@/lib/auth/guards";
import { getAuthInfo, postLoginPath } from "@/lib/auth/me";
import { getT } from "@/lib/i18n/server";
import { loadParentData } from "@/lib/parent-data";
import { PlanForm } from "@/components/parent/safety-forms";
import { Card } from "@/components/parent/sections";
import { featureEnabled } from "@/lib/flags/server";
import { loadApprovedKids, loadMyPlans, planDates } from "@/lib/safety/parent";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "บุตรหลานของฉัน", robots: { index: false } };

export default async function ParentHomePage() {
  const me = await requireMe("/home");
  if (me.role !== "parent") redirect(postLoginPath(me));
  if (!me.onboarded) redirect("/onboarding");
  const { lang, t } = await getT();
  const supabase = await createClient();
  const info = await getAuthInfo();
  const data = await loadParentData(supabase, info!.id, lang);
  const approved = data.claims.filter((c) => c.status === "approved");
  const others = data.claims.filter((c) => c.status !== "approved");

  const { data: settings } = await supabase.from("schools").select("id, lat, lng").in("id", [...new Set(data.claims.map((c) => c.school_id))]);
  const notReady = (settings ?? []).some((s) => s.lat == null);
  const planOn = approved.length > 0 && (await featureEnabled("advance_notice"));
  const kids = planOn ? await loadApprovedKids(info!.id) : [];
  const dates = planDates(new Date(), lang);
  const mine = planOn ? await loadMyPlans(kids.map((k) => k.id), dates.map((d) => d.value)) : {};

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{t.home_parent_title}</h1>

      {approved.length > 0 && (
        <AsyncLink href="/pickup" className="flex items-center gap-3 rounded-2xl bg-primary p-5 text-lg font-semibold text-primary-fg hover:bg-primary-strong">
          <CarFront className="size-7" aria-hidden="true" /> {t.pickup_start_button}
        </AsyncLink>
      )}
      {approved.length > 0 && notReady && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">
          <Clock3 className="size-4" aria-hidden="true" /> {t.home_school_not_ready}
        </p>
      )}

      {approved.length === 0 && others.length === 0 && <p className="text-ink-soft">{t.home_parent_empty}</p>}

      <ul className="space-y-3">
        {approved.map((c) => {
          const teachers = data.classrooms[c.school_id]?.find((r) => r.id === c.classroom_id)?.teachers ?? [];
          return (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{c.student_label ?? c.claimed_name}</p>
                  <p className="text-ink-soft">{c.classroom_name}</p>
                </div>
                <StatusChip status="approved" />
              </div>
              <p className="mt-2 flex items-center gap-2 text-sm">
                <GraduationCap className="size-4 text-primary" aria-hidden="true" />
                <span className="text-ink-soft">{t.home_homeroom}:</span> {teachers.length ? teachers.join(", ") : t.teacher_step_none}
              </p>
              {c.student_id && <div className="mt-2"><StudentInviteButton studentId={c.student_id} /></div>}
            </li>
          );
        })}
      </ul>

      {planOn && kids.length > 0 && (
        <Card title={t.plans_title} lead={t.plans_lead}>
          {[...new Set(kids.map((k) => k.school_id))].map((sid) => (
            <PlanForm key={sid} school={sid} students={kids.filter((k) => k.school_id === sid).map((k) => ({ id: k.id, label: k.label }))} dates={dates} current={mine} />
          ))}
        </Card>
      )}

      <ChildrenSection claims={others} schools={data.schools} classrooms={data.classrooms} />
    </div>
  );
}

import { AnalyticsView, DAY_CHOICES, DaysPicker } from "@/components/admin/analytics-view";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { loadAnalytics, loadQueueStats } from "@/lib/analytics/server";
import { requireSchoolRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "สถิติ", robots: { index: false } };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/analytics");
  const { lang, t } = await getT();
  const d = Number((await searchParams).days);
  const days = (DAY_CHOICES as readonly number[]).includes(d) ? d : 30;
  const [a, q] = await Promise.all([loadAnalytics(days, school.id), loadQueueStats(days, school.id)]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHead title={t.analytics_title} lead={t.analytics_lead} school={schoolName(school, lang)} actions={<DaysPicker base="/admin/analytics" days={days} t={t} />} />
      <AnalyticsView a={a} q={q} t={t} failed={a.failed || q.failed} />
    </div>
  );
}

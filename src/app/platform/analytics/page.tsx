import { AnalyticsView, DAY_CHOICES, DaysPicker } from "@/components/admin/analytics-view";
import { PageHead } from "@/components/staff/page-head";
import { loadAnalytics, loadQueueStats } from "@/lib/analytics/server";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "สถิติทั้งระบบ", robots: { index: false } };

export default async function PlatformAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePlatformAdmin("/platform/analytics");
  const { t } = await getT();
  const d = Number((await searchParams).days);
  const days = (DAY_CHOICES as readonly number[]).includes(d) ? d : 30;
  const [a, q] = await Promise.all([loadAnalytics(days, null), loadQueueStats(days, null)]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHead title={t.nav_platform_analytics} lead={t.analytics_lead} actions={<DaysPicker base="/platform/analytics" days={days} t={t} />} />
      <AnalyticsView a={a} q={q} t={t} failed={a.failed || q.failed} />
    </div>
  );
}

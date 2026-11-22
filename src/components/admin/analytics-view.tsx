import { Card } from "@/components/parent/sections";
import { AsyncLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { buildFunnel, retentionRate, type Analytics, type QueueStats } from "@/lib/analytics/events";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { cn } from "@/lib/cn";

export const DAY_CHOICES = [7, 30, 90] as const;

function Stat({ label, value, testid }: { label: string; value: string | number; testid?: string }) {
  return (
    <div className="rounded-xl border border-line p-4" data-testid={testid}>
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** แท่งกราฟแนวตั้งอย่างง่าย (ไม่พึ่งไลบรารี) — ความสูงสัมพันธ์กับค่ามากสุด; มีตารางตัวเลขสำหรับโปรแกรมอ่านหน้าจอ */
function Bars({ items, label }: { items: { key: string; n: number; label?: string }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <figure aria-label={label}>
      <div className="flex h-28 items-end gap-0.5" aria-hidden="true">
        {items.map((i) => (
          <div key={i.key} title={`${i.label ?? i.key}: ${i.n}`} className="flex-1 rounded-t bg-primary/80" style={{ height: `${Math.max(i.n ? 4 : 1, Math.round((i.n / max) * 100))}%` }} />
        ))}
      </div>
      <figcaption className="sr-only">{items.map((i) => `${i.label ?? i.key}: ${i.n}`).join(", ")}</figcaption>
    </figure>
  );
}

const fmtDur = (t: Dict, s: number | null) => (s == null ? "—" : s < 90 ? fmt(t.analytics_seconds, { n: s }) : fmt(t.analytics_minutes, { n: Math.round(s / 60) }));

export function DaysPicker({ base, days, t }: { base: string; days: number; t: Dict }) {
  return (
    <nav aria-label={t.analytics_days} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-soft">{t.analytics_days}</span>
      {DAY_CHOICES.map((d) => (
        <AsyncLink key={d} href={`${base}?days=${d}`} aria-current={d === days ? "true" : undefined} className={cn(buttonVariants({ variant: d === days ? "primary" : "secondary", size: "sm" }))}>
          {fmt(t.analytics_days_n, { n: d })}
        </AsyncLink>
      ))}
    </nav>
  );
}

export function AnalyticsView({ a, q, t, failed }: { a: Analytics; q: QueueStats; t: Dict; failed: boolean }) {
  const funnel = buildFunnel(a.funnel);
  const pct = (r: { eligible: number; returned: number }) => {
    const v = retentionRate(r);
    return v == null ? t.analytics_retention_na : `${v}% (${r.returned}/${r.eligible})`;
  };
  const evLabel = (e: string) => (t as Record<string, string>)[`event_${e}`] ?? e;
  const hours = Array.from({ length: 24 }, (_, h) => ({ key: String(h), n: q.by_hour.find((x) => x.hour === h)?.n ?? 0, label: `${h}:00` }));
  const wdays = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ key: String(d), n: q.by_weekday.find((x) => x.dow === d)?.n ?? 0, label: (t as Record<string, string>)[`analytics_wd_${d}`] }));
  return (
    <div className="space-y-6">
      {failed && (
        <p role="alert" className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {t.analytics_failed}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.analytics_dau} value={a.dau} testid="stat-dau" />
        <Stat label={t.analytics_wau} value={a.wau} />
        <Stat label={t.analytics_mau} value={a.mau} />
        <Stat label={t.analytics_users} value={a.users_total} />
      </div>
      <Card title={t.analytics_daily}>
        <Bars label={t.analytics_daily} items={a.daily.map((d) => ({ key: d.day, n: d.n }))} />
      </Card>

      <Card title={t.analytics_queue}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t.analytics_q_total} value={q.total} testid="stat-q-total" />
          <Stat label={t.analytics_q_completed} value={q.completed} />
          <Stat label={t.analytics_q_cancelled} value={q.cancelled} />
          <Stat label={t.analytics_q_expired} value={q.expired} />
          <Stat label={t.analytics_q_students} value={q.students_released} />
          <Stat label={t.analytics_q_by_parent} value={q.by_parent} />
          <Stat label={t.analytics_q_by_staff} value={q.by_staff} />
          <Stat label={t.analytics_q_verified} value={q.verified} />
          <Stat label={t.analytics_q_manual} value={q.manual_arrival} />
        </div>
        <div>
          <h3 className="mb-2 font-medium">{t.analytics_q_wait}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t.analytics_q_wait_avg} value={fmtDur(t, q.wait_avg_s)} />
            <Stat label={t.analytics_q_wait_p50} value={fmtDur(t, q.wait_p50_s)} />
            <Stat label={t.analytics_q_wait_p90} value={fmtDur(t, q.wait_p90_s)} />
          </div>
        </div>
        <div>
          <h3 className="mb-2 font-medium">{t.analytics_q_hours}</h3>
          <Bars label={t.analytics_q_hours} items={hours} />
        </div>
        <div>
          <h3 className="mb-2 font-medium">{t.analytics_q_weekdays}</h3>
          <Bars label={t.analytics_q_weekdays} items={wdays} />
        </div>
      </Card>

      <Card title={t.analytics_funnel} lead={t.analytics_funnel_note}>
        <ol className="space-y-3">
          {funnel.map((f) => (
            <li key={f.step}>
              <div className="flex justify-between text-sm">
                <span>{evLabel(f.step)}</span>
                <span className="tabular-nums">
                  {f.users}
                  {f.pct != null ? ` · ${f.pct}%` : ""}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-surface-2" aria-hidden="true">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${f.bar}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title={t.analytics_retention}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label={t.analytics_retention_d1} value={pct(a.retention.d1)} />
          <Stat label={t.analytics_retention_d7} value={pct(a.retention.d7)} />
        </div>
      </Card>

      <Card title={t.analytics_events}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="py-2 text-start">{t.analytics_events}</th>
              <th className="py-2 text-end">{t.analytics_col_times}</th>
              <th className="py-2 text-end">{t.analytics_col_people}</th>
            </tr>
          </thead>
          <tbody>
            {a.events.map((e) => (
              <tr key={e.event} className="border-b border-line/60">
                <td className="py-2">{evLabel(e.event)}</td>
                <td className="py-2 text-end tabular-nums">{e.count}</td>
                <td className="py-2 text-end tabular-nums">{e.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

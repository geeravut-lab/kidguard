import { notFound } from "next/navigation";
import { revokeTvAction } from "@/app/actions/safety";
import { TvForm } from "@/components/admin/safety-admin-forms";
import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate, schoolName } from "@/components/staff/page-head";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requireSchoolRole } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/flags/server";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { loadZones } from "@/lib/safety/read";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "จอ TV", robots: { index: false } };

export default async function TvAdminPage() {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/tv");
  if (!(await featureEnabled("tv_mode"))) notFound();
  const { lang, t } = await getT();
  const [zones, { data: tvs }] = await Promise.all([
    loadZones(school.id),
    supabaseAdmin().from("tv_displays").select("id,name,last_seen_at,zones:zone_id(name)").eq("school_id", school.id).order("created_at"),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.tv_title} lead={t.tv_lead} school={schoolName(school, lang)} />
      <Card title={t.tv_add}><TvForm zones={zones.map((z) => ({ id: z.id, name: z.name }))} /></Card>
      <Card title={t.tv_list}>
        {(tvs ?? []).length === 0 ? <p className="text-ink-soft">{t.tv_empty}</p> : (
          <ul className="space-y-2" data-testid="tv-list">
            {((tvs ?? []) as unknown as { id: string; name: string; last_seen_at: string | null; zones: { name: string } | null }[]).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3" data-tv={d.name}>
                <div>
                  <p className="font-medium">{d.name} {d.zones?.name && <span className="text-ink-soft">· {d.zones.name}</span>}</p>
                  <p className="text-sm text-ink-soft">{d.last_seen_at ? fmt(t.tv_last_seen, { at: fmtDate(d.last_seen_at, lang) }) : t.tv_never_seen}</p>
                </div>
                <AsyncForm action={revokeTvAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <SubmitButton size="sm" variant="ghost">{t.tv_revoke}</SubmitButton>
                </AsyncForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

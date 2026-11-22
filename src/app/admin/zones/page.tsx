import { assignClassroomZoneAction, toggleZoneAction } from "@/app/actions/safety";
import { ZoneForm } from "@/components/admin/safety-admin-forms";
import { Card } from "@/components/parent/sections";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requireSchoolRole } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { loadZones } from "@/lib/safety/read";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";

export const metadata = { title: "ประตู/โซน", robots: { index: false } };

export default async function ZonesPage() {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/zones");
  if (!(await featureEnabled("zones"))) notFound();
  const { lang, t } = await getT();
  const zones = await loadZones(school.id, false);
  const { data: rooms } = await supabaseAdmin().from("classrooms").select("id,name,zone_id").eq("school_id", school.id).eq("active", true).order("sort").order("name");
  const active = zones.filter((z) => z.active);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.zones_title} lead={t.zones_lead} school={schoolName(school, lang)} />
      <Card title={t.zones_add}><ZoneForm /></Card>
      <Card title={t.zones_list}>
        {zones.length === 0 ? <p className="text-ink-soft">{t.zones_empty}</p> : (
          <ul className="space-y-2" data-testid="zone-list">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3" data-zone={z.name}>
                <span className="font-medium">{z.name} {!z.active && <span className="text-ink-soft">{t.zones_inactive}</span>}</span>
                <AsyncForm action={toggleZoneAction}>
                  <input type="hidden" name="id" value={z.id} />
                  <input type="hidden" name="active" value={z.active ? "false" : "true"} />
                  <SubmitButton size="sm" variant="ghost">{z.active ? t.zones_deactivate : t.zones_activate}</SubmitButton>
                </AsyncForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {active.length > 0 && (
        <Card title={t.zones_assign}>
          <ul className="space-y-2">
            {(rooms ?? []).map((r) => (
              <li key={r.id}>
                <AsyncForm action={assignClassroomZoneAction} className="flex flex-wrap items-center gap-3" data-room={r.name}>
                  <input type="hidden" name="classroom" value={r.id} />
                  <span className="w-28 font-medium">{r.name}</span>
                  <select name="zone" defaultValue={r.zone_id ?? ""} aria-label={`${t.zones_assign} ${r.name}`} className="min-h-11 rounded-xl border border-line bg-surface px-3">
                    <option value="">{t.zones_none}</option>
                    {active.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                  <SubmitButton size="sm" variant="secondary">{t.zones_assign_save}</SubmitButton>
                </AsyncForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

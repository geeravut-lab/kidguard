import { PageHead, schoolName } from "@/components/staff/page-head";
import { SettingsForm } from "@/components/staff/manage-forms";
import { requireSchoolRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SafetySettingsForm } from "@/components/admin/safety-admin-forms";
import { Card } from "@/components/parent/sections";
import { loadSafetyCfg } from "@/lib/safety/server";

export const metadata = { title: "ตั้งค่าโรงเรียน", robots: { index: false } };

const hhmm = (v: string | null) => (v ? v.slice(0, 5) : "");

export default async function SettingsPage() {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/settings");
  const { lang, t } = await getT();
  const supabase = await createClient();
  const [s, cfg] = await Promise.all([
    supabase.from("schools").select("name_th,name_en,short_name,lat,lng").eq("id", school.id).single(),
    supabase.from("school_settings").select("*").eq("school_id", school.id).single(),
  ]);
  if (!s.data || !cfg.data) notFound();
  const c = cfg.data;
  const safety = await loadSafetyCfg(school.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title={t.settings_title} lead={t.settings_lead} school={schoolName(school, lang)} />
      <SettingsForm
        v={{
          name_th: s.data.name_th, name_en: s.data.name_en ?? "", short_name: s.data.short_name ?? "",
          lat: s.data.lat?.toString() ?? "", lng: s.data.lng?.toString() ?? "",
          checkin_radius_m: c.checkin_radius_m, arrive_radius_m: c.arrive_radius_m, student_alert_min: c.student_alert_min,
          student_dashboard_enabled: c.student_dashboard_enabled, checkin_start: hhmm(c.checkin_start), checkin_end: hhmm(c.checkin_end),
          checkin_ttl_min: c.checkin_ttl_min, stale_location_sec: c.stale_location_sec, late_pickup_min: c.late_pickup_min,
        }}
      />
      <div className="mt-6">
        <Card title={t.settings_safety_title}>
          <SafetySettingsForm dismissal={hhmm(safety.dismissal_time)} voice={safety.voice_enabled} tvArriving={safety.tv_show_arriving} />
        </Card>
      </div>
    </div>
  );
}

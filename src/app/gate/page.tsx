import { PageHead, schoolName } from "@/components/staff/page-head";
import { PassCheck } from "@/components/pickup/pass-check";
import { PlansToday } from "@/components/pickup/plans-today";
import { QueueBoard } from "@/components/pickup/queue-board";
import { requireSchoolRole } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";
import { getSchoolFingerprint } from "@/lib/live/fingerprint";
import { loadQueue } from "@/lib/pickup/queue";
import { loadBoardExtras, loadPlansToday } from "@/lib/safety/read";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "จอประตูโรงเรียน", robots: { index: false } };

export default async function GatePage() {
  const { school } = await requireSchoolRole(["gate_staff", "school_admin"], "/gate");
  const { lang, t } = await getT();
  const fp = await getSchoolFingerprint(school.id); // ก่อนอ่านข้อมูลคิว
  const supabase = await createClient();
  const [rows, extras, plans, passes] = await Promise.all([loadQueue(supabase, school.id), loadBoardExtras(school.id), loadPlansToday(supabase, school.id), featureEnabled("pickup_passes")]);
  const showPlans = await featureEnabled("advance_notice");
  return (
    <div className="space-y-6">
      <PageHead title={t.gate_title} school={schoolName(school, lang)} />
      <QueueBoard rows={rows} topics={[`school:${school.id}`]} fingerprintUrl={`/api/live?scope=school&id=${school.id}`} canVerify initial={fp} zones={extras.zones} canMoveZone paused={extras.paused} voice={extras.voice} />
      {passes && <PassCheck />}
      {showPlans && <PlansToday plans={plans} t={t} />}
    </div>
  );
}

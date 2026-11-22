import { PageHead, schoolName } from "@/components/staff/page-head";
import { QueueBoard } from "@/components/pickup/queue-board";
import { requireSchoolRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { loadQueue } from "@/lib/pickup/queue";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "จอประตูโรงเรียน", robots: { index: false } };

export default async function GatePage() {
  const { school } = await requireSchoolRole(["gate_staff", "school_admin"], "/gate");
  const { lang, t } = await getT();
  const rows = await loadQueue(await createClient(), school.id);
  return (
    <div>
      <PageHead title={t.gate_title} school={schoolName(school, lang)} />
      <QueueBoard rows={rows} topics={[`school:${school.id}`]} fingerprintUrl={`/api/live?scope=school&id=${school.id}`} canVerify />
    </div>
  );
}

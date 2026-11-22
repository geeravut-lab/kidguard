import { PageHead, schoolName } from "@/components/staff/page-head";
import { requireSchoolRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { GatePreview } from "@/app/preview/gate/gate-preview";

export const metadata = { title: "จอประตูโรงเรียน", robots: { index: false } };

export default async function GatePage() {
  const { school } = await requireSchoolRole(["gate_staff", "school_admin"], "/gate");
  const { lang, t } = await getT();
  return (
    <div>
      <PageHead title={t.gate_title} school={schoolName(school, lang)} />
      <p className="mb-4 rounded-xl bg-warn-bg px-4 py-2 text-sm text-warn">{t.gate_soon}</p>
      <GatePreview />
    </div>
  );
}

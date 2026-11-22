import { BackLink } from "@/components/shell/back-link";
import { getT } from "@/lib/i18n/server";
import { GatePreview } from "./gate-preview";

export const metadata = { title: "ตัวอย่าง: จอประตูโรงเรียน" };

export default async function GatePreviewPage() {
  const { t } = await getT();
  return (
    <div>
      <BackLink href="/" labelKey="nav_home" t={t} />
      <p className="mb-4 rounded-xl bg-warn-bg px-4 py-2 text-sm text-warn">{t.common_sample_notice}</p>
      <GatePreview />
    </div>
  );
}

import { BackLink } from "@/components/shell/back-link";
import { getT } from "@/lib/i18n/server";
import { ParentPreview } from "./parent-preview";

export const metadata = { title: "ตัวอย่าง: มุมผู้ปกครอง" };

export default async function ParentPreviewPage() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/" labelKey="nav_home" t={t} />
      <p className="mb-4 rounded-xl bg-warn-bg px-4 py-2 text-sm text-warn">{t.common_sample_notice}</p>
      <ParentPreview />
    </div>
  );
}

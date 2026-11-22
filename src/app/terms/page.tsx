import { getT } from "@/lib/i18n/server";

export const metadata = { title: "ข้อตกลงการใช้งาน" };

export default async function TermsPage() {
  const { t } = await getT();
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{t.terms_title}</h1>
      <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">{t.privacy_draft}</p>
      <p className="text-ink-soft">{t.terms_p1}</p>
    </article>
  );
}

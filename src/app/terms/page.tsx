import { getT } from "@/lib/i18n/server";

export const metadata = { title: "ข้อตกลงการใช้งาน" };

export default async function TermsPage() {
  const { t } = await getT();
  const sections = [
    [t.terms_title, t.terms_p1],
    [t.terms_h2, t.terms_p2],
    [t.terms_h3, t.terms_p3],
    [t.terms_h4, t.terms_p4],
  ] as const;
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{t.terms_title}</h1>
      <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">{t.privacy_draft}</p>
      <p className="text-ink-soft">{t.terms_p1}</p>
      {sections.slice(1).map(([h, p]) => (
        <section key={h} className="space-y-1">
          <h2 className="text-lg font-semibold">{h}</h2>
          <p className="text-ink-soft">{p}</p>
        </section>
      ))}
    </article>
  );
}

import { fmt } from "@/lib/i18n/dict";
import { PRIVACY_VERSION } from "@/lib/consent";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "นโยบายความเป็นส่วนตัว" };

export default async function PrivacyPage() {
  const { t } = await getT();
  const sections = [
    [t.privacy_h5, t.privacy_p5],
    [t.privacy_h1, t.privacy_p1],
    [t.privacy_h2, t.privacy_p2],
    [t.privacy_h3, t.privacy_p3],
    [t.privacy_h6, t.privacy_p6],
    [t.privacy_h7, t.privacy_p7],
    [t.privacy_h8, t.privacy_p8],
    [t.privacy_h9, t.privacy_p9],
    [t.privacy_h4, t.privacy_p4],
    [t.privacy_h10, t.privacy_p10],
  ] as const;
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{t.privacy_title}</h1>
      <p className="text-sm text-ink-soft">{fmt(t.privacy_version, { version: PRIVACY_VERSION })}</p>
      <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">{t.privacy_draft}</p>
      {sections.map(([h, p]) => (
        <section key={h} className="space-y-1">
          <h2 className="text-lg font-semibold">{h}</h2>
          <p className="text-ink-soft">{p}</p>
        </section>
      ))}
    </article>
  );
}

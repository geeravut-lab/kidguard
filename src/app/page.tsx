import { Lock, MapPinned, ShieldCheck, UsersRound } from "lucide-react";
import { AsyncLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { InstallApp } from "@/components/shell/install-app";
import { getT } from "@/lib/i18n/server";

export default async function HomePage() {
  const { t } = await getT();
  const steps = [
    { icon: MapPinned, title: t.home_step1_title, body: t.home_step1_body },
    { icon: UsersRound, title: t.home_step2_title, body: t.home_step2_body },
    { icon: ShieldCheck, title: t.home_step3_title, body: t.home_step3_body },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-primary-soft/20 via-surface to-surface p-6 md:p-10">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-medium text-primary ring-1 ring-line">
          <ShieldCheck className="size-4" aria-hidden="true" /> {t.home_badge}
        </p>
        <h1 className="text-3xl font-bold leading-snug md:text-4xl">{t.home_title}</h1>
        <p className="mt-3 text-lg text-ink-soft">{t.home_lead}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <AsyncLink href="/preview/parent" className={buttonVariants({ variant: "primary", size: "lg" })}>
            {t.home_cta_parent}
          </AsyncLink>
          <AsyncLink href="/preview/gate" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            {t.home_cta_gate}
          </AsyncLink>
        </div>
      </section>

      <section aria-label={t.home_status_title} className="rounded-2xl border border-line bg-warn-bg p-4 text-warn">
        <p className="font-semibold">{t.home_status_title}</p>
        <p className="text-sm">{t.home_status_body}</p>
      </section>

      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className="rounded-2xl border border-line bg-surface p-5">
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-primary">
              <s.icon className="size-6" aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
        <Lock className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold">{t.home_privacy_title}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t.home_privacy_body}</p>
        </div>
      </section>

      <InstallApp />
    </div>
  );
}

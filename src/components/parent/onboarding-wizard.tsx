"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { finishOnboardingAction } from "@/app/actions/parent";
import { FormMessage } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import type { ParentData } from "@/lib/parent-data";
import { Card, ChildrenSection, ClaimsList, PersonsSection, VehiclesSection } from "./sections";

export function OnboardingWizard({ data }: { data: ParentData }) {
  const { t } = useI18n();
  const live = data.claims.filter((c) => c.status !== "rejected");
  const done1 = data.persons.length > 0 && data.vehicles.length > 0;
  const done2 = live.length > 0;
  const firstOpen = !done1 ? 1 : !done2 ? 2 : 3;
  const [step, setStep] = useState(firstOpen);
  const { state, action, ref } = useFormAction(finishOnboardingAction);

  const steps = [t.onb_step1, t.onb_step2, t.onb_step3, t.onb_step4];
  const canNext = step === 1 ? done1 : step === 2 ? done2 : true;
  const hint = step === 1 && !done1 ? (data.persons.length === 0 ? t.onb_need_person : t.onb_need_vehicle) : step === 2 && !done2 ? t.onb_need_child : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t.onb_title}</h1>
        <p className="text-ink-soft">{t.onb_lead}</p>
      </header>

      <ol className="grid grid-cols-4 gap-2" aria-label={t.onb_title}>
        {steps.map((label, i) => {
          const n = i + 1;
          const complete = (n === 1 && done1) || (n === 2 && done2) || n < step;
          return (
            <li key={n} aria-current={n === step ? "step" : undefined} className="text-center">
              <span
                className={cn(
                  "mx-auto flex size-9 items-center justify-center rounded-full text-sm font-bold",
                  n === step ? "bg-primary text-primary-fg" : complete ? "bg-success-bg text-success" : "bg-surface-2 text-ink-soft",
                )}
              >
                {complete && n !== step ? <Check className="size-5" aria-hidden="true" /> : n}
              </span>
              <span className="mt-1 block text-xs text-ink-soft">{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <>
          <PersonsSection persons={data.persons} />
          <VehiclesSection vehicles={data.vehicles} />
        </>
      )}
      {step === 2 && <ChildrenSection claims={data.claims} schools={data.schools} classrooms={data.classrooms} />}
      {step === 3 && (
        <Card title={t.teacher_step_title} lead={t.teacher_step_lead}>
          <ul className="space-y-2">
            {live.map((c) => {
              const teachers = data.classrooms[c.school_id]?.find((r) => r.id === c.classroom_id)?.teachers ?? [];
              return (
                <li key={c.id} className="rounded-xl border border-line p-3">
                  <p className="font-medium">{c.student_label ?? c.claimed_name}</p>
                  <p className="text-sm text-ink-soft">{c.classroom_name}</p>
                  <p className="mt-1 text-sm">
                    <span className="text-ink-soft">{t.home_homeroom}: </span>
                    <span className="font-semibold">{teachers.length ? teachers.join(", ") : (c.claimed_teacher_name ?? t.teacher_step_none)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {step === 4 && (
        <Card title={t.consent_title} lead={t.consent_lead}>
          <ul className="list-disc space-y-2 ps-5 text-sm">
            <li>{t.consent_point1}</li>
            <li>{t.consent_point2}</li>
            <li>{t.consent_point3}</li>
          </ul>
          <p className="text-sm">
            <Link href="/privacy" target="_blank" className="font-medium text-primary underline">
              {t.consent_read}
            </Link>
          </p>
          <AsyncForm ref={ref} action={action} className="space-y-4">
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" name="accept" className="mt-0.5 size-5 shrink-0 accent-[var(--kg-primary)]" required />
              <span>{t.consent_accept}</span>
            </label>
            <FormMessage state={state} />
            <SubmitButton size="lg" className="w-full">
              {t.onb_finish}
            </SubmitButton>
          </AsyncForm>
          <ClaimsList claims={live} />
        </Card>
      )}

      {hint && <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">{hint}</p>}

      <div className="flex justify-between gap-3">
        {step > 1 ? (
          <AsyncButton variant="secondary" onClick={() => setStep(step - 1)}>
            {t.onb_back}
          </AsyncButton>
        ) : (
          <span />
        )}
        {step < 4 && (
          <AsyncButton onClick={() => setStep(step + 1)} disabled={!canNext}>
            {t.onb_next}
          </AsyncButton>
        )}
      </div>
      <p className="text-center text-xs text-ink-soft">{fmt(t.onb_step, { n: step })} / 4</p>
    </div>
  );
}

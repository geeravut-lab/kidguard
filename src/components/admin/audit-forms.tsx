"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { purgeAuditAction, saveAuditSwitchesAction } from "@/app/actions/admin";
import { FormMessage, SelectField, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncForm, Button, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { kindLabel } from "@/lib/audit/kinds";

type Opt = { value: string; label: string };

/** ตัวกรอง: ส่งเป็น query string (ลิงก์แชร์/CSV ใช้ตัวกรองเดียวกัน); สปินเนอร์ขณะโหลดผลใหม่ */
export function AuditFilterForm({ values, groups, schools, base }: { values: Record<string, string>; groups: Opt[]; schools: Opt[] | null; base: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v.trim()) p.set(k, v.trim());
    start(() => router.push(`${base}${p.size ? `?${p}` : ""}`));
  }
  return (
    <AsyncForm onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t.audit_filter}>
      <TextField label={t.audit_from} name="from" type="date" defaultValue={values.from ?? ""} />
      <TextField label={t.audit_to} name="to" type="date" defaultValue={values.to ?? ""} />
      <SelectField label={t.audit_group} id="f-group" name="group" defaultValue={values.group ?? ""}>
        <option value="">{t.audit_group_all}</option>
        {groups.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </SelectField>
      {schools && (
        <SelectField label={t.audit_school} id="f-school" name="school" defaultValue={values.school ?? ""}>
          <option value="">{t.audit_school_all}</option>
          {schools.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label={t.audit_actor} name="actor" defaultValue={values.actor ?? ""} maxLength={36} autoComplete="off" />
      <div className="flex items-end gap-2">
        <Button type="submit" variant="primary" busy={pending} busyLabel={t.common_loading}>
          {t.audit_filter_apply}
        </Button>
      </div>
    </AsyncForm>
  );
}

export function AuditSwitchesForm({ scope, enabled, groups, off }: { scope: "platform" | "school"; enabled: boolean; groups: string[]; off: string[] }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(saveAuditSwitchesAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-4">
      <input type="hidden" name="scope" value={scope} />
      <label className="flex min-h-12 items-center gap-3 font-medium">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5" />
        {t.audit_switch_enabled}
      </label>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm text-ink-soft">{t.audit_switch_hint}</legend>
        {groups.map((g) => (
          <label key={g} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3">
            <input type="checkbox" name="keep" value={g} defaultChecked={!off.includes(g)} className="size-5" />
            <span>{kindLabel(t as Record<string, string>, g)}</span>
          </label>
        ))}
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{t.audit_switches_save}</SubmitButton>
    </AsyncForm>
  );
}

export function PurgeForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(purgeAuditAction);
  const rows = state?.ok ? (state.data as { rows?: number } | undefined)?.rows : undefined;
  return (
    <AsyncForm ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <TextField label={t.audit_purge_confirm} name="confirm" autoComplete="off" className="max-w-48" />
      <SubmitButton variant="danger">{t.audit_purge_run}</SubmitButton>
      <div className="basis-full">
        <FormMessage state={state} />
        {rows !== undefined && <p className="text-sm text-ink-soft">{rows}</p>}
      </div>
    </AsyncForm>
  );
}

"use client";

import { saveRuleAction } from "@/app/actions/admin";
import { FormMessage, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export type RuleView = { key: string; title: string; desc: string; enabled: boolean; params: { name: string; label: string; value: number }[]; lastRun: string };

export function RuleForm({ r }: { r: RuleView }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(saveRuleAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3" data-testid={`rule-${r.key}`}>
      <input type="hidden" name="key" value={r.key} />
      <div>
        <p className="text-sm text-ink-soft">{r.desc}</p>
        <p className="mt-1 text-xs text-ink-soft">{r.lastRun}</p>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="enabled" defaultChecked={r.enabled} className="size-5" />
        {t.rules_enabled}
      </label>
      {r.params.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {r.params.map((p) => (
            <TextField key={p.name} label={p.label} name={`p_${p.name}`} type="number" inputMode="numeric" min={0} max={10000} defaultValue={p.value} required />
          ))}
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="sm">
        {t.rules_save}
      </SubmitButton>
    </AsyncForm>
  );
}

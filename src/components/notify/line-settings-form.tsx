"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { saveLineSettingsAction, testLineConnectionAction } from "@/app/actions/notify";
import { FormMessage, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";

export type LineStatus = { configured: boolean; enabled: boolean; basic_id: string | null; monthly_quota: number; sent_this_month: number; last_error: string | null; paused_until: string | null; last_verified_at: string | null; has_secret: boolean; has_token: boolean };

export function LineSettingsForm({ status, webhookUrl, pausedText, verifiedText }: { status: LineStatus; webhookUrl: string; pausedText: string | null; verifiedText: string | null }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(saveLineSettingsAction);
  const [testState, testAction] = useActionState(testLineConnectionAction, null);
  const [copied, setCopied] = useState(false);
  const testMsg = testState?.ok && testState.message ? fmt((t as Record<string, string>)[testState.message] ?? "", { real: String(testState.data?.real ?? "") }) : null;
  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-5" aria-label={t.line_admin_status}>
        <p className="font-semibold">{t.line_admin_status}: <span data-testid="line-config-status" className={status.configured ? "text-success" : "text-warn"}>{status.configured ? t.line_admin_configured : t.line_admin_not_configured}</span></p>
        <p className="text-sm text-ink-soft" data-testid="line-sent">{fmt(t.line_admin_sent, { n: status.sent_this_month, quota: status.monthly_quota })}</p>
        {pausedText && <p role="alert" className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">{pausedText}</p>}
        {status.last_error && !pausedText && <p className="text-sm text-warn">{fmt(t.line_admin_last_error, { error: status.last_error })}</p>}
        {verifiedText && <p className="text-xs text-ink-soft">{verifiedText}</p>}
        <div className="space-y-1.5 pt-1">
          <p className="text-sm font-medium">{t.line_admin_webhook}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-surface-2 px-3 py-2 text-sm" data-testid="line-webhook">{webhookUrl}</code>
            <AsyncButton variant="secondary" size="sm" leading={<Copy className="size-4" aria-hidden="true" />} onClick={async () => { await navigator.clipboard?.writeText(webhookUrl).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>{copied ? t.line_copied : t.line_copy}</AsyncButton>
          </div>
        </div>
        <p className="text-xs text-ink-soft">{t.line_admin_steps}</p>
      </section>

      <AsyncForm ref={ref} action={action} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <TextField label={t.line_admin_basic_id} name="basic_id" defaultValue={status.basic_id ?? ""} required maxLength={41} autoComplete="off" />
        <TextField label={t.line_admin_secret} name="secret" type="password" autoComplete="off" maxLength={200} hint={status.has_secret ? t.line_admin_secret_keep : undefined} />
        <TextField label={t.line_admin_token} name="token" type="password" autoComplete="off" maxLength={500} hint={status.has_token ? t.line_admin_secret_keep : undefined} />
        <TextField label={t.line_admin_quota} name="quota" type="number" min={0} max={1000000} defaultValue={status.monthly_quota} required />
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={status.enabled} className="size-5 accent-[var(--kg-primary)]" /> {t.line_admin_enabled}
        </label>
        <FormMessage state={state} />
        <SubmitButton>{t.line_admin_save}</SubmitButton>
      </AsyncForm>

      <AsyncForm action={testAction} className="space-y-2">
        <SubmitButton variant="secondary" disabled={!status.has_token}>{t.line_admin_test}</SubmitButton>
        {testMsg && <p role="status" data-testid="line-test-result" className="text-sm font-medium">{testMsg}</p>}
        {testState && !testState.ok && <FormMessage state={testState} />}
      </AsyncForm>
    </div>
  );
}

"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { addCustodyFlagAction, createTvAction, createZoneAction, saveSafetySettingsAction, sendBroadcastAction } from "@/app/actions/safety";
import { FormMessage, SelectField, TextField, inputClass } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncButton, AsyncForm, Button, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";

export function ZoneForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createZoneAction);
  return (
    <AsyncForm ref={ref} action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <TextField label={t.zones_name} name="name" required maxLength={30} autoComplete="off" />
      <SubmitButton variant="secondary">{t.zones_add}</SubmitButton>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </AsyncForm>
  );
}

/** เลือกนักเรียน (ขั้นแรกของการติดธง): ไปหน้าเดิมพร้อม ?student= เพื่อโหลดรายชื่อผู้ปกครองของเด็กคนนั้น */
export function StudentPickForm({ students, value }: { students: { id: string; label: string }[]; value: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = String(new FormData(e.currentTarget).get("student") ?? "");
    start(() => router.push(id ? `/admin/custody?student=${id}` : "/admin/custody"));
  }
  return (
    <AsyncForm onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <SelectField label={t.custody_student} id="cu-student" name="student" defaultValue={value}>
        <option value="">—</option>
        {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </SelectField>
      <Button type="submit" variant="secondary" busy={pending} busyLabel={t.common_loading}>{t.audit_filter_apply}</Button>
    </AsyncForm>
  );
}

export function CustodyForm({ student, guardians }: { student: string; guardians: { id: string; label: string }[] }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(addCustodyFlagAction);
  const [kind, setKind] = useState("hold_all");
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="student" value={student} />
      <SelectField label={t.custody_kind} id="cu-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="hold_all">{t.custody_kind_hold}</option>
        <option value="block_guardian">{t.custody_kind_block}</option>
      </SelectField>
      {kind === "block_guardian" && (
        <SelectField label={t.custody_guardian} id="cu-guardian" name="guardian" defaultValue="">
          <option value="">—</option>
          {guardians.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </SelectField>
      )}
      <div className="space-y-1.5">
        <label htmlFor="cu-note" className="block text-sm font-medium">{t.custody_note}</label>
        <textarea id="cu-note" name="note" rows={3} maxLength={300} className={inputClass + " py-3"} />
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="danger">{t.custody_add}</SubmitButton>
    </AsyncForm>
  );
}

export function BroadcastForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(sendBroadcastAction);
  const n = state?.ok ? (state.data as { recipients?: number } | undefined)?.recipients : undefined;
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3" data-testid="broadcast-form">
      <TextField label={t.announce_msg_title} name="title" required maxLength={80} autoComplete="off" />
      <div className="space-y-1.5">
        <label htmlFor="bc-body" className="block text-sm font-medium">{t.announce_msg_body}</label>
        <textarea id="bc-body" name="body" rows={4} required maxLength={400} className={inputClass + " py-3"} />
      </div>
      <SelectField label={t.announce_severity} id="bc-sev" name="severity" defaultValue="warning">
        <option value="info">{t.announce_sev_info}</option>
        <option value="warning">{t.announce_sev_warning}</option>
        <option value="danger">{t.announce_sev_danger}</option>
      </SelectField>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="pause" className="mt-1 size-5" />
        <span><span className="font-medium">{t.announce_pause}</span><span className="block text-sm text-ink-soft">{t.announce_pause_hint}</span></span>
      </label>
      <p className="text-sm text-warn">{t.announce_confirm}</p>
      <FormMessage state={state} />
      {n !== undefined && <p className="text-sm text-ink-soft" data-testid="broadcast-recipients">{fmt(t.announce_recipients, { n })}</p>}
      <SubmitButton variant="danger">{t.announce_send}</SubmitButton>
    </AsyncForm>
  );
}

export function TvForm({ zones }: { zones: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createTvAction);
  const url = state?.ok ? (state.data as { url?: string } | undefined)?.url : undefined;
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <AsyncForm ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
        <TextField label={t.tv_name} name="name" required maxLength={40} autoComplete="off" />
        {zones.length > 0 && (
          <SelectField label={t.tv_zone} id="tv-zone" name="zone" defaultValue="">
            <option value="">{t.tv_zone_all}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </SelectField>
        )}
        <div className="sm:col-span-2"><FormMessage state={url ? null : state} /></div>
        <div><SubmitButton variant="secondary">{t.tv_add}</SubmitButton></div>
      </AsyncForm>
      {url && (
        <div className="space-y-2 rounded-xl border-2 border-primary p-3" data-testid="tv-url">
          <p className="text-sm font-medium">{t.tv_created}</p>
          <code className="block break-all rounded-lg bg-surface-2 p-2 text-sm" data-testid="tv-url-text">{url}</code>
          <AsyncButton variant="secondary" size="sm" leading={<Copy className="size-4" aria-hidden="true" />} onClick={async () => { await navigator.clipboard?.writeText(url).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? t.members_invite_copied : t.members_invite_copy}
          </AsyncButton>
        </div>
      )}
    </div>
  );
}

export function SafetySettingsForm({ dismissal, voice, tvArriving }: { dismissal: string; voice: boolean; tvArriving: boolean }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(saveSafetySettingsAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3">
      <TextField label={t.settings_dismissal} name="dismissal_time" type="time" defaultValue={dismissal} hint={t.settings_dismissal_hint} className="max-w-48" />
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="voice_enabled" defaultChecked={voice} className="size-5" /> {t.settings_voice}</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="tv_show_arriving" defaultChecked={tvArriving} className="size-5" /> {t.settings_tv_arriving}</label>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{t.settings_safety_save}</SubmitButton>
    </AsyncForm>
  );
}

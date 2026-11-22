"use client";

import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { createPassAction, revokePassAction, setPlanAction } from "@/app/actions/safety";
import { FormMessage, SelectField, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { passQrText } from "@/lib/safety/pure";

export type StudentOpt = { id: string; label: string };

function StudentChecks({ students, name = "student" }: { students: StudentOpt[]; name?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {students.map((s) => (
        <label key={s.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3">
          <input type="checkbox" name={name} value={s.id} defaultChecked={students.length === 1} className="size-5" />
          <span>{s.label}</span>
        </label>
      ))}
    </div>
  );
}

/** แสดงรหัส + QR ครั้งเดียว (ไม่เก็บรหัสจริงไว้ที่ใด) */
function CodeReveal({ code, expiresAt }: { code: string; expiresAt: string }) {
  const { t, lang } = useI18n();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(passQrText(code), { margin: 1, width: 240, errorCorrectionLevel: "M" }).then((u) => live && setQr(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [code]);
  const at = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(expiresAt));
  return (
    <div className="space-y-3 rounded-2xl border-2 border-primary p-4" data-testid="pass-reveal">
      <h3 className="font-semibold">{t.passes_created_title}</h3>
      <p className="font-mono text-3xl font-bold tracking-[0.3em]" data-testid="pass-code">{code}</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={t.passes_qr_alt} width={240} height={240} className="rounded-lg border border-line bg-white" />
      )}
      <p className="text-sm text-ink-soft">{t.passes_expires.replace("{at}", at)}</p>
      <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">{t.passes_code_note}</p>
      <AsyncButton variant="secondary" size="sm" leading={<Copy className="size-4" aria-hidden="true" />} onClick={async () => { await navigator.clipboard?.writeText(code).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
        {copied ? t.members_invite_copied : t.members_invite_copy}
      </AsyncButton>
    </div>
  );
}

export function PassCreateForm({ school, students }: { school: string; students: StudentOpt[] }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createPassAction);
  const [valid, setValid] = useState("today");
  const data = state?.ok ? (state.data as { code: string; expiresAt: string } | undefined) : undefined;
  return (
    <div className="space-y-4">
      <AsyncForm ref={ref} action={action} className="space-y-4">
        <input type="hidden" name="school" value={school} />
        <TextField label={t.passes_holder} name="holder" required maxLength={80} autoComplete="off" />
        <TextField label={t.passes_plate} name="plate" maxLength={20} autoComplete="off" />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t.passes_students}</legend>
          <StudentChecks students={students} />
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={t.passes_valid} id="pass-valid" name="valid" value={valid} onChange={(e) => setValid(e.target.value)}>
            <option value="today">{t.passes_valid_today}</option>
            <option value="days">{t.passes_valid_days}</option>
          </SelectField>
          {valid === "days" && <TextField label={t.passes_days} name="days" type="number" min={1} max={7} defaultValue={2} inputMode="numeric" />}
        </div>
        <p className="text-sm text-ink-soft">{t.passes_save_hint}</p>
        <FormMessage state={data ? null : state} />
        <SubmitButton>{t.passes_create}</SubmitButton>
      </AsyncForm>
      {data && <CodeReveal code={data.code} expiresAt={data.expiresAt} />}
    </div>
  );
}

export function RevokePassButton({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <AsyncForm action={revokePassAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost">{t.passes_revoke}</SubmitButton>
    </AsyncForm>
  );
}

export type PlanCell = { date: string; mode: "parent" | "bus" | "absent" | "other" };
export function PlanForm({ school, students, dates, current }: { school: string; students: StudentOpt[]; dates: { value: string; label: string }[]; current: Record<string, string> }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(setPlanAction);
  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm" data-testid="plans-current">
        {students.map((s) => (
          <li key={s.id}>
            <span className="font-medium">{s.label}</span>:{" "}
            {dates.slice(0, 2).map((d) => (
              <span key={d.value} className="me-3 text-ink-soft">
                {d.label} — {current[`${s.id}|${d.value}`] ? t[`plans_mode_${current[`${s.id}|${d.value}`]}` as "plans_mode_parent"] : t.plans_none}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <AsyncForm ref={ref} action={action} className="space-y-3">
        <input type="hidden" name="school" value={school} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t.plans_students}</legend>
          <StudentChecks students={students} />
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={t.plans_date} id={`plan-date-${school}`} name="date" defaultValue={dates[0]?.value}>
            {dates.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </SelectField>
          <SelectField label={t.plans_mode} id={`plan-mode-${school}`} name="mode" defaultValue="parent">
            <option value="parent">{t.plans_mode_parent}</option>
            <option value="bus">{t.plans_mode_bus}</option>
            <option value="absent">{t.plans_mode_absent}</option>
            <option value="other">{t.plans_mode_other}</option>
            <option value="clear">{t.plans_clear}</option>
          </SelectField>
        </div>
        <FormMessage state={state} />
        <SubmitButton variant="secondary">{t.plans_save}</SubmitButton>
      </AsyncForm>
    </div>
  );
}

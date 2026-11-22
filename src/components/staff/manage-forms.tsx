"use client";

import { Trash2, Upload } from "lucide-react";
import { createClassroomAction, createStudentAction, importStudentsAction, removeMemberAction, revokeInviteAction, updateSettingsAction, updateStudentAction } from "@/app/actions/staff";
import { createSchoolAction } from "@/app/actions/platform";
import { FormMessage, SelectField, TextField, inputClass } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { StudentInviteButton } from "@/components/notify/student-invite-button";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";

export function ClassroomForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createClassroomAction);
  return (
    <AsyncForm ref={ref} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <TextField label={t.classroom_name} name="name" required maxLength={30} autoComplete="off" />
      <TextField label={t.classroom_level} name="level" maxLength={30} autoComplete="off" />
      <SubmitButton variant="secondary">{t.classroom_add}</SubmitButton>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </AsyncForm>
  );
}

export function StudentForm({ classrooms }: { classrooms: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createStudentAction);
  return (
    <AsyncForm ref={ref} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <TextField label={t.students_first} name="first" required maxLength={80} autoComplete="off" />
      <TextField label={t.students_last} name="last" maxLength={80} autoComplete="off" />
      <TextField label={t.students_nick} name="nickname" maxLength={30} autoComplete="off" />
      <TextField label={t.students_code} name="code" maxLength={30} autoComplete="off" />
      <SelectField label={t.students_classroom} id="stu-room" name="classroom" defaultValue="">
        <option value="">—</option>
        {classrooms.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <div className="flex items-end">
        <SubmitButton variant="secondary" className="w-full">
          {t.students_add}
        </SubmitButton>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <FormMessage state={state} />
      </div>
    </AsyncForm>
  );
}

export function ImportForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(importStudentsAction);
  const result = state?.ok ? (state.data as { inserted: number; skipped: number; errors: { row: number; reason: string }[] } | undefined) : undefined;
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3">
      <p className="text-sm text-ink-soft">{t.students_import_help}</p>
      <div className="space-y-1.5">
        <label htmlFor="csv-file" className="block text-sm font-medium">
          {t.students_import_pick}
        </label>
        <input id="csv-file" name="file" type="file" accept=".csv,text/csv,text/plain" required className={inputClass + " py-2.5"} />
      </div>
      <FormMessage state={state} />
      {result && (
        <div role="status" className="rounded-xl bg-success-bg px-4 py-3 text-sm text-success">
          <p className="font-medium">{fmt(t.students_import_result, { ok: result.inserted, skip: result.skipped })}</p>
          <ul className="mt-1 list-disc ps-5">
            {result.errors.map((e) => (
              <li key={e.row}>{fmt(t.students_import_row_error, { row: e.row, reason: e.reason })}</li>
            ))}
          </ul>
        </div>
      )}
      <SubmitButton variant="secondary" leading={<Upload className="size-4" aria-hidden="true" />}>
        {t.students_import_run}
      </SubmitButton>
    </AsyncForm>
  );
}

/** ย้ายห้อง / ทำเครื่องหมายออกแล้ว ของนักเรียนหนึ่งคน */
export function StudentRowActions({ id, classroomId, status, classrooms }: { id: string; classroomId: string | null; status: string; classrooms: { id: string; name: string }[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AsyncForm action={updateStudentAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <select name="classroom" defaultValue={classroomId ?? ""} aria-label={t.students_move} className={inputClass + " !min-h-11 w-auto py-1"}>
          <option value="">—</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <SubmitButton size="sm" variant="secondary">
          {t.students_move}
        </SubmitButton>
      </AsyncForm>
      {status === "active" && <StudentInviteButton studentId={id} />}
      {status === "active" && (
        <AsyncForm action={updateStudentAction}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton size="sm" variant="ghost" name="status" value="left">
            {t.students_mark_left}
          </SubmitButton>
        </AsyncForm>
      )}
    </div>
  );
}

export function RevokeInviteButton({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <AsyncForm action={revokeInviteAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost" leading={<Trash2 className="size-4" aria-hidden="true" />}>
        {t.members_invite_revoke}
      </SubmitButton>
    </AsyncForm>
  );
}

export function RemoveMemberButton({ user, role }: { user: string; role: string }) {
  const { t } = useI18n();
  return (
    <AsyncForm action={removeMemberAction}>
      <input type="hidden" name="user" value={user} />
      <input type="hidden" name="role" value={role} />
      <SubmitButton size="sm" variant="ghost" leading={<Trash2 className="size-4" aria-hidden="true" />}>
        {t.members_remove}
      </SubmitButton>
    </AsyncForm>
  );
}

export type SettingsValues = {
  name_th: string; name_en: string; short_name: string; lat: string; lng: string;
  checkin_radius_m: number; arrive_radius_m: number; student_alert_min: number; student_dashboard_enabled: boolean;
  checkin_start: string; checkin_end: string; checkin_ttl_min: number; stale_location_sec: number; late_pickup_min: number;
};

export function SettingsForm({ v }: { v: SettingsValues }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(updateSettingsAction);
  function fillHere(form: HTMLFormElement | null) {
    return new Promise<void>((resolve) => {
      if (!navigator.geolocation || !form) return resolve();
      navigator.geolocation.getCurrentPosition(
        (p) => {
          (form.elements.namedItem("lat") as HTMLInputElement).value = p.coords.latitude.toFixed(6);
          (form.elements.namedItem("lng") as HTMLInputElement).value = p.coords.longitude.toFixed(6);
          resolve();
        },
        () => {
          alert(t.settings_location_denied);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }
  return (
    <AsyncForm ref={ref} action={action} className="space-y-8">
      <fieldset className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-lg font-semibold">{t.settings_school_section}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label={t.settings_name_th} name="name_th" defaultValue={v.name_th} required maxLength={120} />
          <TextField label={t.settings_name_en} name="name_en" defaultValue={v.name_en} maxLength={120} />
          <TextField label={t.settings_short_name} name="short_name" defaultValue={v.short_name} maxLength={20} />
        </div>
        <p className="text-sm font-medium">{t.settings_location}</p>
        <p className="text-xs text-ink-soft">{t.settings_location_help}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField label={t.settings_lat} name="lat" defaultValue={v.lat} inputMode="decimal" />
          <TextField label={t.settings_lng} name="lng" defaultValue={v.lng} inputMode="decimal" />
          <AsyncButton variant="secondary" onClick={() => fillHere(ref.current)}>
            {t.settings_use_here}
          </AsyncButton>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <legend className="px-1 text-lg font-semibold">{t.settings_pickup_section}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t.settings_radius} hint={t.settings_radius_help} name="checkin_radius_m" type="number" min={100} max={50000} defaultValue={v.checkin_radius_m} required />
          <TextField label={t.settings_arrive} name="arrive_radius_m" type="number" min={20} max={2000} defaultValue={v.arrive_radius_m} required />
          <TextField label={t.settings_alert_min} name="student_alert_min" type="number" min={0} max={120} defaultValue={v.student_alert_min} required />
          <TextField label={t.settings_ttl} name="checkin_ttl_min" type="number" min={10} max={480} defaultValue={v.checkin_ttl_min} required />
          <TextField label={t.settings_stale} name="stale_location_sec" type="number" min={20} max={600} defaultValue={v.stale_location_sec} required />
          <TextField label={t.settings_late} name="late_pickup_min" type="number" min={5} max={240} defaultValue={v.late_pickup_min} required />
          <TextField label={t.settings_window_start} name="checkin_start" type="time" defaultValue={v.checkin_start} />
          <TextField label={t.settings_window_end} name="checkin_end" type="time" defaultValue={v.checkin_end} hint={t.settings_window_help} />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="student_dashboard_enabled" defaultChecked={v.student_dashboard_enabled} className="size-5 accent-[var(--kg-primary)]" />
          {t.settings_student_dash}
        </label>
      </fieldset>

      {state && !state.ok && state.error === "err_invalid_input" ? (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {t.settings_invalid_range}
        </p>
      ) : (
        <FormMessage state={state} />
      )}
      <SubmitButton size="lg">{t.settings_save}</SubmitButton>
    </AsyncForm>
  );
}

export function SchoolCreateForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createSchoolAction);
  return (
    <AsyncForm ref={ref} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <TextField label={t.platform_slug} name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" autoComplete="off" />
      <TextField label={t.platform_name_th} name="name" required maxLength={120} autoComplete="off" />
      <SubmitButton variant="secondary">{t.platform_school_add}</SubmitButton>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </AsyncForm>
  );
}

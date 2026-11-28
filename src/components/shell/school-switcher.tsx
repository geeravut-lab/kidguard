import { Building2 } from "lucide-react";
import { selectSchoolAction } from "@/app/actions/platform";
import { AsyncForm, SubmitButton } from "@/components/ui";
import type { Dict } from "@/lib/i18n/dict";

export type SwitchableSchool = { id: string; name: string };

/** ตัวเลือกโรงเรียนที่กำลังจัดการ: แอดมินแพลตฟอร์ม (เมนูจัดการโรงเรียนใช้กับโรงเรียนที่เลือก) และเจ้าหน้าที่ที่อยู่หลายโรงเรียน */
export function SchoolSwitcher({ schools, currentId, t, idPrefix }: { schools: SwitchableSchool[]; currentId: string | null; t: Dict; idPrefix: string }) {
  if (schools.length === 0) return null;
  const current = schools.find((s) => s.id === currentId);
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3" data-testid="school-switcher">
      <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
        <Building2 className="size-4" aria-hidden="true" /> {t.platform_current_school}
      </p>
      <p className="mt-1 text-base font-semibold" data-testid="current-school">{current?.name ?? "—"}</p>
      {schools.length > 1 && (
        <AsyncForm action={selectSchoolAction} className="mt-2 flex flex-col gap-2">
          <label htmlFor={`${idPrefix}-school`} className="sr-only">{t.platform_switch_school_label}</label>
          <select id={`${idPrefix}-school`} name="school" defaultValue={currentId ?? undefined} className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm">
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <SubmitButton size="sm" variant="secondary">{t.platform_switch_school}</SubmitButton>
        </AsyncForm>
      )}
      <p className="mt-2 text-xs text-ink-soft">{t.platform_current_school_hint}</p>
    </div>
  );
}

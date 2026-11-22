"use client";

import { Car, Phone, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { addPersonAction, addVehicleAction, cancelClaimAction, claimStudentAction, removePersonAction, removeVehicleAction } from "@/app/actions/parent";
import { FormMessage, SelectField, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { PROVINCES } from "@/config/provinces";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { RELATIONS } from "@/lib/validation";

export type Person = { id: string; name: string; phone: string; relation: string | null; is_primary: boolean };
export type Vehicle = { id: string; plate: string; province: string; color: string | null; model: string | null };
export type Claim = { id: string; status: "pending" | "approved" | "rejected"; claimed_name: string; classroom_name: string; student_label: string | null };
export type SchoolOption = { id: string; name: string };
export type ClassroomOption = { id: string; name: string; teachers: string[] };

export function Card({ title, lead, children, className }: { title: string; lead?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4 rounded-2xl border border-line bg-surface p-5", className)}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {lead && <p className="mt-1 text-sm text-ink-soft">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

export function StatusChip({ status }: { status: Claim["status"] }) {
  const { t } = useI18n();
  const map = {
    pending: ["bg-warn-bg text-warn", t.child_status_pending],
    approved: ["bg-success-bg text-success", t.child_status_approved],
    rejected: ["bg-danger-bg text-danger", t.child_status_rejected],
  } as const;
  const [cls, label] = map[status];
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>{label}</span>;
}

export function PersonsSection({ persons }: { persons: Person[] }) {
  const { t } = useI18n();
  const { state, action, ref: formRef } = useFormAction(addPersonAction);
  const relLabel = (r: string | null) => (r ? (t as Record<string, string>)[`rel_${r}`] : "");
  return (
    <Card title={t.person_title} lead={t.person_lead}>
      <ul className="space-y-2">
        {persons.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <UserRound className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {p.name} {p.is_primary && <span className="ms-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-soft">{t.person_primary}</span>}
              </p>
              <p className="flex items-center gap-1 text-sm text-ink-soft">
                <Phone className="size-3.5" aria-hidden="true" /> {p.phone} {relLabel(p.relation) && `· ${relLabel(p.relation)}`}
              </p>
            </div>
            <AsyncForm action={removePersonAction}>
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton variant="ghost" size="sm" aria-label={`${t.person_remove} ${p.name}`} leading={<Trash2 className="size-4" aria-hidden="true" />}>
                <span className="sr-only">{t.person_remove}</span>
              </SubmitButton>
            </AsyncForm>
          </li>
        ))}
      </ul>
      <AsyncForm ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
        <TextField label={t.person_name} name="name" required maxLength={80} autoComplete="off" />
        <TextField label={t.person_phone} name="phone" type="tel" inputMode="tel" required autoComplete="off" />
        <SelectField label={t.person_relation} id="person-relation" name="relation" defaultValue="">
          <option value="">{t.rel_choose}</option>
          {RELATIONS.map((r) => (
            <option key={r} value={r}>
              {(t as Record<string, string>)[`rel_${r}`]}
            </option>
          ))}
        </SelectField>
        <div className="flex items-end">
          <SubmitButton variant="secondary" className="w-full">
            {t.person_add}
          </SubmitButton>
        </div>
        <div className="sm:col-span-2">
          <FormMessage state={state} />
        </div>
      </AsyncForm>
    </Card>
  );
}

export function VehiclesSection({ vehicles }: { vehicles: Vehicle[] }) {
  const { t } = useI18n();
  const { state, action, ref: formRef } = useFormAction(addVehicleAction);
  return (
    <Card title={t.vehicle_title} lead={t.vehicle_lead}>
      <ul className="space-y-2">
        {vehicles.map((v) => (
          <li key={v.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <Car className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-base font-semibold tracking-wide">
                {v.plate} <span className="font-sans text-sm font-normal text-ink-soft">{v.province}</span>
              </p>
              {(v.color || v.model) && <p className="text-sm text-ink-soft">{[v.color, v.model].filter(Boolean).join(" · ")}</p>}
            </div>
            <AsyncForm action={removeVehicleAction}>
              <input type="hidden" name="id" value={v.id} />
              <SubmitButton variant="ghost" size="sm" aria-label={`${t.vehicle_remove} ${v.plate}`} leading={<Trash2 className="size-4" aria-hidden="true" />}>
                <span className="sr-only">{t.vehicle_remove}</span>
              </SubmitButton>
            </AsyncForm>
          </li>
        ))}
      </ul>
      <AsyncForm ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
        <TextField label={t.vehicle_plate} name="plate" required maxLength={16} autoComplete="off" autoCapitalize="characters" />
        <SelectField label={t.vehicle_province} id="vehicle-province" name="province" required defaultValue="">
          <option value="" disabled>
            {t.province_choose}
          </option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </SelectField>
        <TextField label={t.vehicle_color} name="color" maxLength={30} autoComplete="off" />
        <TextField label={t.vehicle_model} name="model" maxLength={40} autoComplete="off" />
        <div className="sm:col-span-2">
          <SubmitButton variant="secondary" className="w-full sm:w-auto">
            {t.vehicle_add}
          </SubmitButton>
        </div>
        <div className="sm:col-span-2">
          <FormMessage state={state} />
        </div>
      </AsyncForm>
    </Card>
  );
}

export function ClaimsList({ claims }: { claims: Claim[] }) {
  const { t } = useI18n();
  if (claims.length === 0) return null;
  return (
    <ul className="space-y-2">
      {claims.map((c) => (
        <li key={c.id} className="rounded-xl border border-line p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.student_label ?? c.claimed_name}</p>
              <p className="text-sm text-ink-soft">{c.classroom_name}</p>
              <div className="mt-1">
                <StatusChip status={c.status} />
              </div>
              {c.status === "rejected" && <p className="mt-2 text-sm text-ink-soft">{t.child_rejected_help}</p>}
            </div>
            {c.status === "pending" && (
              <AsyncForm action={cancelClaimAction}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton variant="ghost" size="sm">
                  {t.child_remove}
                </SubmitButton>
              </AsyncForm>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChildrenSection({
  claims,
  schools,
  classrooms,
}: {
  claims: Claim[];
  schools: SchoolOption[];
  classrooms: Record<string, ClassroomOption[]>;
}) {
  const { t } = useI18n();
  const { state, action, ref: formRef } = useFormAction(claimStudentAction);
  const [school, setSchool] = useState(schools[0]?.id ?? "");
  const [classroom, setClassroom] = useState("");
  const options = classrooms[school] ?? [];
  const current = options.find((c) => c.id === classroom);

  return (
    <Card title={t.child_title} lead={t.child_lead}>
      <ClaimsList claims={claims} />
      <AsyncForm
        ref={formRef}
        action={(fd) => {
          action(fd);
          setClassroom("");
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        {schools.length > 1 ? (
          <SelectField label={t.child_school} id="child-school" name="school" value={school} onChange={(e) => { setSchool(e.target.value); setClassroom(""); }}>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <>
            <input type="hidden" name="school" value={school} />
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t.child_school}</p>
              <p className="flex min-h-12 items-center rounded-xl bg-surface-2 px-4">{schools[0]?.name}</p>
            </div>
          </>
        )}
        <SelectField label={t.child_classroom} id="child-classroom" name="classroom" required value={classroom} onChange={(e) => setClassroom(e.target.value)}>
          <option value="" disabled>
            {t.child_classroom_choose}
          </option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        {current && (
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm sm:col-span-2" data-testid="homeroom-teacher">
            <span className="text-ink-soft">{t.child_teacher_label}: </span>
            <span className="font-semibold">{current.teachers.length ? current.teachers.join(", ") : t.child_teacher_unknown}</span>
          </p>
        )}
        <TextField label={t.child_name} name="name" required minLength={2} maxLength={120} autoComplete="off" className="sm:col-span-1" />
        <SelectField label={t.child_relation} id="child-relation" name="relation" defaultValue="">
          <option value="">{t.rel_choose}</option>
          {RELATIONS.filter((r) => r !== "driver").map((r) => (
            <option key={r} value={r}>
              {(t as Record<string, string>)[`rel_${r}`]}
            </option>
          ))}
        </SelectField>
        {current && current.teachers.length === 0 && <TextField label={t.child_teacher_name} name="teacher" maxLength={80} autoComplete="off" />}
        <p className="text-xs text-ink-soft sm:col-span-2">{t.child_privacy}</p>
        <div className="sm:col-span-2">
          <FormMessage state={state} />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton variant="secondary" className="w-full sm:w-auto">
            {t.child_add}
          </SubmitButton>
        </div>
      </AsyncForm>
    </Card>
  );
}

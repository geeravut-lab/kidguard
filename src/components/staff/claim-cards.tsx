"use client";

import { Check, Phone, X } from "lucide-react";
import { decideClaimAction } from "@/app/actions/staff";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { StatusChip } from "@/components/parent/sections";
import { SelectField } from "@/components/forms/fields";
import { useI18n } from "@/lib/i18n/client";

export type ClaimRow = {
  link_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  parent_name: string | null;
  parent_phone: string | null;
  claimed_name: string;
  claimed_teacher_name: string | null;
  classroom_id: string;
  classroom_name: string;
  student_id: string | null;
  student_name: string | null;
};
export type StudentOption = { id: string; name: string; classroom_id: string | null };

/** รายการคำขอผูกนักเรียน (ใช้ทั้งหน้าแอดมินและหน้าครู — ครูได้รับเฉพาะห้องตัวเองจากฐานข้อมูลอยู่แล้ว) */
export function ClaimCards({ claims, students }: { claims: ClaimRow[]; students: StudentOption[] }) {
  const { t } = useI18n();
  if (claims.length === 0) return <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-ink-soft">{t.claims_empty}</p>;
  return (
    <ul className="space-y-3">
      {claims.map((c) => {
        const candidates = students.filter((s) => s.classroom_id === c.classroom_id);
        return (
          <li key={c.link_id} className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="claim-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold">{c.claimed_name}</p>
                <p className="text-sm text-ink-soft">
                  {t.claims_classroom} {c.classroom_name}
                </p>
              </div>
              <StatusChip status={c.status} />
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-soft">{t.claims_parent}</dt>
                <dd className="font-medium">{c.parent_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">{t.claims_phone}</dt>
                <dd className="flex items-center gap-1 font-medium">
                  <Phone className="size-3.5" aria-hidden="true" /> {c.parent_phone ?? "—"}
                </dd>
              </div>
              {c.claimed_teacher_name && (
                <div>
                  <dt className="text-ink-soft">{t.claims_teacher_claimed}</dt>
                  <dd className="font-medium">{c.claimed_teacher_name}</dd>
                </div>
              )}
            </dl>
            {c.status === "pending" && (
              <AsyncForm action={decideClaimAction} className="space-y-3">
                <input type="hidden" name="id" value={c.link_id} />
                {c.student_id ? (
                  <p className="rounded-xl bg-success-bg px-4 py-2 text-sm text-success">
                    {t.claims_matched}: <span className="font-semibold">{c.student_name}</span>
                  </p>
                ) : (
                  <>
                    <p className="rounded-xl bg-warn-bg px-4 py-2 text-sm text-warn">{t.claims_unmatched}</p>
                    <SelectField label={t.claims_choose_student} id={`stu-${c.link_id}`} name="student" defaultValue="">
                      <option value="">{t.claims_choose_student}</option>
                      {candidates.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </SelectField>
                  </>
                )}
                <div className="flex flex-wrap gap-3">
                  <SubmitButton name="decision" value="approve" leading={<Check className="size-5" aria-hidden="true" />}>
                    {t.claims_approve}
                  </SubmitButton>
                  <SubmitButton name="decision" value="reject" variant="secondary" leading={<X className="size-5" aria-hidden="true" />}>
                    {t.claims_reject}
                  </SubmitButton>
                </div>
              </AsyncForm>
            )}
          </li>
        );
      })}
    </ul>
  );
}

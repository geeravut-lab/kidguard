"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { createInviteAction } from "@/app/actions/staff";
import { createSchoolAdminInviteAction } from "@/app/actions/platform";
import { FormMessage, SelectField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

/** แสดงลิงก์เชิญ (ครั้งเดียว) พร้อมปุ่มคัดลอก */
export function InviteLink({ code, label }: { code: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = typeof location === "undefined" ? `/invite/${code}` : `${location.origin}/invite/${code}`;
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3" data-testid="invite-link">
      <p className="text-sm font-medium">{label}</p>
      <code className="block break-all rounded-lg bg-surface p-2 text-sm">{link}</code>
      <AsyncButton
        variant="secondary"
        size="sm"
        leading={<Copy className="size-4" aria-hidden="true" />}
        onClick={async () => {
          await navigator.clipboard?.writeText(link).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }}
      >
        {copied ? t.members_invite_copied : t.members_invite_copy}
      </AsyncButton>
    </div>
  );
}

export function StaffInviteForm({ classrooms }: { classrooms: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createInviteAction);
  const [role, setRole] = useState("teacher");
  const code = state?.ok ? (state.data?.code as string | undefined) : undefined;
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={t.members_invite_role} id="inv-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="teacher">{t.invite_role_teacher}</option>
          <option value="gate_staff">{t.invite_role_gate_staff}</option>
          <option value="school_admin">{t.invite_role_school_admin}</option>
        </SelectField>
        {role === "teacher" && (
          <SelectField label={t.members_invite_classroom} id="inv-room" name="classroom" defaultValue="">
            <option value="">—</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{t.members_invite_create}</SubmitButton>
      {code && <InviteLink code={code} label={t.members_invite_link} />}
    </AsyncForm>
  );
}

export function PlatformInviteForm({ schools }: { schools: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(createSchoolAdminInviteAction);
  const code = state?.ok ? (state.data?.code as string | undefined) : undefined;
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3">
      <SelectField label={t.child_school} id="pinv-school" name="school" defaultValue={schools[0]?.id}>
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{t.platform_invite_admin}</SubmitButton>
      {code && <InviteLink code={code} label={t.platform_invite_link} />}
    </AsyncForm>
  );
}

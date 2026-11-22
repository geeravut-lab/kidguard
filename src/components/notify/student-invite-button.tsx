"use client";

import { Backpack } from "lucide-react";
import { useState } from "react";
import { createStudentInviteAction } from "@/app/actions/notify";
import { InviteLink } from "@/components/staff/invite-form";
import { AsyncButton } from "@/components/ui";
import { errorText } from "@/lib/action";
import { useI18n } from "@/lib/i18n/client";

/** สร้างลิงก์ครั้งเดียวให้นักเรียนผูกบัญชีของตัวเอง (ผู้ปกครองที่อนุมัติแล้ว หรือผู้ดูแลโรงเรียน) */
export function StudentInviteButton({ studentId }: { studentId: string }) {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <AsyncButton variant="ghost" size="sm" leading={<Backpack className="size-4" aria-hidden="true" />}
        onClick={async () => { setError(null); const r = await createStudentInviteAction(studentId); if (r.ok) setCode(r.code); else setError(errorText(t, r.error)); }}>
        {t.student_invite_btn}
      </AsyncButton>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {code && <InviteLink code={code} label={t.student_invite_link} />}
    </div>
  );
}

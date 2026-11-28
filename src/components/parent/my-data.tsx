"use client";

import { Download, Trash2 } from "lucide-react";
import { deleteMyAccountAction } from "@/app/actions/account";
import { FormMessage, PasswordField, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncForm, AsyncLink, SubmitButton } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/** สิทธิของเจ้าของข้อมูล (PDPA): ดาวน์โหลดข้อมูลของตัวเอง + ลบบัญชี */
export function MyDataCard({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(deleteMyAccountAction);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <AsyncLink href="/api/me/export" prefetch={false} download className={buttonVariants({ variant: "secondary", size: "sm" })} data-testid="mydata-download">
          <Download className="size-4" aria-hidden="true" /> {t.mydata_download}
        </AsyncLink>
        <p className="text-sm text-ink-soft">{t.mydata_download_hint}</p>
      </div>
      <div className="space-y-3 rounded-xl border border-danger p-4">
        <h3 className="font-semibold text-danger">{t.mydata_delete_title}</h3>
        <p className="text-sm text-ink-soft">{t.mydata_delete_lead}</p>
        <AsyncForm ref={ref} action={action} className="space-y-3" data-testid="delete-account-form">
          <TextField label={t.mydata_delete_confirm} name="confirm" autoComplete="off" />
          {hasPassword && <PasswordField label={t.mydata_delete_password} name="password" autoComplete="current-password" />}
          <FormMessage state={state} />
          <SubmitButton variant="danger" leading={<Trash2 className="size-4" aria-hidden="true" />}>
            {t.mydata_delete_submit}
          </SubmitButton>
        </AsyncForm>
      </div>
    </div>
  );
}

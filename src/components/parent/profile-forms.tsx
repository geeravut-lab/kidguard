"use client";

import { changePasswordAction } from "@/app/actions/auth";
import { updateNameAction } from "@/app/actions/parent";
import { FormMessage, PasswordField, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export function NameForm({ defaultName }: { defaultName: string }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(updateNameAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3">
      <TextField label={t.auth_display_name} name="name" defaultValue={defaultName} required maxLength={80} />
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{t.profile_name_save}</SubmitButton>
    </AsyncForm>
  );
}

export function ChangePasswordForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(changePasswordAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-3">
      <PasswordField label={t.pw_current} name="current" autoComplete="current-password" required />
      <PasswordField label={t.pw_new} hint={t.auth_password_hint} name="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      <PasswordField label={t.pw_confirm} name="confirm" autoComplete="new-password" required minLength={8} maxLength={72} />
      <FormMessage state={state} />
      <SubmitButton variant="secondary">{t.pw_submit}</SubmitButton>
    </AsyncForm>
  );
}

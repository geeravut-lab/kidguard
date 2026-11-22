"use client";

import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction } from "@/app/actions/auth";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { FormMessage, PasswordField, TextField } from "@/components/forms/fields";
import { useFormAction } from "@/components/forms/use-form-action";
import { useI18n } from "@/lib/i18n/client";

export function LoginForm({ next }: { next: string }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(signInAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField label={t.auth_email} name="email" type="email" autoComplete="email" inputMode="email" required />
      <PasswordField label={t.auth_password} name="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        {t.auth_login_submit}
      </SubmitButton>
    </AsyncForm>
  );
}

export function SignupForm({ next }: { next: string }) {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(signUpAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField label={t.auth_display_name} name="name" autoComplete="name" required maxLength={80} />
      <TextField label={t.auth_email} name="email" type="email" autoComplete="email" inputMode="email" required />
      <PasswordField label={t.auth_password} hint={t.auth_password_hint} name="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        {t.auth_signup_submit}
      </SubmitButton>
    </AsyncForm>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(forgotPasswordAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-4">
      <TextField label={t.auth_email} name="email" type="email" autoComplete="email" inputMode="email" required />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        {t.auth_forgot_submit}
      </SubmitButton>
    </AsyncForm>
  );
}

export function ResetForm() {
  const { t } = useI18n();
  const { state, action, ref } = useFormAction(resetPasswordAction);
  return (
    <AsyncForm ref={ref} action={action} className="space-y-4">
      <PasswordField label={t.pw_new} hint={t.auth_password_hint} name="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      <PasswordField label={t.pw_confirm} name="confirm" autoComplete="new-password" required minLength={8} maxLength={72} />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        {t.auth_reset_submit}
      </SubmitButton>
    </AsyncForm>
  );
}

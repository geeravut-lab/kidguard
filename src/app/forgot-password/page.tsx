import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/auth-forms";
import { AsyncLink } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "ลืมรหัสผ่าน" };

export default async function ForgotPage() {
  const { t } = await getT();
  return (
    <AuthCard title={t.auth_forgot_title} lead={t.auth_forgot_lead}>
      <ForgotForm />
      <p className="text-center text-sm">
        <AsyncLink href="/login" className="font-medium text-primary hover:underline">
          {t.auth_to_login}
        </AsyncLink>
      </p>
    </AuthCard>
  );
}

import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/auth-forms";
import { requireMe } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "ตั้งรหัสผ่านใหม่", robots: { index: false } };

export default async function ResetPage() {
  await requireMe("/reset-password"); // ต้องมี session จากลิงก์กู้รหัสผ่าน
  const { t } = await getT();
  return (
    <AuthCard title={t.auth_reset_title}>
      <ResetForm />
    </AuthCard>
  );
}

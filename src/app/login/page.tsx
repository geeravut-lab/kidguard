import { redirect } from "next/navigation";
import { AuthCard, Divider } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AsyncLink } from "@/components/ui";
import { getAuthInfo } from "@/lib/auth/me";
import { safeNext } from "@/lib/auth/next";
import { getT } from "@/lib/i18n/server";
import { aivoraAuthorizeUrl } from "@/lib/sso/config";

export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getAuthInfo()) redirect(next);
  const { t } = await getT();
  return (
    <AuthCard title={t.auth_login_title} lead={t.auth_login_lead}>
      {sp.error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {t.auth_callback_failed}
        </p>
      )}
      <LoginForm next={next} />
      <p className="text-center text-sm">
        <AsyncLink href="/forgot-password" className="font-medium text-primary hover:underline">
          {t.auth_forgot}
        </AsyncLink>
      </p>
      <Divider label={t.auth_or} />
      <OAuthButtons next={next} aivoraUrl={aivoraAuthorizeUrl()} />
      <p className="text-center text-sm">
        <AsyncLink href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
          {t.auth_to_signup}
        </AsyncLink>
      </p>
      <p className="text-center text-xs text-ink-soft">{t.auth_staff_note}</p>
    </AuthCard>
  );
}

import { redirect } from "next/navigation";
import { AuthCard, Divider } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/auth-forms";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AsyncLink } from "@/components/ui";
import { getAuthInfo } from "@/lib/auth/me";
import { safeNext } from "@/lib/auth/next";
import { getT } from "@/lib/i18n/server";
import { aivoraAuthorizeUrl } from "@/lib/sso/config";

export const metadata = { title: "สมัครใช้งาน" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getAuthInfo()) redirect(next);
  const { t } = await getT();
  return (
    <AuthCard title={t.auth_signup_title} lead={t.auth_signup_lead}>
      <SignupForm next={next} />
      <Divider label={t.auth_or} />
      <OAuthButtons next={next} aivoraUrl={aivoraAuthorizeUrl()} />
      <p className="text-center text-sm">
        <AsyncLink href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
          {t.auth_to_login}
        </AsyncLink>
      </p>
      <p className="text-center text-xs text-ink-soft">{t.auth_staff_note}</p>
    </AuthCard>
  );
}

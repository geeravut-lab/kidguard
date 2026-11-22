import { notFound } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { InviteForm } from "./invite-form";
import { requireMe } from "@/lib/auth/guards";
import { INVITE_CODE_RE } from "@/lib/invites";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "รับคำเชิญ", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!INVITE_CODE_RE.test(code)) notFound();
  await requireMe(`/invite/${code}`);
  const { t } = await getT();
  return (
    <AuthCard title={t.invite_title} lead={t.invite_lead}>
      <InviteForm code={code} />
    </AuthCard>
  );
}

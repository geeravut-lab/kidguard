import { redirect } from "next/navigation";
import { Baby } from "lucide-react";
import { chooseRoleAction } from "@/app/actions/parent";
import { OnboardingWizard } from "@/components/parent/onboarding-wizard";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requireMe } from "@/lib/auth/guards";
import { getAuthInfo, isStaff, isStudent, postLoginPath } from "@/lib/auth/me";
import { getT } from "@/lib/i18n/server";
import { loadParentData } from "@/lib/parent-data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "ลงทะเบียนผู้ปกครอง", robots: { index: false } };

export default async function OnboardingPage() {
  const me = await requireMe("/onboarding");
  const { lang, t } = await getT();

  if (me.role === "parent" && me.onboarded) redirect("/home");
  // เจ้าหน้าที่ที่ไม่ได้เป็นผู้ปกครองไม่ต้องลงทะเบียนผู้ปกครอง
  if (!me.role && (isStaff(me) || isStudent(me))) redirect(postLoginPath(me));

  // ยังไม่ได้เลือกบทบาท: หน้าเลือก role (กลุ่ม "เลือกเองได้" เท่านั้น — ตอนนี้มีเฉพาะผู้ปกครอง)
  if (!me.role) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-8">
        <h1 className="text-2xl font-bold">{t.role_title}</h1>
        <p className="text-ink-soft">{t.role_lead}</p>
        <AsyncForm action={chooseRoleAction}>
          <SubmitButton size="lg" className="h-auto w-full flex-col items-start gap-0 py-4 text-start" leading={<Baby className="size-6" aria-hidden="true" />}>
            {t.role_parent}
          </SubmitButton>
        </AsyncForm>
        <p className="text-sm text-ink-soft">{t.role_parent_hint}</p>
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm">{t.role_staff_hint}</p>
      </div>
    );
  }

  const info = await getAuthInfo();
  const data = await loadParentData(await createClient(), info!.id, lang);
  return <OnboardingWizard data={data} />;
}

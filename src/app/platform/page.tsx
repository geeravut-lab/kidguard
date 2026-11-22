import { MapPinOff } from "lucide-react";
import { selectSchoolAction, setSchoolActiveAction } from "@/app/actions/platform";
import { Card } from "@/components/parent/sections";
import { PageHead, schoolName } from "@/components/staff/page-head";
import { PlatformInviteForm } from "@/components/staff/invite-form";
import { SchoolCreateForm } from "@/components/staff/manage-forms";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "แพลตฟอร์ม", robots: { index: false } };

export default async function PlatformPage() {
  await requirePlatformAdmin("/platform");
  const { lang, t } = await getT();
  const { data } = await (await createClient()).from("schools").select("id,slug,name_th,name_en,short_name,lat,active").order("created_at");
  const schools = data ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.platform_title} lead={t.platform_lead} />
      <Card title={t.platform_schools}>
        <ul className="space-y-2">
          {schools.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3" data-testid="school-row">
              <div>
                <p className="font-medium">
                  {schoolName(s, lang)} {s.short_name && <span className="text-ink-soft">({s.short_name})</span>}
                </p>
                <p className="flex items-center gap-2 text-sm text-ink-soft">
                  <code>{s.slug}</code>
                  {s.lat == null && (
                    <span className="inline-flex items-center gap-1 text-warn">
                      <MapPinOff className="size-3.5" aria-hidden="true" /> {t.platform_no_location}
                    </span>
                  )}
                  {!s.active && <span className="text-danger">·</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <AsyncForm action={selectSchoolAction}>
                  <input type="hidden" name="school" value={s.id} />
                  <SubmitButton size="sm">{t.nav_admin_settings}</SubmitButton>
                </AsyncForm>
                <AsyncForm action={setSchoolActiveAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                  <SubmitButton size="sm" variant="ghost">
                    {s.active ? t.platform_deactivate : t.platform_activate}
                  </SubmitButton>
                </AsyncForm>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t.platform_school_add}>
        <SchoolCreateForm />
      </Card>
      <Card title={t.platform_invite_admin}>
        <PlatformInviteForm schools={schools.map((s) => ({ id: s.id, name: schoolName(s, lang) }))} />
      </Card>
    </div>
  );
}

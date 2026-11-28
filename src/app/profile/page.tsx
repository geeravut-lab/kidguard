import { PersonsSection, VehiclesSection } from "@/components/parent/sections";
import { ChangePasswordForm, NameForm } from "@/components/parent/profile-forms";
import { LangSwitch } from "@/components/shell/lang-switch";
import { requireMe } from "@/lib/auth/guards";
import { getAuthInfo } from "@/lib/auth/me";
import { getT } from "@/lib/i18n/server";
import { loadParentData } from "@/lib/parent-data";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/parent/sections";
import { MyDataCard } from "@/components/parent/my-data";
import { LineCard, type LineChannelRow } from "@/components/notify/line-card";

export const metadata = { title: "บัญชีของฉัน", robots: { index: false } };

export default async function ProfilePage() {
  const me = await requireMe("/profile");
  const { lang, t } = await getT();
  const info = await getAuthInfo();
  const lineRows = ((await (await createClient()).rpc("my_line_channels")).data ?? []) as LineChannelRow[];
  const data = me.role === "parent" ? await loadParentData(await createClient(), info!.id, lang) : null;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{t.profile_title}</h1>
      <Card title={t.profile_name_title}>
        <NameForm defaultName={me.display_name ?? ""} />
        <p className="text-sm text-ink-soft">{info?.email}</p>
      </Card>
      <LineCard rows={lineRows} />
      <Card title={t.profile_lang_title}>
        <LangSwitch lang={lang} t={t} />
      </Card>
      {data && (
        <>
          <PersonsSection persons={data.persons} />
          <VehiclesSection vehicles={data.vehicles} />
        </>
      )}
      <Card title={t.pw_title}>{info?.hasPassword ? <ChangePasswordForm /> : <p className="text-sm text-ink-soft">{t.pw_oauth_only}</p>}</Card>
      <Card title={t.mydata_title} lead={t.mydata_lead}>
        <MyDataCard hasPassword={!!info?.hasPassword} />
      </Card>
    </div>
  );
}

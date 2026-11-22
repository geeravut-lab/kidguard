import { revokePlatformAdminAction } from "@/app/actions/admin";
import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate } from "@/components/staff/page-head";
import { PlatformAdminInvite } from "@/components/staff/invite-form";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "ผู้ดูแลแพลตฟอร์ม", robots: { index: false } };

export default async function AdminsPage() {
  const me = await requirePlatformAdmin("/platform/admins");
  const { lang, t } = await getT();
  const a = supabaseAdmin();
  const { data: admins } = await a.from("platform_admins").select("user_id,is_owner,created_at").order("created_at");
  const ids = (admins ?? []).map((x) => x.user_id);
  const { data: profiles } = ids.length ? await a.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.admins_title} lead={t.admins_lead} />
      <Card title={t.admins_title}>
        <ul className="space-y-2">
          {(admins ?? []).map((x) => (
            <li key={x.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3" data-testid="platform-admin-row">
              <div>
                <p className="font-medium">
                  {nameOf.get(x.user_id) || t.admins_none_name} {x.user_id === me.user_id && <span className="text-ink-soft">({t.admins_you})</span>}
                </p>
                <p className="text-sm text-ink-soft">{x.is_owner ? t.admins_owner : fmtDate(x.created_at, lang)}</p>
              </div>
              {!x.is_owner && x.user_id !== me.user_id && (
                <AsyncForm action={revokePlatformAdminAction}>
                  <input type="hidden" name="id" value={x.user_id} />
                  <SubmitButton size="sm" variant="ghost">
                    {t.admins_revoke}
                  </SubmitButton>
                </AsyncForm>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t.admins_invite} lead={t.admins_invite_note}>
        <PlatformAdminInvite />
      </Card>
    </div>
  );
}

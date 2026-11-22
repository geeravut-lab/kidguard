import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate, schoolName } from "@/components/staff/page-head";
import { StaffInviteForm } from "@/components/staff/invite-form";
import { RemoveMemberButton, RevokeInviteButton } from "@/components/staff/manage-forms";
import { requireSchoolRole } from "@/lib/auth/guards";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "เจ้าหน้าที่", robots: { index: false } };

export default async function MembersPage() {
  const { me, school } = await requireSchoolRole(["school_admin"], "/admin/members");
  const { lang, t } = await getT();
  const supabase = await createClient();
  const [staff, invites, rooms] = await Promise.all([
    supabase.rpc("school_staff", { p_school: school.id }),
    supabase.rpc("school_open_invites", { p_school: school.id }),
    supabase.from("classrooms").select("id,name").eq("school_id", school.id).order("sort").order("name"),
  ]);
  const roleLabel = (r: string) => (t as Record<string, string>)[`invite_role_${r}`] ?? r;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.members_title} lead={t.members_lead} school={schoolName(school, lang)} />
      <Card title={t.members_invite_create}>
        <StaffInviteForm classrooms={rooms.data ?? []} />
      </Card>
      <Card title={t.members_open_invites}>
        {((invites.data ?? []) as { id: string; role: string; classroom_name: string | null; expires_at: string }[]).length === 0 ? (
          <p className="text-sm text-ink-soft">{t.members_none_open}</p>
        ) : (
          <ul className="space-y-2">
            {((invites.data ?? []) as { id: string; role: string; classroom_name: string | null; expires_at: string }[]).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                <div>
                  <p className="font-medium">
                    {roleLabel(i.role)} {i.classroom_name && `· ${i.classroom_name}`}
                  </p>
                  <p className="text-sm text-ink-soft">{fmt(t.members_invite_expires, { date: fmtDate(i.expires_at, lang) })}</p>
                </div>
                <RevokeInviteButton id={i.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t.members_list}>
        <ul className="space-y-2">
          {((staff.data ?? []) as { user_id: string; role: string; display_name: string | null; classrooms: string[]; since: string }[]).map((s) => (
            <li key={`${s.user_id}-${s.role}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3" data-testid="member-row">
              <div>
                <p className="font-medium">{s.display_name ?? t.members_unnamed}</p>
                <p className="text-sm text-ink-soft">
                  {roleLabel(s.role)} {s.classrooms.length > 0 && `· ${s.classrooms.join(", ")}`} · {fmt(t.members_since, { date: fmtDate(s.since, lang) })}
                </p>
              </div>
              {s.user_id !== me.user_id && <RemoveMemberButton user={s.user_id} role={s.role} />}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

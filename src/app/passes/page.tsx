import { notFound, redirect } from "next/navigation";
import { PassCreateForm, RevokePassButton } from "@/components/parent/safety-forms";
import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate } from "@/components/staff/page-head";
import { requireMe } from "@/lib/auth/guards";
import { postLoginPath } from "@/lib/auth/me";
import { featureEnabled } from "@/lib/flags/server";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { loadApprovedKids } from "@/lib/safety/parent";
import { passStatus } from "@/lib/safety/pure";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "รหัสผู้รับแทน", robots: { index: false } };

export default async function PassesPage() {
  const me = await requireMe("/passes");
  if (me.role !== "parent") redirect(postLoginPath(me));
  if (!me.onboarded) redirect("/onboarding");
  if (!(await featureEnabled("pickup_passes"))) notFound();
  const { lang, t } = await getT();
  const kids = await loadApprovedKids(me.user_id);
  const { data: passes } = await supabaseAdmin()
    .from("pickup_passes")
    .select("id,holder_name,status,expires_at,used_at,created_at,school_id,pickup_pass_students(students(nickname,first_name))")
    .eq("created_by", me.user_id)
    .order("created_at", { ascending: false })
    .limit(20);
  const schools = [...new Set(kids.map((k) => k.school_id))];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHead title={t.passes_title} lead={t.passes_lead} />
      {kids.length === 0 ? (
        <p className="rounded-xl bg-warn-bg px-4 py-3 text-warn">{t.passes_no_students}</p>
      ) : (
        schools.map((sid) => (
          <Card key={sid} title={t.passes_create}>
            <PassCreateForm school={sid} students={kids.filter((k) => k.school_id === sid).map((k) => ({ id: k.id, label: k.label }))} />
          </Card>
        ))
      )}
      <Card title={t.passes_list}>
        {(passes ?? []).length === 0 ? (
          <p className="text-ink-soft">{t.passes_empty}</p>
        ) : (
          <ul className="space-y-2" data-testid="pass-list">
            {(passes ?? []).map((p) => {
              const st = passStatus(p.status, p.expires_at);
              const names = ((p.pickup_pass_students ?? []) as unknown as { students: { nickname: string | null; first_name: string } | null }[]).map((x) => x.students?.nickname || x.students?.first_name).filter(Boolean).join(", ");
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3" data-status={st}>
                  <div>
                    <p className="font-medium">{p.holder_name} <span className="text-ink-soft">· {names}</span></p>
                    <p className="text-sm text-ink-soft">
                      {t[`passes_status_${st}` as "passes_status_active"]} · {st === "used" && p.used_at ? fmt(t.passes_used_at, { at: fmtDate(p.used_at, lang) }) : fmt(t.passes_expires, { at: fmtDate(p.expires_at, lang) })}
                    </p>
                  </div>
                  {st === "active" && <RevokePassButton id={p.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

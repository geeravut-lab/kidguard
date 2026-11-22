import { notFound } from "next/navigation";
import { resumePickupsAction } from "@/app/actions/safety";
import { BroadcastForm } from "@/components/admin/safety-admin-forms";
import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate, schoolName } from "@/components/staff/page-head";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requireSchoolRole } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/flags/server";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { loadSafetyCfg } from "@/lib/safety/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "ประกาศและพักการรับ", robots: { index: false } };
export const maxDuration = 60; // ส่งการแจ้งเตือนถึงผู้ปกครองทั้งโรงเรียนหลังตอบผู้ใช้

export default async function AnnouncePage() {
  const { school } = await requireSchoolRole(["school_admin", "gate_staff"], "/admin/announce");
  if (!(await featureEnabled("broadcast"))) notFound();
  const { lang, t } = await getT();
  const [cfg, { data: hist }] = await Promise.all([
    loadSafetyCfg(school.id),
    supabaseAdmin().from("broadcasts").select("id,title,body,severity,pause_pickups,recipients,created_at").eq("school_id", school.id).order("created_at", { ascending: false }).limit(10),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.announce_title} lead={t.announce_lead} school={schoolName(school, lang)} />
      <Card title={cfg.pickup_paused ? t.announce_state_paused : t.announce_state_ok}>
        {cfg.pickup_paused && (
          <AsyncForm action={resumePickupsAction}>
            <SubmitButton variant="primary" data-testid="resume-btn">{t.announce_resume}</SubmitButton>
          </AsyncForm>
        )}
      </Card>
      <Card title={t.announce_form}><BroadcastForm /></Card>
      <Card title={t.announce_history}>
        {(hist ?? []).length === 0 ? <p className="text-ink-soft">{t.announce_empty}</p> : (
          <ul className="space-y-2" data-testid="broadcast-history">
            {(hist ?? []).map((b) => (
              <li key={b.id} className="rounded-xl border border-line p-3">
                <p className="font-semibold">{b.title}</p>
                <p className="text-sm">{b.body}</p>
                <p className="mt-1 text-xs text-ink-soft">{fmtDate(b.created_at, lang)} · {fmt(t.announce_recipients, { n: b.recipients })}{b.pause_pickups ? ` · ${t.announce_pause}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

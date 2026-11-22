import { LineSettingsForm, type LineStatus } from "@/components/notify/line-settings-form";
import { PageHead, fmtDate, schoolName } from "@/components/staff/page-head";
import { requireSchoolRole } from "@/lib/auth/guards";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "LINE ของโรงเรียน", robots: { index: false } };

const nowMs = () => Date.now();

export default async function AdminLinePage() {
  const { school } = await requireSchoolRole(["school_admin"], "/admin/line");
  const { lang, t } = await getT();
  const supabase = await createClient();
  const [st, sc] = await Promise.all([supabase.rpc("school_line_status", { p_school: school.id }), supabase.from("schools").select("slug").eq("id", school.id).single()]);
  const s = ((st.data ?? [])[0] ?? { configured: false, enabled: false, basic_id: null, monthly_quota: 1000, sent_this_month: 0, last_error: null, paused_until: null, last_verified_at: null, has_secret: false, has_token: false }) as LineStatus;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://kidguards.vercel.app").replace(/\/+$/, "");
  const paused = s.paused_until && Date.parse(s.paused_until) > nowMs() ? fmt(t.line_admin_paused, { time: fmtDate(s.paused_until, lang), error: s.last_error ?? "" }) : null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title={t.line_admin_title} lead={t.line_admin_lead} school={schoolName(school, lang)} />
      <LineSettingsForm status={s} webhookUrl={`${site}/api/line/webhook/${sc.data?.slug ?? ""}`} pausedText={paused} verifiedText={s.last_verified_at ? fmt(t.line_admin_verified, { time: fmtDate(s.last_verified_at, lang) }) : null} />
    </div>
  );
}

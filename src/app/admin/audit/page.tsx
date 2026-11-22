import { Download } from "lucide-react";
import { AuditFilterForm, AuditSwitchesForm, PurgeForm } from "@/components/admin/audit-forms";
import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate, schoolName } from "@/components/staff/page-head";
import { AsyncLink } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { AUDIT_KINDS, filterToQuery, kindLabel, groupOfAction, parseFilter, parseSwitch, switchableGroups } from "@/lib/audit/kinds";
import { PAGE_SIZE, actorNames, queryAudit, seenGroups } from "@/lib/audit/read";
import { requireSchoolRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { loadPlatformSettings } from "@/lib/settings/platform";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "บันทึกการใช้งาน", robots: { index: false } };

function detailText(d: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (k === "values") continue;
    parts.push(`${k}=${Array.isArray(v) ? v.join("|") : String(v)}`);
  }
  return parts.join(" · ").slice(0, 160);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { me, school } = await requireSchoolRole(["school_admin"], "/admin/audit");
  const { lang, t } = await getT();
  const sp = await searchParams;
  const filter = parseFilter(sp);
  const before = Number(Array.isArray(sp.before) ? sp.before[0] : sp.before) || undefined;
  const scope = { platform: me.platform_admin, schoolId: school.id };
  // แอดมินแพลตฟอร์มเห็นทุกโรงเรียน (กรองเองได้); school_admin เห็นเฉพาะโรงเรียนของตน (บังคับที่ server)
  const a = supabaseAdmin();
  const [{ rows, hasMore }, seen, settings, schoolRow, schools] = await Promise.all([
    queryAudit(filter, scope, before),
    seenGroups(scope),
    loadPlatformSettings(),
    a.from("school_settings").select("audit").eq("school_id", school.id).maybeSingle(),
    me.platform_admin ? a.from("schools").select("id,name_th,name_en").order("created_at") : Promise.resolve({ data: null }),
  ]);
  const names = await actorNames(rows.map((r) => r.actor_id));
  const platformSw = parseSwitch(settings.audit);
  const schoolSw = parseSwitch(schoolRow.data?.audit);
  const groupOpts = [...new Set([...AUDIT_KINDS, ...seen])].sort().map((g) => ({ value: g, label: kindLabel(t as Record<string, string>, g) }));
  const csvHref = `/admin/audit/export${filterToQuery(filter)}`;
  const nextHref = rows.length ? `/admin/audit${filterToQuery(filter, { before: String(rows[rows.length - 1]!.id) })}` : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHead
        title={t.audit_title}
        lead={t.audit_lead}
        school={schoolName(school, lang)}
        actions={
          <AsyncLink href={csvHref} prefetch={false} className={buttonVariants({ variant: "secondary", size: "sm" })} download>
            <Download className="size-4" aria-hidden="true" /> {t.audit_export}
          </AsyncLink>
        }
      />
      <Card title={t.audit_filter}>
        <AuditFilterForm
          base="/admin/audit"
          values={filter as Record<string, string>}
          groups={groupOpts}
          schools={schools.data ? schools.data.map((s) => ({ value: s.id, label: schoolName(s, lang) })) : null}
        />
        <p className="text-xs text-ink-soft">{t.audit_export_note}</p>
      </Card>

      <Card title={t.audit_title}>
        {rows.length === 0 ? (
          <p className="text-ink-soft">{t.audit_empty}</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.audit_title}>
            <table className="w-full min-w-[720px] text-sm" data-testid="audit-table">
              <thead>
                <tr className="border-b border-line text-start text-ink-soft">
                  <th className="py-2 pe-3 text-start">{t.audit_col_time}</th>
                  <th className="py-2 pe-3 text-start">{t.audit_col_actor}</th>
                  <th className="py-2 pe-3 text-start">{t.audit_col_action}</th>
                  <th className="py-2 pe-3 text-start">{t.audit_col_target}</th>
                  <th className="py-2 text-start">{t.audit_col_detail}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 align-top" data-testid="audit-row">
                    <td className="whitespace-nowrap py-2 pe-3">{fmtDate(r.at, lang)}</td>
                    <td className="py-2 pe-3">{r.actor_id ? names.get(r.actor_id) || r.actor_id.slice(0, 8) : t.audit_actor_system}{r.actor_role ? <span className="block text-xs text-ink-soft">{r.actor_role}</span> : null}</td>
                    <td className="py-2 pe-3"><code>{r.action}</code><span className="block text-xs text-ink-soft">{kindLabel(t as Record<string, string>, groupOfAction(r.action, r.source))}</span></td>
                    <td className="py-2 pe-3"><span>{r.entity}</span>{r.entity_id ? <span className="block text-xs text-ink-soft">{r.entity_id.slice(0, 13)}</span> : null}</td>
                    <td className="py-2 break-words text-ink-soft">{detailText(r.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && nextHref && (
          <AsyncLink href={nextHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t.audit_older} ({PAGE_SIZE})
          </AsyncLink>
        )}
      </Card>

      <Card title={`${t.audit_switches_title} — ${t.audit_switches_scope_school}`} lead={t.audit_switch_hint}>
        <AuditSwitchesForm scope="school" enabled={schoolSw.enabled} groups={switchableGroups(seen, schoolSw.off_groups)} off={schoolSw.off_groups} />
      </Card>

      {me.platform_admin && (
        <>
          <Card title={`${t.audit_switches_title} — ${t.audit_switches_scope_platform}`} lead={t.audit_switch_hint}>
            <AuditSwitchesForm scope="platform" enabled={platformSw.enabled} groups={switchableGroups(seen, platformSw.off_groups)} off={platformSw.off_groups} />
          </Card>
          <Card title={t.audit_purge_title} lead={t.audit_purge_lead}>
            <PurgeForm />
          </Card>
        </>
      )}
    </div>
  );
}

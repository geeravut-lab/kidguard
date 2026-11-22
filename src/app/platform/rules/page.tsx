import { RuleForm, type RuleView } from "@/components/admin/rule-form";
import { Card } from "@/components/parent/sections";
import { PageHead, fmtDate } from "@/components/staff/page-head";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { fmt } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { describeTick } from "@/lib/rules/describe";
import { RULE_DEFS, RULE_KEYS, ruleEnabled, ruleNumber } from "@/lib/rules/rules";
import { loadRules } from "@/lib/rules/tick";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "กฎอัตโนมัติ", robots: { index: false } };

export default async function RulesPage() {
  await requirePlatformAdmin("/platform/rules");
  const { lang, t } = await getT();
  const rules = await loadRules();
  const { data: ticks } = await supabaseAdmin().from("cron_ticks").select("id,started_at,summary").order("id", { ascending: false }).limit(5);
  const tt = t as Record<string, string>;
  const views: RuleView[] = [...RULE_KEYS].sort((a, b) => RULE_DEFS[a].sort - RULE_DEFS[b].sort).map((k) => {
    const row = rules.get(k);
    return {
      key: k, title: tt[`rule_${k}`] ?? k, desc: tt[`rule_${k}_d`] ?? "", enabled: ruleEnabled(rules, k),
      params: Object.keys(RULE_DEFS[k].params).map((p) => ({ name: p, label: tt[`param_${p}`] ?? p, value: ruleNumber(rules, k, p) })),
      lastRun: row?.last_run_at ? fmt(t.rules_last_run, { at: fmtDate(row.last_run_at, lang), n: row.last_count ?? 0 }) : t.rules_never,
    };
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.rules_title} lead={t.rules_lead} />
      {views.map((v) => (
        <Card key={v.key} title={v.title}>
          <RuleForm r={v} />
        </Card>
      ))}
      <Card title={t.rules_ticks}>
        {(ticks ?? []).length === 0 ? (
          <p className="text-ink-soft">{t.rules_empty_ticks}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(ticks ?? []).map((k) => (
              <li key={k.id}>{fmt(t.rules_tick_line, { at: fmtDate(k.started_at, lang), summary: describeTick(t, k.summary) })}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

import { setFeatureFlagAction } from "@/app/actions/admin";
import { Card } from "@/components/parent/sections";
import { PageHead } from "@/components/staff/page-head";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { FEATURE_FLAGS, isEnabled } from "@/lib/flags/flags";
import { getFlags } from "@/lib/flags/server";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "สวิตช์ฟีเจอร์", robots: { index: false } };

export default async function FlagsPage() {
  await requirePlatformAdmin("/platform/flags");
  const { t } = await getT();
  const flags = await getFlags();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHead title={t.flags_title} lead={t.flags_lead} />
      <Card title={t.flags_title}>
        <ul className="space-y-2">
          {FEATURE_FLAGS.map((f) => {
            const on = isEnabled(flags, f);
            return (
              <li key={f} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${on ? "border-line" : "border-warn bg-warn-bg"}`} data-testid={`flag-${f}`} data-on={on}>
                <div>
                  <p className="font-medium">{(t as Record<string, string>)[`flag_${f}`]}</p>
                  <p className={`text-sm ${on ? "text-ink-soft" : "font-semibold text-warn"}`}>{on ? t.flags_on : t.flags_off}</p>
                </div>
                <AsyncForm action={setFeatureFlagAction}>
                  <input type="hidden" name="flag" value={f} />
                  <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                  <SubmitButton size="sm" variant={on ? "secondary" : "primary"}>
                    {on ? t.flags_turn_off : t.flags_turn_on}
                  </SubmitButton>
                </AsyncForm>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

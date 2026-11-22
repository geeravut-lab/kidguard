import { setLang } from "@/app/actions/lang";
import { AsyncForm, SubmitButton } from "@/components/ui";
import type { Dict, Lang } from "@/lib/i18n/dict";

export function LangSwitch({ lang, t }: { lang: Lang; t: Dict }) {
  return (
    <div role="group" aria-label={t.lang_switch} className="flex gap-2">
      {(["th", "en"] as const).map((l) => (
        <AsyncForm key={l} action={setLang}>
          <input type="hidden" name="lang" value={l} />
          <SubmitButton
            size="sm"
            variant={lang === l ? "primary" : "secondary"}
            aria-pressed={lang === l}
            disabled={lang === l}
          >
            {l === "th" ? t.lang_th : t.lang_en}
          </SubmitButton>
        </AsyncForm>
      ))}
    </div>
  );
}

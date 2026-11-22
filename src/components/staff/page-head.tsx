import { School } from "lucide-react";
import type { ReactNode } from "react";

export function PageHead({ title, lead, school, actions }: { title: string; lead?: string; school?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 space-y-1">
      {school && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-soft">
          <School className="size-3.5" aria-hidden="true" /> {school}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        {actions}
      </div>
      {lead && <p className="text-ink-soft">{lead}</p>}
    </header>
  );
}

export const fmtDate = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(iso));

export const schoolName = (s: { name_th: string; name_en: string | null }, lang: string) => (lang === "en" && s.name_en ? s.name_en : s.name_th);

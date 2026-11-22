import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";

export function AuthCard({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-4 md:py-10">
      <div className="space-y-2 text-center">
        <LogoMark size={56} className="mx-auto" />
        <h1 className="text-2xl font-bold">{title}</h1>
        {lead && <p className="text-ink-soft">{lead}</p>}
      </div>
      <div className="space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-sm md:p-7">{children}</div>
    </div>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-soft" role="separator">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

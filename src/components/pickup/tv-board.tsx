"use client";

import { OctagonAlert } from "lucide-react";
import { useMemo } from "react";
import { LiveSync } from "@/components/live/live-sync";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { callPhrase } from "@/lib/safety/pure";
import type { TvState } from "@/lib/safety/tv";
import { VoiceAnnouncer } from "./voice-announcer";

/** จอ TV หน้าโรงเรียน: ตัวใหญ่มาก อ่านไกล ๆ; เฉพาะชื่อเล่น + ห้อง; อัปเดตเองด้วยการถามลายนิ้วมือทุก ~3 วินาที */
export function TvBoard({ state, token, schoolName, logoSrc, showArriving, voice }: { state: TvState; token: string; schoolName: string; logoSrc: string; showArriving: boolean; voice: boolean }) {
  const { t, lang } = useI18n();
  const targets = useMemo(() => state.called.map((c) => ({ key: c.id, text: callPhrase({ nickname: c.nickname, classroom: c.classroom, zone: c.zone }, lang) })), [state.called, lang]);
  return (
    <div className="min-h-dvh bg-surface px-6 py-8 md:px-14" data-testid="tv-board">
      <LiveSync quiet topics={[]} fingerprintUrl={`/api/tv/${token}`} fallbackMs={3000} fast initial={state.fp} />
      <header className="flex items-center gap-4">
        <LogoMark size={64} src={logoSrc} />
        <h1 className="text-3xl font-bold md:text-5xl">{schoolName}</h1>
      </header>
      {state.paused && (
        <div role="alert" className="mt-8 flex items-center gap-4 rounded-3xl border-2 border-danger bg-danger-bg p-6 text-danger" data-testid="tv-paused">
          <OctagonAlert className="size-12 shrink-0" aria-hidden="true" />
          <p className="text-3xl font-bold md:text-5xl">{t.tv_paused}</p>
        </div>
      )}
      {voice && (
        <div className="mt-6">
          <VoiceAnnouncer targets={targets} label={{ on: t.tv_voice_on, off: t.tv_voice_ready }} />
        </div>
      )}
      <section className="mt-8" aria-labelledby="tv-called">
        <h2 id="tv-called" className="text-2xl font-semibold text-ink-soft md:text-4xl">{t.tv_heading_called}</h2>
        {state.called.length === 0 ? (
          <p className="mt-6 text-2xl text-ink-soft md:text-4xl" data-testid="tv-wait">{t.tv_wait}</p>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2" data-testid="tv-called-list">
            {state.called.map((c) => (
              <li key={c.id} className="rounded-3xl bg-primary p-6 text-primary-fg" data-testid="tv-called-item">
                <p className="text-5xl font-extrabold md:text-7xl">{c.nickname}</p>
                <p className="mt-2 text-2xl md:text-4xl">{c.classroom ?? ""}{c.zone ? ` · ${c.zone}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {showArriving && state.arriving.length > 0 && (
        <section className="mt-10" aria-labelledby="tv-arriving">
          <h2 id="tv-arriving" className="text-2xl font-semibold text-ink-soft md:text-3xl">{t.tv_heading_arriving}</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3" data-testid="tv-arriving-list">
            {state.arriving.map((a) => (
              <li key={a.id} className={cn("rounded-2xl border p-4", a.arrived ? "border-success" : "border-line")}>
                <p className="text-2xl font-bold md:text-3xl">{a.nickname}</p>
                <p className="text-lg text-ink-soft md:text-xl">{a.classroom ?? ""} · {a.arrived ? t.tv_arrived : a.eta_min != null ? fmt(t.tv_min, { n: a.eta_min }) : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

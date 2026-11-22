"use client";

import { BellRing, CircleCheckBig, Clock3, OctagonAlert, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { staffCallAction, staffReleaseAction, staffVerifyAction } from "@/app/actions/pickup";
import { setSessionZoneAction } from "@/app/actions/safety";
import { VoiceAnnouncer } from "./voice-announcer";
import { callPhrase } from "@/lib/safety/pure";
import { LiveSync } from "@/components/live/live-sync";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { fmtDistance, fmtEta } from "./format";

export type QueueRow = {
  session_id: string; status: "on_the_way" | "arrived"; distance_m: number | null; eta_s: number | null; stale: boolean; seen_ago_s: number;
  verified_at: string | null; manual_arrival: boolean; driver_name: string; plate: string; plate_province: string; vehicle_desc: string | null;
  students: { id: string; name: string; nickname: string | null; classroom: string | null; status: "waiting" | "called" | "released"; held?: boolean }[];
  zone_id?: string | null; zone_name?: string | null;
};
export type ZoneOpt = { id: string; name: string };

/** คิวรับนักเรียน (จอประตู/ครู): ตัวใหญ่ อ่านจากระยะไกล; ลำดับมาจากฐานข้อมูล (เรียงเหมือนกันทุกจอ) */
export function QueueBoard({ rows: allRows, topics, fingerprintUrl, canVerify, title, initial, zones = [], canMoveZone = false, paused = null, voice = false }: {
  rows: QueueRow[]; topics: string[]; fingerprintUrl: string; canVerify: boolean; title?: string; initial?: string;
  /** ประตูที่เปิดใช้ (ว่าง = ไม่แสดงตัวกรอง) */ zones?: ZoneOpt[]; canMoveZone?: boolean;
  /** พักการรับ: ปิดปุ่มเรียก/ปล่อย (server ปฏิเสธซ้ำ) */ paused?: { note: string | null } | null; voice?: boolean;
}) {
  const { t, lang } = useI18n();
  const [zone, setZone] = useState<string>("all");
  const rows = useMemo(() => (zone === "all" ? allRows : allRows.filter((r) => (zone === "none" ? !r.zone_id : r.zone_id === zone))), [allRows, zone]);
  const targets = useMemo(
    () => allRows.flatMap((r) => r.students.filter((s) => s.status === "called").map((s) => ({ key: `${r.session_id}:${s.id}`, text: callPhrase({ nickname: s.nickname || s.name.split(" ")[0] || s.name, classroom: s.classroom, zone: r.zone_name }, lang) }))),
    [allRows, lang],
  );
  return (
    <section aria-labelledby="qb-title" data-testid="queue-board">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="qb-title" className="text-2xl font-bold md:text-3xl">{title ?? t.queue_title}</h2>
          <p className="mt-1 flex items-center gap-2 text-ink-soft"><Clock3 className="size-4" aria-hidden="true" /> {t.queue_subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-surface-2 px-3 py-1 font-medium" data-testid="queue-count">{fmt(t.queue_count, { n: rows.length })}</span>
          <LiveSync topics={topics} fingerprintUrl={fingerprintUrl} initial={initial} />
        </div>
      </div>

      {paused && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-danger bg-danger-bg p-4 text-danger" data-testid="paused-banner">
          <OctagonAlert className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-lg font-bold">{t.paused_title}</p>
            <p>{paused.note || t.paused_body_default}</p>
          </div>
        </div>
      )}
      {voice && <div className="mt-4"><VoiceAnnouncer targets={targets} /></div>}
      {zones.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t.gate_zone_all} data-testid="zone-filter">
          {[{ id: "all", name: t.gate_zone_all }, ...zones, { id: "none", name: t.gate_zone_unset }].map((z) => (
            <AsyncButton key={z.id} size="sm" variant={zone === z.id ? "primary" : "secondary"} aria-pressed={zone === z.id} onClick={() => setZone(z.id)}>
              {z.name}
            </AsyncButton>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-ink-soft" data-testid="queue-empty">{t.queue_empty}</p>
      ) : (
        <ol className="mt-5 space-y-3">
          {rows.map((r, i) => {
            const called = r.students.every((s) => s.status === "called");
            const allHeld = r.students.length > 0 && r.students.every((s) => s.held);
            return (
              <li key={r.session_id} data-testid="queue-row" data-session={r.session_id} data-status={r.status}
                className={cn("space-y-3 rounded-2xl border bg-surface p-4", r.status === "arrived" ? "border-success" : "border-line")}>
                <div className="flex items-center gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-fg" aria-label={`${t.queue_order} ${i + 1}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-semibold">{r.driver_name}</p>
                    <p className="font-mono text-lg tracking-wide text-ink-soft">{r.plate} <span className="font-sans text-sm">{r.plate_province}</span> {r.vehicle_desc && <span className="font-sans text-sm">· {r.vehicle_desc}</span>}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {r.verified_at && <Chip tone="ok"><ShieldCheck className="size-3.5" aria-hidden="true" /> {t.queue_verified}</Chip>}
                      {r.manual_arrival && <Chip tone="warn">{t.queue_manual}</Chip>}
                      {r.stale && <Chip tone="warn">{fmt(t.queue_stale, { min: Math.max(1, Math.round(r.seen_ago_s / 60)) })}</Chip>}
                      {r.zone_name && <Chip tone="muted" testid="row-zone">{r.zone_name}</Chip>}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className={cn("text-3xl font-bold tabular-nums", r.status === "arrived" && "text-success")} data-testid="row-eta">{fmtEta(r.eta_s, r.status, t)}</p>
                    <p className="text-base tabular-nums text-ink-soft" data-testid="row-distance">{fmtDistance(r.distance_m, t)}</p>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-2 border-t border-line pt-3">
                  {r.students.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
                      <span className="text-base font-medium">{s.nickname ? `${s.nickname} ` : ""}{s.name}</span>
                      {s.classroom && <span className="text-sm text-ink-soft">{s.classroom}</span>}
                      <Chip tone={s.status === "called" ? "warn" : "muted"}>{s.status === "called" ? t.queue_status_called : t.queue_status_waiting}</Chip>
                      {s.held && <Chip tone="danger" testid="held-badge"><ShieldAlert className="size-3.5" aria-hidden="true" /> {t.held_badge}</Chip>}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap justify-end gap-2">
                  {canVerify && !r.verified_at && (
                    <AsyncForm action={staffVerifyAction}>
                      <input type="hidden" name="session" value={r.session_id} />
                      <SubmitButton size="sm" variant="secondary" leading={<ShieldCheck className="size-4" aria-hidden="true" />}>{t.queue_verify}</SubmitButton>
                    </AsyncForm>
                  )}
                  {canMoveZone && zones.length > 0 && (
                    <AsyncForm action={setSessionZoneAction} className="flex items-center gap-2">
                      <input type="hidden" name="session" value={r.session_id} />
                      <select name="zone" defaultValue={r.zone_id ?? ""} aria-label={t.gate_zone_move} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm">
                        <option value="">{t.gate_zone_unset}</option>
                        {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                      <SubmitButton size="sm" variant="ghost">{t.gate_zone_move}</SubmitButton>
                    </AsyncForm>
                  )}
                  {!called && !paused && (
                    <AsyncForm action={staffCallAction}>
                      <input type="hidden" name="session" value={r.session_id} />
                      <SubmitButton size="sm" variant={r.status === "arrived" ? "primary" : "secondary"} leading={<BellRing className="size-4" aria-hidden="true" />}>{t.queue_call}</SubmitButton>
                    </AsyncForm>
                  )}
                  <AsyncForm action={staffReleaseAction}>
                    <input type="hidden" name="session" value={r.session_id} />
                    <SubmitButton size="sm" variant={called ? "primary" : "secondary"} disabled={!!paused || allHeld} leading={<CircleCheckBig className="size-4" aria-hidden="true" />}>{t.queue_release}</SubmitButton>
                  </AsyncForm>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Chip({ children, tone, testid }: { children: React.ReactNode; tone: "ok" | "warn" | "muted" | "danger"; testid?: string }) {
  return <span data-testid={testid} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tone === "ok" ? "bg-success-bg text-success" : tone === "warn" ? "bg-warn-bg text-warn" : tone === "danger" ? "bg-danger-bg text-danger" : "bg-surface-2 text-ink-soft")}>{children}</span>;
}

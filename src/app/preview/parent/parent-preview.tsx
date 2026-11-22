"use client";

import { useState } from "react";
import { CarFront, CircleCheckBig, Lock } from "lucide-react";
import { AsyncButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";

/** หน้าจอตัวอย่างของผู้ปกครองระหว่างเดินทาง (ข้อมูลสมมุติ — ไม่เรียก API ใด ๆ) */
export function ParentPreview() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);

  // จำลองงานที่ช้า เพื่อให้เห็นสปินเนอร์และกดซ้ำไม่ได้ (กติกาข้อ 3)
  const fake = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  return (
    <section aria-labelledby="pp-title" className="space-y-4">
      <h1 id="pp-title" className="text-2xl font-bold">
        {t.preview_parent_title}
      </h1>

      <div className="rounded-3xl bg-primary p-6 text-primary-fg">
        <p className="text-sm opacity-90">{t.preview_parent_eta_label}</p>
        <p className="text-5xl font-bold tabular-nums">{fmt(t.preview_parent_eta_value, { min: 8 })}</p>
        <p className="mt-1 text-lg opacity-95">{fmt(t.preview_parent_distance, { km: "1.4" })}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-label={t.preview_parent_eta_label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={30}>
          <div className="h-full w-[30%] rounded-full bg-accent" />
        </div>
      </div>

      <figure className="overflow-hidden rounded-2xl border border-line bg-surface">
        <svg viewBox="0 0 400 180" role="img" aria-label={t.preview_parent_map_label} className="block w-full bg-surface-2">
          <g stroke="currentColor" className="text-line" strokeWidth="10" fill="none" strokeLinecap="round">
            <path d="M-10 120 L150 90 L260 130 L420 60" />
            <path d="M80 -10 L120 190" />
            <path d="M300 -10 L250 190" />
          </g>
          <path d="M30 150 C 110 110, 150 100, 210 112 S 330 70, 352 52" stroke="var(--kg-primary)" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray="2 12" />
          <circle cx="30" cy="150" r="9" fill="var(--kg-primary-strong)" />
          <path d="M352 22a18 18 0 0 1 18 18c0 14-18 36-18 36s-18-22-18-36a18 18 0 0 1 18-18z" fill="var(--kg-accent)" />
          <circle cx="352" cy="40" r="6" fill="var(--kg-ink)" />
        </svg>
        <figcaption className="flex items-center gap-2 border-t border-line px-4 py-2 text-xs text-ink-soft">
          <Lock className="size-3.5" aria-hidden="true" /> {t.preview_parent_map_label}
        </figcaption>
      </figure>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-line bg-surface p-3">
          <dt className="text-ink-soft">{t.preview_parent_students}</dt>
          <dd className="font-semibold">น้องมะลิ อ.3/1 · น้องไผ่ ป.1/1</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <dt className="text-ink-soft">{t.preview_parent_vehicle}</dt>
          <dd className="flex items-center gap-2 font-semibold">
            <CarFront className="size-4" aria-hidden="true" /> 1กข 2345 กรุงเทพมหานคร
          </dd>
        </div>
        <div className="col-span-2 rounded-xl border border-line bg-surface p-3">
          <dt className="text-ink-soft">{t.preview_parent_driver}</dt>
          <dd className="font-semibold">คุณสมหญิง ใจดี</dd>
        </div>
      </dl>

      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <Lock className="size-4 shrink-0" aria-hidden="true" /> {t.preview_parent_privacy}
      </p>

      <div className="flex flex-col gap-3 pt-2">
        <AsyncButton size="lg" onClick={async () => { await fake(1500); setDone(true); }} disabled={done} leading={<CircleCheckBig className="size-5" aria-hidden="true" />}>
          {t.preview_parent_pickup_done}
        </AsyncButton>
        <AsyncButton variant="secondary" onClick={() => fake(1200)} disabled={done}>
          {t.preview_parent_cancel}
        </AsyncButton>
      </div>
      <p role="status" aria-live="polite" className={done ? "rounded-xl bg-success-bg px-4 py-3 text-success" : "sr-only"}>
        {done ? t.preview_parent_pickup_done_toast : ""}
      </p>
    </section>
  );
}

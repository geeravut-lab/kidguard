"use client";

import { useState } from "react";
import { BellRing, CircleCheckBig, Clock3 } from "lucide-react";
import { AsyncButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/dict";
import { cn } from "@/lib/cn";

type Status = "arrived" | "on_the_way" | "called";
type Row = { id: string; parent: string; plate: string; students: string[]; etaMin: number; meters: number; status: Status };

// ข้อมูลสมมุติ เรียงตามลำดับที่ระบบจริงจะเรียง: ถึงประตู → ETA น้อย→มาก → ระยะน้อย→มาก
const SAMPLE: Row[] = [
  { id: "a", parent: "คุณสมชาย ใจดี", plate: "กท 1234", students: ["น้องภูมิ ป.3/2"], etaMin: 0, meters: 40, status: "arrived" },
  { id: "b", parent: "คุณสุดา มีสุข", plate: "3กข 5678", students: ["น้องมะลิ อ.3/1", "น้องไผ่ ป.1/1"], etaMin: 2, meters: 650, status: "on_the_way" },
  { id: "c", parent: "คุณวิชัย รักดี", plate: "ฮก 9012", students: ["น้องกานต์ ม.2/4"], etaMin: 5, meters: 1900, status: "on_the_way" },
  { id: "d", parent: "คุณนภา สุขใจ", plate: "2ขค 3456", students: ["น้องฟ้า ป.6/1"], etaMin: 9, meters: 3400, status: "on_the_way" },
];

export function GatePreview() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>(SAMPLE);
  const fake = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const statusLabel: Record<Status, string> = {
    arrived: t.preview_gate_status_arrived,
    on_the_way: t.preview_gate_status_on_the_way,
    called: t.preview_gate_status_called,
  };
  const statusClass: Record<Status, string> = {
    arrived: "bg-success-bg text-success",
    on_the_way: "bg-surface-2 text-ink-soft",
    called: "bg-warn-bg text-warn",
  };

  async function call(id: string) {
    await fake(1200);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "called" } : r)));
  }
  async function release(id: string) {
    await fake(1200);
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  return (
    <section aria-labelledby="gp-title">
      <h1 id="gp-title" className="text-2xl font-bold md:text-3xl">
        {t.preview_gate_title}
      </h1>
      <p className="mt-1 flex items-center gap-2 text-ink-soft">
        <Clock3 className="size-4" aria-hidden="true" /> {t.preview_gate_subtitle}
        <span className="ms-auto text-xs">{t.preview_gate_updated}</span>
      </p>

      <ol className="mt-5 space-y-3">
        {rows.map((r, i) => (
          <li key={r.id} className="grid items-center gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[3rem_1.6fr_1.4fr_7rem_7rem_11rem]">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-fg" aria-label={`${t.preview_gate_col_order} ${i + 1}`}>
              {i + 1}
            </span>
            <div>
              <p className="text-lg font-semibold">{r.parent}</p>
              <p className="font-mono text-base tracking-wide text-ink-soft">{r.plate}</p>
            </div>
            <div>
              <p className="text-base font-medium">{r.students.join(" · ")}</p>
              <span className={cn("mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", statusClass[r.status])}>{statusLabel[r.status]}</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{r.etaMin === 0 ? t.preview_gate_now : fmt(t.preview_gate_minutes, { min: r.etaMin })}</p>
            <p className="text-base tabular-nums text-ink-soft">
              {r.meters < 1000 ? fmt(t.preview_gate_meters, { m: r.meters }) : fmt(t.preview_gate_km, { km: (r.meters / 1000).toFixed(1) })}
            </p>
            {r.status === "called" ? (
              <AsyncButton onClick={() => release(r.id)} leading={<CircleCheckBig className="size-5" aria-hidden="true" />}>
                {t.preview_gate_release}
              </AsyncButton>
            ) : (
              <AsyncButton variant={r.status === "arrived" ? "primary" : "secondary"} onClick={() => call(r.id)} leading={<BellRing className="size-5" aria-hidden="true" />}>
                {t.preview_gate_call}
              </AsyncButton>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

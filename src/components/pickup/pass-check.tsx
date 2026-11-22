"use client";

import { QrCode, ScanLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { checkPassAction } from "@/app/actions/safety";
import { FormMessage, TextField } from "@/components/forms/fields";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import { useI18n } from "@/lib/i18n/client";
import { normalizePassCode } from "@/lib/safety/pure";
import type { PassInfo } from "@/lib/safety/server";

type BarcodeDetectorLike = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type Ctor = new (o: { formats: string[] }) => BarcodeDetectorLike;

/** ตรวจรหัสผู้รับแทนที่ประตู: พิมพ์รหัส (หรือสแกน QR ถ้าเบราว์เซอร์รองรับ) → ดูชื่อ/นักเรียน → ตรวจบัตร → ยืนยัน (ใช้ครั้งเดียว) */
export function PassCheck() {
  const { t } = useI18n();
  const [state, action] = useActionState(checkPassAction, null as ActionState);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const data = state?.ok ? (state.data as { pass: PassInfo; consumed: boolean } | undefined) : undefined;
  const pass = data?.pass;
  const done = data?.consumed;
  const supported = useSyncExternalStore(
    () => () => {},
    () => "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );

  useEffect(() => {
    if (!scanning) return;
    let stop = false;
    let stream: MediaStream | undefined;
    (async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector: Ctor }).BarcodeDetector;
        const det = new Detector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        while (!stop && video.current) {
          const found = await det.detect(video.current).catch(() => []);
          const c = found.map((f) => normalizePassCode(f.rawValue)).find(Boolean);
          if (c) {
            setCode(c);
            setScanning(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setScanMsg(t.gate_pass_scan_unsupported);
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, [scanning, t]);

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5" aria-labelledby="pc-title" data-testid="pass-check">
      <div>
        <h2 id="pc-title" className="flex items-center gap-2 text-lg font-semibold"><QrCode className="size-5" aria-hidden="true" /> {t.gate_pass_title}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t.gate_pass_lead}</p>
      </div>
      <AsyncForm action={action} className="space-y-3">
        <TextField label={t.gate_pass_code} name="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" maxLength={20} className="font-mono text-xl tracking-widest" />
        <div className="flex flex-wrap gap-2">
          <SubmitButton variant="primary">{t.gate_pass_check}</SubmitButton>
          {supported && (
            <AsyncButton variant="secondary" leading={<ScanLine className="size-4" aria-hidden="true" />} onClick={() => { setScanMsg(null); setScanning((v) => !v); }}>
              {scanning ? t.gate_pass_stop_scan : t.gate_pass_scan}
            </AsyncButton>
          )}
        </div>
        {scanning && <video ref={video} muted playsInline className="aspect-video w-full max-w-sm rounded-xl bg-black" aria-label={t.gate_pass_scanning} />}
        {scanMsg && <p className="text-sm text-warn">{scanMsg}</p>}
        {!pass && <FormMessage state={state} />}
      </AsyncForm>

      {pass && !done && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4" data-testid="pass-result">
          <dl className="grid gap-1 text-base">
            <div className="flex gap-2"><dt className="text-ink-soft">{t.gate_pass_holder}</dt><dd className="font-semibold" data-testid="pass-holder">{pass.holder_name}</dd></div>
            {pass.plate && <div className="flex gap-2"><dt className="text-ink-soft">{t.gate_pass_plate}</dt><dd className="font-mono">{pass.plate}</dd></div>}
          </dl>
          <div>
            <p className="text-sm text-ink-soft">{t.gate_pass_students}</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {pass.students.map((s) => (
                <li key={s.id} className="rounded-xl bg-surface px-3 py-1.5 font-medium">{s.nickname}{s.classroom ? ` · ${s.classroom}` : ""}{s.held && <span className="ms-2 text-danger"><ShieldAlert className="inline size-4" aria-hidden="true" /> {t.held_badge}</span>}</li>
              ))}
            </ul>
          </div>
          {pass.held > 0 ? (
            <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 font-medium text-danger">{t.gate_pass_held}</p>
          ) : (
            <AsyncForm action={action} className="space-y-2">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="confirm" value="yes" />
              <p className="flex items-start gap-2 text-sm text-ink-soft"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t.gate_pass_check_id}</p>
              <FormMessage state={state?.ok ? null : state} />
              <SubmitButton variant="primary" leading={<ShieldCheck className="size-4" aria-hidden="true" />}>{t.gate_pass_confirm}</SubmitButton>
            </AsyncForm>
          )}
        </div>
      )}
      {done && <p role="status" className="rounded-xl bg-success-bg px-4 py-3 font-medium text-success" data-testid="pass-done">{t.gate_pass_done}</p>}
    </section>
  );
}

"use client";

import { Check, Copy, ExternalLink, MessageCircleMore, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sendTestNotificationAction, startLineLinkAction, unlinkLineAction } from "@/app/actions/notify";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { Card } from "@/components/parent/sections";
import { errorText } from "@/lib/action";
import { useI18n } from "@/lib/i18n/client";

export type LineChannelRow = { school_id: string; school_name: string; enabled: boolean; basic_id: string | null; status: "pending" | "active" | "stopped" | null; last_error: string | null; code_expires_at: string | null };

const POLL_MS = 4000;

/** ผูกบัญชี LINE เพื่อรับแจ้งเตือน (docs/LINE-ACCOUNT-LINKING-KNOWLEDGE.md §8): 4 ขั้นตอน + รีเฟรชอัตโนมัติจนเชื่อมต่อแล้ว */
export function LineCard({ rows }: { rows: LineChannelRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  return (
    <Card title={t.line_title} lead={t.line_lead}>
      <div className="space-y-4">
        {rows.map((r) => (<LineConnect key={r.school_id} row={r} showName={rows.length > 1} />))}
      </div>
    </Card>
  );
}

function LineConnect({ row, showName }: { row: LineChannelRow; showName: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [issued, setIssued] = useState<{ code: string; basicId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // แสดงขั้นตอนเฉพาะเมื่อสถานะยัง pending (ยกเลิก/เชื่อมต่อแล้ว → รหัสเก่าไม่ค้างหน้าจอ)
  const shown = row.status === "pending" ? issued : null;
  const waiting = shown !== null;

  // ระหว่างรอรหัสจาก LINE: ให้ server อ่านสถานะใหม่ทุก 4 วินาที (ไม่ต้องใช้ websocket) จนเชื่อมต่อแล้วหรือครบ 30 นาที
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 30 * 60_000) clearInterval(id);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [waiting, router]);

  async function connect() {
    setError(null);
    setNote(null);
    const r = await startLineLinkAction(row.school_id);
    if (!r.ok) return setError(errorText(t, r.error));
    setIssued({ code: r.code, basicId: r.basicId });
    router.refresh();
  }
  async function test() {
    setError(null);
    const r = await sendTestNotificationAction(row.school_id);
    if (r.ok) setNote(t.line_test_sent);
    else setError(errorText(t, r.error));
  }
  async function copy() {
    if (!shown) return;
    await navigator.clipboard?.writeText(shown.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const heading = showName ? <p className="font-semibold">{row.school_name}</p> : null;

  if (!row.enabled) return <div>{heading}<p className="text-sm text-ink-soft">{t.line_school_unavailable}</p></div>;

  if (row.status === "active") {
    return (
      <div className="space-y-3" data-testid="line-connected">
        {heading}
        <p className="inline-flex items-center gap-2 rounded-full bg-success-bg px-3 py-1 text-sm font-semibold text-success"><Check className="size-4" aria-hidden="true" /> {t.line_connected}</p>
        <div className="flex flex-wrap gap-2">
          <AsyncButton variant="secondary" size="sm" onClick={test} leading={<Send className="size-4" aria-hidden="true" />}>{t.line_test_btn}</AsyncButton>
          <AsyncForm action={unlinkLineAction}>
            <input type="hidden" name="school" value={row.school_id} />
            <SubmitButton variant="ghost" size="sm">{t.line_disconnect_btn}</SubmitButton>
          </AsyncForm>
        </div>
        {note && <p role="status" className="text-sm text-success">{note}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {heading}
      {row.status === "stopped" && (
        <p role="status" className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">{row.last_error === "unfollowed" ? t.line_stopped_unfollowed : t.line_stopped_blocked}</p>
      )}
      <AsyncButton variant={shown ? "secondary" : "primary"} onClick={connect} leading={<MessageCircleMore className="size-5" aria-hidden="true" />}>
        {row.status === "pending" || row.status === "stopped" ? t.line_new_code_btn : t.line_connect_btn}
      </AsyncButton>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      {shown && (
        <ol aria-label={t.line_title} className="space-y-3" data-testid="line-steps">
          <li className="space-y-2 rounded-xl border border-line p-3">
            <p className="font-semibold">1. {t.line_step1}</p>
            <div className="flex flex-wrap items-center gap-3">
              <code data-testid="line-code" aria-label={shown.code.split("").join(" ")} className="select-all rounded-lg bg-surface-2 px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em]">{shown.code}</code>
              <AsyncButton variant="secondary" size="sm" onClick={copy} leading={<Copy className="size-4" aria-hidden="true" />}>{copied ? t.line_copied : t.line_copy}</AsyncButton>
            </div>
            <p className="text-xs text-ink-soft">{t.line_step1_hint}</p>
          </li>
          <li className="space-y-2 rounded-xl border border-line p-3">
            <p className="font-semibold">2. {t.line_step2}</p>
            <a href={`https://line.me/R/ti/p/${encodeURIComponent(shown.basicId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 font-semibold text-primary hover:bg-surface-2">
              <ExternalLink className="size-4" aria-hidden="true" /> {t.line_step2_btn}
            </a>
          </li>
          <li className="space-y-2 rounded-xl border border-line p-3">
            <p className="font-semibold">3. {t.line_step3}</p>
            <a href={`https://line.me/R/oaMessage/${encodeURIComponent(shown.basicId)}/?${shown.code}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 font-semibold text-primary hover:bg-surface-2">
              <ExternalLink className="size-4" aria-hidden="true" /> {t.line_step3_btn}
            </a>
            <p className="text-xs text-ink-soft">{t.line_step3_hint}</p>
          </li>
          <li className="space-y-1 rounded-xl border border-line p-3">
            <p className="font-semibold">4. {t.line_step4}</p>
            <p className="text-sm text-ink-soft" role="status">{t.line_waiting}</p>
            <p className="text-xs text-ink-soft">{t.line_step4_hint}</p>
          </li>
        </ol>
      )}
    </div>
  );
}

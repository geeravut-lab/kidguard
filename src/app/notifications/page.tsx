import { Bell, CheckCheck } from "lucide-react";
import { markAllReadAction, openNotificationAction } from "@/app/actions/notify";
import { PageHead, fmtDate } from "@/components/staff/page-head";
import { AsyncForm, SubmitButton } from "@/components/ui";
import { requireMe } from "@/lib/auth/guards";
import { cn } from "@/lib/cn";
import { getMyFingerprint } from "@/lib/live/fingerprint";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "การแจ้งเตือน", robots: { index: false } };

type Row = { id: string; kind: "info" | "success" | "warning" | "danger"; title: string; body: string | null; fields: { label: string; value: string }[]; link: string | null; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  await requireMe("/notifications");
  await getMyFingerprint(); // ก่อนอ่านข้อมูล (แคชเดียวกับ AppShell)
  const { lang, t } = await getT();
  const { data } = await (await createClient()).from("app_notifications").select("id,kind,title,body,fields,link,read_at,created_at").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Row[];
  const unread = rows.filter((r) => !r.read_at).length;
  const tone = { info: "bg-surface-2 text-primary", success: "bg-success-bg text-success", warning: "bg-warn-bg text-warn", danger: "bg-danger-bg text-danger" } as const;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead
        title={t.notifications_title}
        actions={unread > 0 ? (
          <AsyncForm action={markAllReadAction}>
            <SubmitButton size="sm" variant="secondary" leading={<CheckCheck className="size-4" aria-hidden="true" />}>{t.notifications_mark_all}</SubmitButton>
          </AsyncForm>
        ) : undefined}
      />
      {rows.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-ink-soft">{t.notifications_empty}</p>}
      <ul className="space-y-3">
        {rows.map((n) => (
          <li key={n.id} data-testid="notification" data-unread={n.read_at ? "false" : "true"} className={cn("space-y-2 rounded-2xl border bg-surface p-4", n.read_at ? "border-line" : "border-primary")}>
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", tone[n.kind])}><Bell className="size-4" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{n.title}</p>
                {n.body && <p className="text-sm text-ink-soft">{n.body}</p>}
                {n.fields.length > 0 && (
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                    {n.fields.map((f, i) => (<div key={i} className="contents"><dt className="text-ink-soft">{f.label}</dt><dd>{f.value}</dd></div>))}
                  </dl>
                )}
                <p className="mt-1 text-xs text-ink-soft">{fmtDate(n.created_at, lang)}{!n.read_at && ` · ${t.notifications_unread}`}</p>
              </div>
            </div>
            {n.link && (
              <AsyncForm action={openNotificationAction} className="flex justify-end">
                <input type="hidden" name="id" value={n.id} />
                <SubmitButton size="sm" variant={n.read_at ? "ghost" : "secondary"}>{t.notif_open}</SubmitButton>
              </AsyncForm>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Backpack, Clock3, Lock } from "lucide-react";
import { requireMe } from "@/lib/auth/guards";
import { getMyFingerprint } from "@/lib/live/fingerprint";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dict";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";

export const metadata = { title: "ผู้ปกครองมารับ", robots: { index: false } };

type Row = { student_id: string; student_label: string; enabled: boolean; session_id: string | null; status: "on_the_way" | "arrived" | null; eta_s: number | null; distance_m: number | null; student_status: "waiting" | "called" | "released" | null };

/** จอนักเรียน: เห็นเฉพาะระยะ/เวลาของผู้ปกครองที่กำลังมารับตัวเอง — ไม่เห็นชื่อผู้ปกครอง ทะเบียน ตำแหน่ง หรือเส้นทาง */
export default async function StudentPage() {
  const me = await requireMe("/student");
  if ((me.students?.length ?? 0) === 0) redirect("/start");
  await getMyFingerprint(); // ก่อนอ่านข้อมูล (แคชเดียวกับ AppShell)
  const { t } = await getT();
  const { data } = await (await createClient()).rpc("student_pickup_status");
  const rows = (data ?? []) as Row[];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">{t.student_title}</h1>
      {rows.map((r) => {
        const mins = r.eta_s == null ? null : Math.max(1, Math.ceil(r.eta_s / 60));
        const arrived = r.status === "arrived";
        return (
          <section key={r.student_id} data-testid="student-card" className={cn("space-y-2 rounded-3xl p-6", !r.enabled || !r.session_id ? "border border-line bg-surface" : arrived ? "bg-success text-white" : "bg-primary text-primary-fg")}>
            <p className="flex items-center gap-2 text-lg font-semibold"><Backpack className="size-5" aria-hidden="true" /> {r.student_label}</p>
            {!r.enabled ? (
              <p className="text-ink-soft">{t.student_disabled}</p>
            ) : !r.session_id ? (
              <p className="text-ink-soft">{t.student_none}</p>
            ) : (
              <>
                <p className="text-3xl font-bold" data-testid="student-status">{arrived ? t.student_arrived : mins == null ? "—" : fmt(t.student_eta, { min: mins })}</p>
                {r.student_status === "called" && <p className="flex items-center gap-2 text-lg"><Clock3 className="size-5" aria-hidden="true" /> {t.student_called}</p>}
              </>
            )}
          </section>
        );
      })}
      <p className="flex items-center gap-2 text-sm text-ink-soft"><Lock className="size-4 shrink-0" aria-hidden="true" /> {t.student_privacy}</p>
    </div>
  );
}

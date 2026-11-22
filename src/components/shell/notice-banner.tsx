import { Megaphone, OctagonAlert } from "lucide-react";
import type { Dict } from "@/lib/i18n/dict";
import type { SchoolNotice } from "@/lib/safety/server";
import { cn } from "@/lib/cn";

/** แบนเนอร์ประกาศฉุกเฉิน/พักการรับ: อยู่บนสุดของทุกหน้าสำหรับผู้ที่ล็อกอินและเกี่ยวข้องกับโรงเรียน */
export function NoticeBanner({ notice, t }: { notice: SchoolNotice; t: Dict }) {
  const b = notice.broadcast;
  const danger = notice.paused || b?.severity === "danger";
  return (
    <div role="alert" data-testid="notice-banner" className={cn("border-b px-4 py-3 md:px-8", danger ? "border-danger bg-danger-bg text-danger" : "border-warn bg-warn-bg text-warn")}>
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        {danger ? <OctagonAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : <Megaphone className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
        <div className="min-w-0">
          {notice.paused && <p className="font-bold">{t.paused_title}{notice.pauseNote ? ` — ${notice.pauseNote}` : ""}</p>}
          {b && (
            <p>
              <span className="font-semibold">{b.title}</span> <span>{b.body}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

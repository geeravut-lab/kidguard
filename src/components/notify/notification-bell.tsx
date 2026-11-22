import { Bell } from "lucide-react";
import { AsyncLink } from "@/components/ui";
import { fmt, type Dict } from "@/lib/i18n/dict";

/** กระดิ่งแจ้งเตือน + จำนวนที่ยังไม่อ่าน (อัปเดตสดผ่าน LiveSync ใน AppShell) */
export function NotificationBell({ count, t }: { count: number; t: Dict }) {
  return (
    <AsyncLink href="/notifications" aria-label={count > 0 ? fmt(t.notifications_bell_unread, { n: count }) : t.notifications_bell}
      className="relative inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-2" data-testid="bell">
      <Bell className="size-6" aria-hidden="true" />
      {count > 0 && (
        <span data-testid="bell-count" className="absolute end-0.5 top-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-bold leading-5 text-white">{count > 99 ? "99+" : count}</span>
      )}
    </AsyncLink>
  );
}

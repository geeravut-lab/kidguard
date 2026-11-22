"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, CarFront, ClipboardCheck, Ellipsis, GraduationCap, House, ListOrdered, School, Settings, Smartphone, UserRound, Users, UsersRound, X } from "lucide-react";
import { AsyncButton, AsyncLink } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { NavIcon } from "@/config/nav";

export type NavEntry = { href: string; label: string; icon: NavIcon };

const ICONS = {
  home: House, parent: Smartphone, gate: ListOrdered, children: UsersRound, account: UserRound, teacher: GraduationCap,
  classroom: School, students: Users, staff: UsersRound, settings: Settings, approvals: ClipboardCheck, platform: Building2, pickup: CarFront,
} as const;
const MAX_BAR = 4;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ items, label }: { items: NavEntry[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = isActive(pathname, it.href);
        return (
          <AsyncLink
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-xl px-4 text-base font-medium",
              active ? "bg-primary text-primary-fg" : "text-ink hover:bg-surface-2",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span>{it.label}</span>
          </AsyncLink>
        );
      })}
    </nav>
  );
}

/** แถบล่างบนมือถือ: เมนูหลัก + ปุ่ม "เพิ่มเติม" ที่เปิดแผ่นเมนูรอง
 *  แผ่นจอง history 1 รายการ → ปุ่ม Back ของเครื่อง = ปิดแผ่น (docs/BACK-BUTTON-KNOWLEDGE.md) */
export function BottomBar({
  items,
  moreLabel,
  closeLabel,
  navLabel,
  sheet,
}: {
  items: NavEntry[];
  moreLabel: string;
  closeLabel: string;
  navLabel: string;
  sheet: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const primary = items.slice(0, MAX_BAR);
  const rest = items.slice(MAX_BAR);
  const pendingHref = useRef<string | null>(null);
  // แผ่นเปิดอยู่เฉพาะ "หน้าที่กดเปิด" — เปลี่ยนหน้าแล้วปิดเอง โดยไม่ต้อง setState ใน effect
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const reserved = useRef(false);

  useEffect(() => {
    reserved.current = false; // เปลี่ยนหน้า → ไม่มี history ของแผ่นค้างอีกต่อไป
  }, [pathname]);

  useEffect(() => {
    const onPop = () => {
      reserved.current = false;
      setOpenAt(null);
      const href = pendingHref.current;
      if (href) {
        pendingHref.current = null;
        // ถอยรายการของแผ่นก่อน แล้วค่อยไปหน้าใหม่ → กด Back ครั้งเดียวกลับหน้าเดิม
        // (หน่วงหนึ่งจังหวะ: router ของ Next จัดการ popstate เองด้วย ถ้า push ทันทีจะถูกทับ)
        setTimeout(() => router.push(href), 0);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (reserved.current) history.back();
      else setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openSheet() {
    history.pushState({ kgSheet: true }, "");
    reserved.current = true;
    setOpenAt(pathname);
  }
  function close() {
    if (reserved.current) history.back(); // popstate จะปิดแผ่นให้ — history ไม่สะสม
    else setOpenAt(null);
  }

  return (
    <>
      <nav
        aria-label={navLabel}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto flex max-w-xl items-stretch justify-around">
          {primary.map((it) => {
            const Icon = ICONS[it.icon];
            const active = isActive(pathname, it.href);
            return (
              <li key={it.href} className="flex-1">
                <AsyncLink
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium",
                    active ? "text-primary" : "text-ink-soft",
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                  <span className="max-w-full truncate">{it.label}</span>
                </AsyncLink>
              </li>
            );
          })}
          <li className="flex-1">
            <AsyncButton
              variant="ghost"
              size="sm"
              className="h-full min-h-14 w-full flex-col gap-0.5 rounded-none px-1 text-xs text-ink-soft"
              aria-haspopup="dialog"
              aria-expanded={open}
              leading={<Ellipsis className="size-6" aria-hidden="true" />}
              onClick={openSheet}
            >
              {moreLabel}
            </AsyncButton>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={moreLabel}>
          <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-semibold">{moreLabel}</p>
              <AsyncButton variant="ghost" size="icon" aria-label={closeLabel} onClick={close} leading={<X className="size-5" aria-hidden="true" />}>
                <span className="sr-only">{closeLabel}</span>
              </AsyncButton>
            </div>
            {rest.length > 0 && (
              <nav aria-label={navLabel} className="mb-5 flex flex-col gap-1">
                {rest.map((it) => {
                  const Icon = ICONS[it.icon];
                  const active = isActive(pathname, it.href);
                  return (
                    <AsyncLink
                      key={it.href}
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      onClick={(e) => {
                        if (!reserved.current) return;
                        e.preventDefault();
                        pendingHref.current = it.href;
                        window.dispatchEvent(new Event("kg:nav-start"));
                        history.back();
                      }}
                      className={cn("flex min-h-12 items-center gap-3 rounded-xl px-4 text-base font-medium", active ? "bg-primary text-primary-fg" : "text-ink hover:bg-surface-2")}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span>{it.label}</span>
                    </AsyncLink>
                  );
                })}
              </nav>
            )}
            {sheet}
          </div>
        </div>
      )}
    </>
  );
}

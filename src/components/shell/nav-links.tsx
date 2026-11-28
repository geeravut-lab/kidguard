"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Backpack, BarChart3, ChevronDown, ChevronUp, Building2, Palette, QrCode, DoorOpen, ShieldAlert, Megaphone, Tv, ScrollText, ShieldCheck, TimerReset, ToggleRight, CarFront, ClipboardCheck, Ellipsis, GraduationCap, House, MessageCircleMore, ListOrdered, School, Settings, Smartphone, UserRound, Users, UsersRound, X } from "lucide-react";
import { AsyncButton, AsyncLink } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { NavIcon } from "@/config/nav";

export type NavEntry = { href: string; label: string; icon: NavIcon; disabled?: boolean };

const ICONS = {
  home: House, parent: Smartphone, gate: ListOrdered, children: UsersRound, account: UserRound, teacher: GraduationCap,
  classroom: School, students: Users, staff: UsersRound, settings: Settings, approvals: ClipboardCheck, platform: Building2, pickup: CarFront, student: Backpack, line: MessageCircleMore,
  audit: ScrollText, brand: Palette, analytics: BarChart3, flags: ToggleRight, rules: TimerReset, admins: ShieldCheck,
  passes: QrCode, zones: DoorOpen, custody: ShieldAlert, announce: Megaphone, tv: Tv,
} as const;
const MAX_BAR = 4;

function matches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/** เมนูที่ "กำลังเปิดอยู่": เลือกอันที่ href ยาวที่สุดที่ตรง (เช่น /admin/audit ไม่ทำให้ /admin ติดสีด้วย) */
function activeHref(items: NavEntry[], pathname: string): string | null {
  let best: string | null = null;
  for (const it of items) if (!it.disabled && matches(pathname, it.href) && (best === null || it.href.length > best.length)) best = it.href;
  return best;
}

export function SidebarNav({ items, label }: { items: NavEntry[]; label: string }) {
  const pathname = usePathname();
  const current = activeHref(items, pathname);
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it.href === current;
        // ฟีเจอร์ที่ปิดอยู่: ยังเห็นเมนู (ไม่งงว่าหายไปไหน) แต่เป็นสีเทาและกดไม่ได้จริง
        if (it.disabled) {
          return (
            <span key={it.href} aria-disabled="true" data-disabled="true" className="flex min-h-12 cursor-not-allowed items-center gap-3 rounded-xl px-4 text-base font-medium text-ink-soft opacity-50">
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span>{it.label}</span>
            </span>
          );
        }
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
  const current = activeHref(items, pathname);
  const moreActive = rest.some((it) => it.href === current); // หน้าปัจจุบันอยู่ในแผ่น "เพิ่มเติม" → ปุ่มนี้ติดสีแทน
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
            const active = it.href === current;
            if (it.disabled) {
              return (
                <li key={it.href} className="flex-1">
                  <span aria-disabled="true" data-disabled="true" className="flex min-h-14 cursor-not-allowed flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-ink-soft opacity-50">
                    <Icon className="size-6" aria-hidden="true" />
                    <span className="max-w-full truncate">{it.label}</span>
                  </span>
                </li>
              );
            }
            return (
              <li key={it.href} className="flex-1">
                <AsyncLink
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "mx-0.5 my-1 flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium",
                    active ? "bg-primary text-primary-fg" : "text-ink-soft",
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
              className={cn("mx-0.5 my-1 h-auto min-h-12 w-[calc(100%-0.25rem)] flex-col gap-0.5 rounded-xl px-1 text-xs", moreActive ? "bg-primary text-primary-fg hover:bg-primary" : "text-ink-soft")}
              data-active={moreActive ? "true" : undefined}
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
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl bg-surface shadow-2xl">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <p className="text-lg font-semibold">{moreLabel}</p>
              <AsyncButton variant="ghost" size="icon" aria-label={closeLabel} onClick={close} leading={<X className="size-5" aria-hidden="true" />}>
                <span className="sr-only">{closeLabel}</span>
              </AsyncButton>
            </div>
            <ScrollArea>
              {rest.length > 0 && (
                <nav aria-label={navLabel} className="mb-5 flex flex-col gap-1">
                  {rest.map((it) => {
                    const Icon = ICONS[it.icon];
                    const active = it.href === current;
                    if (it.disabled) {
                      return (
                        <span key={it.href} aria-disabled="true" data-disabled="true" className="flex min-h-12 cursor-not-allowed items-center gap-3 rounded-xl px-4 text-base font-medium text-ink-soft opacity-50">
                          <Icon className="size-5 shrink-0" aria-hidden="true" />
                          <span>{it.label}</span>
                        </span>
                      );
                    }
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
            </ScrollArea>
          </div>
        </div>
      )}
    </>
  );
}

/** พื้นที่เลื่อนของแผ่นเมนู: เปิดแล้วเลื่อนให้เห็นเมนูที่กำลังใช้งาน และมีลูกศรบอกว่ายังมีเมนูซ่อนอยู่ด้านบน/ด้านล่าง */
function ScrollArea({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ up: false, down: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore({ up: el.scrollTop > 4, down: el.scrollTop + el.clientHeight < el.scrollHeight - 4 });
    // เลื่อนให้เมนูที่เปิดอยู่อยู่กลางพื้นที่ (คำนวณเฉพาะในกล่องนี้ ไม่ให้หน้าหลักเลื่อนตาม)
    const cur = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (cur) {
      const box = el.getBoundingClientRect(), r = cur.getBoundingClientRect();
      el.scrollTop += r.top - box.top - (box.height - r.height) / 2;
    }
    const raf = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const fade = "pointer-events-none absolute inset-x-0 z-10 flex h-9 justify-center text-primary";
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} data-testid="more-scroll" className="max-h-full overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" style={{ maxHeight: "calc(85dvh - 4.5rem)" }}>
        {children}
      </div>
      {more.up && (
        <div className={cn(fade, "top-0 items-start bg-gradient-to-b from-surface to-transparent")} data-testid="more-scroll-up" aria-hidden="true">
          <ChevronUp className="size-6 animate-pulse" />
        </div>
      )}
      {more.down && (
        <div className={cn(fade, "bottom-0 items-end bg-gradient-to-t from-surface to-transparent")} data-testid="more-scroll-down" aria-hidden="true">
          <ChevronDown className="size-6 animate-pulse" />
        </div>
      )}
    </div>
  );
}

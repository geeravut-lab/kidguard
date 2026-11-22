"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * แถบความคืบหน้าบางด้านบนเมื่อเปลี่ยนหน้า (เมนู/ลิงก์/ปุ่มกลับ)
 * App Router ไม่มี router events จึงดักการคลิก <a> ภายใน แล้วจบเมื่อ path/query เปลี่ยน
 */
export function NavigationFeedback() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = `${pathname}?${search}`;
  // เก็บ "route ณ ตอนเริ่มนำทาง"; ทันทีที่ route เปลี่ยน key จะไม่ตรง → แถบหยุดเอง (ไม่ต้อง setState ใน effect)
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const keyRef = useRef(key);
  const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = startedAt !== null && startedAt === key;

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    function start() {
      setStartedAt(keyRef.current);
      if (failsafe.current) clearTimeout(failsafe.current);
      failsafe.current = setTimeout(() => setStartedAt(null), 10_000);
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    }
    window.addEventListener("popstate", start);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", start);
      document.removeEventListener("click", onClick, true);
      if (failsafe.current) clearTimeout(failsafe.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      data-testid="nav-progress"
      data-active={active ? "true" : "false"}
      className={
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 origin-left bg-accent transition-[transform,opacity] duration-500 " +
        (active ? "scale-x-90 opacity-100" : "scale-x-0 opacity-0")
      }
    />
  );
}

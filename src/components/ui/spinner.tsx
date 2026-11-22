import { cn } from "@/lib/cn";

/** สปินเนอร์กลาง — ใช้ซ้ำทั้งระบบ (กติกาข้อ 3) */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center justify-center", className)}>
      <svg className="size-[1.1em] animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label ?? "…"}</span>
    </span>
  );
}

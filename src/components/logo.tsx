import { cn } from "@/lib/cn";

/** โลโก้ชี้ /brand/logo เสมอ (ไม่ต้องรู้ว่าแอดมินตั้งรูปเองหรือยัง) — ห้ามใช้ <img src="/logo.png"> ตรง ๆ */
export function LogoMark({ className, size = 36, src = "/brand/logo" }: { className?: string; size?: number; src?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cn("shrink-0", className)} />
  );
}

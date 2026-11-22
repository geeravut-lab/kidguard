import "server-only";

/** เหตุการณ์ของการรับนักเรียนที่ต้องแจ้งอีกฝ่าย (เฟส 4 ต่อกับระบบแจ้งเตือน: แอป + LINE) */
export type PickupEvent =
  | { kind: "released"; sessionId: string; schoolId: string; parentUserId: string; byRole: string; byUserId: string; completed: boolean }
  | { kind: "called"; sessionId: string; schoolId: string; parentUserId: string; byUserId: string; count: number }
  | { kind: "student_alert"; sessionId: string; schoolId: string; parentUserId: string }
  | { kind: "expired"; sessionId: string; schoolId: string; parentUserId: string }
  | { kind: "started"; sessionId: string; schoolId: string; parentUserId: string };

type Handler = (e: PickupEvent) => Promise<void>;
let handler: Handler | null = null;

/** ตัวจัดการจริงถูกลงทะเบียนโดย lib/notify (เฟส 4) — ห้าม throw ใส่งานหลัก */
export function setPickupEventHandler(h: Handler) {
  handler = h;
}
export async function emitPickupEvent(e: PickupEvent): Promise<void> {
  try {
    await handler?.(e);
  } catch (err) {
    console.error("pickup event handler failed:", e.kind, err instanceof Error ? err.name : "unknown");
  }
}

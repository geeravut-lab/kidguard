import "server-only";
import { after } from "next/server";

/** เหตุการณ์ของการรับนักเรียนที่ต้องแจ้งอีกฝ่าย (แอป + LINE ผ่าน lib/notify) */
export type PickupEvent =
  | { kind: "released"; sessionId: string; schoolId: string; parentUserId: string; byRole: string; byUserId: string; completed: boolean }
  | { kind: "called"; sessionId: string; schoolId: string; parentUserId: string; byUserId: string; count: number }
  | { kind: "student_alert"; sessionId: string; schoolId: string; parentUserId: string }
  | { kind: "expired"; sessionId: string; schoolId: string; parentUserId: string }
  | { kind: "started"; sessionId: string; schoolId: string; parentUserId: string };

/** ส่งหลังตอบผู้ใช้แล้ว (after) เพื่อไม่ให้การแจ้งเตือนช้าหน่วงงานหลัก; นอก request ตกไปทำทันที — ไม่เคย throw */
export async function emitPickupEvent(e: PickupEvent): Promise<void> {
  const run = async () => {
    try {
      const { handlePickupEvent } = await import("@/lib/notify/pickup-events");
      await handlePickupEvent(e);
    } catch (err) {
      console.error("pickup event handler failed:", e.kind, err instanceof Error ? err.name : "unknown");
    }
  };
  try {
    after(run);
  } catch {
    await run();
  }
}

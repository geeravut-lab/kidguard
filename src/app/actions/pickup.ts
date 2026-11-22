"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit/server";
import { getAuthInfo } from "@/lib/auth/me";
import { emitPickupEvent } from "@/lib/pickup/events";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { str, uuidSchema } from "@/lib/validation";

type Release = { completed: boolean; released: number; by_role: string; parent_user_id: string; school_id: string };
const done = () => revalidatePath("/", "layout");

// ===== ผู้ปกครอง (ตรวจตัวตนที่ server แล้วส่ง p_user/p_actor เข้าฟังก์ชัน; ฟังก์ชัน SQL ตรวจความเป็นเจ้าของซ้ำ) =====
export async function parentArriveAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "session"));
  if (!info || !id.success) return;
  const { data } = await supabaseAdmin().rpc("pickup_manual_arrive", { p_user: info.id, p_session: id.data });
  if (data === true) await audit({ by: info.id, role: "parent", action: "pickup.manual_arrive", entity: "pickup_sessions", entityId: id.data });
  done();
}

export async function parentCancelAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "session"));
  if (!info || !id.success) return;
  const { data } = await supabaseAdmin().rpc("pickup_cancel", { p_user: info.id, p_session: id.data });
  if (data === true) await audit({ by: info.id, role: "parent", action: "pickup.cancel", entity: "pickup_sessions", entityId: id.data });
  done();
}

/** ผู้ปกครองกด "รับนักเรียนแล้ว" → จบทั้งคิว และแจ้งเจ้าหน้าที่/ครู (D) */
export async function parentCompleteAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "session"));
  if (!info || !id.success) return;
  const { data, error } = await supabaseAdmin().rpc("pickup_release", { p_actor: info.id, p_session: id.data });
  if (!error && data) {
    const r = data as Release;
    await audit({ by: info.id, role: "parent", action: "pickup.complete", entity: "pickup_sessions", entityId: id.data, schoolId: r.school_id, detail: { by_role: r.by_role } });
    await emitPickupEvent({ kind: "released", sessionId: id.data, schoolId: r.school_id, parentUserId: r.parent_user_id, byRole: r.by_role, byUserId: info.id, completed: r.completed });
  }
  done();
}

// ===== เจ้าหน้าที่ประตู / แอดมิน / ครู =====
export async function staffVerifyAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "session"));
  if (!info || !id.success) return;
  const { data } = await supabaseAdmin().rpc("pickup_verify", { p_actor: info.id, p_session: id.data });
  if (data === true) await audit({ by: info.id, action: "pickup.verify", entity: "pickup_sessions", entityId: id.data });
  done();
}

export async function staffCallAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "session"));
  if (!info || !id.success) return;
  const student = uuidSchema.safeParse(str(fd, "student"));
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("pickup_call", { p_actor: info.id, p_session: id.data, p_student: student.success ? student.data : null });
  if (!error && (data as number) > 0) {
    const { data: s } = await admin.from("pickup_sessions").select("school_id,parent_user_id").eq("id", id.data).maybeSingle();
    if (s) {
      await audit({ by: info.id, action: "pickup.call", entity: "pickup_sessions", entityId: id.data, schoolId: s.school_id, detail: { students: data as number } });
      await emitPickupEvent({ kind: "called", sessionId: id.data, schoolId: s.school_id, parentUserId: s.parent_user_id, byUserId: info.id, count: data as number });
    }
  }
  done();
}

/** เจ้าหน้าที่/ครูกด "ส่งนักเรียนแล้ว" (check-out) → แจ้งผู้ปกครอง (D) */
export async function staffReleaseAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "session"));
  if (!info || !id.success) return;
  const student = uuidSchema.safeParse(str(fd, "student"));
  const { data, error } = await supabaseAdmin().rpc("pickup_release", { p_actor: info.id, p_session: id.data, p_student: student.success ? student.data : null });
  if (!error && data) {
    const r = data as Release;
    await audit({ by: info.id, role: r.by_role, action: "pickup.release", entity: "pickup_sessions", entityId: id.data, schoolId: r.school_id, detail: { by_role: r.by_role, completed: r.completed, released: r.released } });
    await emitPickupEvent({ kind: "released", sessionId: id.data, schoolId: r.school_id, parentUserId: r.parent_user_id, byRole: r.by_role, byUserId: info.id, completed: r.completed });
  }
  done();
}

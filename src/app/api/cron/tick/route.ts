import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit/server";
import { emitPickupEvent } from "@/lib/pickup/events";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** งานตามเวลา (Vercel Cron ทุกนาที): หมดอายุ check-in ที่ค้าง + แจ้งผู้ปกครอง; แต่ละงานล้มได้โดยไม่ลากงานอื่น */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const summary: Record<string, number | string> = {};
  try {
    const { data, error } = await supabaseAdmin().rpc("pickup_expire");
    if (error) throw error;
    const rows = (data ?? []) as { session_id: string; parent_user_id: string; school_id: string }[];
    for (const r of rows) {
      await emitPickupEvent({ kind: "expired", sessionId: r.session_id, schoolId: r.school_id, parentUserId: r.parent_user_id });
      await audit({ action: "pickup.expire", entity: "pickup_sessions", entityId: r.session_id, schoolId: r.school_id, role: "system" });
    }
    summary.expired = rows.length;
  } catch (e) {
    console.error("cron pickup_expire failed:", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    summary.expired_error = "failed";
  }
  summary.ms = Date.now() - started;
  return NextResponse.json({ ok: true, ...summary });
}

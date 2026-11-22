import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** ตรวจว่าแอปและฐานข้อมูลทำงาน — ไม่เปิดเผยรายละเอียดข้อผิดพลาด */
export async function GET() {
  let db: "up" | "down" = "down";
  try {
    const { error } = await supabaseAdmin()
      .from("platform_settings")
      .select("key", { head: true, count: "exact" })
      .abortSignal(AbortSignal.timeout(4000));
    db = error ? "down" : "up";
  } catch (e) {
    console.error("health: db check failed", e instanceof Error ? e.name : "unknown"); // ไม่ log ข้อความ/คีย์
  }
  const ok = db === "up";
  return NextResponse.json(
    { ok, service: "kidguard", db, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runTick } from "@/lib/rules/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** งานตามเวลา (Vercel Cron ทุกนาที): รันกฎอัตโนมัติ (เปิด/ปิด + ตัวเลขปรับได้ที่ /platform/rules) — ต้องมี secret */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = await runTick();
  return NextResponse.json({ ok: true, expired: summary.pickup_expire ?? 0, ...summary });
}

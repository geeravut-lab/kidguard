import { NextResponse, type NextRequest } from "next/server";
import { getAuthInfo } from "@/lib/auth/me";
import { updatePickup } from "@/lib/pickup/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const info = await getAuthInfo();
  if (!info) return NextResponse.json({ ok: false, error: "err_forbidden" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = await req.json().catch(() => null);
  const r = await updatePickup(info.id, body);
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === "err_rate_limited" ? 429 : 422, headers: { "Cache-Control": "no-store" } });
}

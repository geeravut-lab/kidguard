import { NextResponse } from "next/server";
import { getAuthInfo } from "@/lib/auth/me";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** ให้ token แก่ socket ของ Live sync — client ของ socket ห้ามจัดการ session/คุกกี้เอง (กัน refresh token ถูกใช้สองครั้ง) */
export async function GET() {
  const info = await getAuthInfo(); // ตรวจกับ Auth server ก่อน
  if (!info) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { data } = await (await createClient()).auth.getSession();
  if (!data.session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ token: data.session.access_token, expires_at: data.session.expires_at }, { headers: { "Cache-Control": "no-store" } });
}

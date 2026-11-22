import { NextResponse, type NextRequest } from "next/server";
import { getAuthInfo } from "@/lib/auth/me";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** ทางสำรองของ Live sync (เมื่อ socket ใช้ไม่ได้): ลายนิ้วมือเป็นตัวเลข/สถานะล้วน กรองตามสิทธิ์ที่ฐานข้อมูล */
export async function GET(req: NextRequest) {
  const h = { "Cache-Control": "no-store" };
  if (!(await getAuthInfo())) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: h });
  const scope = req.nextUrl.searchParams.get("scope");
  const supabase = await createClient();
  if (scope === "me") {
    const { data, error } = await supabase.rpc("pickup_my_fingerprint");
    return error ? NextResponse.json({ error: "failed" }, { status: 500, headers: h }) : NextResponse.json({ t: data }, { headers: h });
  }
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (scope === "school" && /^[0-9a-f-]{36}$/i.test(id)) {
    const { data, error } = await supabase.rpc("pickup_fingerprint", { p_school: id });
    return error ? NextResponse.json({ error: "forbidden" }, { status: 403, headers: h }) : NextResponse.json({ t: data }, { headers: h });
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400, headers: h });
}

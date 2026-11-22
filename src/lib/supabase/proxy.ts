import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/** รีเฟรช session ของ Supabase ในทุกคำขอ (cookie) แล้วส่งต่อ; คืน user ที่ตรวจแล้ว (หรือ null) */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getClaims: ตรวจ JWT (และรีเฟรชถ้าหมดอายุ) — ห้ามใส่โค้ดอื่นคั่นระหว่าง createServerClient กับ getClaims
  const { data } = await supabase.auth.getClaims();
  return { response, signedIn: Boolean(data?.claims?.sub) };
}

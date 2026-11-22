import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// หน้าที่ต้องล็อกอิน (ตรวจเบื้องต้นที่นี่เพื่อ redirect เร็ว; การตรวจสิทธิ์จริงอยู่ที่หน้า/ action/ RLS)
const PROTECTED = ["/home", "/onboarding", "/profile", "/admin", "/teacher", "/gate", "/platform", "/invite", "/start", "/reset-password", "/passes", "/pickup", "/notifications", "/student"];

export async function proxy(request: NextRequest) {
  // จอ TV ไม่มีเมนู/โครงแอป (AppShell อ่านหัวนี้) — ตั้งโดยเราเท่านั้น ล้างค่าที่ client ส่งมาเอง
  request.headers.delete("x-kg-bare");
  if (request.nextUrl.pathname.startsWith("/tv/")) request.headers.set("x-kg-bare", "1");
  const { response, signedIn } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  if (!signedIn && PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|brand/|sw.js|manifest.webmanifest|favicon|api/health).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

// หน้าที่ต้องล็อกอิน (ตรวจเบื้องต้นที่นี่เพื่อ redirect เร็ว; การตรวจสิทธิ์จริงอยู่ที่หน้า/ action/ RLS)
const PROTECTED = ["/home", "/onboarding", "/profile", "/admin", "/teacher", "/gate", "/platform", "/invite", "/start", "/reset-password", "/passes", "/pickup", "/notifications", "/student"];

export async function proxy(request: NextRequest) {
  // จอ TV ไม่มีเมนู/โครงแอป (AppShell อ่านหัวนี้) — ตั้งโดยเราเท่านั้น ล้างค่าที่ client ส่งมาเอง
  request.headers.delete("x-kg-bare");
  if (request.nextUrl.pathname.startsWith("/tv/")) request.headers.set("x-kg-bare", "1");
  // CSP แบบ nonce ต่อคำขอ: ใส่ในหัวของคำขอเพื่อให้ Next ใส่ nonce ให้สคริปต์ของมันเอง และใส่ในคำตอบให้เบราว์เซอร์บังคับใช้
  const nonce = makeNonce();
  const csp = buildCsp({ nonce, supabaseHost: SUPABASE_HOST, dev: process.env.NODE_ENV !== "production" });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const { response, signedIn } = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  const { pathname, search } = request.nextUrl;
  if (!signedIn && PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|brand/|sw.js|manifest.webmanifest|favicon|api/health).*)"],
};

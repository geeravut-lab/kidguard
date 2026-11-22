import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit/server";
import { safeNext } from "@/lib/auth/next";
import { createClient } from "@/lib/supabase/server";

/** รับ code จาก OAuth (Google) / ลิงก์รีเซ็ตรหัสผ่าน → แลกเป็น session แล้วไปต่อ */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const provider = (data.user.app_metadata?.provider as string | undefined) ?? "oauth";
      if (next !== "/reset-password") await audit({ by: data.user.id, action: "auth.login", entity: "auth_users", entityId: data.user.id, detail: { method: provider } });
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("auth callback: exchange failed", error?.code);
  }
  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}

import { trackEvent } from "@/lib/analytics/server";
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit/server";
import { getSsoConfig } from "@/lib/sso/config";
import { exchangeTicket, SsoError } from "@/lib/sso/exchange";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** แลกตั๋ว SSO ฝั่ง server เท่านั้น (ห้ามแลกจากเบราว์เซอร์ตรง ๆ) — คืนเฉพาะ access/refresh token */
export async function POST(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  const cfg = getSsoConfig();
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== cfg.siteHost) return NextResponse.json({ error: "forbidden_origin" }, { status: 403, headers: noStore });

  const admin = supabaseAdmin();
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0]!.trim().slice(0, 64);
  const allowed = await admin.rpc("rl_hit", { p_key: `sso:${ip}`, p_limit: 30, p_window_s: 600 });
  if (allowed.data === false) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });

  try {
    const body = (await req.json().catch(() => null)) as { ticket?: unknown } | null;
    const r = await exchangeTicket(body?.ticket, { admin, slug: cfg.slug, hubBase: cfg.hubBase, siteHost: cfg.siteHost });
    if (r.created) await trackEvent("signup", r.user_id);
    await audit({ by: r.user_id, action: "auth.sso_login", entity: "auth_users", entityId: r.user_id, detail: { provider: "aivora", created: r.created } });
    return NextResponse.json({ access_token: r.access_token, refresh_token: r.refresh_token }, { headers: noStore });
  } catch (e) {
    const err = e instanceof SsoError ? e : new SsoError(500, "unexpected");
    // log ทุก error รวมที่ตั้งใจโยน (รหัส + ข้อความเท่านั้น ห้าม log token/คีย์)
    console.error("sso exchange failed:", err.status, err.code, e instanceof SsoError ? "" : (e as Error)?.message?.slice(0, 200));
    return NextResponse.json({ error: err.code }, { status: err.status, headers: noStore });
  }
}

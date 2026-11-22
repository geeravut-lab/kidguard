import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * แลกตั๋ว Aivora SSO เป็น session ของ Supabase — ทำตาม docs/SSO-Aivora-Supabase.md ขั้นที่ 2–3
 *  - ผูกบัญชีด้วย aivora_user_id เท่านั้น (ห้ามหาผู้ใช้จากอีเมล)
 *  - ผู้ใช้ SSO ได้สิทธิ์เท่าผู้ใช้ทั่วไป: ไม่รับ roles จาก hub
 *  - ใช้อีเมลสังเคราะห์เสมอ: อีเมลจาก hub ไม่ผ่านการยืนยัน ถ้านำมาเป็นอีเมลของบัญชี
 *    เจ้าของอีเมลตัวจริงที่ล็อกอินด้วย Google ภายหลังจะถูก Supabase ผูกเข้าบัญชีของคนที่ใช้อีเมลนั้นอ้างไว้
 */
export class SsoError extends Error {
  constructor(public status: 401 | 403 | 500 | 502, public code: string) {
    super(code);
  }
}

export type HubUser = { id: string; display_name: string | null; avatar_url: string | null; email: string | null };
const nullableString = (v: unknown) => v == null || typeof v === "string"; // hub คืน null (ไม่ใช่ undefined) เมื่อไม่มีค่า

export function parseHubPayload(p: unknown, slug: string): HubUser {
  const o = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
  const u = o?.user && typeof o.user === "object" ? (o.user as Record<string, unknown>) : null;
  if (!o || !u) throw new SsoError(502, "bad_hub_response");
  if (typeof u.id !== "string" || u.id.trim() === "" || u.id.length > 200) throw new SsoError(502, "bad_hub_response");
  if (![u.display_name, u.avatar_url, u.email].every(nullableString)) throw new SsoError(502, "bad_hub_response");
  // o.firebase เป็น null เสมอสำหรับแอปที่ใช้ Supabase — ถูกต้อง ไม่ใช่ error
  if (o.app_slug !== slug) throw new SsoError(403, "slug_mismatch");
  return {
    id: u.id,
    display_name: (u.display_name as string | null) ?? null,
    avatar_url: (u.avatar_url as string | null) ?? null,
    email: (u.email as string | null) ?? null,
  };
}

export function syntheticEmail(hubUserId: string, siteHost: string): string {
  const safe = /^[A-Za-z0-9_-]{1,100}$/.test(hubUserId) ? hubUserId : createHash("sha256").update(hubUserId).digest("hex").slice(0, 40);
  return `aivora+${safe}@${siteHost}`.toLowerCase();
}

export type ExchangeDeps = {
  admin: SupabaseClient;
  slug: string;
  hubBase: string;
  siteHost: string;
  fetchImpl?: typeof fetch;
};

export async function exchangeTicket(ticket: unknown, deps: ExchangeDeps) {
  if (typeof ticket !== "string" || ticket.length < 1 || ticket.length > 4096) throw new SsoError(401, "invalid_ticket");
  const doFetch = deps.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(`${deps.hubBase}/api/public/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SsoError(502, "hub_unreachable"); // 502 เฉพาะตอน hub ติดต่อไม่ได้จริง
  }
  if (res.status >= 500) throw new SsoError(502, "hub_error");
  if (!res.ok) throw new SsoError(401, "invalid_ticket");
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new SsoError(502, "bad_hub_response");
  }
  const hub = parseHubPayload(payload, deps.slug);
  const { admin } = deps;

  // 1) หาผู้ใช้ด้วย aivora_user_id
  let userId: string | null = null;
  let email: string | null = null;
  let created = false;
  const link = await admin.from("aivora_links").select("user_id").eq("aivora_user_id", hub.id).maybeSingle();
  if (link.error) throw new SsoError(500, "link_lookup_failed");
  if (link.data?.user_id) {
    userId = link.data.user_id as string;
    const u = await admin.auth.admin.getUserById(userId);
    email = u.data.user?.email ?? null;
    if (!email) throw new SsoError(500, "linked_user_missing");
  } else {
    // 2) สร้างผู้ใช้ใหม่ (อีเมลสังเคราะห์) แล้วบันทึก aivora_links
    email = syntheticEmail(hub.id, deps.siteHost);
    const c = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { aivora_user_id: hub.id, provider: "aivora" },
      user_metadata: { display_name: hub.display_name, avatar_url: hub.avatar_url },
    });
    if (c.error || !c.data.user) {
      // แข่งกับคำขออื่นที่กำลังสร้างบัญชีของ hub user เดียวกัน (อีเมลสังเคราะห์ซ้ำ): รอให้ link ถูกบันทึกแล้วใช้บัญชีเดิม
      for (let i = 0; i < 8 && !userId; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const again = await admin.from("aivora_links").select("user_id").eq("aivora_user_id", hub.id).maybeSingle();
        if (again.data?.user_id) userId = again.data.user_id as string;
      }
      if (!userId) throw new SsoError(500, "create_user_failed");
      const u = await admin.auth.admin.getUserById(userId);
      email = u.data.user?.email ?? null;
      if (!email) throw new SsoError(500, "linked_user_missing");
    } else {
      userId = c.data.user.id;
      created = true;
      const ins = await admin.from("aivora_links").insert({ aivora_user_id: hub.id, user_id: userId });
      if (ins.error) {
        // แข่งกันบันทึก link: ลบบัญชีที่เพิ่งสร้าง แล้วใช้ของเดิม
        await admin.auth.admin.deleteUser(userId);
        const again = await admin.from("aivora_links").select("user_id").eq("aivora_user_id", hub.id).maybeSingle();
        if (!again.data?.user_id) throw new SsoError(500, "link_insert_failed");
        userId = again.data.user_id as string;
        created = false;
        const u = await admin.auth.admin.getUserById(userId);
        email = u.data.user?.email ?? null;
        if (!email) throw new SsoError(500, "linked_user_missing");
      }
    }
  }

  // 3) ผู้ใช้เดิมไม่เขียนทับข้อมูลที่เขาแก้เอง — เติมเฉพาะช่องที่ว่าง
  if (hub.display_name) await admin.from("profiles").update({ display_name: hub.display_name.slice(0, 80) }).eq("id", userId).is("display_name", null);
  if (hub.avatar_url && hub.avatar_url.length <= 500 && /^https:\/\//.test(hub.avatar_url)) await admin.from("profiles").update({ avatar_url: hub.avatar_url }).eq("id", userId).is("avatar_url", null);

  // 4) ออก session
  const gl = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = gl.data?.properties?.hashed_token;
  if (gl.error || !hashed) throw new SsoError(500, "generate_link_failed");
  const v = await admin.auth.verifyOtp({ type: "magiclink", token_hash: hashed });
  const session = v.data?.session;
  if (v.error || !session) throw new SsoError(500, "verify_otp_failed");
  return { access_token: session.access_token, refresh_token: session.refresh_token, user_id: userId, created };
}

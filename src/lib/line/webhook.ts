import { trackEvent } from "@/lib/analytics/server";
import "server-only";
import { lineReply, verifyLineSignature } from "./api";
import { bindLine, lineFollowed, lineUnfollowed, loadSchoolLine } from "./service";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyBrandNames } from "@/lib/brand/brand";
import { loadBrand } from "@/lib/brand/server";

const MAX_BODY = 200_000;
const MAX_EVENTS = 20;
const CODE_RE = /^(?:LINK\s+)?([A-Z2-9]{8})$/;

const HELP_TH = "ส่งรหัส 8 ตัวที่แสดงในหน้า “บัญชีของฉัน” ของ KidGuard มาที่แชตนี้เพื่อผูกบัญชีรับแจ้งเตือน";
const HELP_EN = "Send the 8-character code shown on your KidGuard “My account” page to link this chat for notifications.";
const BAD = "รหัสไม่ถูกต้องหรือหมดอายุ / The code is invalid or has expired.";
const OK: Record<"th" | "en", string> = { th: "เชื่อมต่อ LINE เรียบร้อยแล้ว คุณจะได้รับแจ้งเตือนทางนี้", en: "LINE connected. You will receive notifications here." };

export type WebhookDeps = { fetchImpl?: typeof fetch };
export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * ประมวลผล webhook ของ LINE ต่อโรงเรียน (docs/LINE-ACCOUNT-LINKING-KNOWLEDGE.md §7):
 * ไบต์ดิบ → จำกัดขนาด → ตรวจลายเซ็น (ไม่ผ่าน = 401 ไม่อ่านต่อ) → parse → ต่อ event → ตอบ 200 เสมอเมื่อลายเซ็นถูก
 * ตอบกลับด้วย replyToken และกลืน error (การผูกสำเร็จไปแล้ว ตอบไม่ถึงต้องไม่ทำให้ทั้งคำขอล้ม)
 */
export async function handleLineWebhook(input: { raw: string; signature: string | null; slug: string }, deps: WebhookDeps = {}): Promise<WebhookResult> {
  const a = supabaseAdmin();
  const { data: school } = await a.from("schools").select("id").eq("slug", input.slug).eq("active", true).maybeSingle();
  if (!school) return { status: 404, body: { error: "not_found" } };
  const cfg = await loadSchoolLine(school.id, { requireEnabled: false });
  if (!cfg || input.raw.length > MAX_BODY || !verifyLineSignature(input.raw, input.signature, cfg.secret)) return { status: 401, body: { error: "unauthorized" } };

  let payload: { events?: Record<string, unknown>[] };
  try {
    payload = JSON.parse(input.raw);
  } catch {
    return { status: 400, body: { error: "bad_json" } };
  }
  const brand = await loadBrand();
  const reply = (token: string | undefined, text: string) =>
    token ? lineReply(cfg.token, token, [{ type: "text", text }], { fetchImpl: deps.fetchImpl }).catch(() => undefined) : undefined;

  for (const e of (payload.events ?? []).slice(0, MAX_EVENTS)) {
    const source = e.source as { userId?: string } | undefined;
    const uid = source?.userId;
    if (!uid) continue;
    if (e.type === "unfollow") {
      await lineUnfollowed(school.id, uid);
      continue;
    }
    if (e.type === "follow") {
      await lineFollowed(school.id, uid);
      continue;
    }
    const msg = e.message as { type?: string; text?: string } | undefined;
    const replyToken = typeof e.replyToken === "string" ? e.replyToken : undefined;
    if (e.type !== "message" || msg?.type !== "text" || !replyToken) continue;

    // กันเดารหัสจากบัญชี LINE เดียว: 10 ครั้ง/10 นาที เกินแล้วเงียบ
    const rl = await a.rpc("rl_hit", { p_key: `line:bind:${school.id}:${uid}`, p_limit: 10, p_window_s: 600 });
    if (rl.data === false) continue;

    const m = (msg.text ?? "").trim().toUpperCase().match(CODE_RE);
    if (!m) {
      await reply(replyToken, `${applyBrandNames(HELP_TH, brand, "th")}\n\n${applyBrandNames(HELP_EN, brand, "en")}`); // ยังไม่รู้ว่าผู้ส่งเป็นใคร จึงต่อกันทุกภาษา
      continue;
    }
    const r = await bindLine(school.id, m[1]!, uid);
    if (!r.ok) {
      await reply(replyToken, BAD); // ไม่เฉลยสาเหตุ (หมดอายุ/ไม่มี/ใช้แล้ว/ซ้ำ ตอบเหมือนกัน)
      continue;
    }
    await trackEvent("line_linked", r.ownerId, { schoolId: school.id });
    const { data: p } = await a.from("profiles").select("lang").eq("id", r.ownerId!).maybeSingle();
    await reply(replyToken, OK[p?.lang === "en" ? "en" : "th"]);
  }
  return { status: 200, body: { ok: true } };
}

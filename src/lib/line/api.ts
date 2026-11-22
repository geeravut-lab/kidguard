import { createHmac, timingSafeEqual } from "node:crypto";

const base = () => (process.env.LINE_API_BASE || "https://api.line.me").replace(/\/+$/, "");

/** ตรวจลายเซ็นจาก "ไบต์ดิบ" ของ body: base64(HMAC-SHA256(channelSecret, rawBody)) เทียบแบบเวลาคงที่ */
export function verifyLineSignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const exp = createHmac("sha256", secret).update(raw).digest("base64");
  return signature.length === exp.length && timingSafeEqual(Buffer.from(signature), Buffer.from(exp));
}

/** ตารางข้อผิดพลาด: 200/409 = ส่งแล้ว · 400 = ผู้รับ/รูปแบบมีปัญหา · 401/403 = หยุดทั้งระบบชั่วคราว · 429 = เต็ม · 5xx/เครือข่าย = ลองใหม่ */
export type LineKind = "ok" | "bad_request" | "auth" | "rate" | "server" | "network";
export type LineResult = { ok: boolean; status: number; kind: LineKind };
const classify = (status: number): LineKind =>
  status === 200 || status === 409 ? "ok" : status === 400 ? "bad_request" : status === 401 || status === 403 ? "auth" : status === 429 ? "rate" : "server";

type Opts = { fetchImpl?: typeof fetch; retryKey?: string };

async function post(path: string, token: string, body: unknown, o: Opts): Promise<LineResult> {
  try {
    const res = await (o.fetchImpl ?? fetch)(`${base()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(o.retryKey ? { "X-Line-Retry-Key": o.retryKey } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const kind = classify(res.status);
    return { ok: kind === "ok", status: res.status, kind };
  } catch {
    return { ok: false, status: 0, kind: "network" };
  }
}

export const linePush = (token: string, to: string, messages: unknown[], o: Opts = {}) => post("/v2/bot/message/push", token, { to, messages }, o);
export const lineReply = (token: string, replyToken: string, messages: { type: "text"; text: string }[], o: Opts = {}) =>
  post("/v2/bot/message/reply", token, { replyToken, messages: messages.map((m) => ({ ...m, text: m.text.slice(0, 900) })) }, o);

/** ตรวจ token: คืน basicId ของ OA เพื่อเทียบกับที่ผู้ดูแลกรอก */
export async function lineBotInfo(token: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number; basicId?: string }> {
  try {
    const res = await fetchImpl(`${base()}/v2/bot/info`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ok: false, status: res.status };
    const j = (await res.json()) as { basicId?: string };
    return { ok: true, status: 200, basicId: j.basicId };
  } catch {
    return { ok: false, status: 0 };
  }
}

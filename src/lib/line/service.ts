import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret, hmacCode } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { linePush, type LineResult } from "./api";
import { buildLineMessage, buildTextMessage, type Notice, type Sender } from "./flex";

const SAFE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ไม่มี 0/O/1/I (ผู้ใช้อ่านจากหน้าจอแล้วพิมพ์ในแชต)
export const CODE_TTL_MIN = 30;
export const PAUSE_ON_AUTH_FAIL_MS = 6 * 3600_000;
export const makeLinkCode = () => Array.from({ length: 8 }, () => SAFE[randomInt(SAFE.length)]).join("");

export type SchoolLine = { schoolId: string; basicId: string; secret: string; token: string; quota: number; pausedUntil: number | null };

/** ตั้งค่า LINE ของโรงเรียน (ถอดรหัสแล้ว) — null = ยังไม่ตั้ง/ปิดอยู่ */
export async function loadSchoolLine(schoolId: string, opts: { requireEnabled?: boolean } = { requireEnabled: true }): Promise<SchoolLine | null> {
  const { data } = await supabaseAdmin().from("school_line_channels").select("*").eq("school_id", schoolId).maybeSingle();
  if (!data?.channel_secret_enc || !data.access_token_enc || !data.basic_id) return null;
  if (opts.requireEnabled && !data.enabled) return null;
  try {
    return {
      schoolId, basicId: data.basic_id, secret: decryptSecret(data.channel_secret_enc), token: decryptSecret(data.access_token_enc),
      quota: data.monthly_quota, pausedUntil: data.paused_until ? Date.parse(data.paused_until) : null,
    };
  } catch {
    console.error("line config decrypt failed for school", schoolId); // กุญแจเปลี่ยน/ข้อมูลเสีย — ห้ามทำให้ระบบอื่นล้ม
    return null;
  }
}

export { encryptSecret };

// ===== ผูกบัญชี (รหัสครั้งเดียวส่งเข้า OA) =====

async function relatedToSchool(userId: string, schoolId: string): Promise<boolean> {
  const a = supabaseAdmin();
  const [g, m, s] = await Promise.all([
    a.from("guardian_links").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("school_id", schoolId),
    a.from("school_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId).eq("school_id", schoolId),
    a.from("student_accounts").select("user_id", { count: "exact", head: true }).eq("user_id", userId).eq("school_id", schoolId),
  ]);
  return (g.count ?? 0) + (m.count ?? 0) + (s.count ?? 0) > 0;
}

export type StartLinkResult = { ok: true; code: string; basicId: string; expiresAt: string } | { ok: false; error: "err_channel_unavailable" | "err_rate_limited" | "err_forbidden" | "err_generic" };

export async function startLineLink(userId: string, schoolId: string): Promise<StartLinkResult> {
  const a = supabaseAdmin();
  if (!(await relatedToSchool(userId, schoolId))) return { ok: false, error: "err_forbidden" };
  const cfg = await loadSchoolLine(schoolId);
  if (!cfg) return { ok: false, error: "err_channel_unavailable" };
  const rl = await a.rpc("rl_hit", { p_key: `chan:line:${userId}`, p_limit: 10, p_window_s: 3600 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };
  const code = makeLinkCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();
  const up = await a
    .from("notification_channels")
    .upsert({ user_id: userId, school_id: schoolId, channel: "line", address: null, status: "pending", code_hash: hmacCode(schoolId, code), code_expires_at: expiresAt, attempts: 0, last_error: null, verified_at: null }, { onConflict: "user_id,school_id,channel" })
    .select("id");
  if (up.error || up.data?.length !== 1) return { ok: false, error: "err_generic" }; // เขียนไม่ติดแถว ไม่ถือว่าสำเร็จ
  return { ok: true, code, basicId: cfg.basicId, expiresAt };
}

/** เรียกจาก webhook เท่านั้น: จับคู่รหัส ↔ LINE userId (ใช้ได้ครั้งเดียวด้วย compare-and-set ที่ status='pending') */
export async function bindLine(schoolId: string, codeRaw: string, lineUserId: string): Promise<{ ok: boolean; ownerId?: string }> {
  const code = codeRaw.trim().toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(code) || !lineUserId) return { ok: false };
  const a = supabaseAdmin();
  const { data: row } = await a.from("notification_channels").select("id,user_id,attempts,code_expires_at")
    .eq("school_id", schoolId).eq("channel", "line").eq("status", "pending").eq("code_hash", hmacCode(schoolId, code)).maybeSingle();
  if (!row?.code_expires_at || Date.parse(row.code_expires_at) < Date.now() || row.attempts >= 5) return { ok: false };
  const upd = await a.from("notification_channels")
    .update({ address: lineUserId, status: "active", code_hash: null, code_expires_at: null, verified_at: new Date().toISOString(), last_error: null })
    .eq("id", row.id).eq("status", "pending").select("id");
  if (upd.error || upd.data?.length !== 1) return { ok: false }; // รวมกรณี LINE userId นี้ผูกกับบัญชีอื่นของโรงเรียนอยู่แล้ว (unique)
  return { ok: true, ownerId: row.user_id };
}

export async function lineUnfollowed(schoolId: string, lineUserId: string) {
  await supabaseAdmin().from("notification_channels").update({ status: "stopped", last_error: "unfollowed" })
    .eq("school_id", schoolId).eq("channel", "line").eq("address", lineUserId).eq("status", "active");
}
/** ผู้ใช้กลับมาเป็นเพื่อนเอง → เปิดช่องทางเดิมต่อ (ถ้ายังมี address เดิม) */
export async function lineFollowed(schoolId: string, lineUserId: string) {
  await supabaseAdmin().from("notification_channels").update({ status: "active", last_error: null })
    .eq("school_id", schoolId).eq("channel", "line").eq("address", lineUserId).eq("status", "stopped").eq("last_error", "unfollowed");
}

export async function disconnectLine(userId: string, schoolId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("notification_channels").delete().eq("user_id", userId).eq("school_id", schoolId).eq("channel", "line").select("id");
  return data?.length === 1;
}

// ===== ส่งการ์ด =====

export type PushOutcome = "sent" | "skipped" | "failed";

async function log(schoolId: string, userId: string, kind: string, status: "sent" | "failed" | "skipped", error?: string) {
  await supabaseAdmin().from("message_log").insert({ school_id: schoolId, user_id: userId, channel: "line", kind, status, error: error?.slice(0, 200) ?? null });
}

/** ส่งการ์ดถึงผู้ใช้ทาง LINE (ถ้าผูกไว้และโรงเรียนเปิดช่องทาง) — ไม่เคย throw; ข้อความธรรมดาเป็น fallback เมื่อการ์ดโดน 400 */
export async function pushNoticeToUser(
  userId: string, schoolId: string, notice: Notice, o: { appUrl: string; defaultCta: string; retryKey?: string; fetchImpl?: typeof fetch; sender?: Sender },
): Promise<PushOutcome> {
  try {
    const a = supabaseAdmin();
    const cfg = await loadSchoolLine(schoolId);
    if (!cfg) return "skipped";
    if (cfg.pausedUntil && cfg.pausedUntil > Date.now()) return "skipped";
    const { data: ch } = await a.from("notification_channels").select("id,address").eq("user_id", userId).eq("school_id", schoolId).eq("channel", "line").eq("status", "active").maybeSingle();
    if (!ch?.address) return "skipped";

    // โควตารายเดือนของเรา (ต่ำกว่าของ LINE): นับเฉพาะที่ส่งจริง
    const { count } = await a.from("message_log").select("id", { count: "exact", head: true })
      .eq("school_id", schoolId).eq("channel", "line").eq("status", "sent").gte("at", new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString());
    if ((count ?? 0) >= cfg.quota) {
      await log(schoolId, userId, notice.kind, "skipped", "quota");
      return "skipped";
    }

    const send = async (msg: unknown): Promise<LineResult> => {
      let r = await linePush(cfg.token, ch.address!, [msg], { fetchImpl: o.fetchImpl, retryKey: o.retryKey ?? randomUUID() });
      if (r.kind === "server" || r.kind === "network") {
        await new Promise((res) => setTimeout(res, 1000));
        r = await linePush(cfg.token, ch.address!, [msg], { fetchImpl: o.fetchImpl, retryKey: o.retryKey ?? randomUUID() }); // retry key เดิม → LINE ไม่ส่งซ้ำ
      }
      return r;
    };

    let r = await send(buildLineMessage(notice, o));
    if (r.kind === "bad_request") r = await send(buildTextMessage(notice, o)); // อาจเป็นรูปแบบการ์ด: ลองข้อความธรรมดาก่อน อย่าเพิ่งหยุดช่องทาง
    if (r.ok) {
      await log(schoolId, userId, notice.kind, "sent");
      return "sent";
    }
    if (r.kind === "auth") {
      // 401/403: token/สิทธิ์มีปัญหา → หยุดทั้งโรงเรียนชั่วคราว (ไม่ถล่ม LINE) ให้ผู้ดูแลเห็นสาเหตุ
      await a.from("school_line_channels").update({ paused_until: new Date(Date.now() + PAUSE_ON_AUTH_FAIL_MS).toISOString(), last_error: `auth_${r.status}` }).eq("school_id", schoolId);
    } else if (r.kind === "bad_request") {
      // ข้อความธรรมดายังโดน 400 = ผู้รับบล็อก/เลิกเป็นเพื่อน → หยุดเฉพาะช่องทางของผู้ใช้คนนี้
      await a.from("notification_channels").update({ status: "stopped", last_error: "blocked_or_unfriended" }).eq("id", ch.id);
    }
    await log(schoolId, userId, notice.kind, "failed", `${r.kind}_${r.status}`);
    return "failed";
  } catch (e) {
    console.error("pushNoticeToUser failed:", e instanceof Error ? e.name : "unknown");
    return "failed";
  }
}

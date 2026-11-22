"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, mapDbError, ok, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { guardSchool, roleOfCtx } from "@/lib/auth/action-guard";
import { getAuthInfo } from "@/lib/auth/me";
import { encryptSecret } from "@/lib/crypto";
import { hashInviteCode, INVITE_TTL_DAYS, makeInviteCode } from "@/lib/invites";
import { lineBotInfo } from "@/lib/line/api";
import { disconnectLine, loadSchoolLine, startLineLink } from "@/lib/line/service";
import { dictFor, notifyUser } from "@/lib/notify";
import { safeHref } from "@/lib/line/flex";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { str, uuidSchema } from "@/lib/validation";

const done = () => revalidatePath("/", "layout");

// ===== ผู้ใช้: ผูก/ยกเลิก LINE, ทดสอบ, กล่องแจ้งเตือน =====
export async function startLineLinkAction(schoolId: string): Promise<{ ok: true; code: string; basicId: string } | { ok: false; error: string }> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(schoolId);
  if (!info || !id.success) return { ok: false, error: "err_forbidden" };
  const r = await startLineLink(info.id, id.data);
  if (r.ok) await audit({ by: info.id, action: "channel.line_link_start", entity: "notification_channels", schoolId: id.data });
  done();
  return r.ok ? { ok: true, code: r.code, basicId: r.basicId } : { ok: false, error: r.error };
}

export async function unlinkLineAction(fd: FormData): Promise<void> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(str(fd, "school"));
  if (!info || !id.success) return;
  if (await disconnectLine(info.id, id.data)) await audit({ by: info.id, action: "channel.line_unlink", entity: "notification_channels", schoolId: id.data });
  done();
}

export async function sendTestNotificationAction(schoolId: string): Promise<{ ok: boolean; error?: string }> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(schoolId);
  if (!info || !id.success) return { ok: false, error: "err_forbidden" };
  const rl = await supabaseAdmin().rpc("rl_hit", { p_key: `chan:test:${info.id}`, p_limit: 5, p_window_s: 3600 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };
  const { t } = await dictFor(info.id);
  const r = await notifyUser({ userId: info.id, schoolId: id.data, kind: "info", title: t.notif_test_title, body: t.notif_test_body, link: "/notifications" });
  await audit({ by: info.id, action: "channel.line_test", entity: "notification_channels", schoolId: id.data, detail: { line: r.line } });
  done();
  return { ok: r.inApp };
}

export async function markAllReadAction(): Promise<void> {
  const info = await getAuthInfo();
  if (!info) return;
  await (await createClient()).from("app_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  done();
}

/** เปิดแจ้งเตือน: ทำเครื่องหมายอ่านแล้วไปยังลิงก์ภายในของมัน */
export async function openNotificationAction(fd: FormData): Promise<void> {
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data).select("link");
  done();
  redirect(safeHref(data?.[0]?.link ?? undefined, "/notifications"));
}

// ===== ผู้ดูแลโรงเรียน: ตั้งค่า LINE OA ของโรงเรียน =====
const lineSchema = z.object({
  basic_id: z.string().trim().regex(/^@[A-Za-z0-9._-]{2,40}$/),
  quota: z.coerce.number().int().min(0).max(1_000_000),
});

export async function saveLineSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const p = lineSchema.safeParse({ basic_id: str(fd, "basic_id"), quota: str(fd, "quota") });
  if (!p.success) return fail("err_invalid_input");
  const secret = str(fd, "secret").trim();
  const token = str(fd, "token").trim();
  if (secret.length > 200 || token.length > 500) return fail("err_invalid_input");
  const a = supabaseAdmin();
  const { data: cur } = await a.from("school_line_channels").select("channel_secret_enc,access_token_enc").eq("school_id", c.school.id).maybeSingle();
  const patch: Record<string, unknown> = { school_id: c.school.id, basic_id: p.data.basic_id, monthly_quota: p.data.quota };
  try {
    if (secret) patch.channel_secret_enc = encryptSecret(secret);
    if (token) {
      patch.access_token_enc = encryptSecret(token);
      patch.paused_until = null; // เปลี่ยน token แล้วปลดการพักอัตโนมัติ
      patch.last_error = null;
    }
  } catch {
    return fail("err_generic"); // กุญแจเข้ารหัสของระบบไม่พร้อม
  }
  const complete = Boolean((patch.channel_secret_enc ?? cur?.channel_secret_enc) && (patch.access_token_enc ?? cur?.access_token_enc));
  const wantEnabled = str(fd, "enabled") === "on";
  if (wantEnabled && !complete) return fail("err_invalid_input"); // เปิดใช้ต้องตั้งค่าครบก่อน
  patch.enabled = wantEnabled;
  const { data, error } = await a.from("school_line_channels").upsert(patch, { onConflict: "school_id" }).select("school_id");
  if (error || data?.length !== 1) return fail(mapDbError(error));
  await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "channel.line_settings", entity: "school_line_channels", entityId: c.school.id, schoolId: c.school.id, detail: { enabled: wantEnabled, quota: p.data.quota, secret_changed: Boolean(secret), token_changed: Boolean(token) } });
  revalidatePath("/", "layout");
  return ok({ message: "settings_saved" });
}

export async function testLineConnectionAction(_prev: ActionState): Promise<ActionState> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const cfg = await loadSchoolLine(c.school.id, { requireEnabled: false });
  if (!cfg) return fail("err_invalid_input");
  const r = await lineBotInfo(cfg.token);
  const a = supabaseAdmin();
  if (!r.ok) {
    await a.from("school_line_channels").update({ last_error: `verify_${r.status}` }).eq("school_id", c.school.id);
    revalidatePath("/", "layout");
    return ok({ message: "line_admin_test_fail" });
  }
  await a.from("school_line_channels").update({ last_verified_at: new Date().toISOString(), last_error: null }).eq("school_id", c.school.id);
  await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "channel.line_verify", entity: "school_line_channels", entityId: c.school.id, schoolId: c.school.id });
  revalidatePath("/", "layout");
  if (r.basicId && r.basicId.toLowerCase() !== cfg.basicId.toLowerCase()) return ok({ message: "line_admin_test_mismatch", data: { real: r.basicId } });
  return ok({ message: "line_admin_test_ok" });
}

// ===== ลิงก์สำหรับบัญชีนักเรียน (ผู้ดูแลโรงเรียน หรือผู้ปกครองที่ได้รับอนุมัติของเด็กคนนั้น) =====
export async function createStudentInviteAction(studentId: string): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const info = await getAuthInfo();
  const id = uuidSchema.safeParse(studentId);
  if (!info || !id.success) return { ok: false, error: "err_forbidden" };
  const a = supabaseAdmin();
  const { data: st } = await a.from("students").select("id,school_id,status").eq("id", id.data).maybeSingle();
  if (!st || st.status !== "active") return { ok: false, error: "err_not_found" };
  const supabase = await createClient();
  const [adm, guard] = await Promise.all([supabase.rpc("is_school_admin", { p_school: st.school_id }), supabase.rpc("is_guardian_of", { p_student: st.id })]);
  if (adm.data !== true && guard.data !== true) return { ok: false, error: "err_forbidden" };
  const rl = await a.rpc("rl_hit", { p_key: `sinv:${info.id}`, p_limit: 20, p_window_s: 3600 });
  if (rl.data === false) return { ok: false, error: "err_rate_limited" };
  const code = makeInviteCode();
  const { data, error } = await a.from("school_invites").insert({ school_id: st.school_id, role: "student", student_id: st.id, code_hash: hashInviteCode(code), expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86400e3).toISOString(), created_by: info.id }).select("id");
  if (error || data?.length !== 1) return { ok: false, error: "err_generic" };
  await audit({ by: info.id, action: "member.invite_create", entity: "school_invites", entityId: data[0]!.id, schoolId: st.school_id, detail: { role: "student" } });
  return { ok: true, code };
}

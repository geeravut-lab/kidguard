"use server";

import { trackEvent } from "@/lib/analytics/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { safeNext } from "@/lib/auth/next";
import { getAuthInfo } from "@/lib/auth/me";
import { publicEnv } from "@/lib/env";
import { allow, clientIp, hashKey } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, nameSchema, passwordSchema, str } from "@/lib/validation";

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host && /^[a-z0-9.:-]+$/i.test(host) ? `${proto}://${host}` : publicEnv.siteUrl;
}

export async function signUpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema, password: passwordSchema, name: nameSchema }).safeParse({
    email: str(fd, "email"), password: str(fd, "password"), name: str(fd, "name"),
  });
  if (!parsed.success) {
    const bad = parsed.error.issues[0]?.path[0];
    return fail(bad === "email" ? "err_invalid_email" : bad === "password" ? "err_weak_password" : "err_name_required");
  }
  if (!(await allow(`signup:${await clientIp()}`, 10, 3600))) return fail("err_rate_limited");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.name } },
  });
  if (error) {
    if (error.code === "user_already_exists" || /already/i.test(error.message)) return fail("err_email_taken");
    if (error.code === "weak_password") return fail("err_weak_password");
    if (error.status === 429) return fail("err_rate_limited");
    console.error("signUp failed", error.code);
    return fail("err_generic");
  }
  // สมัครซ้ำด้วยอีเมลที่มีอยู่ (identities ว่าง) = ไม่ได้สร้างบัญชีใหม่
  if (!data.user || (data.user.identities?.length ?? 1) === 0) return fail("err_email_taken");
  await audit({ by: data.user.id, action: "auth.signup", entity: "auth_users", entityId: data.user.id, detail: { method: "email" } });
  await trackEvent("signup", data.user.id);
  redirect(safeNext(str(fd, "next")));
}

export async function signInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(72) }).safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return fail("err_login_failed");
  // กันเดารหัสผ่าน: ต่อ IP และต่ออีเมล (เก็บเฉพาะ hash) — ผู้ใช้ปกติไม่มีทางถึงเพดานนี้
  if (!(await allow(`login:ip:${await clientIp()}`, 30, 600)) || !(await allow(`login:em:${hashKey(parsed.data.email)}`, 10, 600))) return fail("err_rate_limited");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.status === 429) return fail("err_rate_limited");
    await audit({ action: "auth.login_failed", entity: "auth_users", detail: { method: "email" } }); // ไม่เก็บอีเมล
    return fail("err_login_failed");
  }
  await audit({ by: data.user.id, action: "auth.login", entity: "auth_users", entityId: data.user.id, detail: { method: "email" } });
  redirect(safeNext(str(fd, "next")));
}

export async function signOutAction(): Promise<void> {
  const info = await getAuthInfo();
  const supabase = await createClient();
  await supabase.auth.signOut();
  if (info) await audit({ by: info.id, action: "auth.logout", entity: "auth_users", entityId: info.id });
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(str(fd, "email"));
  if (!parsed.success) return fail("err_invalid_email");
  if (!(await allow(`forgot:ip:${await clientIp()}`, 10, 3600)) || !(await allow(`forgot:em:${hashKey(parsed.data)}`, 3, 3600))) return fail("err_rate_limited");
  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error && error.status === 429) return fail("err_rate_limited");
  // ตอบเหมือนกันทุกกรณี (ไม่เปิดเผยว่าอีเมลนี้มีบัญชีหรือไม่)
  return ok({ message: "auth_forgot_sent" });
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const pw = passwordSchema.safeParse(str(fd, "password"));
  if (!pw.success) return fail("err_weak_password");
  if (str(fd, "password") !== str(fd, "confirm")) return fail("err_password_mismatch");
  const info = await getAuthInfo();
  if (!info) return fail("err_forbidden");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return fail(error.code === "same_password" ? "err_password_same" : error.code === "weak_password" ? "err_weak_password" : "err_generic");
  await audit({ by: info.id, action: "auth.password_reset", entity: "auth_users", entityId: info.id });
  redirect("/start");
}

/** เปลี่ยนรหัสผ่าน: พิสูจน์รหัสเดิมด้วยการ sign-in ซ้ำ → อัปเดต → ออกจากระบบเครื่องอื่น (docs/CHANGE-PASSWORD-KNOWLEDGE.md) */
export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const info = await getAuthInfo();
  if (!info?.email || !info.hasPassword) return fail("err_forbidden");
  const current = str(fd, "current");
  const next = str(fd, "password");
  if (!current) return fail("err_password_current_wrong");
  if (!passwordSchema.safeParse(next).success) return fail("err_weak_password");
  if (next !== str(fd, "confirm")) return fail("err_password_mismatch");
  if (next === current) return fail("err_password_same");
  const supabase = await createClient();
  const proof = await supabase.auth.signInWithPassword({ email: info.email, password: current });
  if (proof.error) return fail(proof.error.status === 429 ? "err_rate_limited" : "err_password_current_wrong");
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return fail(error.code === "same_password" ? "err_password_same" : error.code === "weak_password" ? "err_weak_password" : "err_generic");
  await supabase.auth.signOut({ scope: "others" });
  await audit({ by: info.id, action: "auth.password_change", entity: "auth_users", entityId: info.id });
  return ok({ message: "pw_done" });
}

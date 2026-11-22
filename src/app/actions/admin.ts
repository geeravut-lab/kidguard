"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { isGroupName, parseSwitch, switchableGroups } from "@/lib/audit/kinds";
import { seenGroups } from "@/lib/audit/read";
import { guardSchool, roleOfCtx } from "@/lib/auth/action-guard";
import { getMe } from "@/lib/auth/me";
import { FAVICON_MAX_BYTES, LOGO_MAX_BYTES, validBrandName } from "@/lib/brand/brand";
import { clearBrandImage, saveBrandImage, saveBrandNames } from "@/lib/brand/server";
import { isFeatureFlag, normalizeFlags, withFlag } from "@/lib/flags/flags";
import { hashInviteCode, INVITE_TTL_DAYS, makeInviteCode } from "@/lib/invites";
import { isRuleKey, sanitizeParams } from "@/lib/rules/rules";
import { loadPlatformSettings, savePlatformSetting } from "@/lib/settings/platform";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { str, uuidSchema } from "@/lib/validation";

async function platformGuard() {
  const me = await getMe();
  return me?.platform_admin ? me : null;
}

async function readFile(fd: FormData, max: number): Promise<{ bytes: Uint8Array } | { error: string }> {
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "err_invalid_input" };
  if (f.size > max) return { error: "err_image_too_big" };
  return { bytes: new Uint8Array(await f.arrayBuffer()) };
}

// ===== แบรนด์แพลตฟอร์ม (super_admin) =====
export async function saveBrandNamesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await platformGuard();
  if (!me) return fail("err_forbidden");
  const th = str(fd, "name_th").trim();
  const en = str(fd, "name_en").trim();
  if (!validBrandName(th) || !validBrandName(en)) return fail("err_invalid_input");
  if (!(await saveBrandNames({ name_th: th, name_en: en }))) return fail("err_save_failed");
  await audit({ by: me.user_id, role: "super_admin", action: "brand.names", entity: "platform_settings", entityId: "brand" });
  revalidatePath("/", "layout");
  return ok({ message: "brand_saved" });
}

export async function uploadBrandImageAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await platformGuard();
  if (!me) return fail("err_forbidden");
  const kind = str(fd, "kind");
  if (kind !== "logo" && kind !== "favicon") return fail("err_invalid_input");
  const f = await readFile(fd, kind === "logo" ? LOGO_MAX_BYTES : FAVICON_MAX_BYTES);
  if ("error" in f) return fail(f.error);
  const r = await saveBrandImage({ kind, bytes: f.bytes });
  if (!r.ok) return fail(r.error);
  await audit({ by: me.user_id, role: "super_admin", action: "brand.image", entity: "platform_settings", entityId: kind, detail: { kind, mime: r.ref.mime } });
  revalidatePath("/", "layout");
  return ok({ message: "brand_saved" });
}

export async function clearBrandImageAction(fd: FormData): Promise<void> {
  const me = await platformGuard();
  const kind = str(fd, "kind");
  if (!me || (kind !== "logo" && kind !== "favicon")) return;
  if (await clearBrandImage({ kind })) await audit({ by: me.user_id, role: "super_admin", action: "brand.image_reset", entity: "platform_settings", entityId: kind, detail: { kind } });
  revalidatePath("/", "layout");
}

// ===== โลโก้โรงเรียน (school_admin) =====
export async function uploadSchoolLogoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return fail("err_forbidden");
  const f = await readFile(fd, LOGO_MAX_BYTES);
  if ("error" in f) return fail(f.error);
  const r = await saveBrandImage({ kind: "logo", bytes: f.bytes, schoolId: c.school.id });
  if (!r.ok) return fail(r.error);
  await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "brand.school_logo", entity: "schools", entityId: c.school.id, schoolId: c.school.id, detail: { mime: r.ref.mime } });
  revalidatePath("/", "layout");
  return ok({ message: "brand_saved" });
}

export async function clearSchoolLogoAction(): Promise<void> {
  const c = await guardSchool(["school_admin"]);
  if (!c) return;
  if (await clearBrandImage({ kind: "logo", schoolId: c.school.id })) await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "brand.school_logo_reset", entity: "schools", entityId: c.school.id, schoolId: c.school.id });
  revalidatePath("/", "layout");
}

// ===== สวิตช์ฟีเจอร์ =====
export async function setFeatureFlagAction(fd: FormData): Promise<void> {
  const me = await platformGuard();
  const flag = str(fd, "flag");
  if (!me || !isFeatureFlag(flag)) return;
  const enabled = str(fd, "enabled") === "true";
  const cur = normalizeFlags((await loadPlatformSettings()).feature_flags);
  if (await savePlatformSetting("feature_flags", withFlag(cur, flag, enabled))) {
    await audit({ by: me.user_id, role: "super_admin", action: "flag.set", entity: "platform_settings", entityId: flag, detail: { flag, enabled } });
  }
  revalidatePath("/", "layout");
}

// ===== Audit: สวิตช์เปิด/ปิด + ติ๊กกลุ่ม (บันทึกการเปลี่ยนสวิตช์เสมอ) =====
export async function saveAuditSwitchesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const scope = str(fd, "scope");
  const enabled = str(fd, "enabled") === "on";
  const ticked = new Set(fd.getAll("keep").map(String).filter(isGroupName));
  if (scope === "platform") {
    const me = await platformGuard();
    if (!me) return fail("err_forbidden");
    const cur = parseSwitch((await loadPlatformSettings()).audit);
    const all = switchableGroups(await seenGroups({ platform: true, schoolId: null }), cur.off_groups);
    const off = all.filter((g) => !ticked.has(g));
    if (!(await savePlatformSetting("audit", { enabled, off_groups: off }))) return fail("err_save_failed");
    await audit({ by: me.user_id, role: "super_admin", action: "audit.switches", entity: "platform_settings", entityId: "audit", detail: { scope, enabled, off_groups: off } });
  } else if (scope === "school") {
    const c = await guardSchool(["school_admin"]);
    if (!c) return fail("err_forbidden");
    const a = supabaseAdmin();
    const { data: row } = await a.from("school_settings").select("audit").eq("school_id", c.school.id).maybeSingle();
    const cur = parseSwitch(row?.audit);
    const all = switchableGroups(await seenGroups({ platform: false, schoolId: c.school.id }), cur.off_groups);
    const off = all.filter((g) => !ticked.has(g));
    const { data, error } = await a.from("school_settings").update({ audit: { enabled, off_groups: off } }).eq("school_id", c.school.id).select("school_id");
    if (error || data?.length !== 1) return fail("err_save_failed");
    await audit({ by: c.me.user_id, role: roleOfCtx(c), action: "audit.switches", entity: "school_settings", entityId: c.school.id, schoolId: c.school.id, detail: { scope, enabled, off_groups: off } });
  } else return fail("err_invalid_input");
  revalidatePath("/admin/audit");
  return ok({ message: "audit_switches_saved" });
}

/** ลบบันทึกเก่ากว่า 4 ปี (แอดมินแพลตฟอร์ม + พิมพ์ยืนยัน) — ฟังก์ชันฐานข้อมูลตรวจสิทธิ์ซ้ำและบันทึกการลบตลอดไป */
export async function purgeAuditAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await platformGuard();
  if (!me) return fail("err_forbidden");
  if (str(fd, "confirm").trim().toUpperCase() !== "PURGE") return fail("err_invalid_input");
  const { data, error } = await supabaseAdmin().rpc("admin_purge_audit", { p_actor: me.user_id });
  if (error) return fail("err_generic");
  revalidatePath("/admin/audit");
  return ok({ message: "audit_purged", data: { rows: Number(data ?? 0) } });
}

// ===== กฎอัตโนมัติ =====
export async function saveRuleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await platformGuard();
  if (!me) return fail("err_forbidden");
  const key = str(fd, "key");
  if (!isRuleKey(key)) return fail("err_invalid_input");
  const params = sanitizeParams(key, Object.fromEntries([...fd.entries()].filter(([k]) => k.startsWith("p_")).map(([k, v]) => [k.slice(2), v])));
  if (!params) return fail("err_invalid_input");
  const a = supabaseAdmin();
  const { data: cur } = await a.from("automation_rules").select("params").eq("key", key).maybeSingle();
  const merged = { ...(cur?.params && typeof cur.params === "object" ? (cur.params as Record<string, unknown>) : {}), ...params };
  const row = { key, enabled: str(fd, "enabled") === "on", params: merged, updated_by: me.user_id };
  const { data, error } = cur ? await a.from("automation_rules").update(row).eq("key", key).select("key") : await a.from("automation_rules").insert(row).select("key");
  if (error || data?.length !== 1) return fail("err_save_failed");
  await audit({ by: me.user_id, role: "super_admin", action: "rule.save", entity: "automation_rules", entityId: key, detail: { enabled: row.enabled } });
  revalidatePath("/platform/rules");
  return ok({ message: "rules_saved" });
}

// ===== ผู้ดูแลแพลตฟอร์ม =====
export async function revokePlatformAdminAction(fd: FormData): Promise<void> {
  const me = await platformGuard();
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!me || !id.success || id.data === me.user_id) return;
  // เจ้าของ (is_owner) ถอนไม่ได้ และต้องเหลือแอดมินอย่างน้อยหนึ่งคนเสมอ
  const { data } = await supabaseAdmin().from("platform_admins").delete().eq("user_id", id.data).eq("is_owner", false).select("user_id");
  if (data?.length === 1) await audit({ by: me.user_id, role: "super_admin", action: "member.admin_revoke", entity: "platform_admins", entityId: id.data });
  revalidatePath("/platform/admins");
}

export async function createSuperAdminInviteAction(_prev: ActionState): Promise<ActionState> {
  const me = await platformGuard();
  if (!me) return fail("err_forbidden");
  const code = makeInviteCode();
  const { data, error } = await supabaseAdmin()
    .from("school_invites")
    .insert({ school_id: null, role: "super_admin", code_hash: hashInviteCode(code), expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86400e3).toISOString(), created_by: me.user_id })
    .select("id");
  if (error || data?.length !== 1) return fail("err_generic");
  await audit({ by: me.user_id, role: "super_admin", action: "member.invite_create", entity: "school_invites", entityId: data[0]!.id, detail: { role: "super_admin" } });
  return ok({ data: { code } });
}


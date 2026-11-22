"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { SCHOOL_COOKIE } from "@/lib/auth/guards";
import { getMe } from "@/lib/auth/me";
import { hashInviteCode, INVITE_TTL_DAYS, makeInviteCode } from "@/lib/invites";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { str, uuidSchema } from "@/lib/validation";

async function platformGuard() {
  const me = await getMe();
  return me?.platform_admin ? me : null;
}

export async function selectSchoolAction(fd: FormData): Promise<void> {
  const me = await getMe();
  const id = uuidSchema.safeParse(str(fd, "school"));
  if (!me || !id.success) return;
  if (!me.platform_admin && !me.memberships.some((m) => m.school_id === id.data)) return;
  (await cookies()).set(SCHOOL_COOKIE, id.data, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  revalidatePath("/", "layout");
  redirect("/admin");
}

export async function createSchoolAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await platformGuard();
  if (!me) return fail("err_forbidden");
  const p = z.object({ slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/), name: z.string().trim().min(1).max(120) }).safeParse({ slug: str(fd, "slug"), name: str(fd, "name") });
  if (!p.success) return fail("err_invalid_input");
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("schools").insert({ slug: p.data.slug, name_th: p.data.name }).select("id");
  if (error || data?.length !== 1) return fail(error?.code === "23505" ? "err_duplicate" : "err_generic");
  await admin.from("school_settings").insert({ school_id: data[0]!.id });
  await audit({ by: me.user_id, role: "super_admin", action: "school.create", entity: "schools", entityId: data[0]!.id, schoolId: data[0]!.id });
  revalidatePath("/", "layout");
  return ok();
}

export async function setSchoolActiveAction(fd: FormData): Promise<void> {
  const me = await platformGuard();
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!me || !id.success) return;
  const active = str(fd, "active") === "true";
  const { data } = await supabaseAdmin().from("schools").update({ active }).eq("id", id.data).select("id");
  if (data?.length === 1) await audit({ by: me.user_id, role: "super_admin", action: "school.active", entity: "schools", entityId: id.data, schoolId: id.data, detail: { active } });
  revalidatePath("/", "layout");
}

export async function createSchoolAdminInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await platformGuard();
  if (!me) return fail("err_forbidden");
  const school = uuidSchema.safeParse(str(fd, "school"));
  if (!school.success) return fail("err_invalid_input");
  const code = makeInviteCode();
  const { data, error } = await supabaseAdmin()
    .from("school_invites")
    .insert({ school_id: school.data, role: "school_admin", code_hash: hashInviteCode(code), expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86400e3).toISOString(), created_by: me.user_id })
    .select("id");
  if (error || data?.length !== 1) return fail("err_generic");
  await audit({ by: me.user_id, role: "super_admin", action: "member.invite_create", entity: "school_invites", entityId: data[0]!.id, schoolId: school.data, detail: { role: "school_admin" } });
  return ok({ data: { code } });
}

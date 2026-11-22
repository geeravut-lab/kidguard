"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, mapDbError, ok, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { getAuthInfo } from "@/lib/auth/me";
import { PRIVACY_VERSION } from "@/lib/consent";
import { createClient } from "@/lib/supabase/server";
import { nameSchema, normalizePhone, normalizePlate, relationSchema, str, uuidSchema } from "@/lib/validation";

async function ctx() {
  const info = await getAuthInfo();
  if (!info) return null;
  return { info, supabase: await createClient() };
}

export async function chooseRoleAction(): Promise<void> {
  const c = await ctx();
  if (!c) redirect("/login");
  const { error } = await c.supabase.rpc("choose_role", { p_role: "parent" });
  if (!error) await audit({ by: c.info.id, action: "auth.role_chosen", entity: "profiles", entityId: c.info.id, detail: { role: "parent" } });
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function addPersonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return fail("err_forbidden");
  const name = nameSchema.safeParse(str(fd, "name"));
  if (!name.success) return fail("err_name_required");
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return fail("err_invalid_phone");
  const rel = relationSchema.safeParse(str(fd, "relation"));
  const { count } = await c.supabase.from("guardian_persons").select("id", { count: "exact", head: true }).eq("user_id", c.info.id);
  const { data, error } = await c.supabase
    .from("guardian_persons")
    .insert({ user_id: c.info.id, name: name.data, phone, relation: rel.success ? rel.data : null, is_primary: (count ?? 0) === 0 })
    .select("id");
  if (error || data?.length !== 1) return fail(mapDbError(error));
  await audit({ by: c.info.id, action: "guardian.person_add", entity: "guardian_persons", entityId: data[0]!.id });
  revalidatePath("/", "layout");
  return ok();
}

export async function removePersonAction(fd: FormData): Promise<void> {
  const c = await ctx();
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const { data } = await c.supabase.from("guardian_persons").delete().eq("id", id.data).eq("user_id", c.info.id).select("id, is_primary");
  if (data?.length === 1) {
    await audit({ by: c.info.id, action: "guardian.person_remove", entity: "guardian_persons", entityId: id.data });
    if (data[0]!.is_primary) {
      const { data: next } = await c.supabase.from("guardian_persons").select("id").eq("user_id", c.info.id).order("created_at").limit(1);
      if (next?.[0]) await c.supabase.from("guardian_persons").update({ is_primary: true }).eq("id", next[0].id);
    }
  }
  revalidatePath("/", "layout");
}

export async function addVehicleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return fail("err_forbidden");
  const plate = normalizePlate(str(fd, "plate"));
  if (!plate) return fail("err_invalid_plate");
  const province = z.string().trim().min(1).max(40).safeParse(str(fd, "province"));
  if (!province.success) return fail("err_invalid_input");
  const color = str(fd, "color").trim().slice(0, 30) || null;
  const model = str(fd, "model").trim().slice(0, 40) || null;
  const { data, error } = await c.supabase.from("vehicles").insert({ user_id: c.info.id, plate, province: province.data, color, model }).select("id");
  if (error || data?.length !== 1) return fail(mapDbError(error));
  await audit({ by: c.info.id, action: "guardian.vehicle_add", entity: "vehicles", entityId: data[0]!.id });
  revalidatePath("/", "layout");
  return ok();
}

export async function removeVehicleAction(fd: FormData): Promise<void> {
  const c = await ctx();
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const { data } = await c.supabase.from("vehicles").delete().eq("id", id.data).eq("user_id", c.info.id).select("id");
  if (data?.length === 1) await audit({ by: c.info.id, action: "guardian.vehicle_remove", entity: "vehicles", entityId: id.data });
  revalidatePath("/", "layout");
}

export async function claimStudentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return fail("err_forbidden");
  const parsed = z
    .object({ school: uuidSchema, classroom: uuidSchema, name: z.string().trim().min(2).max(120) })
    .safeParse({ school: str(fd, "school"), classroom: str(fd, "classroom"), name: str(fd, "name") });
  if (!parsed.success) return fail("err_invalid_input");
  const rel = relationSchema.safeParse(str(fd, "relation"));
  const { data, error } = await c.supabase.rpc("claim_student", {
    p_school: parsed.data.school,
    p_classroom: parsed.data.classroom,
    p_name: parsed.data.name,
    p_relation: rel.success ? rel.data : "",
    p_teacher_name: str(fd, "teacher").trim().slice(0, 80) || null,
  });
  if (error) return fail(mapDbError(error));
  await audit({ by: c.info.id, action: "guardian.claim", entity: "guardian_links", entityId: data as string, schoolId: parsed.data.school });
  revalidatePath("/", "layout");
  return ok();
}

export async function cancelClaimAction(fd: FormData): Promise<void> {
  const c = await ctx();
  const id = uuidSchema.safeParse(str(fd, "id"));
  if (!c || !id.success) return;
  const { data } = await c.supabase.from("guardian_links").delete().eq("id", id.data).eq("status", "pending").select("id, school_id");
  if (data?.length === 1) await audit({ by: c.info.id, action: "guardian.claim_cancel", entity: "guardian_links", entityId: id.data, schoolId: data[0]!.school_id });
  revalidatePath("/", "layout");
}

/** ขั้นสุดท้ายของลงทะเบียน: บันทึกความยินยอม PDPA แล้วตรวจความครบถ้วนที่ฝั่งฐานข้อมูล */
export async function finishOnboardingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return fail("err_forbidden");
  if (str(fd, "accept") !== "on") return fail("err_consent_required");
  for (const kind of ["privacy", "location"] as const) {
    const { error } = await c.supabase.from("consents").insert({ user_id: c.info.id, kind, version: PRIVACY_VERSION });
    if (error && error.code !== "23505") return fail(mapDbError(error));
  }
  const { data, error } = await c.supabase.rpc("complete_onboarding");
  if (error) return fail(mapDbError(error));
  if (data !== true) return fail("err_incomplete");
  await audit({ by: c.info.id, action: "auth.consent", entity: "consents", entityId: c.info.id, detail: { version: PRIVACY_VERSION } });
  await audit({ by: c.info.id, action: "guardian.onboarded", entity: "profiles", entityId: c.info.id });
  revalidatePath("/", "layout");
  redirect("/home");
}

export async function updateNameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ctx();
  if (!c) return fail("err_forbidden");
  const name = nameSchema.safeParse(str(fd, "name"));
  if (!name.success) return fail("err_name_required");
  const { data, error } = await c.supabase.from("profiles").update({ display_name: name.data }).eq("id", c.info.id).select("id");
  if (error || data?.length !== 1) return fail(mapDbError(error));
  revalidatePath("/", "layout");
  return ok({ message: "profile_saved" });
}

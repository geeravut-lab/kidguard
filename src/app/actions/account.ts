"use server";

import { redirect } from "next/navigation";
import { fail, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { getAuthInfo } from "@/lib/auth/me";
import { allow } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/validation";

/** ลบบัญชีของตัวเอง (PDPA): ต้องพิมพ์ DELETE + รหัสผ่านปัจจุบัน (ถ้ามี); ผู้ดูแลคนสุดท้าย/เจ้าของแพลตฟอร์มลบไม่ได้ */
export async function deleteMyAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const info = await getAuthInfo();
  if (!info) return fail("err_forbidden");
  if (!(await allow(`delacct:${info.id}`, 5, 3600))) return fail("err_rate_limited");
  if (str(fd, "confirm").trim() !== "DELETE") return fail("err_delete_confirm");
  const supabase = await createClient();
  if (info.hasPassword && info.email) {
    const proof = await supabase.auth.signInWithPassword({ email: info.email, password: str(fd, "password") });
    if (proof.error) return fail(proof.error.status === 429 ? "err_rate_limited" : "err_delete_confirm");
  }
  const a = supabaseAdmin();
  const [{ data: pa }, { data: mine }] = await Promise.all([
    a.from("platform_admins").select("user_id,is_owner").eq("user_id", info.id).maybeSingle(),
    a.from("school_members").select("school_id").eq("user_id", info.id).eq("role", "school_admin"),
  ]);
  if (pa?.is_owner) return fail("err_last_admin_delete");
  for (const m of mine ?? []) {
    const { count } = await a.from("school_members").select("user_id", { count: "exact", head: true }).eq("school_id", m.school_id).eq("role", "school_admin");
    if ((count ?? 0) <= 1) return fail("err_last_admin_delete");
  }
  await audit({ by: info.id, action: "auth.account_delete", entity: "auth_users", entityId: info.id });
  const del = await a.auth.admin.deleteUser(info.id);
  if (del.error) return fail("err_generic");
  await supabase.auth.signOut();
  redirect("/");
}

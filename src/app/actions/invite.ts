"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, mapDbError, type ActionState } from "@/lib/action";
import { audit } from "@/lib/audit/server";
import { getAuthInfo, getMe, postLoginPath } from "@/lib/auth/me";
import { INVITE_CODE_RE } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";
import { str } from "@/lib/validation";

export async function redeemInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const info = await getAuthInfo();
  if (!info) return fail("err_forbidden");
  const code = str(fd, "code");
  if (!INVITE_CODE_RE.test(code)) return fail("err_invalid_invite");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });
  if (error) return fail(mapDbError(error));
  await audit({ by: info.id, action: "member.invite_redeemed", entity: "school_invites", schoolId: (data as { school_id?: string | null })?.school_id ?? null, detail: { role: (data as { role?: string })?.role } });
  revalidatePath("/", "layout");
  const me = await getMe();
  redirect(me ? postLoginPath(me) : "/start");
}

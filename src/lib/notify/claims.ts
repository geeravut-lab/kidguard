import "server-only";
import { fmt } from "@/lib/i18n/dict";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dictFor, notifyUser } from "./index";

/** แจ้งผู้ปกครองเมื่อโรงเรียนอนุมัติ/ไม่อนุมัติคำขอผูกนักเรียน */
export async function notifyClaimDecision(linkId: string): Promise<void> {
  const { data: l } = await supabaseAdmin().from("guardian_links").select("user_id,school_id,claimed_name,status").eq("id", linkId).maybeSingle();
  if (!l || (l.status !== "approved" && l.status !== "rejected")) return;
  const { t } = await dictFor(l.user_id);
  const ok = l.status === "approved";
  await notifyUser({
    userId: l.user_id, schoolId: l.school_id, kind: ok ? "success" : "warning",
    title: ok ? t.notif_claim_approved_title : t.notif_claim_rejected_title,
    body: fmt(ok ? t.notif_claim_approved_body : t.notif_claim_rejected_body, { name: l.claimed_name.split(/\s+/)[0] ?? l.claimed_name }),
    link: "/home", dedupeKey: `claim:${linkId}`,
  });
}

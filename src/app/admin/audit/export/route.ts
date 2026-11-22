import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit/server";
import { parseFilter } from "@/lib/audit/kinds";
import { actorNames, auditToCsv, queryAuditForCsv } from "@/lib/audit/read";
import { resolveSchool } from "@/lib/auth/guards";
import { getMe } from "@/lib/auth/me";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** ส่งออก CSV ตามตัวกรองเดียวกับหน้าจอ — เฉพาะ school_admin/แอดมินแพลตฟอร์ม; การส่งออกถูกบันทึกเสมอ (กลุ่ม audit) */
export async function GET(req: NextRequest) {
  const me = await getMe();
  const school = me ? await resolveSchool(me) : null;
  if (!me || !school || !(me.platform_admin || school.roles.includes("school_admin"))) return new NextResponse(null, { status: 404 });
  const rl = await supabaseAdmin().rpc("rl_hit", { p_key: `audit:export:${me.user_id}`, p_limit: 10, p_window_s: 600 });
  if (rl.data === false) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const filter = parseFilter(Object.fromEntries(req.nextUrl.searchParams));
  const rows = await queryAuditForCsv(filter, { platform: me.platform_admin, schoolId: school.id });
  const csv = auditToCsv(rows, await actorNames(rows.map((r) => r.actor_id)));
  await audit({
    by: me.user_id, role: me.platform_admin ? "super_admin" : "school_admin", action: "audit.export", entity: "audit_log",
    schoolId: me.platform_admin ? null : school.id, detail: { rows: rows.length, group: filter.group ?? null, from: filter.from ?? null, to: filter.to ?? null },
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

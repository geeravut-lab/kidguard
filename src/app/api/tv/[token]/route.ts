import { NextResponse, type NextRequest } from "next/server";
import { findTv, loadTvState } from "@/lib/safety/tv";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** ลายนิ้วมือของจอ TV (ไม่ต้องล็อกอิน แต่ต้องมีโทเคนลับ): คืนเฉพาะค่า md5 ของสถานะ ไม่มีชื่อ */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const h = { "Cache-Control": "no-store" };
  const { token } = await ctx.params;
  const d = await findTv(token);
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404, headers: h });
  const rl = await supabaseAdmin().rpc("rl_hit", { p_key: `tv:${d.id}`, p_limit: 120, p_window_s: 60 });
  if (rl.data === false) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: h });
  const { state } = await loadTvState(d);
  return NextResponse.json({ t: state.fp }, { headers: h });
}

import { NextResponse, type NextRequest } from "next/server";
import { handleLineWebhook } from "@/lib/line/webhook";

export const dynamic = "force-dynamic";

/** webhook ต่อโรงเรียน: https://<โดเมน>/api/line/webhook/<slug> — ต้องอ่านเป็นข้อความดิบก่อนตรวจลายเซ็น (ห้าม req.json() ก่อน) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const raw = await req.text();
  const r = await handleLineWebhook({ raw, signature: req.headers.get("x-line-signature"), slug });
  return NextResponse.json(r.body, { status: r.status });
}

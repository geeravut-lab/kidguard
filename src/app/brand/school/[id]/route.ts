import type { NextRequest } from "next/server";
import { schoolLogoRef, serveBrandImage } from "@/lib/brand/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// โลโก้โรงเรียน (เปิดสาธารณะด้วย id ที่เดาไม่ได้ — ใช้บนการ์ด LINE ได้); ไม่มี = โลโก้แพลตฟอร์ม
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const { data } = await supabaseAdmin().from("schools").select("logo").eq("id", id.data).eq("active", true).maybeSingle();
  return serveBrandImage(req, schoolLogoRef(data), "logo", "/brand/logo", id.data);
}

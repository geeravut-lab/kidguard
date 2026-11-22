import type { NextRequest } from "next/server";
import { loadBrand, serveBrandImage } from "@/lib/brand/server";

export const dynamic = "force-dynamic";

// รูปของแอดมิน (ถ้ามี) ไม่งั้นรูปในตัว — หน้าเข้าสู่ระบบต้องเห็นโลโก้ จึงเปิดสาธารณะ
export async function GET(req: NextRequest) {
  return serveBrandImage(req, (await loadBrand()).logo, "logo", "/icons/logo.svg");
}

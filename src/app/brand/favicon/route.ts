import { NextResponse, type NextRequest } from "next/server";

// เฟส 0: ไม่มีรูปของแอดมิน → redirect ไปรูปในตัว (เฟส 5: เสิร์ฟรูปที่อัปโหลดพร้อม ETag/304)
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/icons/favicon-32.png", req.url), 307);
  res.headers.set("Cache-Control", "public, max-age=60");
  return res;
}

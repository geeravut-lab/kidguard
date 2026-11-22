/** ค่า public (ฝั่ง browser เห็นได้) — anon key ถูกจำกัดด้วย RLS
 *  ห้ามใส่ชื่อ/ค่าความลับในไฟล์นี้ (ไฟล์นี้ถูกรวมเข้า bundle ฝั่ง client) — ค่าลับอยู่ใน env.server.ts */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kidguards.vercel.app",
};

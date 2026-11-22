import { z } from "zod";

/** ค่า public (ฝั่ง browser เห็นได้) — anon key ถูกจำกัดด้วย RLS */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kidguards.vercel.app",
};

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

/** ค่าลับฝั่ง server เท่านั้น — เรียกจาก server code (ไฟล์ที่ import "server-only") */
export function getServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("server_env_missing");
  return parsed.data;
}

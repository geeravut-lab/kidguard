import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env.server";
import { publicEnv } from "@/lib/env";

/** service role: ข้าม RLS ทั้งหมด — ใช้ใน server เท่านั้น ห้าม import จาก client component */
export function supabaseAdmin() {
  return createClient(publicEnv.supabaseUrl, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

/** ค่าลับฝั่ง server เท่านั้น (import "server-only" กันหลุดเข้า client bundle) */
export function getServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("server_env_missing");
  return parsed.data;
}

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/** client ของผู้ใช้ฝั่ง server (ติด RLS ตามสิทธิ์ผู้ล็อกอิน) */
export async function createClient() {
  const store = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* เรียกจาก Server Component: เขียนคุกกี้ไม่ได้ — proxy จะรีเฟรช session แทน */
        }
      },
    },
  });
}

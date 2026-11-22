import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// การตั้งค่าแพลตฟอร์ม (platform_settings: brand / feature_flags / audit ...) อ่านทีเดียวต่อ ~30 วินาที ต่อ server instance
// cache เดียวบน globalThis (production อาจ bundle โมดูลซ้ำต่อ route — ตัวแปรระดับโมดูลจะมีหลายชุด)
// อ่านไม่ได้ = ใช้ค่าล่าสุดที่เคยอ่านได้ หรือ {} (ค่าเริ่มต้นในโค้ด — ต้อง "ทำงานต่อ" ไม่ใช่หยุด)

const TTL_MS = 30_000;
type Snapshot = { at: number; rows: Record<string, unknown> };
const G = globalThis as unknown as { __kgPlatformSettings?: Snapshot; __kgPlatformSettingsInflight?: Promise<Record<string, unknown>> };

export async function loadPlatformSettings(): Promise<Record<string, unknown>> {
  const snap = G.__kgPlatformSettings;
  if (snap && Date.now() - snap.at < TTL_MS) return snap.rows;
  if (G.__kgPlatformSettingsInflight) return G.__kgPlatformSettingsInflight;
  const run = (async () => {
    try {
      const { data, error } = await supabaseAdmin().from("platform_settings").select("key,value");
      if (error || !data) throw error ?? new Error("no data");
      const rows = Object.fromEntries(data.map((r) => [r.key, r.value]));
      G.__kgPlatformSettings = { at: Date.now(), rows };
      return rows;
    } catch {
      // อ่านไม่ได้: ใช้ของเก่า (ถ้ามี) และลองใหม่เร็ว ๆ — ไม่ทำให้ทุกหน้าพัง
      const old = G.__kgPlatformSettings?.rows ?? {};
      G.__kgPlatformSettings = { at: Date.now() - TTL_MS + 5_000, rows: old };
      return old;
    } finally {
      G.__kgPlatformSettingsInflight = undefined;
    }
  })();
  G.__kgPlatformSettingsInflight = run;
  return run;
}

export function invalidatePlatformSettings(): void {
  G.__kgPlatformSettings = undefined;
}

/** เขียนค่าของ key เดียว (upsert) แล้วนับแถว — คืน true เมื่อบันทึกจริง */
export async function savePlatformSetting(key: string, value: unknown): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("platform_settings").upsert({ key, value: value as never }, { onConflict: "key" }).select("key");
  invalidatePlatformSettings();
  return !error && data?.length === 1;
}

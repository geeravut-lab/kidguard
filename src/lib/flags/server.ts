import "server-only";
import { loadPlatformSettings } from "@/lib/settings/platform";
import { isEnabled, normalizeFlags, type FeatureFlag, type Flags } from "./flags";

export async function getFlags(): Promise<Flags> {
  return normalizeFlags((await loadPlatformSettings()).feature_flags);
}

export async function featureEnabled(flag: FeatureFlag): Promise<boolean> {
  return isEnabled(await getFlags(), flag);
}

/** ซ่อนปุ่มไม่ใช่การปิดฟีเจอร์ — ใส่ก่อนทำอย่างอื่นใน server action / route ของฟีเจอร์ (คืนรหัส error หรือ null) */
export async function featureOff(flag: FeatureFlag): Promise<"err_feature_off" | null> {
  return (await featureEnabled(flag)) ? null : "err_feature_off";
}

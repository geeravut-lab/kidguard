import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * ลายเซ็น "ณ ตอน render" ของสิ่งที่หน้านี้แสดง — ส่งให้ LiveSync เป็น baseline
 * ต้องเรียก "ก่อน" อ่านข้อมูลของหน้า: ถ้าได้ลายเซ็นเก่ากว่าข้อมูลแค่ refresh เกินหนึ่งครั้ง (ไม่เสียหาย)
 * แต่ถ้าใหม่กว่า หน้าจะค้างเก่าตลอดเพราะ baseline ตามไม่ทันการเปลี่ยนแปลงที่เกิดระหว่างทาง
 */
export const getMyFingerprint = cache(async (): Promise<string | undefined> => {
  const { data, error } = await (await createClient()).rpc("pickup_my_fingerprint");
  return error ? undefined : (data as string);
});

export const getSchoolFingerprint = cache(async (schoolId: string): Promise<string | undefined> => {
  const { data, error } = await (await createClient()).rpc("pickup_fingerprint", { p_school: schoolId });
  return error ? undefined : (data as string);
});

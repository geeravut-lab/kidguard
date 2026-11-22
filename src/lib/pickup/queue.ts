import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueRow } from "@/components/pickup/queue-board";

type Raw = {
  session_id: string; status: "on_the_way" | "arrived"; distance_m: number | null; eta_s: number | null; last_seen_at: string; stale: boolean;
  verified_at: string | null; manual_arrival: boolean; driver_name: string; plate: string; plate_province: string; vehicle_desc: string | null; students: QueueRow["students"];
};

/** คิวของโรงเรียนผ่านฟังก์ชันฐานข้อมูล (ตรวจสิทธิ์ + กรองตามบทบาทที่นั่น; เรียงลำดับที่นั่นเพื่อให้ทุกจอตรงกัน) */
export async function loadQueue(supabase: SupabaseClient, schoolId: string): Promise<QueueRow[]> {
  const { data, error } = await supabase.rpc("pickup_queue", { p_school: schoolId });
  if (error) {
    console.error("pickup_queue failed:", error.code);
    return [];
  }
  const now = Date.now();
  return ((data ?? []) as Raw[]).map((r) => ({
    session_id: r.session_id, status: r.status, distance_m: r.distance_m, eta_s: r.eta_s, stale: r.stale,
    seen_ago_s: Math.max(0, Math.round((now - Date.parse(r.last_seen_at)) / 1000)), verified_at: r.verified_at, manual_arrival: r.manual_arrival,
    driver_name: r.driver_name, plate: r.plate, plate_province: r.plate_province, vehicle_desc: r.vehicle_desc, students: r.students,
  }));
}

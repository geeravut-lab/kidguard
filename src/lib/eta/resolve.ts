import { computeRoute } from "./google";
import { estimate, haversineM, type LatLng } from "./geo";

export type RouteMemo = { route_at: string | null; route_eta_s: number | null; route_straight_m: number | null; route_road_m: number | null };
export type EtaResult = {
  distance_m: number;
  eta_s: number;
  source: "google" | "estimate";
  straight_m: number;
  route: { eta: number; straight: number; road: number } | null; // เมื่อเรียกบริการเส้นทางรอบนี้
  polyline: string | null; // ส่งให้ผู้ปกครองเจ้าของเท่านั้น ไม่เก็บในฐานข้อมูล
};

export type EtaDeps = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** เพดานต่อวัน/ต่อ session (คืน false = ห้ามเรียก API ภายนอก ใช้ค่าประมาณแทน) */
  allowExternal?: () => Promise<boolean>;
  minRouteIntervalMs?: number;
};

/**
 * ระยะ/เวลาโดยประมาณ ตามลำดับ:
 *  1) เรียก Google Routes ครั้งแรก และห่างจากครั้งก่อน ≥ 30 วินาที (ลดต้นทุน) ถ้ามีคีย์และไม่เกินเพดาน
 *  2) ระหว่างรอบ: ปรับค่าล่าสุดของ Google ตามสัดส่วนระยะเส้นตรงที่เปลี่ยนไป
 *  3) ไม่มีคีย์/เรียกไม่สำเร็จ: ประมาณจากเส้นตรง (haversine)
 */
export async function resolveEta(pos: LatLng, school: LatLng, memo: RouteMemo | null, deps: EtaDeps = {}): Promise<EtaResult> {
  const now = (deps.now ?? Date.now)();
  const straight = haversineM(pos, school);
  const minGap = deps.minRouteIntervalMs ?? 30_000;
  const lastAt = memo?.route_at ? Date.parse(memo.route_at) : 0;
  const due = !memo?.route_at || now - lastAt >= minGap;

  if (deps.apiKey && due && (!deps.allowExternal || (await deps.allowExternal()))) {
    const r = await computeRoute(pos, school, deps.apiKey, deps.fetchImpl);
    if (r) {
      return {
        distance_m: r.distance_m, eta_s: straight < 40 ? 0 : r.duration_s, source: "google", straight_m: straight,
        route: { eta: r.duration_s, straight: Math.max(straight, 1), road: r.distance_m }, polyline: r.polyline,
      };
    }
  }
  if (memo?.route_eta_s != null && memo.route_straight_m && memo.route_road_m != null) {
    const ratio = straight / memo.route_straight_m;
    return {
      distance_m: Math.round(memo.route_road_m * ratio), eta_s: straight < 40 ? 0 : Math.round(memo.route_eta_s * ratio),
      source: "google", straight_m: straight, route: null, polyline: null,
    };
  }
  const e = estimate(straight);
  return { distance_m: e.distance_m, eta_s: straight < 40 ? 0 : e.eta_s, source: "estimate", straight_m: straight, route: null, polyline: null };
}

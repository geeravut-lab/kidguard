export type LatLng = { lat: number; lng: number };

/** ระยะทางเส้นตรงบนผิวโลก (เมตร) */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** ประมาณเมื่อใช้บริการเส้นทางไม่ได้: ระยะถนน ≈ เส้นตรง × 1.35, ความเร็วเฉลี่ยในเมือง ≈ 6.5 ม./วินาที (~23 กม./ชม.) */
export const ROAD_FACTOR = 1.35;
export const AVG_SPEED_MS = 6.5;
export function estimate(straightM: number): { distance_m: number; eta_s: number } {
  const distance_m = Math.round(straightM * ROAD_FACTOR);
  return { distance_m, eta_s: Math.round(distance_m / AVG_SPEED_MS) };
}

/** ถอดรหัส encoded polyline (Google, precision 5) → [lat, lng][] */
export function decodePolyline(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1] as const) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i <= str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export const isLat = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
export const isLng = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;

import type { LatLng } from "./geo";

export type RouteResult = { duration_s: number; distance_m: number; polyline: string | null };

/**
 * Google Routes API (computeRoutes) — เรียกจาก server เท่านั้น
 * ขอเฉพาะฟิลด์ที่ใช้ (FieldMask) เพื่อคุมต้นทุน; ไม่ log พิกัด
 */
export async function computeRoute(from: LatLng, to: LatLng, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<RouteResult | null> {
  try {
    const res = await fetchImpl("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        languageCode: "th",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("routes api failed:", res.status);
      return null;
    }
    const j = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] };
    const r = j.routes?.[0];
    const secs = r?.duration ? Number.parseFloat(r.duration) : NaN; // รูปแบบ "845s" หรือ "845.5s"
    if (!r || !Number.isFinite(secs) || typeof r.distanceMeters !== "number") return null;
    return { duration_s: Math.max(0, Math.round(secs)), distance_m: Math.max(0, Math.round(r.distanceMeters)), polyline: r.polyline?.encodedPolyline ?? null };
  } catch (e) {
    console.error("routes api error:", e instanceof Error ? e.name : "unknown");
    return null;
  }
}

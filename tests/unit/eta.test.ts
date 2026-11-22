import { describe, expect, it, vi } from "vitest";
import { computeRoute } from "@/lib/eta/google";
import { decodePolyline, estimate, haversineM } from "@/lib/eta/geo";
import { resolveEta } from "@/lib/eta/resolve";

const SCHOOL = { lat: 13.7563, lng: 100.5018 };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("haversine / estimate / polyline", () => {
  it("ระยะเส้นตรง: จุดเดียวกัน = 0, ~1.11 กม. ต่อ 0.01° ละติจูด", () => {
    expect(haversineM(SCHOOL, SCHOOL)).toBe(0);
    expect(haversineM(SCHOOL, { lat: SCHOOL.lat + 0.01, lng: SCHOOL.lng })).toBeGreaterThan(1100);
    expect(haversineM(SCHOOL, { lat: SCHOOL.lat + 0.01, lng: SCHOOL.lng })).toBeLessThan(1120);
  });
  it("ประมาณ: ระยะถนน > เส้นตรง และเวลาเพิ่มตามระยะ", () => {
    const a = estimate(1000), b = estimate(2000);
    expect(a.distance_m).toBeGreaterThan(1000);
    expect(b.eta_s).toBeGreaterThan(a.eta_s);
  });
  it("ถอดรหัส polyline ตัวอย่างของ Google", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});

describe("Google Routes: รูปแบบคำขอและการอ่านผล", () => {
  it("ส่ง header/FieldMask/body ที่ถูกต้อง และอ่าน duration แบบ '845s'", async () => {
    const f = vi.fn(async () => json({ routes: [{ duration: "845s", distanceMeters: 4521, polyline: { encodedPolyline: "abc" } }] }));
    const r = await computeRoute({ lat: 13.8, lng: 100.6 }, SCHOOL, "KEY123", f as unknown as typeof fetch);
    expect(r).toEqual({ duration_s: 845, distance_m: 4521, polyline: "abc" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    const h = init.headers as Record<string, string>;
    expect(h["X-Goog-Api-Key"]).toBe("KEY123");
    expect(h["X-Goog-FieldMask"]).toBe("routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", origin: { location: { latLng: { latitude: 13.8, longitude: 100.6 } } } });
  });
  it("ผิดพลาด/รูปแบบแปลก/เครือข่ายล่ม → null (ไม่ throw)", async () => {
    expect(await computeRoute(SCHOOL, SCHOOL, "k", (async () => json({}, 403)) as unknown as typeof fetch)).toBeNull();
    expect(await computeRoute(SCHOOL, SCHOOL, "k", (async () => json({ routes: [] })) as unknown as typeof fetch)).toBeNull();
    expect(await computeRoute(SCHOOL, SCHOOL, "k", (async () => { throw new TypeError("x"); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe("resolveEta: ลดการเรียก API และ fallback", () => {
  const pos = { lat: 13.78, lng: 100.52 };
  const google = (eta = 600, road = 3000) => vi.fn(async () => json({ routes: [{ duration: `${eta}s`, distanceMeters: road, polyline: { encodedPolyline: "p" } }] })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

  it("ครั้งแรกเรียก Google; ภายใน 30 วินาทีใช้ค่าเดิมปรับตามสัดส่วนระยะ (ไม่เรียกซ้ำ)", async () => {
    const f = google(600, 3000);
    const t0 = 1_000_000;
    const first = await resolveEta(pos, SCHOOL, null, { apiKey: "k", fetchImpl: f, now: () => t0 });
    expect(first).toMatchObject({ source: "google", eta_s: 600, distance_m: 3000, polyline: "p" });
    const memo = { route_at: new Date(t0).toISOString(), route_eta_s: first.route!.eta, route_straight_m: first.route!.straight, route_road_m: first.route!.road };
    const closer = { lat: 13.77, lng: 100.51 };
    const second = await resolveEta(closer, SCHOOL, memo, { apiKey: "k", fetchImpl: f, now: () => t0 + 10_000 });
    expect(f).toHaveBeenCalledTimes(1);
    expect(second.source).toBe("google");
    expect(second.eta_s).toBeLessThan(600);
    expect(second.polyline).toBeNull();
    const third = await resolveEta(closer, SCHOOL, memo, { apiKey: "k", fetchImpl: f, now: () => t0 + 31_000 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(third.route).not.toBeNull();
  });
  it("ไม่มีคีย์ / เกินเพดาน / Google ล้ม → ประมาณจากเส้นตรง ไม่พัง", async () => {
    const f = google();
    expect((await resolveEta(pos, SCHOOL, null, { fetchImpl: f })).source).toBe("estimate");
    expect((await resolveEta(pos, SCHOOL, null, { apiKey: "k", fetchImpl: f, allowExternal: async () => false })).source).toBe("estimate");
    expect(f).not.toHaveBeenCalled();
    const bad = (async () => json({}, 500)) as unknown as typeof fetch;
    expect((await resolveEta(pos, SCHOOL, null, { apiKey: "k", fetchImpl: bad })).source).toBe("estimate");
  });
  it("อยู่ใกล้โรงเรียนมาก (<40 ม.) → ETA = 0", async () => {
    const r = await resolveEta({ lat: SCHOOL.lat + 0.0001, lng: SCHOOL.lng }, SCHOOL, null, {});
    expect(r.eta_s).toBe(0);
  });
});

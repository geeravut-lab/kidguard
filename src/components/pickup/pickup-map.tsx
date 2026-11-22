"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { decodePolyline } from "@/lib/eta/geo";

type Props = { school: { lat: number; lng: number }; me: { lat: number; lng: number } | null; polyline: string | null; label: string };

const dot = (color: string, size = 18) =>
  L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>` });

/** แผนที่แสดงเฉพาะผู้ปกครองเจ้าของ session (เส้นทางไม่ถูกส่งให้ใครอื่นหรือเก็บลงฐานข้อมูล) */
export default function PickupMap({ school, me, polyline, label }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ me?: L.Marker; line?: L.Polyline }>({});

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([school.lat, school.lng], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
    L.marker([school.lat, school.lng], { icon: dot("#ffc247", 22), keyboard: false }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layers.current = {};
    };
  }, [school.lat, school.lng]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (me) {
      if (!layers.current.me) layers.current.me = L.marker([me.lat, me.lng], { icon: dot("#0b6e8a"), keyboard: false }).addTo(m);
      else layers.current.me.setLatLng([me.lat, me.lng]);
    }
    layers.current.line?.remove();
    layers.current.line = undefined;
    if (polyline) {
      const pts = decodePolyline(polyline);
      if (pts.length > 1) layers.current.line = L.polyline(pts, { color: "#0b6e8a", weight: 5, opacity: 0.85 }).addTo(m);
    }
    const pts: L.LatLngExpression[] = [[school.lat, school.lng]];
    if (me) pts.push([me.lat, me.lng]);
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
  }, [me, polyline, school.lat, school.lng]);

  return <div ref={el} role="img" aria-label={label} className="h-64 w-full rounded-2xl" data-testid="pickup-map" />;
}

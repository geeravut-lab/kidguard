import { fmt, type Dict } from "@/lib/i18n/dict";

export function fmtDistance(m: number | null | undefined, t: Dict): string {
  if (m == null) return "—";
  return m < 1000 ? fmt(t.preview_gate_meters, { m: Math.round(m / 10) * 10 || m }) : fmt(t.preview_gate_km, { km: (m / 1000).toFixed(1) });
}
export function etaMinutes(s: number | null | undefined): number | null {
  return s == null ? null : Math.max(1, Math.ceil(s / 60));
}
export function fmtEta(s: number | null | undefined, status: string, t: Dict): string {
  if (status === "arrived" || s === 0) return t.pickup_eta_now;
  const m = etaMinutes(s);
  return m == null ? "—" : fmt(t.preview_gate_minutes, { min: m });
}

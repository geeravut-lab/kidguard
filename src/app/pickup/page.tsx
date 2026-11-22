import { redirect } from "next/navigation";
import { PickupClient, type ActiveSession, type LastSession, type PickupChild, type PickupSchool } from "@/components/pickup/pickup-client";
import { requireMe } from "@/lib/auth/guards";
import { getAuthInfo, postLoginPath } from "@/lib/auth/me";
import { getMyFingerprint } from "@/lib/live/fingerprint";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "แจ้งการเดินทางมารับ", robots: { index: false } };

type SessionRow = {
  id: string; status: "on_the_way" | "arrived"; distance_m: number | null; eta_s: number | null; manual_arrival: boolean; verified_at: string | null;
  school_id: string; driver_name: string; plate: string; expires_at: string;
  pickup_session_students: { status: "waiting" | "called" | "released"; students: { id: string; first_name: string; last_name: string } | null }[];
};

const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();
const isoNow = () => new Date().toISOString();

export default async function PickupPage() {
  const me = await requireMe("/pickup");
  if (me.role !== "parent") redirect(postLoginPath(me));
  if (!me.onboarded) redirect("/onboarding");
  await getMyFingerprint(); // ก่อนอ่านข้อมูล (แคชเดียวกับ AppShell)
  const { lang } = await getT();
  const info = await getAuthInfo();
  const supabase = await createClient();

  const [persons, vehicles, links, schools, settings, active, last] = await Promise.all([
    supabase.from("guardian_persons").select("id,name,is_primary").order("created_at"),
    supabase.from("vehicles").select("id,plate,province").order("created_at"),
    supabase.from("guardian_links").select("school_id,students(id,first_name,last_name)").eq("status", "approved"),
    supabase.from("schools").select("id,name_th,name_en,lat,lng").eq("active", true),
    supabase.from("school_settings").select("school_id,checkin_radius_m"),
    supabase
      .from("pickup_sessions")
      .select("id,status,distance_m,eta_s,manual_arrival,verified_at,school_id,driver_name,plate,expires_at,pickup_session_students(status,students(id,first_name,last_name))")
      .in("status", ["on_the_way", "arrived"]).gt("expires_at", isoNow()).order("checked_in_at", { ascending: false }).limit(1),
    supabase
      .from("pickup_sessions").select("status,completed_by_role").in("status", ["completed", "cancelled", "expired"])
      .gt("completed_at", isoAgo(30 * 60_000)).order("completed_at", { ascending: false }).limit(1),
  ]);

  const children: PickupChild[] = ((links.data ?? []) as unknown as { school_id: string; students: { id: string; first_name: string; last_name: string } | null }[])
    .filter((l) => l.students)
    .map((l) => ({ id: l.students!.id, name: `${l.students!.first_name} ${l.students!.last_name}`.trim(), school_id: l.school_id }));
  const radius = new Map((settings.data ?? []).map((s) => [s.school_id, s.checkin_radius_m as number]));
  const schoolOptions: PickupSchool[] = (schools.data ?? []).map((s) => ({
    id: s.id, name: lang === "en" && s.name_en ? s.name_en : s.name_th, radius_m: radius.get(s.id) ?? 2000, lat: s.lat, lng: s.lng,
  }));

  const row = ((active.data ?? []) as unknown as SessionRow[])[0];
  const activeSession: ActiveSession | null = row
    ? {
        id: row.id, status: row.status, distance_m: row.distance_m, eta_s: row.eta_s, manual_arrival: row.manual_arrival, verified: !!row.verified_at,
        school_id: row.school_id, driver_name: row.driver_name, plate: row.plate,
        students: row.pickup_session_students.filter((s) => s.students).map((s) => ({ id: s.students!.id, name: `${s.students!.first_name} ${s.students!.last_name}`.trim(), status: s.status })),
      }
    : null;

  return (
    <PickupClient
      userId={info!.id}
      persons={(persons.data ?? []) as { id: string; name: string; is_primary: boolean }[]}
      vehicles={(vehicles.data ?? []) as { id: string; plate: string; province: string }[]}
      kids={children}
      schools={schoolOptions}
      active={activeSession}
      last={((last.data ?? [])[0] as LastSession) ?? null}
    />
  );
}

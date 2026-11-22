"use client";

import { CarFront, CircleCheckBig, DoorOpen, MapPin, ShieldCheck, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parentArriveAction, parentCancelAction, parentCompleteAction } from "@/app/actions/pickup";
import { SelectField } from "@/components/forms/fields";
import { LiveSync } from "@/components/live/live-sync";
import { Card } from "@/components/parent/sections";
import { AsyncButton, AsyncForm, SubmitButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { fmt, type Dict } from "@/lib/i18n/dict";
import { etaMinutes, fmtDistance } from "./format";

const PickupMap = dynamic(() => import("./pickup-map"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl bg-surface-2" /> });

export type PickupChild = { id: string; name: string; school_id: string };
export type PickupSchool = { id: string; name: string; radius_m: number; lat: number | null; lng: number | null };
export type ActiveSession = {
  id: string; status: "on_the_way" | "arrived"; distance_m: number | null; eta_s: number | null; manual_arrival: boolean; verified: boolean;
  school_id: string; driver_name: string; plate: string; students: { id: string; name: string; status: "waiting" | "called" | "released" }[];
};
export type LastSession = { status: "completed" | "cancelled" | "expired"; completed_by_role: string | null } | null;

type ApiFail = { ok: false; error: string; data?: Record<string, number | string | null> };
type ApiOk = { ok: true; status: string; distance_m: number; eta_s: number; polyline: string | null };

function errMessage(t: Dict, code: string, data?: ApiFail["data"]): string {
  const base = (t as Record<string, string>)[code] ?? t.err_generic;
  if (code === "err_too_far" && data) return fmt(base, { radius: fmtDistance(Number(data.radius_m), t), distance: fmtDistance(Number(data.distance_m), t) });
  if (code === "err_gps_inaccurate" && data) return fmt(base, { acc: Number(data.accuracy_m) });
  if (code === "err_outside_window" && data) return fmt(base, { start: String(data.start ?? "").slice(0, 5), end: String(data.end ?? "").slice(0, 5) });
  return base;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 2 });
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  });
}

export function PickupClient(props: {
  userId: string; persons: { id: string; name: string; is_primary: boolean }[]; vehicles: { id: string; plate: string; province: string }[];
  kids: PickupChild[]; schools: PickupSchool[]; active: ActiveSession | null; last: LastSession;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-bold">{t.pickup_title}</h1>
      {props.active ? <TravelView {...props} active={props.active} /> : <StartView {...props} />}
      <div className="flex justify-end">
        <LiveSync topics={[`u:${props.userId}`]} fingerprintUrl="/api/live?scope=me" />
      </div>
    </div>
  );
}

function StartView({ persons, vehicles, kids: children, schools, last }: Parameters<typeof PickupClient>[0]) {
  const { t } = useI18n();
  const router = useRouter();
  const [schoolId, setSchoolId] = useState(children[0]?.school_id ?? "");
  const kids = children.filter((c) => c.school_id === schoolId);
  const [picked, setPicked] = useState<Set<string>>(new Set(kids.map((k) => k.id)));
  const [person, setPerson] = useState(persons.find((p) => p.is_primary)?.id ?? persons[0]?.id ?? "");
  const [vehicle, setVehicle] = useState(vehicles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const school = schools.find((s) => s.id === schoolId);
  const schoolSet = new Set(children.map((c) => c.school_id));

  async function start() {
    setError(null);
    if (picked.size === 0) return setError(t.err_no_children);
    let pos: GeolocationPosition;
    try {
      pos = await getPosition();
    } catch (e) {
      return setError((e as { code?: number }).code === 1 ? t.err_gps_denied : t.err_gps_unavailable);
    }
    try {
      const res = await fetch("/api/pickup/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, person_id: person, vehicle_id: vehicle, student_ids: [...picked], lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      });
      const j = (await res.json()) as ApiOk | ApiFail;
      if (!j.ok) return setError(errMessage(t, j.error, j.data));
      router.refresh(); // server render หน้าเดินทางจาก session ที่เพิ่งสร้าง
      await new Promise(() => {}); // คงสปินเนอร์จนหน้าเปลี่ยน
    } catch {
      setError(t.err_network);
    }
  }

  if (children.length === 0) return <p className="rounded-2xl bg-warn-bg px-4 py-4 text-warn">{t.pickup_no_children}</p>;
  return (
    <div className="space-y-4">
      {last && <LastResult last={last} />}
      <Card title={t.pickup_start_button} lead={t.pickup_start_lead}>
        {schoolSet.size > 1 && (
          <SelectField label={t.pickup_school} id="pk-school" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setPicked(new Set(children.filter((c) => c.school_id === e.target.value).map((c) => c.id))); }}>
            {schools.filter((s) => schoolSet.has(s.id)).map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </SelectField>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{t.pickup_children}</legend>
          {kids.map((k) => (
            <label key={k.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-4">
              <input type="checkbox" className="size-5 accent-[var(--kg-primary)]" checked={picked.has(k.id)}
                onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(k.id); else n.delete(k.id); return n; })} />
              <span className="font-medium">{k.name}</span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={t.pickup_driver} id="pk-driver" value={person} onChange={(e) => setPerson(e.target.value)}>
            {persons.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </SelectField>
          <SelectField label={t.pickup_vehicle} id="pk-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.plate} {v.province}</option>))}
          </SelectField>
        </div>
        {school && <p className="flex items-center gap-2 text-sm text-ink-soft"><MapPin className="size-4" aria-hidden="true" />{fmt(t.pickup_radius_hint, { radius: fmtDistance(school.radius_m, t) })}</p>}
        {error && <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}
        <AsyncButton size="lg" className="w-full" onClick={start} leading={<CarFront className="size-6" aria-hidden="true" />} disabled={!vehicle || !person}>
          {t.pickup_start_button}
        </AsyncButton>
        <p className="text-xs text-ink-soft">{t.pickup_gps_note}</p>
      </Card>
    </div>
  );
}

function LastResult({ last }: { last: NonNullable<LastSession> }) {
  const { t } = useI18n();
  const text = last.status === "completed" ? (last.completed_by_role === "parent" ? t.pickup_result_completed_parent : t.pickup_result_completed_staff) : last.status === "cancelled" ? t.pickup_result_cancelled : t.pickup_result_expired;
  return (
    <p role="status" data-testid="pickup-last" className={cn("flex items-center gap-2 rounded-2xl px-4 py-3 font-medium", last.status === "completed" ? "bg-success-bg text-success" : "bg-surface-2")}>
      <CircleCheckBig className="size-5 shrink-0" aria-hidden="true" /> {text}
    </p>
  );
}

const SEND_EVERY_MS = 15_000;

function TravelView({ active, schools }: Parameters<typeof PickupClient>[0] & { active: ActiveSession }) {
  const { t } = useI18n();
  const school = schools.find((s) => s.id === active.school_id);
  const [live, setLive] = useState({ eta_s: active.eta_s, distance_m: active.distance_m, status: active.status as string, polyline: null as string | null });
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [gps, setGps] = useState<"waiting" | "ok" | "lost" | "denied">("waiting");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<GeolocationCoordinates | null>(null);
  const sessionId = active.id;

  // ส่งตำแหน่งทุก ~15 วินาที (เฉพาะตอนหน้าจอเปิดอยู่) + กันจอดับ (Wake Lock)
  useEffect(() => {
    let disposed = false;
    let wake: WakeLockSentinel | null = null;
    let lastSent = 0;
    let lastFix = 0;

    async function send() {
      const c = latest.current;
      if (!c || document.hidden || Date.now() - lastSent < SEND_EVERY_MS - 500) return;
      lastSent = Date.now();
      try {
        const res = await fetch("/api/pickup/update", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, lat: c.latitude, lng: c.longitude, accuracy: c.accuracy }),
        });
        const j = (await res.json()) as ApiOk | ApiFail;
        if (disposed) return;
        if (j.ok) {
          setError(null);
          setLive((p) => ({ eta_s: j.eta_s, distance_m: j.distance_m, status: j.status, polyline: j.polyline ?? p.polyline }));
        } else if (j.error !== "err_rate_limited") setError(errMessage(t, j.error, j.data));
      } catch {
        /* ออฟไลน์ชั่วคราว: รอบหน้า */
      }
    }
    const watch = navigator.geolocation?.watchPosition(
      (p) => {
        latest.current = p.coords;
        lastFix = Date.now();
        setMe({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGps("ok");
        void send();
      },
      (e) => setGps(e.code === 1 ? "denied" : "lost"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    const timer = setInterval(() => {
      void send();
      if (lastFix && Date.now() - lastFix > 45_000) setGps("lost");
    }, SEND_EVERY_MS);
    const acquire = async () => {
      try {
        wake = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* ไม่รองรับ/ถูกปฏิเสธ: ไม่เป็นไร */
      }
    };
    void acquire();
    const onVis = () => {
      if (!document.hidden) {
        void acquire();
        void send();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      void wake?.release();
    };
  }, [sessionId, t]);

  // สถานะจาก server (ping จากเจ้าหน้าที่) มีผลเหนือค่าที่ client คำนวณเมื่อถึงประตู
  const arrived = active.status === "arrived" || live.status === "arrived";
  const mins = etaMinutes(live.eta_s);
  const childLabel = { waiting: t.pickup_child_waiting, called: t.pickup_child_called, released: t.pickup_child_released } as const;

  return (
    <div className="space-y-4" data-testid="travel-view">
      <section className={cn("rounded-3xl p-6", arrived ? "bg-success text-white" : "bg-primary text-primary-fg")} aria-live="polite">
        <p className="text-sm opacity-90">{arrived ? t.pickup_status_arrived : t.pickup_eta_label}</p>
        <p className="text-5xl font-bold tabular-nums" data-testid="eta">
          {arrived || live.eta_s === 0 ? t.pickup_eta_now : mins == null ? "—" : fmt(t.pickup_eta_min, { min: mins })}
        </p>
        <p className="mt-1 text-lg opacity-95" data-testid="distance">{fmt(t.pickup_distance, { dist: fmtDistance(live.distance_m, t) })}</p>
        {active.verified && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm"><ShieldCheck className="size-4" aria-hidden="true" /> {t.pickup_verified}</p>}
        {active.manual_arrival && <p className="mt-2 text-sm opacity-90">{t.pickup_manual_note}</p>}
      </section>

      {gps !== "ok" && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> {gps === "denied" ? t.err_gps_denied : gps === "lost" ? t.pickup_gps_lost : t.pickup_gps_waiting}
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      {school?.lat != null && school.lng != null && (
        <figure className="space-y-2">
          <PickupMap school={{ lat: school.lat, lng: school.lng }} me={me} polyline={live.polyline} label={t.pickup_map_privacy} />
          <figcaption className="text-xs text-ink-soft">{t.pickup_map_privacy}</figcaption>
        </figure>
      )}

      <Card title={t.pickup_children}>
        <ul className="space-y-2">
          {active.students.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2">
              <span className="font-medium">{s.name}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", s.status === "called" ? "bg-warn-bg text-warn" : s.status === "released" ? "bg-success-bg text-success" : "bg-surface-2 text-ink-soft")} data-testid={`child-${s.status}`}>{childLabel[s.status]}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">{active.driver_name} · {active.plate}</p>
      </Card>

      <div className="flex flex-col gap-3">
        <AsyncForm action={parentCompleteAction}>
          <input type="hidden" name="session" value={active.id} />
          <SubmitButton size="lg" className="w-full" leading={<CircleCheckBig className="size-6" aria-hidden="true" />}>{t.pickup_done_btn}</SubmitButton>
        </AsyncForm>
        {!arrived && (
          <AsyncForm action={parentArriveAction}>
            <input type="hidden" name="session" value={active.id} />
            <SubmitButton variant="secondary" className="w-full" leading={<DoorOpen className="size-5" aria-hidden="true" />}>{t.pickup_arrived_btn}</SubmitButton>
          </AsyncForm>
        )}
        <AsyncForm action={parentCancelAction}>
          <input type="hidden" name="session" value={active.id} />
          <SubmitButton variant="ghost" className="w-full">{t.pickup_cancel_btn}</SubmitButton>
        </AsyncForm>
      </div>
      <p className="text-center text-xs text-ink-soft">{t.pickup_keep_open}</p>
    </div>
  );
}

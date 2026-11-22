import "server-only";
import { fmt } from "@/lib/i18n/dict";
import type { PickupEvent } from "@/lib/pickup/events";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dictFor, notifyUser } from "./index";

type StudentRow = { student_id: string; status: string; students: { first_name: string; nickname: string | null; classroom_id: string | null; classrooms: { name: string } | null } | null };
const timeBkk = (lang: string) => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date());

/** ชื่อเด็กบนการ์ด = ชื่อเล่น/ชื่อต้น + ห้อง (ไม่ใส่นามสกุล เพราะขึ้นหน้าจอล็อก) */
const label = (s: StudentRow) => `${s.students?.nickname || s.students?.first_name || "—"}${s.students?.classrooms?.name ? ` ${s.students.classrooms.name}` : ""}`;

async function loadSession(sessionId: string) {
  const a = supabaseAdmin();
  const [s, st] = await Promise.all([
    a.from("pickup_sessions").select("plate,driver_name,eta_s,school_id,parent_user_id").eq("id", sessionId).maybeSingle(),
    a.from("pickup_session_students").select("student_id,status,students(first_name,nickname,classroom_id,classrooms(name))").eq("session_id", sessionId),
  ]);
  return { session: s.data, students: (st.data ?? []) as unknown as StudentRow[] };
}

/** เจ้าหน้าที่คิว + ครูประจำชั้นของเด็กในคิว (ไม่รวมผู้กระทำ) */
async function staffRecipients(schoolId: string, students: StudentRow[], exclude: string) {
  const a = supabaseAdmin();
  const rooms = [...new Set(students.map((s) => s.students?.classroom_id).filter((x): x is string => !!x))];
  const [gate, teachers] = await Promise.all([
    a.from("school_members").select("user_id").eq("school_id", schoolId).eq("role", "gate_staff"),
    rooms.length ? a.from("classroom_teachers").select("user_id,classroom_id").in("classroom_id", rooms).is("ended_at", null) : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const out = new Map<string, "/gate" | "/teacher">();
  for (const g of gate.data ?? []) out.set(g.user_id, "/gate");
  for (const t of teachers.data ?? []) if (!out.has(t.user_id)) out.set(t.user_id, "/teacher");
  out.delete(exclude);
  return out;
}

/** เหตุการณ์ของการรับนักเรียน → แจ้งอีกฝ่าย (D): ผู้ปกครองกดก่อน → แจ้งเจ้าหน้าที่/ครู; เจ้าหน้าที่กดก่อน → แจ้งผู้ปกครอง */
export async function handlePickupEvent(e: PickupEvent, deps: { fetchImpl?: typeof fetch } = {}): Promise<void> {
  if (e.kind === "started") return; // จอคิวเห็นสดอยู่แล้ว ไม่ส่งแจ้งเตือนทุกครั้งที่มีคนออกเดินทาง
  const { session, students } = await loadSession(e.sessionId);
  if (!session) return;
  const names = students.map(label).join(", ");

  if (e.kind === "released") {
    if (e.byRole === "parent") {
      const targets = await staffRecipients(e.schoolId, students, e.byUserId);
      await Promise.allSettled([...targets].map(async ([uid, link]) => {
        const { t, lang } = await dictFor(uid);
        return notifyUser({
          userId: uid, schoolId: e.schoolId, kind: "success", title: t.notif_released_parent_title, body: fmt(t.notif_released_parent_body, { names }),
          fields: [{ label: t.notif_f_plate, value: session.plate }, { label: t.notif_f_time, value: timeBkk(lang) }], link, dedupeKey: `released:${e.sessionId}:staff`,
        }, deps);
      }));
    } else {
      const { t, lang } = await dictFor(e.parentUserId);
      const byLabel = (t as Record<string, string>)[`role_label_${e.byRole}`] ?? "";
      await notifyUser({
        userId: e.parentUserId, schoolId: e.schoolId, kind: "success",
        title: e.completed ? t.notif_released_staff_title : t.notif_released_partial_title,
        body: fmt(e.completed ? t.notif_released_staff_body : t.notif_released_partial_body, { names }),
        fields: [{ label: t.notif_f_by, value: byLabel }, { label: t.notif_f_time, value: timeBkk(lang) }].filter((f) => f.value),
        link: "/pickup", dedupeKey: e.completed ? `released:${e.sessionId}:parent` : `released:${e.sessionId}:partial:${Date.now() / 60000 | 0}`,
      }, deps);
    }
    return;
  }

  if (e.kind === "called") {
    const called = students.filter((s) => s.status === "called").map(label).join(", ") || names;
    const { t } = await dictFor(e.parentUserId);
    await notifyUser({ userId: e.parentUserId, schoolId: e.schoolId, kind: "info", title: t.notif_called_title, body: fmt(t.notif_called_body, { names: called }), link: "/pickup", dedupeKey: `called:${e.sessionId}:${Date.now() / 60000 | 0}` }, deps);
    return;
  }

  if (e.kind === "expired") {
    const { t } = await dictFor(e.parentUserId);
    await notifyUser({ userId: e.parentUserId, schoolId: e.schoolId, kind: "warning", title: t.notif_expired_title, body: t.notif_expired_body, link: "/pickup", dedupeKey: `expired:${e.sessionId}` }, deps);
    return;
  }

  if (e.kind === "student_alert") {
    const a = supabaseAdmin();
    const { data: accounts } = await a.from("student_accounts").select("user_id").in("student_id", students.map((s) => s.student_id)).eq("school_id", e.schoolId);
    const min = Math.max(1, Math.ceil((session.eta_s ?? 0) / 60));
    await Promise.allSettled([...new Set((accounts ?? []).map((x) => x.user_id))].map(async (uid) => {
      const { t } = await dictFor(uid);
      return notifyUser({ userId: uid, schoolId: e.schoolId, kind: "info", title: t.notif_student_alert_title, body: fmt(t.notif_student_alert_body, { min }), link: "/student", dedupeKey: `alert:${e.sessionId}:${uid}` }, deps);
    }));
  }
}

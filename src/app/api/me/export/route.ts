import { NextResponse } from "next/server";
import { audit } from "@/lib/audit/server";
import { getAuthInfo } from "@/lib/auth/me";
import { allow } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** ขอสำเนาข้อมูลของตัวเอง (PDPA): ทุกอย่างที่ผูกกับบัญชีนี้ — ไม่มีรหัสผ่าน ไม่มี token ไม่มีพิกัด (ระบบไม่เก็บอยู่แล้ว) */
export async function GET() {
  const info = await getAuthInfo();
  if (!info) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!(await allow(`export:${info.id}`, 5, 3600))) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const a = supabaseAdmin();
  const uid = info.id;
  const [profile, persons, vehicles, links, consents, notes, sessions, passes, plans, channels, studentAcc, memberships] = await Promise.all([
    a.from("profiles").select("display_name,lang,role,onboarded_at,created_at").eq("id", uid).maybeSingle(),
    a.from("guardian_persons").select("name,phone,relation,is_primary,created_at").eq("user_id", uid),
    a.from("vehicles").select("plate,province,color,model,created_at").eq("user_id", uid),
    a.from("guardian_links").select("claimed_name,relation,status,created_at,decided_at,schools(name_th),classrooms:claimed_classroom_id(name)").eq("user_id", uid),
    a.from("consents").select("kind,version,accepted_at").eq("user_id", uid),
    a.from("app_notifications").select("kind,title,body,created_at,read_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
    a.from("pickup_sessions").select("status,checked_in_at,arrived_at,completed_at,completed_by_role,driver_name,plate,plate_province").eq("parent_user_id", uid).order("checked_in_at", { ascending: false }).limit(500),
    a.from("pickup_passes").select("holder_name,plate,status,expires_at,used_at,created_at").eq("created_by", uid),
    a.from("dismissal_plans").select("plan_date,mode,created_at").eq("created_by", uid).limit(500),
    a.from("notification_channels").select("channel,status,verified_at,created_at").eq("user_id", uid),
    a.from("student_accounts").select("created_at").eq("user_id", uid),
    a.from("school_members").select("role,created_at,schools(name_th)").eq("user_id", uid),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    note: "สำเนาข้อมูลส่วนบุคคลของบัญชีนี้ — ไม่มีรหัสผ่าน โทเคน หรือพิกัดตำแหน่ง (ระบบไม่เก็บเส้นทาง/พิกัดดิบ)",
    account: { id: uid, email: info.email, ...(profile.data ?? {}) },
    school_roles: memberships.data ?? [],
    guardians: persons.data ?? [],
    vehicles: vehicles.data ?? [],
    student_link_requests: links.data ?? [],
    consents: consents.data ?? [],
    pickup_history: sessions.data ?? [],
    proxy_codes: passes.data ?? [],
    advance_notices: plans.data ?? [],
    notification_channels: channels.data ?? [],
    student_account: (studentAcc.data ?? []).length > 0,
    notifications: notes.data ?? [],
  };
  await audit({ by: uid, action: "auth.data_export", entity: "auth_users", entityId: uid });
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kidguard-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

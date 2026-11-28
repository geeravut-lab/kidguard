// ข้อมูลสาธิตสำหรับนำเสนอผู้บริหาร: โรงเรียนสาธิต + ผู้ใช้ทุกบทบาท (ชื่อสื่อบทบาท รหัสผ่านเดียวกัน) + ข้อมูลหลักครบทุกชนิด
//   NODE_USE_ENV_PROXY=1 node scripts/demo-data.mjs --seed          สร้าง (ไม่ทำซ้ำถ้ามีอยู่แล้ว)
//   NODE_USE_ENV_PROXY=1 node scripts/demo-data.mjs --remove        ลบทั้งหมด (ผู้ใช้ @kidguard.demo + โรงเรียน demo-bkc)
//   NODE_USE_ENV_PROXY=1 node scripts/demo-data.mjs --remove --purge-audit   ลบแถว audit ของข้อมูลสาธิตด้วย (ต้องได้รับอนุมัติจากเจ้าของก่อน)
// ต้องมีคีย์ Supabase ใน env (ดู CLAUDE.md) — ทุกอย่างอยู่ภายใต้โรงเรียน slug "demo-bkc" และอีเมลโดเมน @kidguard.demo เพื่อลบออกได้หมดจด
import { createClient } from "@supabase/supabase-js";

export const DEMO = { slug: "demo-bkc", domain: "kidguard.demo", password: "Test!234", lat: 13.7563, lng: 100.5018 };
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ROOMS = ["อ.3/1", "ป.1/1", "ป.1/2", "ป.2/1", "ป.3/1", "ป.4/1", "ป.5/1", "ป.6/1"];
// [ชื่อ, นามสกุล, ชื่อเล่น, ห้อง(index)]
const STUDENTS = [
  ["ธนกฤต", "สุขเจริญ", "ต้นกล้า", 0], ["ภัทรภร", "วงศ์สว่าง", "ใบเตย", 0], ["พิชญะ", "ศรีสมบัติ", "ภู", 0],
  ["กฤติน", "ใจดี", "กัน", 1], ["นภัสสร", "แสงทอง", "น้ำใส", 1], ["วรเมธ", "มั่นคง", "เมธ", 1], ["ปัณณ์", "รักไทย", "ปัน", 1],
  ["ชญาน์นันท์", "บุญมา", "ชญา", 2], ["ธีรภัทร", "พงษ์ไพบูลย์", "ภัทร", 2], ["อชิรญา", "ทองดี", "อชิ", 2],
  ["ณัฐณิชา", "เกษมสุข", "ณิชา", 3], ["กวีวัฒน์", "สมบูรณ์", "วัฒน์", 3], ["พิมพ์ชนก", "ลิ้มสกุล", "พิมพ์", 3], ["รวิศ", "อินทร์แก้ว", "วิศ", 3],
  ["ปุญญิสา", "ประเสริฐ", "ปุ้ย", 4], ["ธนภัทร", "คำแก้ว", "โอม", 4], ["สิรภพ", "จันทร์เพ็ญ", "ภพ", 4], ["เกวลิน", "ศิริพร", "เกด", 4],
  ["อัครวินท์", "สว่างวงศ์", "วินท์", 5], ["ชนาธิป", "เพชรรัตน์", "ธิป", 5], ["ปวีณา", "ชัยมงคล", "ปาล์ม", 5],
  ["กิตติภพ", "แก้วมณี", "บอส", 6], ["พิมพ์มาดา", "ภู่ทอง", "มาดา", 6], ["ศุภกร", "นาคสวัสดิ์", "กร", 6],
  ["ธัญญาลักษณ์", "สิทธิชัย", "ธัญ", 7], ["วุฒิภัทร", "พรหมมา", "ภัทร์", 7], ["สุชานาถ", "อัครเดช", "นาถ", 7], ["ภูริวัจน์", "ตั้งใจ", "วัจน์", 7],
];
// ผู้ปกครอง: [ชื่อ, ความสัมพันธ์, [index นักเรียน...], ทะเบียน, ยี่ห้อ/รุ่น, สี]
const PARENTS = [
  ["สมชาย สุขเจริญ", "father", [0], "1กข1234", "Toyota Yaris", "ขาว"], ["มาลี วงศ์สว่าง", "mother", [1], "2ขค2345", "Honda City", "เทา"],
  ["วิชัย ศรีสมบัติ", "father", [2], "3งจ3456", "Mazda 2", "แดง"], ["สุนิสา ใจดี", "mother", [3, 8], "4ฉช4567", "Toyota Altis", "ดำ"],
  ["อรอนงค์ แสงทอง", "mother", [4], "5ซฌ5678", "Honda Jazz", "ขาว"], ["ประสิทธิ์ มั่นคง", "father", [5], "6ญฎ6789", "Nissan Almera", "เงิน"],
  ["จิราพร รักไทย", "mother", [6, 11], "7ฏฐ7890", "Suzuki Swift", "ส้ม"], ["ธวัช บุญมา", "father", [7], "8ฑฒ8901", "Isuzu D-Max", "ขาว"],
  ["นภา ทองดี", "mother", [9], "9ณด9012", "Toyota Vios", "ฟ้า"], ["กมล เกษมสุข", "father", [10], "1ตถ1122", "Honda Civic", "ดำ"],
  ["พรทิพย์ ลิ้มสกุล", "mother", [12, 13], "2ทธ2233", "Mitsubishi Xpander", "เทา"], ["สมศักดิ์ ประเสริฐ", "father", [14], "3นบ3344", "Toyota Fortuner", "ขาว"],
  ["ลัดดา คำแก้ว", "mother", [15], "4ปผ4455", "Honda HR-V", "แดง"], ["เกียรติ จันทร์เพ็ญ", "father", [16, 17], "5ฝพ5566", "Mazda CX-3", "น้ำเงิน"],
  ["ดวงใจ สว่างวงศ์", "mother", [18], "6ฟภ6677", "Toyota Corolla Cross", "ขาว"], ["สุเทพ เพชรรัตน์", "father", [19], "7มย7788", "Ford Ranger", "ดำ"],
];
const PENDING_PARENTS = [["วรรณา ชัยมงคล", "mother", 20, "8รล8899"], ["อนันต์ แก้วมณี", "father", 21, "9วศ9900"], ["กัลยา ภู่ทอง", "mother", 22, "1สห1011"]];

export const emails = {
  superAdmin: `superadmin@${DEMO.domain}`, schoolAdmin: `schooladmin@${DEMO.domain}`, schoolAdmin2: `schooladmin2@${DEMO.domain}`,
  gate: (i) => `gate${String(i).padStart(2, "0")}@${DEMO.domain}`,
  teacher: (room) => `teacher.${["a3-1", "p1-1", "p1-2", "p2-1", "p3-1", "p4-1", "p5-1", "p6-1"][room]}@${DEMO.domain}`,
  student: (i) => `student${String(i).padStart(2, "0")}@${DEMO.domain}`,
  parent: (i) => `parent${String(i).padStart(2, "0")}@${DEMO.domain}`,
  pending: (i) => `parent.new${String(i).padStart(2, "0")}@${DEMO.domain}`,
};
export const world = { ROOMS, STUDENTS, PARENTS, PENDING_PARENTS };

const mgmt = (query) => fetch("https://api.supabase.com/v1/projects/ileermgqcuuduoglhfbf/database/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };

async function remove(purgeAudit) {
  const r = await mgmt(`
    create temp table _u on commit drop as select id from auth.users where email like '%@${DEMO.domain}';
    create temp table _s on commit drop as select id from public.schools where slug = '${DEMO.slug}';
    delete from public.school_invites where school_id in (select id from _s) or created_by in (select id from _u) or used_by in (select id from _u);
    ${purgeAudit ? `alter table public.audit_log disable trigger audit_log_no_delete;
    delete from public.audit_log where actor_id in (select id from _u) or school_id in (select id from _s) or entity_id in (select id::text from _u);` : ""}
    delete from public.schools where id in (select id from _s);
    delete from auth.users where id in (select id from _u);
    ${purgeAudit ? `delete from public.audit_log where actor_id in (select id from _u) or entity_id in (select id::text from _u);
    alter table public.audit_log enable trigger audit_log_no_delete;` : ""}
    delete from public.rate_limits where key like '%demo%';`);
  console.log("ลบข้อมูลสาธิต:", r.status, purgeAudit ? "(รวม audit)" : "(audit คงไว้ — ใช้ --purge-audit เมื่อเจ้าของอนุมัติ)");
}

async function seed() {
  if (!URL_ || !ANON || !SERVICE) throw new Error("ต้องมีคีย์ Supabase ใน env (ดู CLAUDE.md)");
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  if ((await svc.from("schools").select("id").eq("slug", DEMO.slug).maybeSingle()).data) { console.log("มีโรงเรียนสาธิตอยู่แล้ว — ไม่สร้างซ้ำ (ลบก่อนด้วย --remove)"); return; }
  const t0 = Date.now();
  const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

  const school = must(await svc.from("schools").insert({ slug: DEMO.slug, name_th: "โรงเรียนกรุงเทพคริสเตียน (สาธิต)", name_en: "Bangkok Christian College (Demo)", short_name: "BKC-Demo", lat: DEMO.lat, lng: DEMO.lng }).select("id").single(), "school").id;
  must(await svc.from("school_settings").insert({ school_id: school, checkin_radius_m: 2000, arrive_radius_m: 150, student_alert_min: 5, student_dashboard_enabled: true, checkin_ttl_min: 180, late_pickup_min: 30, dismissal_time: "15:30", voice_enabled: true, tv_show_arriving: true }).select("school_id"), "settings");
  const rooms = must(await svc.from("classrooms").insert(ROOMS.map((name) => ({ school_id: school, name }))).select("id,name"), "rooms");
  const roomId = ROOMS.map((n) => rooms.find((r) => r.name === n).id);
  const students = must(await svc.from("students").insert(STUDENTS.map(([first_name, last_name, nickname, r], i) => ({ school_id: school, classroom_id: roomId[r], first_name, last_name, nickname, student_code: `D${String(i + 1).padStart(4, "0")}` }))).select("id,student_code"), "students")
    .sort((a, b) => a.student_code.localeCompare(b.student_code)).map((s) => s.id);
  must(await svc.from("zones").insert(["ประตูหน้า", "ประตูข้าง", "ลานจอดรถ"].map((name, sort) => ({ school_id: school, name, sort }))).select("id"), "zones");

  const mk = async (email, display) => {
    const { data, error } = await svc.auth.admin.createUser({ email, password: DEMO.password, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    return { id: data.user.id, email, display };
  };
  const people = [
    ...[[emails.superAdmin, "ผู้ดูแลแพลตฟอร์ม (Super Admin)"], [emails.schoolAdmin, "ผู้ดูแลโรงเรียน (School Admin)"], [emails.schoolAdmin2, "ผู้ดูแลโรงเรียน 2 (School Admin)"],
      [emails.gate(1), "เจ้าหน้าที่ประตู 1 (Gate Staff)"], [emails.gate(2), "เจ้าหน้าที่ประตู 2 (Gate Staff)"]],
    ...ROOMS.map((n, i) => [emails.teacher(i), `ครูประจำชั้น ${n} (Teacher)`]),
    ...[1, 2, 3, 4].map((i) => [emails.student(i), `นักเรียน ${STUDENTS[i * 3][2]} (Student)`]),
    ...PARENTS.map((p, i) => [emails.parent(i + 1), `${p[0]} (Parent)`]),
    ...PENDING_PARENTS.map((p, i) => [emails.pending(i + 1), `${p[0]} (Parent ใหม่)`]),
  ];
  const users = await pool(people, 8, ([email, display]) => mk(email, display));
  const byEmail = new Map(users.map((u) => [u.email, u]));
  must(await svc.from("profiles").upsert(users.map((u) => ({ id: u.id, display_name: u.display, onboarded_at: new Date().toISOString(), ...(/parent/.test(u.email) ? { role: "parent" } : {}) }))).select("id"), "profiles");

  must(await svc.from("platform_admins").insert({ user_id: byEmail.get(emails.superAdmin).id, is_owner: false }).select("user_id"), "platform_admin");
  const members = [
    { user: emails.schoolAdmin, role: "school_admin" }, { user: emails.schoolAdmin2, role: "school_admin" },
    { user: emails.gate(1), role: "gate_staff" }, { user: emails.gate(2), role: "gate_staff" },
    ...ROOMS.map((_, i) => ({ user: emails.teacher(i), role: "teacher", room: i })),
  ];
  must(await svc.from("school_members").insert(members.map((m) => ({ school_id: school, user_id: byEmail.get(m.user).id, role: m.role }))).select("user_id"), "members");
  must(await svc.from("classroom_teachers").insert(members.filter((m) => m.room !== undefined).map((m) => ({ classroom_id: roomId[m.room], school_id: school, user_id: byEmail.get(m.user).id }))).select("user_id"), "classroom_teachers");
  must(await svc.from("student_accounts").insert([1, 2, 3, 4].map((i) => ({ user_id: byEmail.get(emails.student(i)).id, student_id: students[i * 3], school_id: school }))).select("user_id"), "student_accounts");

  // ผู้ปกครองที่อนุมัติแล้ว: ผู้ปกครอง + รถ + การผูกนักเรียน
  const personRows = [], vehicleRows = [], linkRows = [];
  PARENTS.forEach(([name, relation, kids, plate, model, color], i) => {
    const uid = byEmail.get(emails.parent(i + 1)).id;
    personRows.push({ user_id: uid, name, phone: `08${String(10000000 + i * 1234567).slice(0, 8)}`, is_primary: true });
    vehicleRows.push({ user_id: uid, plate, province: "กรุงเทพมหานคร", model, color });
    for (const k of kids) linkRows.push({ user_id: uid, school_id: school, student_id: students[k], claimed_name: `${STUDENTS[k][0]} ${STUDENTS[k][1]}`, claimed_classroom_id: roomId[STUDENTS[k][3]], relation, status: "approved", decided_at: new Date().toISOString() });
  });
  must(await svc.from("guardian_persons").insert(personRows).select("id"), "guardian_persons");
  must(await svc.from("vehicles").insert(vehicleRows).select("id"), "vehicles");
  must(await svc.from("guardian_links").insert(linkRows).select("id"), "guardian_links");
  // ผู้ปกครองใหม่ 3 คน: ส่งคำขอผูกนักเรียนจริง (รออนุมัติ — ใช้สาธิตขั้นตอนอนุมัติ)
  for (const [i, [name, relation, kid, plate]] of PENDING_PARENTS.entries()) {
    const u = byEmail.get(emails.pending(i + 1));
    must(await svc.from("guardian_persons").insert({ user_id: u.id, name, phone: `089${String(1000000 + i * 111111)}`, is_primary: true }).select("id"), "pending person");
    must(await svc.from("vehicles").insert({ user_id: u.id, plate, province: "กรุงเทพมหานคร", model: "Honda Brio", color: "ขาว" }).select("id"), "pending vehicle");
    const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: e1 } = await c.auth.signInWithPassword({ email: u.email, password: DEMO.password });
    if (e1) throw new Error("login " + u.email + ": " + e1.message);
    const { error } = await c.rpc("claim_student", { p_school: school, p_classroom: roomId[STUDENTS[kid][3]], p_name: `${STUDENTS[kid][0]} ${STUDENTS[kid][1]}`, p_relation: relation, p_teacher_name: null });
    if (error) throw new Error("claim_student: " + error.message);
  }
  console.log(`สร้างแล้วใน ${((Date.now() - t0) / 1000).toFixed(0)} วินาที — โรงเรียน 1 · ห้อง ${rooms.length} · นักเรียน ${students.length} · ผู้ใช้ ${users.length} · ผู้ปกครอง ${PARENTS.length}+${PENDING_PARENTS.length} · รถ ${vehicleRows.length + PENDING_PARENTS.length} · โซน 3`);
}

if (process.argv[1]?.endsWith("demo-data.mjs")) {
  if (process.argv.includes("--remove")) await remove(process.argv.includes("--purge-audit"));
  else if (process.argv.includes("--seed")) await seed();
  else console.log("ใช้ --seed หรือ --remove [--purge-audit]");
}

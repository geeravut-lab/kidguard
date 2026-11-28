// ทดสอบโหลดช่วงเลิกเรียน: ผู้ปกครองหลายร้อยคนแจ้งมารับพร้อมกัน → อัปเดตตำแหน่งต่อเนื่อง → เจ้าหน้าที่เปิดจอคิวขณะที่คิวยาว
//   NODE_USE_ENV_PROXY=1 node scripts/load-test.mjs [--users 150] [--base https://kidguards.vercel.app] [--rounds 6]
// ต้องมีคีย์ Supabase ใน env (ดู CLAUDE.md); ข้อมูลทดสอบใช้คำนำหน้า zz_test_ / zz-test- และลบท้ายรัน
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg("users", 150));
const ROUNDS = Number(arg("rounds", 6));
const BASE = arg("base", "https://kidguards.vercel.app").replace(/\/+$/, "");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error("ต้องมีคีย์ Supabase ใน env");
const PW = "Zz-test-pass-12345";
const tag = randomBytes(3).toString("hex");
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const SCHOOL = { lat: 13.7563, lng: 100.5018 };
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
const stat = (name, rows) => {
  const ok = rows.filter((r) => r.ok), ms = rows.map((r) => r.ms);
  const codes = {}; rows.forEach((r) => { codes[r.status] = (codes[r.status] ?? 0) + 1; });
  console.log(`${name.padEnd(34)} n=${String(rows.length).padStart(4)} ok=${String(ok.length).padStart(4)} p50=${String(pct(ms, 50)).padStart(5)}ms p95=${String(pct(ms, 95)).padStart(5)}ms max=${String(Math.max(0, ...ms)).padStart(5)}ms  ${JSON.stringify(codes)}`);
  return { name, n: rows.length, ok: ok.length, p50: pct(ms, 50), p95: pct(ms, 95), max: Math.max(0, ...ms) };
};
const req = async (path, cookie, init = {}) => {
  const t = Date.now();
  try {
    const r = await fetch(BASE + path, { ...init, headers: { ...(init.headers ?? {}), cookie, ...(init.body ? { "content-type": "application/json" } : {}) }, redirect: "manual" });
    await r.arrayBuffer();
    return { ok: r.status >= 200 && r.status < 300, status: r.status, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, status: "ERR", ms: Date.now() - t };
  }
};

async function login(email) {
  const jar = new Map();
  const sb = createServerClient(URL_, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach((c) => jar.set(c.name, c.value)) } });
  const { error } = await sb.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error("login failed " + error.message);
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function cleanup() {
  const q = (query) => fetch("https://api.supabase.com/v1/projects/ileermgqcuuduoglhfbf/database/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const r = await q(`
    create temp table _u on commit drop as select id from auth.users where email like 'zz\\_test\\_load\\_${tag}\\_%@kidguard.test';
    create temp table _s on commit drop as select id from public.schools where slug = 'zz-test-load-${tag}';
    alter table public.audit_log disable trigger audit_log_no_delete;
    delete from public.audit_log where actor_id in (select id from _u) or school_id in (select id from _s) or entity_id in (select id::text from _u);
    delete from public.schools where id in (select id from _s);
    delete from auth.users where id in (select id from _u);
    delete from public.audit_log where actor_id in (select id from _u) or entity_id in (select id::text from _u);
    delete from public.rate_limits where key like '%${tag}%';
    alter table public.audit_log enable trigger audit_log_no_delete;`);
  console.log("cleanup:", r.status);
}

const summary = [];
try {
  console.log(`== เตรียมข้อมูล: ผู้ปกครอง ${N} คน บน ${BASE} (tag ${tag})`);
  const t0 = Date.now();
  const school = (await svc.from("schools").insert({ slug: `zz-test-load-${tag}`, name_th: `ทดสอบโหลด ${tag}`, lat: SCHOOL.lat, lng: SCHOOL.lng }).select("id").single()).data.id;
  await svc.from("school_settings").insert({ school_id: school, checkin_ttl_min: 120 });
  const rooms = (await svc.from("classrooms").insert(Array.from({ length: 10 }, (_, i) => ({ school_id: school, name: `ป.${1 + (i % 6)}/${1 + Math.floor(i / 6)}` }))).select("id")).data.map((r) => r.id);
  const students = (await svc.from("students").insert(Array.from({ length: N }, (_, i) => ({ school_id: school, classroom_id: rooms[i % rooms.length], first_name: `เด็ก${i}`, last_name: "ทดสอบโหลด", nickname: `น้อง${i}` }))).select("id")).data.map((r) => r.id);
  const users = await pool(Array.from({ length: N }), 12, async (_, i) => {
    const email = `zz_test_load_${tag}_parent${i}@kidguard.test`;
    const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (error) throw new Error(error.message);
    return { id: data.user.id, email, i };
  });
  await svc.from("profiles").upsert(users.map((u) => ({ id: u.id, display_name: `โหลด ${u.i}`, role: "parent", onboarded_at: new Date().toISOString() })));
  const persons = (await svc.from("guardian_persons").insert(users.map((u) => ({ user_id: u.id, name: `ผู้ปกครอง ${u.i}`, phone: "0812345678", is_primary: true }))).select("id,user_id")).data;
  const vehicles = (await svc.from("vehicles").insert(users.map((u) => ({ user_id: u.id, plate: `ท${String(u.i).padStart(4, "0")}`, province: "กรุงเทพมหานคร" }))).select("id,user_id")).data;
  await svc.from("guardian_links").insert(users.map((u) => ({ user_id: u.id, school_id: school, student_id: students[u.i], claimed_name: `เด็ก${u.i}`, claimed_classroom_id: rooms[u.i % rooms.length], status: "approved" })));
  const staff = await pool(Array.from({ length: 4 }), 4, async (_, i) => {
    const email = `zz_test_load_${tag}_gate${i}@kidguard.test`;
    const { data } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await svc.from("school_members").insert({ school_id: school, user_id: data.user.id, role: "gate_staff" });
    return { id: data.user.id, email };
  });
  const person = new Map(persons.map((p) => [p.user_id, p.id])), vehicle = new Map(vehicles.map((v) => [v.user_id, v.id]));
  console.log(`   ข้อมูลพร้อมใน ${((Date.now() - t0) / 1000).toFixed(0)} วินาที`);

  const t1 = Date.now();
  const cookies = await pool(users, 12, (u) => login(u.email));
  const staffCookies = await pool(staff, 4, (u) => login(u.email));
  console.log(`   ล็อกอิน ${cookies.length + staffCookies.length} บัญชีใน ${((Date.now() - t1) / 1000).toFixed(0)} วินาที`);

  const pos = (dKm) => ({ lat: SCHOOL.lat + dKm / 111, lng: SCHOOL.lng, accuracy: 25 });

  console.log("\n== A. ช่วงแน่นสุด: ผู้ปกครองทุกคนกด 'ฉันกำลังไปรับ' พร้อมกัน");
  const startRows = await pool(users, N, (u) => req("/api/pickup/start", cookies[u.i], { method: "POST", body: JSON.stringify({ school_id: school, person_id: person.get(u.id), vehicle_id: vehicle.get(u.id), student_ids: [students[u.i]], ...pos(1.2 + (u.i % 10) / 20) }) }));
  summary.push(stat("POST /api/pickup/start", startRows));

  console.log("\n== B. ระหว่างเดินทาง: ทุกคนอัปเดตตำแหน่ง + ถามลายนิ้วมือสำรอง + เจ้าหน้าที่เปิดจอคิว");
  const sess = (await svc.from("pickup_sessions").select("id,parent_user_id").eq("school_id", school)).data;
  const sessOf = new Map(sess.map((s) => [s.parent_user_id, s.id]));
  console.log(`   session ที่เปิดอยู่ ${sess.length}/${N}`);
  const upd = [], fp = [], gate = [], live = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const [a, b, c] = await Promise.all([
      pool(users, N, (u) => req("/api/pickup/update", cookies[u.i], { method: "POST", body: JSON.stringify({ session_id: sessOf.get(u.id), ...pos(Math.max(0.1, 1.2 - r * 0.18 + (u.i % 10) / 40)) }) })),
      pool(users, N, (u) => req("/api/live?scope=me", cookies[u.i])),
      pool(staff, 4, (u, i) => req("/gate", staffCookies[i])),
    ]);
    upd.push(...a); fp.push(...b); gate.push(...c);
    const l = await pool(staff, 4, (u, i) => req(`/api/live?scope=school&id=${school}`, staffCookies[i]));
    live.push(...l);
    process.stdout.write(`   รอบ ${r}/${ROUNDS} เสร็จ\r`);
  }
  console.log("");
  summary.push(stat("POST /api/pickup/update", upd));
  summary.push(stat("GET /api/live?scope=me (polling)", fp));
  summary.push(stat("GET /gate (SSR, คิวยาว)", gate));
  summary.push(stat("GET /api/live?scope=school", live));

  console.log("\n== C. ฐานข้อมูล: คิวขณะมี session จำนวนมาก (ผ่าน RPC โดยเจ้าหน้าที่)");
  const sbStaff = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await sbStaff.auth.signInWithPassword({ email: staff[0].email, password: PW });
  const qRows = [];
  for (let i = 0; i < 6; i++) { const t = Date.now(); const { data, error } = await sbStaff.rpc("pickup_queue", { p_school: school }); qRows.push({ ok: !error && (data?.length ?? 0) > 0, status: error ? "ERR" : 200, ms: Date.now() - t }); }
  summary.push(stat(`rpc pickup_queue (${sess.length} แถว)`, qRows));

  console.log("\n== D. ปิดงาน: เจ้าหน้าที่ส่งนักเรียนทั้งหมด (ผ่านฟังก์ชันฐานข้อมูล) แล้วดูว่าผู้ปกครองเห็นเปลี่ยนไป");
  const rel = await pool(sess, 20, async (s) => { const t = Date.now(); const { error } = await svc.rpc("pickup_release", { p_actor: staff[0].id, p_session: s.id }); return { ok: !error, status: error ? "ERR" : 200, ms: Date.now() - t }; });
  summary.push(stat("rpc pickup_release", rel));
  const left = (await svc.from("pickup_sessions").select("id", { count: "exact", head: true }).eq("school_id", school).in("status", ["on_the_way", "arrived"])).count;
  console.log(`   session ที่ยังค้างหลังปิดงาน: ${left}`);
  console.log("\n== สรุป ==");
  const bad = summary.filter((s) => s.ok < s.n);
  console.log(bad.length ? "มีคำขอที่ไม่สำเร็จ: " + bad.map((b) => `${b.name} (${b.n - b.ok})`).join(", ") : "ทุกคำขอสำเร็จ");
} finally {
  await cleanup();
}

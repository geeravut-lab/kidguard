// รัน migration ผ่าน Supabase Management API (ไม่ต้องต่อฐานข้อมูลตรง)
//   node scripts/migrate.mjs            รัน migration ที่ยังไม่เคยรัน
//   node scripts/migrate.mjs --dry      แสดงรายการที่จะรันโดยไม่รัน
// ในเครื่อง/CI: ตั้ง SUPABASE_ACCESS_TOKEN; ใน session ของ Claude: proxy ใส่ token ให้เอง (ไม่ต้องตั้ง)
// กติกา: migration ต้องรันซ้ำได้ (idempotent) และห้ามแก้ไฟล์ที่รันไปแล้ว (ตรวจ checksum)
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const REF = process.env.SUPABASE_PROJECT_REF ?? "ileermgqcuuduoglhfbf";
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
const DIR = path.resolve("supabase/migrations");
const dry = process.argv.includes("--dry");

async function sql(query) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.SUPABASE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  const res = await fetch(API, { method: "POST", headers, body: JSON.stringify({ query }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

await sql(`create table if not exists public.kg_migrations (
  name text primary key, checksum text not null, applied_at timestamptz not null default now());
  alter table public.kg_migrations enable row level security;
  revoke all on public.kg_migrations from anon, authenticated;`);

const applied = new Map((await sql("select name, checksum from public.kg_migrations")).map((r) => [r.name, r.checksum]));
const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
let ran = 0;

for (const f of files) {
  const body = await readFile(path.join(DIR, f), "utf8");
  const sum = createHash("sha256").update(body).digest("hex");
  if (applied.has(f)) {
    if (applied.get(f) !== sum) throw new Error(`migration ${f} ถูกแก้หลังรันไปแล้ว — ห้ามแก้ ให้เพิ่มไฟล์ใหม่แทน`);
    continue;
  }
  console.log(dry ? `จะรัน: ${f}` : `รัน: ${f}`);
  if (!dry) {
    // ส่งเป็นคำสั่งเดียว → อยู่ใน transaction เดียว (ล้มกลางทางแล้วไม่ค้างครึ่ง ๆ)
    const safeName = f.replace(/'/g, "''");
    await sql(`${body}\n;\ninsert into public.kg_migrations (name, checksum) values ('${safeName}', '${sum}');`);
    ran++;
  }
}
console.log(dry ? "dry-run เสร็จ" : `เสร็จ: รันใหม่ ${ran} ไฟล์, ทั้งหมด ${files.length}`);

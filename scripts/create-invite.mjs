// สร้างลิงก์เชิญครั้งเดียว (ใช้สร้างผู้ดูแลแพลตฟอร์มคนแรก หรือผู้ดูแลโรงเรียนคนแรก)
//   node scripts/create-invite.mjs --role super_admin [--hours 24]
//   node scripts/create-invite.mjs --role school_admin --school krungthep-christian [--hours 48]
// ต้องมี env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ไม่เขียนลงไฟล์) — ฐานข้อมูลเก็บเฉพาะ hash ของรหัส
import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const role = arg("role");
const hours = Number(arg("hours") ?? 24);
if (!["super_admin", "school_admin"].includes(role ?? "") || !(hours > 0 && hours <= 168)) {
  console.error("ใช้: --role super_admin|school_admin [--school <slug>] [--hours 1-168]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("ขาด NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน environment");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

let schoolId = null;
if (role === "school_admin") {
  const slug = arg("school");
  const { data } = await db.from("schools").select("id").eq("slug", slug ?? "").maybeSingle();
  if (!data) {
    console.error("ไม่พบโรงเรียนที่ slug นี้");
    process.exit(1);
  }
  schoolId = data.id;
}

const SAFE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = Array.from({ length: 16 }, () => SAFE[randomInt(SAFE.length)]).join("");
const { error } = await db.from("school_invites").insert({
  school_id: schoolId,
  role,
  code_hash: createHash("sha256").update(code).digest("hex"),
  expires_at: new Date(Date.now() + hours * 3600e3).toISOString(),
});
if (error) {
  console.error("สร้างไม่สำเร็จ:", error.message);
  process.exit(1);
}
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kidguards.vercel.app";
console.log(`${site}/invite/${code}`);
console.log(`(ใช้ได้ครั้งเดียว หมดอายุใน ${hours} ชั่วโมง — เปิดลิงก์นี้ขณะล็อกอินด้วยบัญชีที่จะรับสิทธิ์)`);

# KidGuard — กติกาของโครงการ (ต้องทำตามทุกครั้ง)

ระบบแจ้งการเดินทางมารับนักเรียนและจัดคิวส่งนักเรียนของโรงเรียน · โรงเรียนแรก: โรงเรียนกรุงเทพคริสเตียน · ออกแบบเป็น multi-tenant
แผนทั้งหมด: `docs/KIDGUARD-PLAN.md` · สารบัญ knowledge: `docs/Knowledge-Index.md`

## สถานะ
แผน **อนุมัติแล้ว** (คำตัดสินใน `docs/KIDGUARD-PLAN.md` §16) · **เฟส 0–2 เสร็จ** (บัญชีผู้ใช้/สิทธิ์/Audit แกน/โรงเรียน/ลงทะเบียนผู้ปกครอง/อนุมัติ) · รอคำสั่งเริ่มเฟส 3 · จบแต่ละเฟสต้องหยุดรอคำสั่งเฟสถัดไป

## ข้อมูลระบบ
- Production: https://kidguards.vercel.app/ (ยึดชื่อนี้ — มี s; ไม่ใช่ `kidguard.vercel.app` ในตัวอย่างของ SSO doc)
- GitHub: https://github.com/geeravut-lab/kidguard
- Supabase: https://ileermgqcuuduoglhfbf.supabase.co (Auth + Database + Storage + Realtime)
- Vercel: deploy **เฉพาะ production** — ห้ามมี Preview deployment
- เจ้าของอนุญาตให้ดำเนินการบน Supabase และ Vercel แทนได้ทั้งหมด โดยให้ขอ token ผ่านฟอร์มความลับที่ปลอดภัย (ไม่ให้พิมพ์ในแชต)

## กติกา
1. **จบทุก prompt/เฟส ให้สรุป "ขั้นตอนถัดไปที่เหลือ" (ใน phase นั้นหรือ phase ถัดไป) ให้เจ้าของตัดสินใจสั่ง** และรอคำสั่ง ไม่เริ่มเฟสถัดไปเอง
2. **ทดสอบเองให้มากที่สุด** บน Supabase ของ KidGuard (ได้รับอนุญาตแล้ว) — ข้อมูลทดสอบใช้คำนำหน้า `zz_test_` / อีเมล `@kidguard.test` และลบในรันเดียวกัน; รายงานทุกครั้งว่าอะไร "ทดสอบเองไม่ได้ ต้องให้คนทดสอบ" (เช่น Aivora SSO จริง, LINE จริง, GPS จริง)
3. **ทุกปุ่ม/เมนูที่กดแล้วต้องรอ ต้องแสดง Loading Spinner/Throbber และกดซ้ำไม่ได้ จนกว่างานจะเสร็จ** — ใช้คอมโพเนนต์กลาง (`AsyncButton` ฯลฯ) ห้ามใช้ `<button onClick>` ดิบ
4. ความลับ (service_role, token, channel secret) **ห้ามเขียนลงไฟล์/git/แชต**; `SUPABASE_SERVICE_ROLE_KEY` ห้ามมีคำนำหน้า `NEXT_PUBLIC_`/`VITE_`/`PUBLIC_` และใช้ฝั่ง server เท่านั้น; ตรวจ `grep` build output ก่อนปล่อย
5. พัฒนาบน branch `claude/nice-ptolemy-rcullj`; เจ้าของอนุญาตให้ merge/push เข้า `main` **เมื่อจบแต่ละเฟสและผ่านเทสต์แล้วเท่านั้น** (production deploy มาจาก `main`); ไม่สร้าง PR เว้นแต่เจ้าของสั่ง
6. Migration ทุกอันต้องรันซ้ำได้ (idempotent), อ่านทบทวนก่อนรัน, ห้ามแก้ไฟล์ที่รันไปแล้ว (เพิ่มไฟล์ใหม่), โค้ดต้องทนช่วงที่คอลัมน์ยังไม่มี, และ **ต้อง `GRANT` สิทธิ์ให้ `service_role` ชัดเจนทุกตาราง/ฟังก์ชันที่สร้าง** (ตารางที่สร้างผ่าน Management API ไม่ได้สิทธิ์อัตโนมัติ) พร้อม `revoke` จาก `anon`/`authenticated` ถ้าไม่ให้ client เข้าถึง
   รัน migration: `NODE_USE_ENV_PROXY=1 node scripts/migrate.mjs` (ดู `scripts/migrate.mjs`)
7. **Audit Trail:** Admin เปิด/ปิดการเก็บได้ และติ๊กเลือกชนิด event ที่จะเก็บได้ (การเปลี่ยนสวิตช์/ส่งออก/ลบ audit บันทึกเสมอ)
8. ข้อมูลเด็กและตำแหน่ง: เก็บเท่าที่จำเป็น ไม่เก็บเส้นทาง/พิกัดดิบ ไม่แสดงเส้นทางให้ผู้อื่นนอกจากผู้ปกครองเจ้าของ session
9. ข้อความที่ผู้ใช้เห็นทุกจุดผ่านพจนานุกรม i18n (ไทยเป็นต้นฉบับ) และใช้ชื่อแพลตฟอร์ม/โรงเรียนที่ Admin ตั้ง ห้าม hard-code
10. ใช้กฎข้ามทุกเรื่อง 8 ข้อใน `docs/Knowledge-Index.md` (เช่น เขียนแล้วต้อง `.select("id")` นับแถว, ซ่อนปุ่มไม่ใช่การปิดฟีเจอร์ ต้องเช็กที่ server, ค่าที่ admin ตั้งได้ห้ามซ้ำในหน้าเว็บ)
11. ตอบเจ้าของเป็นภาษาไทย

## วิธีทำงานในสภาพแวดล้อมนี้ (ย่อ)
- คีย์ Supabase ไม่อยู่ในไฟล์: ดึงผ่าน Management API เข้า env ของ shell ชั่วคราว (`GET /v1/projects/<ref>/api-keys?reveal=true`) — token ของ Supabase/Vercel ถูก proxy ใส่ให้เองเมื่อเรียก `api.supabase.com` / `api.vercel.com` (ไม่ต้องส่ง header)
- Node ต้องตั้ง `NODE_USE_ENV_PROXY=1` ถึงจะใช้ proxy ของ session (สคริปต์ migrate, build, next start)
- ตรวจก่อน merge: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` (e2e ใช้ `next start` พอร์ต 3100); หลัง deploy: `E2E_BASE_URL=https://kidguards.vercel.app pnpm test:e2e`
- Vercel project `kidguard` (team geeravut-lab): production จาก `main`; `vercel.json` ปิด deployment ของ `claude/*` และมี `ignoreCommand` กัน branch อื่นซ้ำอีกชั้น; env vars ตั้งเฉพาะ target production
- เทสต์ฐานข้อมูล/e2e ต้องมีคีย์ใน env: `source` สคริปต์ที่ดึงคีย์จาก Management API (ดูหัวข้อบน) แล้วรัน `pnpm test` (รวม tests/db) และ `pnpm test:e2e`; ข้อมูลทดสอบ `zz_test_` ถูกลบเองใน afterAll (รวมแถว audit ของข้อมูลทดสอบ)
- ความหน่วง sandbox→Supabase ~0.4–0.6 วินาทีต่อการเรียก: เทสต์ e2e ที่มีหลายขั้นจึงตั้ง timeout สูง (production ไม่ช้าเท่านี้ เพราะ functions อยู่ `icn1`)
- สร้างลิงก์เชิญครั้งแรก: `node scripts/create-invite.mjs --role super_admin` (ต้องมี env คีย์)
- Supabase region ap-northeast-2 (โซล); Vercel functions ตั้ง `icn1` ให้ใกล้ฐานข้อมูล

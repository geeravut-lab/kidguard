-- 0002: ตารางที่สร้างผ่าน Management API ไม่ได้รับสิทธิ์ของ service_role โดยอัตโนมัติ
-- กติกา: ทุก migration ที่สร้างตาราง/ลำดับ/ฟังก์ชัน ต้อง GRANT ให้ service_role ชัดเจน (RLS ยังเปิด; service_role ข้าม RLS ตามปกติ)
grant usage on schema public to service_role;
grant select, insert, update, delete on public.platform_settings to service_role;
grant select on public.kg_migrations to service_role;

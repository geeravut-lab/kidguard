-- 0014: bangkok_today() ถูกให้สิทธิ์ผ่าน PUBLIC (revoke จาก anon อย่างเดียวไม่พอ) — ถอน PUBLIC แล้วให้เฉพาะผู้ที่ต้องใช้
revoke all on function public.bangkok_today() from public, anon;
grant execute on function public.bangkok_today() to authenticated, service_role;

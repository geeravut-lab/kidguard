-- 0013 เฟส 7: ปิดสิทธิ์ execute ของฟังก์ชัน trigger/ตัวช่วยที่ไม่ควรถูกเรียกจาก client (ลดพื้นผิวโจมตี)
-- trigger ยังทำงานตามปกติ (ไม่ต้องใช้สิทธิ์ execute ของผู้ใช้ตอนยิง trigger)
do $$
declare f text;
begin
  foreach f in array array['audit_log_block()', 'audit_log_gate()', 'kg_touch_updated_at()', 'pickup_sessions_live()', 'pickup_students_live()',
                           'app_notifications_live()', 'safety_live()', 'audit_row_change()', 'kg_handle_new_user()']
  loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke all on function public.%s from public, anon, authenticated', f);
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

-- ตัวช่วยวันที่: ใช้ภายในฟังก์ชัน/ค่าเริ่มต้นของคอลัมน์ ไม่ต้องให้ anon เรียกตรง
do $$ begin
  if to_regprocedure('public.bangkok_today()') is not null then
    revoke all on function public.bangkok_today() from anon;
  end if;
end $$;

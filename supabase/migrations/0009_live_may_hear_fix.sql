-- 0009 แก้ live_may_hear: ตัวแปร id ชนกับคอลัมน์ classrooms.id (plpgsql ambiguous → exception → ตอบ false เสมอ)
create or replace function public.live_may_hear(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare tid uuid; sid uuid;
begin
  if p_topic like 'school:%' then
    tid := substr(p_topic, 8)::uuid;
    return public.has_school_role(tid, array['school_admin', 'gate_staff']);
  elsif p_topic like 'class:%' then
    tid := substr(p_topic, 7)::uuid;
    select c.school_id into sid from public.classrooms c where c.id = tid;
    return sid is not null and (public.has_school_role(sid, array['school_admin', 'gate_staff']) or public.teaches_classroom(tid));
  end if;
  return false;
exception when others then
  return false;
end;
$$;
revoke all on function public.live_may_hear(text) from public, anon;
grant execute on function public.live_may_hear(text) to authenticated, service_role;

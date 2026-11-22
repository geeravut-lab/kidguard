-- 0007 รายชื่อเจ้าหน้าที่ของโรงเรียน (ให้แอดมินเห็นชื่อ ครู/พนักงาน เพื่อมอบหมายห้อง) + ดู/เพิกถอนคำเชิญ + แก้ audit gate ให้รองรับสวิตช์ระดับโรงเรียน

create or replace function public.school_staff(p_school uuid)
returns table (user_id uuid, role text, display_name text, classrooms text[], since timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_school_admin(p_school) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select m.user_id, m.role, p.display_name,
         coalesce((select array_agg(c.name order by c.name) from public.classroom_teachers ct
                   join public.classrooms c on c.id = ct.classroom_id
                   where ct.user_id = m.user_id and ct.school_id = p_school and ct.ended_at is null), '{}'),
         m.created_at
  from public.school_members m left join public.profiles p on p.id = m.user_id
  where m.school_id = p_school
  order by m.role, p.display_name nulls last;
end;
$$;

create or replace function public.school_open_invites(p_school uuid)
returns table (id uuid, role text, classroom_name text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_school_admin(p_school) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select i.id, i.role, c.name, i.expires_at, i.created_at
  from public.school_invites i left join public.classrooms c on c.id = i.classroom_id
  where i.school_id = p_school and i.used_at is null and i.expires_at > now()
  order by i.created_at desc;
end;
$$;

create or replace function public.revoke_invite(p_invite uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid; n integer;
begin
  select school_id into sid from public.school_invites where id = p_invite;
  if sid is null or not public.is_school_admin(sid) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.school_invites where id = p_invite and used_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- เอาเจ้าหน้าที่ออก: ห้ามเหลือโรงเรียนที่ไม่มีแอดมิน
create or replace function public.remove_member(p_school uuid, p_user uuid, p_role text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_school_admin(p_school) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'school_admin' and not exists (
      select 1 from public.school_members where school_id = p_school and role = 'school_admin' and user_id <> p_user) then
    raise exception 'last_admin' using errcode = '55000';
  end if;
  delete from public.school_members where school_id = p_school and user_id = p_user and role = p_role;
  get diagnostics n = row_count;
  if p_role = 'teacher' and not exists (select 1 from public.school_members where school_id = p_school and user_id = p_user and role = 'teacher') then
    update public.classroom_teachers set ended_at = now() where school_id = p_school and user_id = p_user and ended_at is null;
  end if;
  return n = 1;
end;
$$;

-- ให้ audit gate รองรับสวิตช์ระดับโรงเรียน: school_settings.audit = {"enabled": bool, "off_groups": []} (ค่าที่ไม่ตั้ง = ใช้ของแพลตฟอร์ม)
alter table public.school_settings add column if not exists audit jsonb not null default '{}'::jsonb check (jsonb_typeof(audit) = 'object');
revoke update (audit) on public.school_settings from authenticated;

create or replace function public.audit_log_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
  sc jsonb;
  grp text := case when new.source = 'db' then 'db' else split_part(new.action, '.', 1) end;
begin
  if grp = 'audit' then return new; end if;
  select value into s from public.platform_settings where key = 'audit';
  if s is not null then
    if coalesce((s ->> 'enabled')::boolean, true) = false then return null; end if;
    if jsonb_typeof(s -> 'off_groups') = 'array' and (s -> 'off_groups') ? grp then return null; end if;
  end if;
  if new.school_id is not null then
    select audit into sc from public.school_settings where school_id = new.school_id;
    if sc is not null then
      if coalesce((sc ->> 'enabled')::boolean, true) = false then return null; end if;
      if jsonb_typeof(sc -> 'off_groups') = 'array' and (sc -> 'off_groups') ? grp then return null; end if;
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['school_staff(uuid)','school_open_invites(uuid)','revoke_invite(uuid)','remove_member(uuid,uuid,text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

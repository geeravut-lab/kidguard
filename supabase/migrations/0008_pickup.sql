-- 0008 แกนหลักเฟส 3: check-in → คิว → check-out + Live sync (ping ไม่มีข้อมูลบน Realtime private channel)
-- หลักการ: เขียนผ่านฟังก์ชัน security definer ที่เรียกได้เฉพาะ service_role (server ตรวจตัวตนแล้วส่ง p_user มา)
--          ไม่เก็บพิกัด/เส้นทาง — เก็บเฉพาะ ระยะ(ม.) + เวลาโดยประมาณ(วินาที) + ตัวเลขช่วยลดการเรียก API ภายนอก

create table if not exists public.pickup_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.guardian_persons(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  -- สำเนาข้อมูลที่เจ้าหน้าที่ต้องเห็น ณ ตอน check-in (ประวัติไม่เปลี่ยนตามการแก้โปรไฟล์ทีหลัง)
  driver_name text not null,
  plate text not null,
  plate_province text not null,
  vehicle_desc text,
  status text not null default 'on_the_way' check (status in ('on_the_way', 'arrived', 'completed', 'cancelled', 'expired')),
  checked_in_at timestamptz not null default now(),
  expires_at timestamptz not null,
  distance_m integer check (distance_m is null or distance_m >= 0),
  eta_s integer check (eta_s is null or eta_s >= 0),
  eta_source text check (eta_source in ('google', 'estimate', 'manual')),
  last_seen_at timestamptz not null default now(),
  route_at timestamptz,
  route_eta_s integer,
  route_straight_m integer,
  route_road_m integer,
  arrived_at timestamptz,
  manual_arrival boolean not null default false,
  verified_by uuid,
  verified_at timestamptz,
  student_alert_sent boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,
  completed_by_role text check (completed_by_role in ('parent', 'teacher', 'gate_staff', 'school_admin', 'super_admin', 'system')),
  updated_at timestamptz not null default now()
);
create unique index if not exists pickup_sessions_one_active_uq on public.pickup_sessions (parent_user_id) where status in ('on_the_way', 'arrived');
create index if not exists pickup_sessions_school_active_idx on public.pickup_sessions (school_id, status) where status in ('on_the_way', 'arrived');
create index if not exists pickup_sessions_expiry_idx on public.pickup_sessions (expires_at) where status in ('on_the_way', 'arrived');
create index if not exists pickup_sessions_parent_idx on public.pickup_sessions (parent_user_id, checked_in_at desc);

create table if not exists public.pickup_session_students (
  session_id uuid not null references public.pickup_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'called', 'released')),
  active boolean not null default true,
  called_at timestamptz,
  called_by uuid,
  released_at timestamptz,
  released_by uuid,
  primary key (session_id, student_id)
);
-- นักเรียน 1 คนอยู่ในคิวที่ยังไม่จบได้ครั้งเดียว (กันผู้ปกครองสองคนแจ้งมารับพร้อมกัน)
create unique index if not exists pickup_students_active_uq on public.pickup_session_students (student_id) where active;
create index if not exists pickup_students_school_idx on public.pickup_session_students (school_id, student_id);

alter table public.pickup_sessions enable row level security;
alter table public.pickup_session_students enable row level security;
revoke all on public.pickup_sessions, public.pickup_session_students from anon, authenticated;
grant select, insert, update, delete on public.pickup_sessions, public.pickup_session_students to service_role;
grant select on public.pickup_sessions, public.pickup_session_students to authenticated;

drop policy if exists pickup_sessions_select_own on public.pickup_sessions;
create policy pickup_sessions_select_own on public.pickup_sessions for select to authenticated using (parent_user_id = (select auth.uid()));
drop policy if exists pickup_students_select_own on public.pickup_session_students;
create policy pickup_students_select_own on public.pickup_session_students for select to authenticated
  using (exists (select 1 from public.pickup_sessions p where p.id = session_id and p.parent_user_id = (select auth.uid())));

drop trigger if exists pickup_sessions_touch on public.pickup_sessions;
create trigger pickup_sessions_touch before update on public.pickup_sessions for each row execute function public.kg_touch_updated_at();

-- audit: บันทึกเฉพาะการเปลี่ยนสถานะ (คอลัมน์ที่ขยับทุกไม่กี่วินาทีถูกข้าม ไม่งั้นล้น)
drop trigger if exists audit_pickup_sessions on public.pickup_sessions;
create trigger audit_pickup_sessions after insert or update on public.pickup_sessions
  for each row execute function public.audit_row_change('status,completed_by_role,manual_arrival',
    'distance_m,eta_s,eta_source,last_seen_at,route_at,route_eta_s,route_straight_m,route_road_m,updated_at,student_alert_sent,arrived_at,verified_at,verified_by,expires_at,checked_in_at,driver_name,plate,plate_province,vehicle_desc,person_id,vehicle_id,completed_at,completed_by');
drop trigger if exists audit_pickup_students on public.pickup_session_students;
create trigger audit_pickup_students after update of status on public.pickup_session_students
  for each row execute function public.audit_row_change('status', 'called_at,called_by,released_at,released_by,active');

-- ===== Live sync: ping ไม่มีข้อมูล =====
create or replace function public.live_ping(p_topic text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'ping', p_topic, true);
exception when others then null;   -- ห้ามทำให้การเขียนล้ม / ไม่ทำอะไรในที่ไม่มี Realtime
end;
$$;
revoke all on function public.live_ping(text) from public, anon, authenticated;
grant execute on function public.live_ping(text) to service_role;

-- ปลุกทุกจอที่เกี่ยวกับ session นี้: ผู้ปกครอง + คิวโรงเรียน + ห้องของนักเรียนในคิว
create or replace function public.pickup_ping_all(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s record; c uuid;
begin
  select school_id, parent_user_id into s from public.pickup_sessions where id = p_session;
  if not found then return; end if;
  perform public.live_ping('u:' || s.parent_user_id::text);
  perform public.live_ping('school:' || s.school_id::text);
  for c in select distinct st.classroom_id from public.pickup_session_students ps join public.students st on st.id = ps.student_id
           where ps.session_id = p_session and st.classroom_id is not null loop
    perform public.live_ping('class:' || c::text);
  end loop;
exception when others then null;
end;
$$;
revoke all on function public.pickup_ping_all(uuid) from public, anon, authenticated;

create or replace function public.pickup_sessions_live() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- ปลุกเมื่อ "ลำดับหรือสิ่งที่เห็นเปลี่ยนจริง": สถานะ, การยืนยัน, นาที ETA, ระยะทุก 100 ม. (ไม่ปลุกทุกครั้งที่ GPS ขยับ)
  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.verified_at is distinct from new.verified_at
     or ceil(coalesce(old.eta_s, 0) / 60.0) is distinct from ceil(coalesce(new.eta_s, 0) / 60.0)
     or (coalesce(old.distance_m, 0) / 100) is distinct from (coalesce(new.distance_m, 0) / 100)
     or old.manual_arrival is distinct from new.manual_arrival then
    perform public.pickup_ping_all(new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists pickup_sessions_live_trg on public.pickup_sessions;
create trigger pickup_sessions_live_trg after insert or update on public.pickup_sessions for each row execute function public.pickup_sessions_live();

create or replace function public.pickup_students_live() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.pickup_ping_all(new.session_id);
  return null;
end;
$$;
drop trigger if exists pickup_students_live_trg on public.pickup_session_students;
create trigger pickup_students_live_trg after insert or update of status, active on public.pickup_session_students for each row execute function public.pickup_students_live();

-- ใครฟัง topic ไหนได้ ตัดสินที่ฐานข้อมูล (ไม่ใช่ที่ JavaScript)
create or replace function public.live_may_hear(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare id uuid; sid uuid;
begin
  if p_topic like 'school:%' then
    id := substr(p_topic, 8)::uuid;
    return public.has_school_role(id, array['school_admin', 'gate_staff']);
  elsif p_topic like 'class:%' then
    id := substr(p_topic, 7)::uuid;
    select school_id into sid from public.classrooms where classrooms.id = id;
    return sid is not null and (public.has_school_role(sid, array['school_admin', 'gate_staff']) or public.teaches_classroom(id));
  end if;
  return false;
exception when others then
  return false;
end;
$$;
revoke all on function public.live_may_hear(text) from public, anon;
grant execute on function public.live_may_hear(text) to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists live_signals_listen on realtime.messages';
    execute $p$create policy live_signals_listen on realtime.messages for select to authenticated using (
      realtime.messages.extension = 'broadcast' and (
        (select realtime.topic()) = 'u:' || (select auth.uid())::text
        or public.live_may_hear((select realtime.topic()))))$p$;
  end if;
end $$;

-- ===== ฟังก์ชันเขียน (เรียกได้เฉพาะ service_role) =====

create or replace function public.pickup_start(
  p_user uuid, p_school uuid, p_person uuid, p_vehicle uuid, p_students uuid[],
  p_dist_m integer, p_eta_s integer, p_src text,
  p_route_eta integer default null, p_route_straight integer default null, p_route_road integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.schools%rowtype; cfg public.school_settings%rowtype;
  per public.guardian_persons%rowtype; veh public.vehicles%rowtype;
  ids uuid[]; linked integer; sid uuid; st text; loc time; in_window boolean := true; cn text;
begin
  select * into s from public.schools where id = p_school and active;
  if not found or s.lat is null then raise exception 'school_not_ready' using errcode = 'P0001'; end if;
  select * into cfg from public.school_settings where school_id = p_school;
  if p_dist_m is null or p_dist_m < 0 or p_dist_m > cfg.checkin_radius_m then raise exception 'too_far' using errcode = 'P0001'; end if;
  if cfg.checkin_start is not null then
    loc := (now() at time zone s.timezone)::time;
    in_window := case when cfg.checkin_start <= cfg.checkin_end then loc between cfg.checkin_start and cfg.checkin_end
                      else loc >= cfg.checkin_start or loc <= cfg.checkin_end end;
    if not in_window then raise exception 'outside_window' using errcode = 'P0001'; end if;
  end if;
  select * into per from public.guardian_persons where id = p_person and user_id = p_user;
  if not found then raise exception 'invalid_person' using errcode = 'P0001'; end if;
  select * into veh from public.vehicles where id = p_vehicle and user_id = p_user;
  if not found then raise exception 'invalid_vehicle' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_students, '{}')) x;
  if cardinality(ids) < 1 or cardinality(ids) > 6 then raise exception 'no_students' using errcode = 'P0001'; end if;
  select count(*) into linked from public.guardian_links g join public.students t on t.id = g.student_id
   where g.user_id = p_user and g.status = 'approved' and t.school_id = p_school and t.status = 'active' and t.id = any (ids);
  if linked <> cardinality(ids) then raise exception 'student_not_linked' using errcode = 'P0001'; end if;

  st := case when p_dist_m <= cfg.arrive_radius_m then 'arrived' else 'on_the_way' end;
  begin
    insert into public.pickup_sessions (school_id, parent_user_id, person_id, vehicle_id, driver_name, plate, plate_province, vehicle_desc,
        status, expires_at, distance_m, eta_s, eta_source, route_at, route_eta_s, route_straight_m, route_road_m, arrived_at)
    values (p_school, p_user, per.id, veh.id, per.name, veh.plate, veh.province, nullif(btrim(concat_ws(' ', veh.color, veh.model)), ''),
        st, now() + make_interval(mins => cfg.checkin_ttl_min), p_dist_m, p_eta_s, p_src,
        case when p_route_eta is not null then now() end, p_route_eta, p_route_straight, p_route_road,
        case when st = 'arrived' then now() end)
    returning id into sid;
    insert into public.pickup_session_students (session_id, student_id, school_id) select sid, x, p_school from unnest(ids) x;
  exception when unique_violation then
    get stacked diagnostics cn = constraint_name;
    if cn = 'pickup_students_active_uq' then raise exception 'student_busy' using errcode = 'P0001'; end if;
    raise exception 'already_active' using errcode = 'P0001';
  end;
  return sid;
end;
$$;

create or replace function public.pickup_update(
  p_user uuid, p_session uuid, p_dist_m integer, p_eta_s integer, p_src text,
  p_route_eta integer default null, p_route_straight integer default null, p_route_road integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.pickup_sessions%rowtype; cfg public.school_settings%rowtype; due boolean := false;
begin
  select c.* into cfg from public.school_settings c join public.pickup_sessions p on p.school_id = c.school_id where p.id = p_session and p.parent_user_id = p_user;
  if not found then raise exception 'not_active' using errcode = 'P0001'; end if;
  update public.pickup_sessions set
      distance_m = p_dist_m, eta_s = p_eta_s, eta_source = p_src, last_seen_at = now(),
      route_at = case when p_route_eta is not null then now() else route_at end,
      route_eta_s = coalesce(p_route_eta, route_eta_s),
      route_straight_m = coalesce(p_route_straight, route_straight_m),
      route_road_m = coalesce(p_route_road, route_road_m),
      status = case when status = 'on_the_way' and p_dist_m <= cfg.arrive_radius_m then 'arrived' else status end,
      arrived_at = case when status = 'on_the_way' and p_dist_m <= cfg.arrive_radius_m then now() else arrived_at end
   where id = p_session and parent_user_id = p_user and status in ('on_the_way', 'arrived') and expires_at > now()
   returning * into r;
  if not found then raise exception 'not_active' using errcode = 'P0001'; end if;
  if not r.student_alert_sent and cfg.student_dashboard_enabled and r.eta_s is not null and r.eta_s <= cfg.student_alert_min * 60 then
    update public.pickup_sessions set student_alert_sent = true where id = p_session;
    due := true;
  end if;
  return jsonb_build_object('status', r.status, 'student_alert_due', due, 'school_id', r.school_id);
end;
$$;

create or replace function public.pickup_manual_arrive(p_user uuid, p_session uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.pickup_sessions set status = 'arrived', arrived_at = coalesce(arrived_at, now()), manual_arrival = true, eta_s = 0, eta_source = 'manual', last_seen_at = now()
   where id = p_session and parent_user_id = p_user and status in ('on_the_way', 'arrived') and expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.pickup_cancel(p_user uuid, p_session uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.pickup_sessions set status = 'cancelled', completed_at = now(), completed_by = p_user, completed_by_role = 'parent'
   where id = p_session and parent_user_id = p_user and status in ('on_the_way', 'arrived');
  get diagnostics n = row_count;
  if n = 1 then update public.pickup_session_students set active = false where session_id = p_session and active; end if;
  return n = 1;
end;
$$;

-- เจ้าหน้าที่ประตู/แอดมินยืนยันตัวผู้มารับ (บันทึกว่าใครยืนยัน)
create or replace function public.pickup_verify(p_actor uuid, p_session uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid; n integer;
begin
  select school_id into sid from public.pickup_sessions where id = p_session;
  if sid is null or not (exists (select 1 from public.school_members m where m.school_id = sid and m.user_id = p_actor and m.role in ('gate_staff', 'school_admin'))
                         or exists (select 1 from public.platform_admins a where a.user_id = p_actor)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.pickup_sessions set verified_by = p_actor, verified_at = now() where id = p_session and status in ('on_the_way', 'arrived') and verified_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- เรียกนักเรียน: เจ้าหน้าที่ประตู/แอดมิน (ทั้งคิว) หรือครูประจำชั้น (เฉพาะนักเรียนห้องตัวเอง)
create or replace function public.pickup_call(p_actor uuid, p_session uuid, p_student uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare sid uuid; staff boolean; n integer;
begin
  select school_id into sid from public.pickup_sessions where id = p_session and status in ('on_the_way', 'arrived');
  if sid is null then raise exception 'not_active' using errcode = 'P0001'; end if;
  staff := exists (select 1 from public.school_members m where m.school_id = sid and m.user_id = p_actor and m.role in ('gate_staff', 'school_admin'))
           or exists (select 1 from public.platform_admins a where a.user_id = p_actor);
  if not staff and not exists (select 1 from public.school_members m where m.school_id = sid and m.user_id = p_actor and m.role = 'teacher') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.pickup_session_students ps set status = 'called', called_at = now(), called_by = p_actor
   where ps.session_id = p_session and ps.active and ps.status = 'waiting' and (p_student is null or ps.student_id = p_student)
     and (staff or exists (select 1 from public.students st where st.id = ps.student_id and st.classroom_id is not null
                           and exists (select 1 from public.classroom_teachers ct where ct.classroom_id = st.classroom_id and ct.user_id = p_actor and ct.ended_at is null)));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ปล่อยนักเรียน / check-out: ผู้ปกครองกดเอง (ทั้งคิว), เจ้าหน้าที่ประตู/แอดมิน (ทั้งคิว หรือรายคน), ครู (เฉพาะห้องตัวเอง)
-- ฝั่งใดกดก่อนก็จบ และคืนข้อมูลให้ server แจ้งอีกฝ่าย
create or replace function public.pickup_release(p_actor uuid, p_session uuid, p_student uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.pickup_sessions%rowtype; role_ text; n integer := 0; remaining integer; done boolean := false;
begin
  select * into p from public.pickup_sessions where id = p_session for update;
  if not found or p.status not in ('on_the_way', 'arrived') then raise exception 'not_active' using errcode = 'P0001'; end if;
  if p.parent_user_id = p_actor then role_ := 'parent';
  elsif exists (select 1 from public.platform_admins a where a.user_id = p_actor) then role_ := 'super_admin';
  else
    select m.role into role_ from public.school_members m where m.school_id = p.school_id and m.user_id = p_actor
      order by case m.role when 'school_admin' then 1 when 'gate_staff' then 2 else 3 end limit 1;
    if role_ is null then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  update public.pickup_session_students ps set status = 'released', released_at = now(), released_by = p_actor, active = false
   where ps.session_id = p_session and ps.active
     and (role_ in ('parent') or p_student is null or ps.student_id = p_student)
     and (role_ <> 'teacher' or exists (select 1 from public.students st join public.classroom_teachers ct on ct.classroom_id = st.classroom_id
                                         where st.id = ps.student_id and ct.user_id = p_actor and ct.ended_at is null));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*) into remaining from public.pickup_session_students where session_id = p_session and active;
  if remaining = 0 or role_ = 'parent' then
    update public.pickup_session_students set active = false, status = 'released', released_at = coalesce(released_at, now()), released_by = coalesce(released_by, p_actor) where session_id = p_session and active;
    update public.pickup_sessions set status = 'completed', completed_at = now(), completed_by = p_actor,
           completed_by_role = case role_ when 'super_admin' then 'super_admin' else role_ end
     where id = p_session and status in ('on_the_way', 'arrived');
    done := true;
  end if;
  return jsonb_build_object('completed', done, 'released', n, 'by_role', role_, 'parent_user_id', p.parent_user_id, 'school_id', p.school_id);
end;
$$;

-- หมดอายุอัตโนมัติ (เรียกจาก cron ทุกนาที): คืนรายการเพื่อแจ้งผู้ปกครอง
create or replace function public.pickup_expire() returns table (session_id uuid, parent_user_id uuid, school_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with e as (
    update public.pickup_sessions p set status = 'expired', completed_at = now(), completed_by_role = 'system'
     where p.status in ('on_the_way', 'arrived') and p.expires_at < now()
     returning p.id, p.parent_user_id, p.school_id)
  select e.id, e.parent_user_id, e.school_id from e;
  update public.pickup_session_students ps set active = false
   where ps.active and exists (select 1 from public.pickup_sessions p where p.id = ps.session_id and p.status not in ('on_the_way', 'arrived'));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['pickup_start(uuid,uuid,uuid,uuid,uuid[],integer,integer,text,integer,integer,integer)',
    'pickup_update(uuid,uuid,integer,integer,text,integer,integer,integer)', 'pickup_manual_arrive(uuid,uuid)', 'pickup_cancel(uuid,uuid)',
    'pickup_verify(uuid,uuid)', 'pickup_call(uuid,uuid,uuid)', 'pickup_release(uuid,uuid,uuid)', 'pickup_expire()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ===== ฟังก์ชันอ่านของเจ้าหน้าที่ (ตรวจสิทธิ์ในฟังก์ชัน; ครูเห็นเฉพาะนักเรียนห้องตัวเอง) =====
create or replace function public.pickup_queue(p_school uuid)
returns table (session_id uuid, status text, distance_m integer, eta_s integer, eta_source text, last_seen_at timestamptz, stale boolean,
               arrived_at timestamptz, checked_in_at timestamptz, verified_at timestamptz, manual_arrival boolean,
               driver_name text, plate text, plate_province text, vehicle_desc text, students jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); full_access boolean; stale_s integer;
begin
  full_access := public.has_school_role(p_school, array['school_admin', 'gate_staff']);
  if uid is null or not (full_access or public.has_school_role(p_school, array['teacher'])) then raise exception 'forbidden' using errcode = '42501'; end if;
  select c.stale_location_sec into stale_s from public.school_settings c where c.school_id = p_school;
  return query
  select * from (
    select p.id, p.status, p.distance_m, p.eta_s, p.eta_source, p.last_seen_at,
           (p.status = 'on_the_way' and p.last_seen_at < now() - make_interval(secs => coalesce(stale_s, 90))) as stale,
           p.arrived_at, p.checked_in_at, p.verified_at, p.manual_arrival, p.driver_name, p.plate, p.plate_province, p.vehicle_desc,
           (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', btrim(st.first_name || ' ' || st.last_name), 'nickname', st.nickname,
                     'classroom', c.name, 'classroom_id', c.id, 'status', ps.status) order by c.name, st.first_name), '[]'::jsonb)
              from public.pickup_session_students ps join public.students st on st.id = ps.student_id left join public.classrooms c on c.id = st.classroom_id
             where ps.session_id = p.id and ps.active
               and (full_access or exists (select 1 from public.classroom_teachers ct where ct.classroom_id = st.classroom_id and ct.user_id = uid and ct.ended_at is null))) as students
      from public.pickup_sessions p
     where p.school_id = p_school and p.status in ('on_the_way', 'arrived') and p.expires_at > now()
  ) q
  where jsonb_array_length(q.students) > 0
  order by (q.status <> 'arrived'), q.arrived_at nulls last, q.eta_s nulls last, q.distance_m nulls last, q.checked_in_at;
end;
$$;

-- ลายนิ้วมือสำหรับทางสำรอง (polling): ตัวเลขล้วน ไม่มีชื่อหรือข้อความ
create or replace function public.pickup_fingerprint(p_school uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_school_role(p_school, array['school_admin', 'gate_staff', 'teacher']) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::text || '/' || coalesce(sum(extract(epoch from p.updated_at))::bigint::text, '0') || '/' ||
                 coalesce(sum(case when p.status = 'arrived' then 1 else 0 end)::text, '0')
            from public.pickup_sessions p where p.school_id = p_school and p.status in ('on_the_way', 'arrived') and p.expires_at > now())
         || '/' || (select count(*)::text || '/' || coalesce(sum(case ps.status when 'called' then 1 else 0 end)::text, '0')
                      from public.pickup_session_students ps where ps.school_id = p_school and ps.active);
end;
$$;

create or replace function public.pickup_my_fingerprint() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.id::text || ':' || p.status || ':' || extract(epoch from p.updated_at)::bigint::text from public.pickup_sessions p
                    where p.parent_user_id = (select auth.uid()) order by p.checked_in_at desc limit 1), 'none')
         || '/' || coalesce((select string_agg(ps.status, ',' order by ps.student_id) from public.pickup_session_students ps
                              join public.pickup_sessions p on p.id = ps.session_id where p.parent_user_id = (select auth.uid()) and ps.active), '');
$$;

do $$
declare f text;
begin
  foreach f in array array['pickup_queue(uuid)', 'pickup_fingerprint(uuid)', 'pickup_my_fingerprint()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

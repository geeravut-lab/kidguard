-- 0012 เฟส 6: ฟีเจอร์ความปลอดภัยเพิ่มเติม — ประตู(zone), ธงห้ามปล่อย, รหัสผู้รับแทน, แจ้งล่วงหน้า, เตือนรับช้า, จอ TV, เสียงเรียก, ประกาศฉุกเฉิน/พักการรับ
-- ตารางใหม่ทั้งหมด: service_role เท่านั้น (ข้อมูลอ่อนไหว: ธงห้ามปล่อย/รหัสผู้รับ ไม่ให้ client อ่านตรง) — อ่านผ่านฟังก์ชันที่ตรวจสิทธิ์ หรือ server

-- ===== ตั้งค่าโรงเรียนเพิ่ม =====
alter table public.school_settings add column if not exists dismissal_time time;                        -- เวลาเลิกเรียน (เตือนรับช้า)
alter table public.school_settings add column if not exists pickup_paused boolean not null default false; -- พักการรับ (ฉุกเฉิน)
alter table public.school_settings add column if not exists pickup_pause_note text check (pickup_pause_note is null or length(pickup_pause_note) <= 200);
alter table public.school_settings add column if not exists voice_enabled boolean not null default false; -- เสียงเรียกนักเรียน
alter table public.school_settings add column if not exists tv_show_arriving boolean not null default false; -- จอ TV แสดง "กำลังมา" ด้วย (ปกติแสดงเฉพาะที่เรียกแล้ว)

drop trigger if exists audit_school_settings on public.school_settings;
create trigger audit_school_settings after update on public.school_settings
  for each row execute function public.audit_row_change('checkin_radius_m,arrive_radius_m,student_alert_min,student_dashboard_enabled,checkin_ttl_min,stale_location_sec,late_pickup_min,pickup_paused,voice_enabled,tv_show_arriving', 'updated_at,audit');

-- ===== หลายประตู =====
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 30),
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
alter table public.classrooms add column if not exists zone_id uuid references public.zones(id) on delete set null;
alter table public.pickup_sessions add column if not exists zone_id uuid references public.zones(id) on delete set null;
create index if not exists pickup_sessions_zone_idx on public.pickup_sessions (zone_id) where zone_id is not null;

-- ===== ธงห้ามปล่อย (ข้อมูลอ่อนไหว: เหตุผลอ่านได้เฉพาะ school_admin ผ่าน server) =====
create table if not exists public.custody_flags (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('hold_all', 'block_guardian')),   -- hold_all = ห้ามปล่อยให้ใคร; block_guardian = บัญชีนี้รับเด็กคนนี้ไม่ได้
  user_id uuid references auth.users(id) on delete cascade,
  note text check (note is null or length(note) <= 300),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  ended_by uuid,
  ended_at timestamptz,
  check ((kind = 'block_guardian') = (user_id is not null))
);
create index if not exists custody_flags_student_idx on public.custody_flags (student_id) where active;
create index if not exists custody_flags_school_idx on public.custody_flags (school_id, active);

create or replace function public.student_held(p_student uuid, p_parent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.custody_flags f where f.student_id = p_student and f.active
                   and (f.kind = 'hold_all' or (f.kind = 'block_guardian' and f.user_id = p_parent)))
$$;
revoke all on function public.student_held(uuid, uuid) from public, anon, authenticated;
grant execute on function public.student_held(uuid, uuid) to service_role;

-- ===== รหัส/QR ผู้รับแทน (ครั้งเดียว เก็บเฉพาะ hash) =====
create table if not exists public.pickup_passes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  holder_name text not null check (length(btrim(holder_name)) between 1 and 80),
  plate text check (plate is null or length(plate) <= 20),
  code_hash text not null unique,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'used', 'revoked')),
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists pickup_passes_owner_idx on public.pickup_passes (created_by, created_at desc);
create table if not exists public.pickup_pass_students (
  pass_id uuid not null references public.pickup_passes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (pass_id, student_id)
);
create index if not exists pickup_pass_students_student_idx on public.pickup_pass_students (student_id);

-- ===== แจ้งล่วงหน้า (รับเอง / รถโรงเรียน / ลา / คนอื่นรับ) =====
create table if not exists public.dismissal_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  plan_date date not null,
  mode text not null check (mode in ('parent', 'bus', 'absent', 'other')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (student_id, plan_date)
);
create index if not exists dismissal_plans_school_date_idx on public.dismissal_plans (school_id, plan_date);

-- ===== จอ TV (เปิดด้วยลิงก์ลับ ไม่ต้องล็อกอิน; เก็บเฉพาะ hash ของโทเคน) =====
create table if not exists public.tv_displays (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  zone_id uuid references public.zones(id) on delete set null,
  token_hash text not null unique,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- ===== ประกาศฉุกเฉิน =====
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid,
  title text not null check (length(btrim(title)) between 1 and 80),
  body text not null check (length(btrim(body)) between 1 and 400),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'danger')),
  pause_pickups boolean not null default false,
  recipients integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours'),
  ended_at timestamptz
);
create index if not exists broadcasts_school_idx on public.broadcasts (school_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['zones','custody_flags','pickup_passes','pickup_pass_students','dismissal_plans','tv_displays','broadcasts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- audit trigger (เก็บเฉพาะคอลัมน์ที่ไม่มีข้อมูลส่วนบุคคล: ไม่เก็บ note/holder_name/plate)
drop trigger if exists audit_custody_flags on public.custody_flags;
create trigger audit_custody_flags after insert or update on public.custody_flags
  for each row execute function public.audit_row_change('kind,active', 'created_at,ended_at,note');
drop trigger if exists audit_pickup_passes on public.pickup_passes;
create trigger audit_pickup_passes after insert or update on public.pickup_passes
  for each row execute function public.audit_row_change('status', 'created_at,holder_name,plate,code_hash,expires_at,used_at');
drop trigger if exists audit_zones on public.zones;
create trigger audit_zones after insert or update or delete on public.zones
  for each row execute function public.audit_row_change('active', 'created_at,name,sort');
drop trigger if exists audit_broadcasts on public.broadcasts;
create trigger audit_broadcasts after insert or update on public.broadcasts
  for each row execute function public.audit_row_change('severity,pause_pickups,recipients', 'created_at,expires_at,title,body,ended_at');
drop trigger if exists audit_tv_displays on public.tv_displays;
create trigger audit_tv_displays after insert or update or delete on public.tv_displays
  for each row execute function public.audit_row_change('active', 'created_at,name,token_hash,last_seen_at');

-- ปลุกจอคิวโรงเรียนเมื่อธง/ประตู/พักการรับ เปลี่ยน (ping ไม่มีข้อมูล)
create or replace function public.safety_live() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid := coalesce((to_jsonb(new) ->> 'school_id'), (to_jsonb(old) ->> 'school_id'))::uuid;
begin
  if sid is not null then perform public.live_ping('school:' || sid::text); end if;
  return null;
exception when others then return null;
end;
$$;
revoke all on function public.safety_live() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['zones','custody_flags','broadcasts']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_live_trg', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.safety_live()', t || '_live_trg', t);
  end loop;
end $$;
drop trigger if exists school_settings_live_trg on public.school_settings;
create trigger school_settings_live_trg after update of pickup_paused on public.school_settings for each row execute function public.safety_live();

-- ===== ฟังก์ชันตรวจ/ใช้รหัสผู้รับแทน (เรียกได้เฉพาะ service_role; ใช้ครั้งเดียวแบบ atomic) =====
create or replace function public.pass_use(p_actor uuid, p_school uuid, p_hash text, p_consume boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ps public.pickup_passes%rowtype; staff boolean; studs jsonb; nheld integer; nbusy integer; paused boolean;
begin
  staff := exists (select 1 from public.school_members m where m.school_id = p_school and m.user_id = p_actor and m.role in ('gate_staff', 'school_admin'))
           or exists (select 1 from public.platform_admins a where a.user_id = p_actor);
  if not staff then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into ps from public.pickup_passes where code_hash = p_hash and school_id = p_school for update;
  if not found or ps.status = 'revoked' then raise exception 'invalid_pass' using errcode = 'P0001'; end if;
  if ps.status = 'used' then raise exception 'pass_used' using errcode = 'P0001'; end if;
  if ps.expires_at < now() then raise exception 'pass_expired' using errcode = 'P0001'; end if;
  select pickup_paused into paused from public.school_settings where school_id = p_school;
  select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'nickname', coalesce(st.nickname, st.first_name), 'classroom', c.name, 'classroom_id', st.classroom_id,
                  'held', public.student_held(st.id, ps.created_by)) order by c.name, st.first_name), '[]'::jsonb)
    into studs
    from public.pickup_pass_students pp join public.students st on st.id = pp.student_id left join public.classrooms c on c.id = st.classroom_id
   where pp.pass_id = ps.id and st.status = 'active';
  select count(*) into nheld from jsonb_array_elements(studs) e where (e ->> 'held')::boolean;
  select count(*) into nbusy from public.pickup_session_students x join public.pickup_pass_students pp on pp.student_id = x.student_id where pp.pass_id = ps.id and x.active;
  if p_consume then
    if coalesce(paused, false) then raise exception 'paused' using errcode = 'P0001'; end if;
    if jsonb_array_length(studs) = 0 then raise exception 'invalid_pass' using errcode = 'P0001'; end if;
    if nheld > 0 then raise exception 'held' using errcode = 'P0001'; end if;
    if nbusy > 0 then raise exception 'student_busy' using errcode = 'P0001'; end if;
    update public.pickup_passes set status = 'used', used_at = now(), used_by = p_actor where id = ps.id;
  end if;
  return jsonb_build_object('pass_id', ps.id, 'created_by', ps.created_by, 'holder_name', ps.holder_name, 'plate', ps.plate, 'expires_at', ps.expires_at,
                            'students', studs, 'held', nheld, 'busy', nbusy, 'paused', coalesce(paused, false));
end;
$$;
revoke all on function public.pass_use(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.pass_use(uuid, uuid, text, boolean) to service_role;

-- ===== แผนรายวันสำหรับเจ้าหน้าที่ (ครูเห็นเฉพาะห้องตัวเอง) =====
create or replace function public.dismissal_plans_today(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); full_access boolean; d date; res jsonb;
begin
  full_access := public.has_school_role(p_school, array['school_admin', 'gate_staff']);
  if uid is null or not (full_access or public.has_school_role(p_school, array['teacher'])) then raise exception 'forbidden' using errcode = '42501'; end if;
  select (now() at time zone s.timezone)::date into d from public.schools s where s.id = p_school;
  select coalesce(jsonb_agg(jsonb_build_object('student_id', st.id, 'nickname', coalesce(st.nickname, st.first_name), 'classroom', c.name, 'classroom_id', st.classroom_id, 'mode', p.mode)
                           order by c.name, st.first_name), '[]'::jsonb)
    into res
    from public.dismissal_plans p join public.students st on st.id = p.student_id left join public.classrooms c on c.id = st.classroom_id
   where p.school_id = p_school and p.plan_date = d and st.status = 'active'
     and (full_access or exists (select 1 from public.classroom_teachers ct where ct.classroom_id = st.classroom_id and ct.user_id = uid and ct.ended_at is null));
  return res;
end;
$$;
revoke all on function public.dismissal_plans_today(uuid) from public, anon;
grant execute on function public.dismissal_plans_today(uuid) to authenticated, service_role;

-- ===== เตือนรับช้า: นักเรียนที่ "คาดว่าจะมีคนมารับ" แต่ยังไม่ได้ออกหลังเลิกเรียน + เวลาที่ตั้งไว้ =====
-- คาดว่ามีคนมารับ = ผู้ปกครองแจ้งล่วงหน้าว่ารับเอง/คนอื่นรับ หรือมี check-in ของวันนี้ (ไม่ใช่ทุกคน — วันหยุด/คนที่ไม่ได้แจ้งจะไม่ถูกเตือนผิด ๆ)
create or replace function public.late_pickup_candidates(p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record; loc timestamp; d date; mins numeric; part jsonb; res jsonb := '[]'::jsonb;
begin
  for r in select s.id as sid, s.timezone as tz, c.dismissal_time as dt, c.late_pickup_min as lm
             from public.schools s join public.school_settings c on c.school_id = s.id
            where s.active and c.dismissal_time is not null and not c.pickup_paused
  loop
    loc := p_now at time zone r.tz;
    d := loc::date;
    mins := extract(epoch from (loc::time - r.dt)) / 60.0 - r.lm;
    if mins < 0 or mins > 360 then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('school_id', r.sid, 'student_id', st.id, 'nickname', coalesce(st.nickname, st.first_name),
                    'classroom_id', st.classroom_id, 'classroom', cl.name, 'date', d, 'late_min', floor(mins)::int)), '[]'::jsonb)
      into part
      from public.students st left join public.classrooms cl on cl.id = st.classroom_id
     where st.school_id = r.sid and st.status = 'active'
       and (exists (select 1 from public.dismissal_plans p where p.student_id = st.id and p.plan_date = d and p.mode in ('parent', 'other'))
            or exists (select 1 from public.pickup_session_students ps join public.pickup_sessions pk on pk.id = ps.session_id
                        where ps.student_id = st.id and (pk.checked_in_at at time zone r.tz)::date = d))
       and not exists (select 1 from public.dismissal_plans p where p.student_id = st.id and p.plan_date = d and p.mode in ('bus', 'absent'))
       and not exists (select 1 from public.pickup_session_students ps where ps.student_id = st.id and ps.status = 'released' and (ps.released_at at time zone r.tz)::date = d)
       and not exists (select 1 from public.pickup_pass_students pp join public.pickup_passes pa on pa.id = pp.pass_id
                        where pp.student_id = st.id and pa.status = 'used' and (pa.used_at at time zone r.tz)::date = d);
    res := res || part;
  end loop;
  return res;
end;
$$;
revoke all on function public.late_pickup_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.late_pickup_candidates(timestamptz) to service_role;

-- ===== จอ TV: สถานะเท่าที่จอสาธารณะในโรงเรียนควรเห็น (ชื่อเล่น + ห้อง; ไม่มีชื่อผู้ปกครอง/ทะเบียน/เส้นทาง) =====
create or replace function public.tv_state(p_school uuid, p_zone uuid, p_show_arriving boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare called jsonb; arriving jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', ps.student_id, 'nickname', coalesce(st.nickname, st.first_name), 'classroom', c.name, 'zone', z.name) order by ps.called_at desc), '[]'::jsonb)
    into called
    from public.pickup_session_students ps join public.pickup_sessions p on p.id = ps.session_id join public.students st on st.id = ps.student_id
         left join public.classrooms c on c.id = st.classroom_id left join public.zones z on z.id = p.zone_id
   where ps.school_id = p_school and ps.active and ps.status = 'called' and p.status in ('on_the_way', 'arrived') and p.expires_at > now()
     and (p_zone is null or p.zone_id = p_zone);
  if p_show_arriving then
    select coalesce(jsonb_agg(x.o order by x.k), '[]'::jsonb) into arriving from (
      select jsonb_build_object('id', ps.student_id, 'nickname', coalesce(st.nickname, st.first_name), 'classroom', c.name,
                                'eta_min', case when p.eta_s is null then null else ceil(p.eta_s / 60.0)::int end, 'arrived', p.status = 'arrived') as o,
             coalesce(p.eta_s, 99999) as k
        from public.pickup_session_students ps join public.pickup_sessions p on p.id = ps.session_id join public.students st on st.id = ps.student_id
             left join public.classrooms c on c.id = st.classroom_id
       where ps.school_id = p_school and ps.active and ps.status = 'waiting' and p.status in ('on_the_way', 'arrived') and p.expires_at > now()
         and (p_zone is null or p.zone_id = p_zone)
       order by p.status <> 'arrived', coalesce(p.eta_s, 99999) limit 12) x;
  else arriving := '[]'::jsonb;
  end if;
  return jsonb_build_object('called', called, 'arriving', arriving,
    'paused', coalesce((select c.pickup_paused from public.school_settings c where c.school_id = p_school), false),
    'fp', md5(called::text || arriving::text));
end;
$$;
revoke all on function public.tv_state(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.tv_state(uuid, uuid, boolean) to service_role;

-- ===== แก้ฟังก์ชันคิวเดิมให้รู้จัก ธงห้ามปล่อย/พักการรับ/ประตู =====
create or replace function public.pickup_start(
  p_user uuid, p_school uuid, p_person uuid, p_vehicle uuid, p_students uuid[],
  p_dist_m integer, p_eta_s integer, p_src text,
  p_route_eta integer default null, p_route_straight integer default null, p_route_road integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.schools%rowtype; cfg public.school_settings%rowtype;
  per public.guardian_persons%rowtype; veh public.vehicles%rowtype;
  ids uuid[]; linked integer; sid uuid; st text; zid uuid; loc time; in_window boolean := true; cn text;
begin
  select * into s from public.schools where id = p_school and active;
  if not found or s.lat is null then raise exception 'school_not_ready' using errcode = 'P0001'; end if;
  select * into cfg from public.school_settings where school_id = p_school;
  if cfg.pickup_paused then raise exception 'paused' using errcode = 'P0001'; end if;
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
  -- ธงห้ามปล่อย: ไม่บอกเหตุผล (ผู้ปกครองเห็นแค่ให้ติดต่อโรงเรียน)
  if exists (select 1 from unnest(ids) x where public.student_held(x, p_user)) then raise exception 'student_held' using errcode = 'P0001'; end if;
  -- ประตูเริ่มต้น = ประตูของห้องแรก (ตามชื่อห้อง) ที่ตั้งไว้
  select c.zone_id into zid from public.students t join public.classrooms c on c.id = t.classroom_id join public.zones z on z.id = c.zone_id and z.active
   where t.id = any (ids) and c.zone_id is not null order by c.name limit 1;

  st := case when p_dist_m <= cfg.arrive_radius_m then 'arrived' else 'on_the_way' end;
  begin
    insert into public.pickup_sessions (school_id, parent_user_id, person_id, vehicle_id, driver_name, plate, plate_province, vehicle_desc,
        status, expires_at, distance_m, eta_s, eta_source, route_at, route_eta_s, route_straight_m, route_road_m, arrived_at, zone_id)
    values (p_school, p_user, per.id, veh.id, per.name, veh.plate, veh.province, nullif(btrim(concat_ws(' ', veh.color, veh.model)), ''),
        st, now() + make_interval(mins => cfg.checkin_ttl_min), p_dist_m, p_eta_s, p_src,
        case when p_route_eta is not null then now() end, p_route_eta, p_route_straight, p_route_road,
        case when st = 'arrived' then now() end, zid)
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

create or replace function public.pickup_release(p_actor uuid, p_session uuid, p_student uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.pickup_sessions%rowtype; role_ text; n integer := 0; remaining integer; done boolean := false; nheld integer;
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

  -- พักการรับ (ประกาศฉุกเฉิน): ไม่มีใครปล่อยนักเรียนได้จนกว่าจะเปิดรับอีกครั้ง
  if exists (select 1 from public.school_settings c where c.school_id = p.school_id and c.pickup_paused) then raise exception 'paused' using errcode = 'P0001'; end if;
  select count(*) into nheld from public.pickup_session_students ps where ps.session_id = p_session and ps.active and public.student_held(ps.student_id, p.parent_user_id);
  -- ผู้ปกครองกด "รับแล้ว" = จบทั้งคิว ทำไม่ได้ถ้ามีเด็กที่ติดธง
  if nheld > 0 and role_ = 'parent' then raise exception 'held' using errcode = 'P0001'; end if;

  update public.pickup_session_students ps set status = 'released', released_at = now(), released_by = p_actor, active = false
   where ps.session_id = p_session and ps.active and not public.student_held(ps.student_id, p.parent_user_id)
     and (role_ in ('parent') or p_student is null or ps.student_id = p_student)
     and (role_ <> 'teacher' or exists (select 1 from public.students st join public.classroom_teachers ct on ct.classroom_id = st.classroom_id
                                         where st.id = ps.student_id and ct.user_id = p_actor and ct.ended_at is null));
  get diagnostics n = row_count;
  if n = 0 and nheld > 0 then raise exception 'held' using errcode = 'P0001'; end if;
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

create or replace function public.pickup_call(p_actor uuid, p_session uuid, p_student uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare sid uuid; staff boolean; n integer;
begin
  select school_id into sid from public.pickup_sessions where id = p_session and status in ('on_the_way', 'arrived');
  if sid is null then raise exception 'not_active' using errcode = 'P0001'; end if;
  if exists (select 1 from public.school_settings c where c.school_id = sid and c.pickup_paused) then raise exception 'paused' using errcode = 'P0001'; end if;
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

drop function if exists public.pickup_queue(uuid);
create function public.pickup_queue(p_school uuid)
returns table (session_id uuid, status text, distance_m integer, eta_s integer, eta_source text, last_seen_at timestamptz, stale boolean,
               arrived_at timestamptz, checked_in_at timestamptz, verified_at timestamptz, manual_arrival boolean,
               driver_name text, plate text, plate_province text, vehicle_desc text, students jsonb, zone_id uuid, zone_name text)
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
                     'classroom', c.name, 'classroom_id', c.id, 'status', ps.status, 'held', public.student_held(st.id, p.parent_user_id)) order by c.name, st.first_name), '[]'::jsonb)
              from public.pickup_session_students ps join public.students st on st.id = ps.student_id left join public.classrooms c on c.id = st.classroom_id
             where ps.session_id = p.id and ps.active
               and (full_access or exists (select 1 from public.classroom_teachers ct where ct.classroom_id = st.classroom_id and ct.user_id = uid and ct.ended_at is null))) as students,
           p.zone_id, z.name as zone_name
      from public.pickup_sessions p left join public.zones z on z.id = p.zone_id
     where p.school_id = p_school and p.status in ('on_the_way', 'arrived') and p.expires_at > now()
  ) q
  where jsonb_array_length(q.students) > 0
  order by (q.status <> 'arrived'), q.arrived_at nulls last, q.eta_s nulls last, q.distance_m nulls last, q.checked_in_at;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['pickup_start(uuid,uuid,uuid,uuid,uuid[],integer,integer,text,integer,integer,integer)', 'pickup_call(uuid,uuid,uuid)', 'pickup_release(uuid,uuid,uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  revoke all on function public.pickup_queue(uuid) from public, anon;
  grant execute on function public.pickup_queue(uuid) to authenticated, service_role;
end $$;

-- กฎอัตโนมัติ: เตือนรับช้า (ไม่ทับค่าที่แอดมินปรับ)
insert into public.automation_rules (key, enabled, params, sort_order) values ('late_pickup', true, '{"repeat_min": 0}'::jsonb, 20) on conflict (key) do nothing;

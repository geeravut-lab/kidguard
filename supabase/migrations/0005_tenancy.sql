-- 0005 โรงเรียน (multi-tenant), สมาชิก, ห้องเรียน, นักเรียน, ผู้ปกครอง/รถ, การผูกผู้ปกครอง–นักเรียน, คำเชิญเจ้าหน้าที่

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name_th text not null check (length(name_th) between 1 and 120),
  name_en text check (name_en is null or length(name_en) between 1 and 120),
  short_name text check (short_name is null or length(short_name) between 1 and 20),   -- ชื่อย่อ เช่น ASCS
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  timezone text not null default 'Asia/Bangkok',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);

create table if not exists public.school_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  checkin_radius_m integer not null default 2000 check (checkin_radius_m between 100 and 50000),   -- C.1
  arrive_radius_m integer not null default 150 check (arrive_radius_m between 20 and 2000),
  student_alert_min integer not null default 5 check (student_alert_min between 0 and 120),        -- C.2.3
  student_dashboard_enabled boolean not null default false,
  checkin_start time,                                    -- null = ไม่จำกัดช่วงเวลา
  checkin_end time,
  checkin_ttl_min integer not null default 90 check (checkin_ttl_min between 10 and 480),
  stale_location_sec integer not null default 90 check (stale_location_sec between 20 and 600),
  late_pickup_min integer not null default 30 check (late_pickup_min between 5 and 240),
  updated_at timestamptz not null default now(),
  check (arrive_radius_m < checkin_radius_m),
  check ((checkin_start is null) = (checkin_end is null))
);

create table if not exists public.school_members (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('school_admin', 'gate_staff', 'teacher')),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id, role)
);
create index if not exists school_members_user_idx on public.school_members (user_id);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (length(name) between 1 and 30),       -- เช่น ป.1/1, ม.4/6, อ.2/1
  level text check (level is null or length(level) <= 30),
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.classroom_teachers (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists classroom_teachers_current_uq on public.classroom_teachers (classroom_id, user_id) where ended_at is null;
create index if not exists classroom_teachers_user_idx on public.classroom_teachers (user_id) where ended_at is null;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_code text check (student_code is null or length(student_code) between 1 and 30),
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null default '' check (length(last_name) <= 80),
  nickname text check (nickname is null or length(nickname) between 1 and 30),
  classroom_id uuid references public.classrooms(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'left')),
  search_key text generated always as (lower(regexp_replace(coalesce(first_name, '') || coalesce(last_name, ''), '\s+', '', 'g'))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists students_code_uq on public.students (school_id, student_code) where student_code is not null;
create index if not exists students_match_idx on public.students (school_id, classroom_id, search_key);

-- ผู้ปกครอง/ผู้รับแทน หลายคนต่อบัญชี (A.1)
create table if not exists public.guardian_persons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  phone text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  relation text check (relation is null or relation in ('father', 'mother', 'guardian', 'relative', 'driver', 'other')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists guardian_persons_user_idx on public.guardian_persons (user_id);

-- ทะเบียนรถ หลายคันต่อบัญชี (A.1)
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plate text not null check (plate ~ '^[0-9A-Za-zก-ฮ๐-๙]{1,12}$'),     -- เก็บแบบไม่มีช่องว่าง/ขีด
  province text not null check (length(btrim(province)) between 1 and 40),
  color text check (color is null or length(color) <= 30),
  model text check (model is null or length(model) <= 40),
  created_at timestamptz not null default now(),
  unique (user_id, plate, province)
);
create index if not exists vehicles_user_idx on public.vehicles (user_id);

-- ผู้ปกครอง ↔ นักเรียน: ต้องผ่านการอนุมัติของ Admin/ครูประจำชั้นก่อนจึง check-in ได้
create table if not exists public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,      -- ระบบจับคู่ให้เมื่อชื่อตรงรายชื่อ; ยังไม่มีผลจนกว่าอนุมัติ
  claimed_name text not null check (length(btrim(claimed_name)) between 2 and 120),
  claimed_classroom_id uuid not null references public.classrooms(id) on delete cascade,
  claimed_teacher_name text check (claimed_teacher_name is null or length(claimed_teacher_name) <= 80),
  relation text check (relation is null or relation in ('father', 'mother', 'guardian', 'relative', 'driver', 'other')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or student_id is not null)
);
create unique index if not exists guardian_links_user_student_uq on public.guardian_links (user_id, student_id) where student_id is not null and status <> 'rejected';
create index if not exists guardian_links_school_status_idx on public.guardian_links (school_id, status, created_at desc);
create index if not exists guardian_links_user_idx on public.guardian_links (user_id);

-- คำเชิญเจ้าหน้าที่/แอดมิน: รหัสครั้งเดียว (เก็บเฉพาะ hash) — ไม่ผูกบัญชีด้วยอีเมล
create table if not exists public.school_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,        -- null = คำเชิญ super_admin
  role text not null check (role in ('super_admin', 'school_admin', 'gate_staff', 'teacher')),
  classroom_id uuid references public.classrooms(id) on delete cascade,  -- ครูประจำชั้น: ผูกห้องตอนรับคำเชิญ
  code_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid,
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check ((role = 'super_admin') = (school_id is null))
);

-- ค่าเริ่มต้น: โรงเรียนแรก (พิกัดยังไม่ตั้ง — Admin ตั้งในหน้าตั้งค่าก่อนเปิดใช้ check-in)
insert into public.schools (slug, name_th, short_name)
values ('krungthep-christian', 'โรงเรียนกรุงเทพคริสเตียน', 'ASCS')
on conflict (slug) do nothing;
insert into public.school_settings (school_id) select id from public.schools on conflict (school_id) do nothing;

-- audit trigger ของตารางสำคัญ (เพิ่มตารางสิทธิ์ใหม่ = เพิ่ม trigger ตรงนี้)
drop trigger if exists audit_school_members on public.school_members;
create trigger audit_school_members after insert or update or delete on public.school_members
  for each row execute function public.audit_row_change('role', 'created_at');
drop trigger if exists audit_guardian_links on public.guardian_links;
create trigger audit_guardian_links after insert or update or delete on public.guardian_links
  for each row execute function public.audit_row_change('status,student_id', 'created_at');
drop trigger if exists audit_schools on public.schools;
create trigger audit_schools after insert or update or delete on public.schools
  for each row execute function public.audit_row_change('active,slug', 'updated_at,created_at');
drop trigger if exists audit_school_settings on public.school_settings;
create trigger audit_school_settings after update on public.school_settings
  for each row execute function public.audit_row_change('checkin_radius_m,arrive_radius_m,student_alert_min,student_dashboard_enabled,checkin_ttl_min,stale_location_sec,late_pickup_min', 'updated_at');
drop trigger if exists audit_classroom_teachers on public.classroom_teachers;
create trigger audit_classroom_teachers after insert or update or delete on public.classroom_teachers
  for each row execute function public.audit_row_change('classroom_id,ended_at', 'started_at');
drop trigger if exists audit_school_invites on public.school_invites;
create trigger audit_school_invites after insert or update on public.school_invites
  for each row execute function public.audit_row_change('role,used_at', 'created_at');

drop trigger if exists schools_touch on public.schools;
create trigger schools_touch before update on public.schools for each row execute function public.kg_touch_updated_at();
drop trigger if exists school_settings_touch on public.school_settings;
create trigger school_settings_touch before update on public.school_settings for each row execute function public.kg_touch_updated_at();
drop trigger if exists students_touch on public.students;
create trigger students_touch before update on public.students for each row execute function public.kg_touch_updated_at();

-- สิทธิ์: เปิด RLS ทุกตาราง, ถอนสิทธิ์ anon, service_role ทำได้ทั้งหมด (สิทธิ์ของ authenticated กำหนดใน 0006)
do $$
declare t text;
begin
  foreach t in array array['schools','school_settings','school_members','classrooms','classroom_teachers','students','guardian_persons','vehicles','guardian_links','school_invites']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- 0011 เฟส 5: คอนโซลแอดมิน — รูปแบรนด์ (bucket + โลโก้โรงเรียน), สถิติการใช้งาน/คิว, กฎอัตโนมัติ, ล้างข้อมูลตามระยะเก็บรักษา
-- ทุกตาราง/ฟังก์ชันที่นี่: service_role เท่านั้น (อ่าน/เขียนผ่าน server ที่ตรวจสิทธิ์แล้ว)

-- ===== รูปแบรนด์: bucket ส่วนตัว (เสิร์ฟผ่าน route ของเรา) + โลโก้โรงเรียน =====
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('brand-assets', 'brand-assets', false) on conflict (id) do nothing;
  end if;
end $$;

alter table public.schools add column if not exists logo jsonb check (logo is null or jsonb_typeof(logo) = 'object');

-- ===== สถิติการใช้งาน (เหตุการณ์ไม่มีเนื้อหา — docs/USAGE-ANALYTICS-KNOWLEDGE.md) =====
create or replace function public.bangkok_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  event text not null check (event ~ '^[a-z][a-z0-9_]{2,39}$'),
  day date not null default public.bangkok_today(),
  detail text check (detail is null or length(detail) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists product_events_day_event_idx on public.product_events (day, event);
create index if not exists product_events_user_idx on public.product_events (user_id, day) where user_id is not null;
create index if not exists product_events_school_idx on public.product_events (school_id, day) where school_id is not null;
create unique index if not exists product_events_active_uq on public.product_events (user_id, day) where event = 'active';
create unique index if not exists product_events_once_uq on public.product_events (user_id, event) where event in ('signup', 'onboarded', 'line_linked');

alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;
grant select, insert, delete on public.product_events to service_role;

-- ผู้ใช้ที่เกี่ยวข้องกับโรงเรียน (สมาชิก + ผู้ปกครองที่อนุมัติแล้ว)
create or replace function public.school_user_ids(p_school uuid) returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.school_members m where m.school_id = p_school
  union
  select g.user_id from public.guardian_links g where g.school_id = p_school and g.status = 'approved'
$$;
revoke all on function public.school_user_ids(uuid) from public, anon, authenticated;
grant execute on function public.school_user_ids(uuid) to service_role;

-- หน้าสถิติทั้งหน้าจากการเรียกเดียว; p_school = null → ทั้งแพลตฟอร์ม
create or replace function public.admin_analytics(p_days integer, p_school uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d integer := least(greatest(coalesce(p_days, 30), 1), 365);
  today date := public.bangkok_today();
  res jsonb;
begin
  with ev as (
    select pe.* from public.product_events pe
     where pe.day > today - 366 and pe.user_id is not null
       and (p_school is null or pe.school_id = p_school or (pe.school_id is null and pe.user_id in (select u.user_id from public.school_user_ids(p_school) u)))
  ),
  win as (select * from ev where day > today - d),
  daily as (
    select g::date as day, coalesce(c.n, 0) as n
      from generate_series(today - d + 1, today, interval '1 day') g
      left join (select day, count(distinct user_id) n from win where event = 'active' group by day) c on c.day = g::date
  ),
  funnel as (
    select s.step, s.ord, (select count(distinct user_id) from win where win.event = s.step) as users
      from (values ('signup', 1), ('onboarded', 2), ('guardian_linked', 3), ('pickup_started', 4), ('pickup_completed', 5)) s(step, ord)
  ),
  su as (
    select user_id, day as signup_day from ev where event = 'signup' and day > today - d
  )
  select jsonb_build_object(
    'days', d,
    'users_total', case when p_school is null then (select count(*) from public.profiles)
                        else (select count(*) from public.school_user_ids(p_school)) end,
    'dau', (select count(distinct user_id) from ev where event = 'active' and day = today),
    'wau', (select count(distinct user_id) from ev where event = 'active' and day > today - 7),
    'mau', (select count(distinct user_id) from ev where event = 'active' and day > today - 30),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]'::jsonb) from daily),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('event', event, 'count', c, 'users', u) order by c desc), '[]'::jsonb)
                 from (select event, count(*) c, count(distinct user_id) u from win where event <> 'active' group by event) x),
    'funnel', (select coalesce(jsonb_agg(jsonb_build_object('step', step, 'users', users) order by ord), '[]'::jsonb) from funnel),
    'retention', jsonb_build_object(
      'd1', jsonb_build_object(
        'eligible', (select count(*) from su where signup_day <= today - 1),
        'returned', (select count(*) from su where signup_day <= today - 1 and exists (select 1 from ev a where a.user_id = su.user_id and a.event = 'active' and a.day = su.signup_day + 1))),
      'd7', jsonb_build_object(
        'eligible', (select count(*) from su where signup_day <= today - 7),
        'returned', (select count(*) from su where signup_day <= today - 7 and exists (select 1 from ev a where a.user_id = su.user_id and a.event = 'active' and a.day = su.signup_day + 7))))
  ) into res;
  return res;
end;
$$;

-- สถิติคิว: ปริมาณ, ผลลัพธ์, เวลารอที่ประตู, ช่วงเวลาที่แน่น (เวลาท้องถิ่นของโรงเรียน)
create or replace function public.admin_queue_stats(p_days integer, p_school uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d integer := least(greatest(coalesce(p_days, 30), 1), 365);
  res jsonb;
begin
  with s as (
    select p.*, (p.checked_in_at at time zone sc.timezone) as local_at
      from public.pickup_sessions p join public.schools sc on sc.id = p.school_id
     where p.checked_in_at >= now() - make_interval(days => d) and (p_school is null or p.school_id = p_school)
  ),
  done as (select * from s where status = 'completed' and arrived_at is not null and completed_at is not null and completed_at >= arrived_at),
  daily as (
    select g::date as day, coalesce(c.n, 0) as n
      from generate_series((now() at time zone 'Asia/Bangkok')::date - d + 1, (now() at time zone 'Asia/Bangkok')::date, interval '1 day') g
      left join (select (local_at)::date as day, count(*) n from s group by 1) c on c.day = g::date
  )
  select jsonb_build_object(
    'days', d,
    'total', (select count(*) from s),
    'completed', (select count(*) from s where status = 'completed'),
    'cancelled', (select count(*) from s where status = 'cancelled'),
    'expired', (select count(*) from s where status = 'expired'),
    'manual_arrival', (select count(*) from s where manual_arrival),
    'verified', (select count(*) from s where verified_at is not null),
    'by_parent', (select count(*) from s where completed_by_role = 'parent'),
    'by_staff', (select count(*) from s where completed_by_role in ('teacher', 'gate_staff', 'school_admin', 'super_admin')),
    'students_released', (select count(*) from public.pickup_session_students ps join s on s.id = ps.session_id where ps.status = 'released'),
    'wait_avg_s', (select round(avg(extract(epoch from completed_at - arrived_at)))::integer from done),
    'wait_p50_s', (select round(percentile_cont(0.5) within group (order by extract(epoch from completed_at - arrived_at)))::integer from done),
    'wait_p90_s', (select round(percentile_cont(0.9) within group (order by extract(epoch from completed_at - arrived_at)))::integer from done),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'n', n) order by h), '[]'::jsonb)
                  from (select extract(hour from local_at)::integer h, count(*) n from s group by 1) x),
    'by_weekday', (select coalesce(jsonb_agg(jsonb_build_object('dow', w, 'n', n) order by w), '[]'::jsonb)
                  from (select extract(isodow from local_at)::integer w, count(*) n from s group by 1) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]'::jsonb) from daily)
  ) into res;
  return res;
end;
$$;

revoke all on function public.admin_analytics(integer, uuid), public.admin_queue_stats(integer, uuid) from public, anon, authenticated;
grant execute on function public.admin_analytics(integer, uuid), public.admin_queue_stats(integer, uuid) to service_role;

-- ===== กฎอัตโนมัติ (ตารางบอกแค่ เปิด/ปิด + ตัวเลข; เงื่อนไขอยู่ในโค้ด) =====
create table if not exists public.automation_rules (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  sort_order integer not null default 100,
  last_run_at timestamptz,
  last_count integer,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table if not exists public.cron_ticks (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb
);
create index if not exists cron_ticks_started_idx on public.cron_ticks (started_at desc);

alter table public.automation_rules enable row level security;
alter table public.cron_ticks enable row level security;
revoke all on public.automation_rules, public.cron_ticks from anon, authenticated;
grant select, insert, update, delete on public.automation_rules, public.cron_ticks to service_role;

drop trigger if exists automation_rules_touch on public.automation_rules;
create trigger automation_rules_touch before update on public.automation_rules for each row execute function public.kg_touch_updated_at();
drop trigger if exists audit_automation_rules on public.automation_rules;
create trigger audit_automation_rules after update on public.automation_rules
  for each row execute function public.audit_row_change('enabled,params', 'updated_at,last_run_at,last_count');

-- seed: ไม่ทับค่าที่แอดมินปรับแล้ว
insert into public.automation_rules (key, enabled, params, sort_order) values
  ('pickup_expire', true, '{}'::jsonb, 10),
  ('cleanup_old', true, '{"notif_days": 90, "msg_days": 90, "events_days": 730, "sessions_days": 365}'::jsonb, 90)
on conflict (key) do nothing;

-- ล้างข้อมูลเก่าตามระยะเก็บรักษา (PDPA): คืนจำนวนแถวที่ลบต่อประเภท
create or replace function public.kg_cleanup_old(p_notif_days integer, p_msg_days integer, p_events_days integer, p_sessions_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a integer; b integer; c integer; e integer; f integer;
begin
  delete from public.app_notifications where created_at < now() - make_interval(days => greatest(p_notif_days, 7));
  get diagnostics a = row_count;
  delete from public.message_log where at < now() - make_interval(days => greatest(p_msg_days, 7));
  get diagnostics b = row_count;
  delete from public.product_events where created_at < now() - make_interval(days => greatest(p_events_days, 30));
  get diagnostics c = row_count;
  delete from public.pickup_sessions where status not in ('on_the_way', 'arrived') and coalesce(completed_at, updated_at) < now() - make_interval(days => greatest(p_sessions_days, 30));
  get diagnostics e = row_count;
  delete from public.cron_ticks where started_at < now() - interval '30 days';
  get diagnostics f = row_count;
  return jsonb_build_object('notifications', a, 'messages', b, 'events', c, 'sessions', e, 'ticks', f);
end;
$$;
revoke all on function public.kg_cleanup_old(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.kg_cleanup_old(integer, integer, integer, integer) to service_role;

-- 0010 เฟส 4: แจ้งเตือนในแอป + LINE (OA แยกต่อโรงเรียน) + บัญชีนักเรียน (optional)
-- ความลับของ LINE (channel secret / access token) เก็บแบบเข้ารหัสฝั่งแอป (AES-256-GCM) ในตารางที่ client เข้าถึงไม่ได้

create table if not exists public.school_line_channels (
  school_id uuid primary key references public.schools(id) on delete cascade,
  basic_id text check (basic_id is null or basic_id ~ '^@[A-Za-z0-9._-]{2,40}$'),
  channel_secret_enc text,
  access_token_enc text,
  enabled boolean not null default false,
  monthly_quota integer not null default 1000 check (monthly_quota between 0 and 1000000),
  paused_until timestamptz,
  last_error text check (last_error is null or length(last_error) <= 200),
  last_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  channel text not null default 'line' check (channel in ('line')),
  address text,                                  -- LINE userId (null ระหว่างรอผูก)
  status text not null default 'pending' check (status in ('pending', 'active', 'stopped')),
  code_hash text,
  code_expires_at timestamptz,
  attempts integer not null default 0,
  last_error text check (last_error is null or length(last_error) <= 200),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (user_id, school_id, channel)
);
-- LINE userId หนึ่งตัวผูกได้กับบัญชีเดียวต่อโรงเรียน (กันข้อความของคนหนึ่งไปโผล่ที่หลายบัญชี)
create unique index if not exists notification_channels_line_active_uq on public.notification_channels (school_id, address) where channel = 'line' and status = 'active';
create index if not exists notification_channels_code_idx on public.notification_channels (school_id, code_hash) where status = 'pending';
create index if not exists notification_channels_addr_idx on public.notification_channels (school_id, address) where address is not null;

create table if not exists public.message_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null,
  kind text,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text check (error is null or length(error) <= 200)
);
create index if not exists message_log_school_month_idx on public.message_log (school_id, channel, at desc);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  kind text not null check (kind in ('info', 'success', 'warning', 'danger')),
  title text not null check (length(title) between 1 and 120),
  body text check (body is null or length(body) <= 400),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and pg_column_size(fields) <= 2048),
  link text check (link is null or (link ~ '^/[^/\\]' and length(link) <= 300)),
  dedupe_key text check (dedupe_key is null or length(dedupe_key) <= 160),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists app_notifications_dedupe_uq on public.app_notifications (user_id, dedupe_key) where dedupe_key is not null;
create index if not exists app_notifications_user_idx on public.app_notifications (user_id, created_at desc);
create index if not exists app_notifications_unread_idx on public.app_notifications (user_id) where read_at is null;

create table if not exists public.student_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, student_id)
);
create index if not exists student_accounts_student_idx on public.student_accounts (student_id);

do $$
declare t text;
begin
  foreach t in array array['school_line_channels', 'notification_channels', 'message_log', 'app_notifications', 'student_accounts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

-- แจ้งเตือนในแอป: เจ้าของอ่าน/ทำเครื่องหมายอ่าน/ลบของตัวเองเท่านั้น (เขียนผ่านเซิร์ฟเวอร์)
grant select, delete on public.app_notifications to authenticated;
grant update (read_at) on public.app_notifications to authenticated;
drop policy if exists app_notifications_own_select on public.app_notifications;
create policy app_notifications_own_select on public.app_notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists app_notifications_own_update on public.app_notifications;
create policy app_notifications_own_update on public.app_notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists app_notifications_own_delete on public.app_notifications;
create policy app_notifications_own_delete on public.app_notifications for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.student_accounts to authenticated;
drop policy if exists student_accounts_own on public.student_accounts;
create policy student_accounts_own on public.student_accounts for select to authenticated using (user_id = (select auth.uid()));

-- ปลุกหน้าจอของเจ้าของเมื่อมีแจ้งเตือนใหม่/อ่านแล้ว (ping ไม่มีข้อมูล)
create or replace function public.app_notifications_live() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.live_ping('u:' || coalesce(new.user_id, old.user_id)::text);
  return null;
end;
$$;
drop trigger if exists app_notifications_live_trg on public.app_notifications;
create trigger app_notifications_live_trg after insert or update of read_at or delete on public.app_notifications for each row execute function public.app_notifications_live();

drop trigger if exists audit_school_line_channels on public.school_line_channels;
create trigger audit_school_line_channels after insert or update or delete on public.school_line_channels
  for each row execute function public.audit_row_change('enabled,monthly_quota', 'updated_at,last_error,last_verified_at,paused_until,channel_secret_enc,access_token_enc,basic_id');
drop trigger if exists audit_notification_channels on public.notification_channels;
create trigger audit_notification_channels after insert or update of status or delete on public.notification_channels
  for each row execute function public.audit_row_change('status,channel', 'address,code_hash,code_expires_at,attempts,last_error,verified_at,created_at');
drop trigger if exists audit_student_accounts on public.student_accounts;
create trigger audit_student_accounts after insert or delete on public.student_accounts for each row execute function public.audit_row_change('', 'created_at');

-- ===== คำเชิญนักเรียน =====
alter table public.school_invites add column if not exists student_id uuid references public.students(id) on delete cascade;
alter table public.school_invites drop constraint if exists school_invites_role_check;
alter table public.school_invites add constraint school_invites_role_check check (role in ('super_admin', 'school_admin', 'gate_staff', 'teacher', 'student'));
alter table public.school_invites drop constraint if exists school_invites_student_chk;
alter table public.school_invites add constraint school_invites_student_chk check ((role = 'student') = (student_id is not null));

create or replace function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  h text;
  inv public.school_invites%rowtype;
  rows_updated integer;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.rl_hit('invite:' || uid::text, 10, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  h := encode(extensions.digest(convert_to(upper(btrim(coalesce(p_code, ''))), 'utf8'), 'sha256'), 'hex');
  select * into inv from public.school_invites where code_hash = h and used_at is null and expires_at > now();
  if not found then raise exception 'invalid_invite' using errcode = 'P0002'; end if;
  update public.school_invites set used_by = uid, used_at = now() where id = inv.id and used_at is null;
  get diagnostics rows_updated = row_count;
  if rows_updated <> 1 then raise exception 'invalid_invite' using errcode = 'P0002'; end if;
  if inv.role = 'super_admin' then
    insert into public.platform_admins (user_id, granted_by) values (uid, inv.created_by) on conflict (user_id) do nothing;
  elsif inv.role = 'student' then
    insert into public.student_accounts (user_id, student_id, school_id) values (uid, inv.student_id, inv.school_id) on conflict do nothing;
  else
    insert into public.school_members (school_id, user_id, role, created_by) values (inv.school_id, uid, inv.role, inv.created_by)
    on conflict (school_id, user_id, role) do nothing;
    if inv.role = 'teacher' and inv.classroom_id is not null then
      insert into public.classroom_teachers (classroom_id, school_id, user_id)
      select inv.classroom_id, inv.school_id, uid
      where not exists (select 1 from public.classroom_teachers where classroom_id = inv.classroom_id and user_id = uid and ended_at is null);
    end if;
  end if;
  return jsonb_build_object('role', inv.role, 'school_id', inv.school_id);
end;
$$;

-- kg_me: เพิ่มรายการนักเรียนที่ผูกกับบัญชี
create or replace function public.kg_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r jsonb;
begin
  if uid is null then return null; end if;
  select jsonb_build_object(
    'user_id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'lang', p.lang,
    'role', p.role, 'onboarded', p.onboarded_at is not null,
    'platform_admin', exists (select 1 from public.platform_admins a where a.user_id = uid),
    'is_owner', exists (select 1 from public.platform_admins a where a.user_id = uid and a.is_owner),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('school_id', m.school_id, 'role', m.role,
        'name_th', s.name_th, 'name_en', s.name_en, 'short_name', s.short_name, 'slug', s.slug))
      from public.school_members m join public.schools s on s.id = m.school_id where m.user_id = uid), '[]'::jsonb),
    'classroom_ids', coalesce((select jsonb_agg(ct.classroom_id) from public.classroom_teachers ct
                               where ct.user_id = uid and ct.ended_at is null), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object('student_id', sa.student_id, 'school_id', sa.school_id))
                          from public.student_accounts sa where sa.user_id = uid), '[]'::jsonb))
  into r from public.profiles p where p.id = uid;
  return r;
end;
$$;

-- ปลุกบัญชีนักเรียนที่ผูกกับเด็กในคิวด้วย (นอกเหนือจากผู้ปกครอง/โรงเรียน/ห้อง)
create or replace function public.pickup_ping_all(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s record; c uuid; u uuid;
begin
  select school_id, parent_user_id into s from public.pickup_sessions where id = p_session;
  if not found then return; end if;
  perform public.live_ping('u:' || s.parent_user_id::text);
  perform public.live_ping('school:' || s.school_id::text);
  for c in select distinct st.classroom_id from public.pickup_session_students ps join public.students st on st.id = ps.student_id
           where ps.session_id = p_session and st.classroom_id is not null loop
    perform public.live_ping('class:' || c::text);
  end loop;
  for u in select distinct sa.user_id from public.student_accounts sa join public.pickup_session_students ps on ps.student_id = sa.student_id
           where ps.session_id = p_session loop
    perform public.live_ping('u:' || u::text);
  end loop;
exception when others then null;
end;
$$;

-- จอนักเรียน: เห็นเฉพาะ ระยะ/เวลา/สถานะ ของผู้ปกครองที่กำลังมารับตัวเอง (ไม่เห็นชื่อผู้ปกครอง/ทะเบียน/เส้นทาง)
create or replace function public.student_pickup_status()
returns table (student_id uuid, school_id uuid, student_label text, enabled boolean, session_id uuid, status text, eta_s integer,
               distance_m integer, last_seen_at timestamptz, student_status text)
language sql stable security definer set search_path = '' as $$
  select sa.student_id, sa.school_id, coalesce(st.nickname, st.first_name), coalesce(cfg.student_dashboard_enabled, false),
         case when coalesce(cfg.student_dashboard_enabled, false) then p.id end,
         case when coalesce(cfg.student_dashboard_enabled, false) then p.status end,
         case when coalesce(cfg.student_dashboard_enabled, false) then p.eta_s end,
         case when coalesce(cfg.student_dashboard_enabled, false) then p.distance_m end,
         case when coalesce(cfg.student_dashboard_enabled, false) then p.last_seen_at end,
         case when coalesce(cfg.student_dashboard_enabled, false) then ps.status end
    from public.student_accounts sa
    join public.students st on st.id = sa.student_id
    left join public.school_settings cfg on cfg.school_id = sa.school_id
    left join public.pickup_session_students ps on ps.student_id = sa.student_id and ps.active
    left join public.pickup_sessions p on p.id = ps.session_id and p.status in ('on_the_way', 'arrived') and p.expires_at > now()
   where sa.user_id = (select auth.uid());
$$;

-- สถานะช่อง LINE ของฉันในแต่ละโรงเรียนที่เกี่ยวข้อง (ไม่คืน LINE userId/รหัส/ความลับ)
create or replace function public.my_line_channels()
returns table (school_id uuid, school_name text, enabled boolean, basic_id text, status text, last_error text, code_expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select g.school_id from public.guardian_links g where g.user_id = (select auth.uid())
    union select m.school_id from public.school_members m where m.user_id = (select auth.uid())
    union select a.school_id from public.student_accounts a where a.user_id = (select auth.uid()))
  select s.id, s.name_th,
         coalesce(c.enabled and c.channel_secret_enc is not null and c.access_token_enc is not null and c.basic_id is not null, false),
         c.basic_id, nc.status, nc.last_error, nc.code_expires_at
    from mine join public.schools s on s.id = mine.school_id
    left join public.school_line_channels c on c.school_id = s.id
    left join public.notification_channels nc on nc.school_id = s.id and nc.user_id = (select auth.uid()) and nc.channel = 'line'
   order by s.name_th;
$$;

-- ผู้ดูแลโรงเรียนดูสถานะการตั้งค่า LINE (ไม่คืนความลับ)
create or replace function public.school_line_status(p_school uuid)
returns table (configured boolean, enabled boolean, basic_id text, monthly_quota integer, sent_this_month bigint, last_error text, paused_until timestamptz, last_verified_at timestamptz, has_secret boolean, has_token boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_school_admin(p_school) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select (c.school_id is not null and c.channel_secret_enc is not null and c.access_token_enc is not null and c.basic_id is not null),
         coalesce(c.enabled, false), c.basic_id, coalesce(c.monthly_quota, 1000),
         (select count(*) from public.message_log m where m.school_id = p_school and m.channel = 'line' and m.status = 'sent' and m.at >= date_trunc('month', now())),
         c.last_error, c.paused_until, c.last_verified_at, c.channel_secret_enc is not null, c.access_token_enc is not null
    from (select 1) one left join public.school_line_channels c on c.school_id = p_school;
end;
$$;

-- ลายนิ้วมือสำรองของฉัน: รวมแจ้งเตือนที่ยังไม่อ่าน (ให้ทางสำรองตามทันเมื่อมีแจ้งเตือนใหม่)
create or replace function public.pickup_my_fingerprint() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.id::text || ':' || p.status || ':' || extract(epoch from p.updated_at)::bigint::text from public.pickup_sessions p
                    where p.parent_user_id = (select auth.uid()) order by p.checked_in_at desc limit 1), 'none')
         || '/' || coalesce((select string_agg(ps.status, ',' order by ps.student_id) from public.pickup_session_students ps
                              join public.pickup_sessions p on p.id = ps.session_id where p.parent_user_id = (select auth.uid()) and ps.active), '')
         || '/n' || (select count(*) from public.app_notifications n where n.user_id = (select auth.uid()) and n.read_at is null)::text
         || '/s' || coalesce((select string_agg(coalesce(sp.status, '-') || ':' || coalesce(sp.eta_s::text, '-'), ',') from public.student_pickup_status() sp), '');
$$;

do $$
declare f text;
begin
  foreach f in array array['student_pickup_status()', 'my_line_channels()', 'school_line_status(uuid)', 'pickup_my_fingerprint()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.pickup_ping_all(uuid) from public, anon, authenticated';
  execute 'revoke all on function public.app_notifications_live() from public, anon, authenticated';
end $$;

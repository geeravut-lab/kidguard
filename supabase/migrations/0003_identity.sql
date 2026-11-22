-- 0003 ตัวตนผู้ใช้: profiles, platform_admins, consents, aivora_links, rate_limits
-- หลักการ: บทบาทที่มีสิทธิ์พิเศษห้ามเลือกเอง — client แก้ได้เฉพาะคอลัมน์ที่ grant ให้, role เปลี่ยนผ่าน RPC เท่านั้น

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or length(display_name) between 1 and 80),
  avatar_url text check (avatar_url is null or length(avatar_url) <= 500),
  lang text not null default 'th' check (lang in ('th', 'en')),
  role text check (role is null or role in ('parent')),      -- บทบาทที่ "เลือกเองได้" (allow-list)
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, lang) on public.profiles to authenticated;   -- role/onboarded_at ไม่อยู่ในรายการ
grant select, insert, update, delete on public.profiles to service_role;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.kg_touch_updated_at();

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีผู้ใช้ใหม่ (ห้ามทำให้การสมัครล้ม)
create or replace function public.kg_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  nm text;
begin
  nm := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  if nm is not null then nm := left(nm, 80); end if;
  insert into public.profiles (id, display_name) values (new.id, nm) on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.kg_handle_new_user() from public, anon, authenticated;
drop trigger if exists kg_on_auth_user_created on auth.users;
create trigger kg_on_auth_user_created after insert on auth.users for each row execute function public.kg_handle_new_user();
-- ผู้ใช้ที่มีอยู่แล้วก่อนมี trigger
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_owner boolean not null default false,
  granted_by uuid,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;

create table if not exists public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('privacy', 'location', 'terms')),
  version text not null check (length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  unique (user_id, kind, version)
);
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select, insert on public.consents to authenticated;
grant all on public.consents to service_role;
drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents for insert to authenticated with check (user_id = (select auth.uid()));

-- ผูกบัญชี SSO ด้วย id ของ hub (ห้ามผูกด้วยอีเมล)
create table if not exists public.aivora_links (
  aivora_user_id text primary key check (length(aivora_user_id) between 1 and 200),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.aivora_links enable row level security;
revoke all on public.aivora_links from anon, authenticated;
grant select, insert, update, delete on public.aivora_links to service_role;

-- rate limit แบบหน้าต่างเวลาคงที่ (ใช้กับรหัสเชิญ, การขอผูกนักเรียน, LINE ฯลฯ)
create table if not exists public.rate_limits (
  key text not null,
  bucket timestamptz not null,
  n integer not null default 0,
  primary key (key, bucket)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.rl_hit(p_key text, p_limit integer, p_window_s integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  b timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  c integer;
begin
  insert into public.rate_limits (key, bucket, n) values (p_key, b, 1)
  on conflict (key, bucket) do update set n = public.rate_limits.n + 1
  returning n into c;
  if random() < 0.01 then delete from public.rate_limits where bucket < now() - interval '1 day'; end if;
  return c <= p_limit;
end;
$$;
revoke all on function public.rl_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rl_hit(text, integer, integer) to service_role;

-- ฟังก์ชันตรวจสิทธิ์ระดับแพลตฟอร์ม (ใช้ใน policy)
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- เลือกบทบาท: null → parent ครั้งเดียว (allow-list) แก้ทับไม่ได้
create or replace function public.choose_role(p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_role is null or p_role not in ('parent') then raise exception 'role_not_allowed' using errcode = '42501'; end if;
  update public.profiles set role = p_role where id = uid and role is null returning role into cur;
  if cur is null then select role into cur from public.profiles where id = uid; end if;
  return cur;
end;
$$;
revoke all on function public.choose_role(text) from public, anon;
grant execute on function public.choose_role(text) to authenticated;

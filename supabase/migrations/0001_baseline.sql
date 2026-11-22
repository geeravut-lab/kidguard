-- 0001 baseline: ตารางตั้งค่าแพลตฟอร์ม (แบรนด์, feature flags, messaging ฯลฯ ใช้ในเฟสถัดไป)
-- อ่าน/เขียนด้วย service role ฝั่ง server เท่านั้น: เปิด RLS แต่ไม่มี policy + ถอนสิทธิ์ anon/authenticated

create or replace function public.kg_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.platform_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value jsonb not null default '{}'::jsonb check (pg_column_size(value) <= 65536),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

drop trigger if exists platform_settings_touch on public.platform_settings;
create trigger platform_settings_touch before update on public.platform_settings
  for each row execute function public.kg_touch_updated_at();

-- seed: ไม่ทับค่าที่แอดมินปรับแล้ว (ON CONFLICT DO NOTHING)
insert into public.platform_settings (key, value) values
  ('brand', '{}'::jsonb),
  ('feature_flags', '{}'::jsonb)
on conflict (key) do nothing;

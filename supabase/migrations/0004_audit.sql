-- 0004 Audit Trail (append-only) + ประตูสวิตช์เปิด/ปิดตามกลุ่ม event (docs/AUDIT-TRAIL-KNOWLEDGE.md)

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null default 'app' check (source in ('app', 'db')),
  actor_id uuid,                 -- ไม่มี FK: บันทึกอยู่ต่อแม้บัญชีถูกลบ
  actor_role text,
  action text not null check (length(action) between 3 and 120),
  entity text not null,
  entity_id text,
  school_id uuid,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096)
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
create index if not exists audit_log_school_idx on public.audit_log (school_id, at desc);
create index if not exists audit_log_action_idx on public.audit_log (action text_pattern_ops, at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select, insert on public.audit_log to service_role;

create table if not exists public.audit_purges (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  before_date timestamptz not null,
  rows_deleted bigint not null
);
alter table public.audit_purges enable row level security;
revoke all on public.audit_purges from anon, authenticated;
grant select on public.audit_purges to service_role;

-- เพิ่มอย่างเดียว: ห้ามแก้ / ลบ / truncate (ลบได้เฉพาะภายใน admin_purge_audit)
create or replace function public.audit_log_block() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('kg.audit_purge', true) = 'on' then return old; end if;
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;
drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update on public.audit_log for each row execute function public.audit_log_block();
drop trigger if exists audit_log_no_delete on public.audit_log;
create trigger audit_log_no_delete before delete on public.audit_log for each row execute function public.audit_log_block();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.audit_log_block();

-- ประตูเดียวของทั้งสองผู้เขียน: กลุ่ม = คำแรกของ action (หรือ 'db' สำหรับ trigger)
-- กลุ่ม 'audit' (เปลี่ยนสวิตช์/ส่งออก/ลบ) บันทึกเสมอ ปิดไม่ได้
create or replace function public.audit_log_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
  grp text := case when new.source = 'db' then 'db' else split_part(new.action, '.', 1) end;
begin
  if grp = 'audit' then return new; end if;
  select value into s from public.platform_settings where key = 'audit';
  if s is not null then
    if coalesce((s ->> 'enabled')::boolean, true) = false then return null; end if;
    if jsonb_typeof(s -> 'off_groups') = 'array' and (s -> 'off_groups') ? grp then return null; end if;
  end if;
  return new;
exception when others then
  return new;   -- อ่านการตั้งค่าไม่ได้ = บันทึกต่อ (fail-open)
end;
$$;
drop trigger if exists audit_log_gate_trg on public.audit_log;
create trigger audit_log_gate_trg before insert on public.audit_log for each row execute function public.audit_log_gate();

insert into public.platform_settings (key, value) values ('audit', '{"enabled": true, "off_groups": []}'::jsonb)
on conflict (key) do nothing;

-- ลบได้ทางเดียว: แถวเก่ากว่า 4 ปี โดยแอดมินแพลตฟอร์ม และบันทึกการลบไว้ตลอดไป
create or replace function public.admin_purge_audit(p_actor uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  cutoff timestamptz := now() - interval '4 years';
  n bigint;
begin
  if not exists (select 1 from public.platform_admins where user_id = p_actor) then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
  perform set_config('kg.audit_purge', 'on', true);
  with d as (delete from public.audit_log where at < cutoff returning 1) select count(*) into n from d;
  insert into public.audit_purges (actor_id, before_date, rows_deleted) values (p_actor, cutoff, n);
  insert into public.audit_log (source, actor_id, action, entity, detail)
    values ('app', p_actor, 'audit.purge', 'audit_log', jsonb_build_object('rows', n));
  return n;
end;
$$;
revoke all on function public.admin_purge_audit(uuid) from public, anon, authenticated;
grant execute on function public.admin_purge_audit(uuid) to service_role;

-- trigger กลางสำหรับตารางสำคัญ: บันทึก db.<table>.<op> + ชื่อคอลัมน์ที่เปลี่ยน + ค่าเก่า/ใหม่เฉพาะคอลัมน์ที่ระบุว่าปลอดภัย
-- tg_argv[0] = คอลัมน์ที่คัดลอกค่าได้ (ไม่มีข้อมูลส่วนบุคคล), tg_argv[1] = คอลัมน์ที่ข้าม
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  safe text[] := string_to_array(coalesce(tg_argv[0], ''), ',');
  skip text[] := string_to_array(coalesce(tg_argv[1], ''), ',');
  o jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  changed text[] := '{}';
  k text;
  vals jsonb := '{}'::jsonb;
  rid text := coalesce(n ->> 'id', o ->> 'id', n ->> 'user_id', o ->> 'user_id');
  sid uuid;
begin
  for k in select jsonb_object_keys(o || n) loop
    if k = any (skip) then continue; end if;
    if tg_op = 'UPDATE' and (o -> k) is not distinct from (n -> k) then continue; end if;
    changed := changed || k;
    if k = any (safe) then
      vals := vals || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
    end if;
  end loop;
  if tg_op = 'UPDATE' and array_length(changed, 1) is null then return null; end if;
  begin
    sid := coalesce(nullif(n ->> 'school_id', ''), nullif(o ->> 'school_id', ''))::uuid;
  exception when others then sid := null;
  end;
  insert into public.audit_log (source, actor_id, action, entity, entity_id, school_id, detail)
  values ('db', (select auth.uid()), 'db.' || tg_table_name || '.' || lower(tg_op), tg_table_name, rid, sid,
          jsonb_build_object('changed', to_jsonb(changed), 'values', vals));
  return null;
exception when others then
  return null;   -- audit ห้ามทำให้งานหลักล้ม
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

drop trigger if exists audit_platform_admins on public.platform_admins;
create trigger audit_platform_admins after insert or update or delete on public.platform_admins
  for each row execute function public.audit_row_change('is_owner', 'created_at');

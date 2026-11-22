-- 0006 ฟังก์ชันตรวจสิทธิ์ + นโยบาย RLS + RPC ของเจ้าหน้าที่/ผู้ปกครอง
-- กฎ: ฟังก์ชันตรวจสิทธิ์เป็น security definer (ไม่ขึ้นกับ RLS ของผู้ใช้), execute เฉพาะ authenticated/service_role

create or replace function public.has_school_role(p_school uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.school_members
    where school_id = p_school and user_id = (select auth.uid()) and role = any (p_roles));
$$;

create or replace function public.is_school_admin(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_school_role(p_school, array['school_admin']);
$$;

create or replace function public.is_school_member(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_school_role(p_school, array['school_admin', 'gate_staff', 'teacher']);
$$;

create or replace function public.teaches_classroom(p_classroom uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classroom_teachers
                 where classroom_id = p_classroom and user_id = (select auth.uid()) and ended_at is null);
$$;

create or replace function public.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardian_links
                 where student_id = p_student and user_id = (select auth.uid()) and status = 'approved');
$$;

do $$
declare f text;
begin
  foreach f in array array['has_school_role(uuid,text[])','is_school_admin(uuid)','is_school_member(uuid)','teaches_classroom(uuid)','is_guardian_of(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ===== สิทธิ์ระดับตาราง (ผู้ใช้ที่ล็อกอิน) =====
grant select on public.schools, public.school_settings, public.classrooms to authenticated;
grant select on public.classroom_teachers, public.students, public.school_members to authenticated;
grant select, insert, update, delete on public.guardian_persons, public.vehicles to authenticated;
grant select, delete on public.guardian_links to authenticated;
grant update (name_th, name_en, short_name, lat, lng) on public.schools to authenticated;
grant update (checkin_radius_m, arrive_radius_m, student_alert_min, student_dashboard_enabled, checkin_start, checkin_end,
              checkin_ttl_min, stale_location_sec, late_pickup_min) on public.school_settings to authenticated;
grant insert, update, delete on public.classrooms, public.classroom_teachers, public.students to authenticated;

-- ===== นโยบาย =====
drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools for select to authenticated using (active or public.is_school_member(id));
drop policy if exists schools_update on public.schools;
create policy schools_update on public.schools for update to authenticated
  using (public.is_school_admin(id)) with check (public.is_school_admin(id));

drop policy if exists school_settings_select on public.school_settings;
create policy school_settings_select on public.school_settings for select to authenticated using (true);
drop policy if exists school_settings_update on public.school_settings;
create policy school_settings_update on public.school_settings for update to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

drop policy if exists school_members_select on public.school_members;
create policy school_members_select on public.school_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_school_admin(school_id));

drop policy if exists classrooms_select on public.classrooms;
create policy classrooms_select on public.classrooms for select to authenticated using (active or public.is_school_member(school_id));
drop policy if exists classrooms_write on public.classrooms;
create policy classrooms_write on public.classrooms for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

drop policy if exists classroom_teachers_select on public.classroom_teachers;
create policy classroom_teachers_select on public.classroom_teachers for select to authenticated
  using (public.is_school_member(school_id));
drop policy if exists classroom_teachers_write on public.classroom_teachers;
create policy classroom_teachers_write on public.classroom_teachers for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

-- นักเรียน: แอดมิน/เจ้าหน้าที่ประตูเห็นทั้งโรงเรียน, ครูเห็นเฉพาะห้องตัวเอง, ผู้ปกครองเห็นเฉพาะลูกที่อนุมัติแล้ว
drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated using (
  public.has_school_role(school_id, array['school_admin', 'gate_staff'])
  or (classroom_id is not null and public.teaches_classroom(classroom_id))
  or public.is_guardian_of(id));
drop policy if exists students_write on public.students;
create policy students_write on public.students for all to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

drop policy if exists guardian_persons_own on public.guardian_persons;
create policy guardian_persons_own on public.guardian_persons for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists vehicles_own on public.vehicles;
create policy vehicles_own on public.vehicles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists guardian_links_select_own on public.guardian_links;
create policy guardian_links_select_own on public.guardian_links for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists guardian_links_delete_own_pending on public.guardian_links;
create policy guardian_links_delete_own_pending on public.guardian_links for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');

-- ===== RPC =====

-- ข้อมูลของฉัน (ครั้งเดียว ประหยัด round trip)
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
                               where ct.user_id = uid and ct.ended_at is null), '[]'::jsonb))
  into r from public.profiles p where p.id = uid;
  return r;
end;
$$;

-- ห้องเรียนของโรงเรียน + ชื่อครูประจำชั้นปัจจุบัน (ให้ผู้ปกครองเห็นตอนลงทะเบียน A.2/A.3)
create or replace function public.classroom_options(p_school uuid)
returns table (id uuid, name text, level text, sort integer, teachers text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.level, c.sort,
         coalesce(array_agg(distinct p.display_name) filter (where p.display_name is not null), '{}')
  from public.classrooms c
  left join public.classroom_teachers ct on ct.classroom_id = c.id and ct.ended_at is null
  left join public.profiles p on p.id = ct.user_id
  where c.school_id = p_school and c.active and (select auth.uid()) is not null
  group by c.id
  order by c.sort, c.name;
$$;

-- ผู้ปกครองขอผูกนักเรียน: ไม่เปิดเผยรายชื่อนักเรียน (ตอบเหมือนกันทุกกรณี), มีผลเมื่อโรงเรียนอนุมัติ
create or replace function public.claim_student(p_school uuid, p_classroom uuid, p_name text, p_relation text, p_teacher_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  nm text := btrim(coalesce(p_name, ''));
  key text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', '', 'g'));
  matched uuid;
  cnt integer;
  existing uuid;
  new_id uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if length(nm) < 2 or length(nm) > 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if not public.rl_hit('claim:' || uid::text, 20, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  if not exists (select 1 from public.schools s where s.id = p_school and s.active)
     or not exists (select 1 from public.classrooms c where c.id = p_classroom and c.school_id = p_school and c.active) then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  select min(s.id::text)::uuid, count(*) into matched, cnt from public.students s
   where s.school_id = p_school and s.classroom_id = p_classroom and s.status = 'active' and s.search_key = key;
  if cnt <> 1 then matched := null; end if;
  select g.id into existing from public.guardian_links g
   where g.user_id = uid and g.school_id = p_school and g.status <> 'rejected'
     and (g.student_id = matched or lower(regexp_replace(g.claimed_name, '\s+', '', 'g')) = key) limit 1;
  if existing is not null then return existing; end if;
  insert into public.guardian_links (user_id, school_id, student_id, claimed_name, claimed_classroom_id, claimed_teacher_name, relation)
  values (uid, p_school, matched, nm, p_classroom, nullif(btrim(coalesce(p_teacher_name, '')), ''),
          nullif(p_relation, ''))
  returning id into new_id;
  return new_id;
end;
$$;

-- เสร็จสิ้นการลงทะเบียน A: ต้องมีผู้ปกครอง+เบอร์, ทะเบียนรถ, นักเรียนอย่างน้อย 1 คน, และยินยอม PDPA
create or replace function public.complete_onboarding() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.guardian_persons where user_id = uid)
     and exists (select 1 from public.vehicles where user_id = uid)
     and exists (select 1 from public.guardian_links where user_id = uid and status <> 'rejected')
     and exists (select 1 from public.consents where user_id = uid and kind = 'privacy') then
    update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = uid;
    return true;
  end if;
  return false;
end;
$$;

-- คำขอผูกนักเรียนสำหรับ Admin (ทั้งโรงเรียน) หรือครูประจำชั้น (เฉพาะห้องตัวเอง)
create or replace function public.school_claims(p_school uuid, p_status text default 'pending')
returns table (link_id uuid, status text, created_at timestamptz, parent_user_id uuid, parent_name text, parent_phone text,
               claimed_name text, claimed_teacher_name text, relation text, classroom_id uuid, classroom_name text,
               student_id uuid, student_name text, decided_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  admin boolean := public.is_school_admin(p_school);
begin
  if uid is null or not (admin or exists (select 1 from public.school_members m where m.school_id = p_school and m.user_id = uid and m.role = 'teacher')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select g.id, g.status, g.created_at, g.user_id,
         coalesce(pp.name, pr.display_name), pp.phone,
         g.claimed_name, g.claimed_teacher_name, g.relation, g.claimed_classroom_id, c.name,
         g.student_id, nullif(btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), ''), g.decided_at
  from public.guardian_links g
  join public.classrooms c on c.id = g.claimed_classroom_id
  left join public.students s on s.id = g.student_id
  left join public.profiles pr on pr.id = g.user_id
  left join lateral (select p.name, p.phone from public.guardian_persons p where p.user_id = g.user_id
                     order by p.is_primary desc, p.created_at limit 1) pp on true
  where g.school_id = p_school and (p_status is null or g.status = p_status)
    and (admin or public.teaches_classroom(g.claimed_classroom_id))
  order by g.created_at desc
  limit 500;
end;
$$;

-- ตัดสินคำขอ: อนุมัติ (ระบุ/ยืนยันนักเรียน) หรือปฏิเสธ — compare-and-set ที่ status='pending'
create or replace function public.decide_claim(p_link uuid, p_approve boolean, p_student uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  l public.guardian_links%rowtype;
  target uuid;
  stu public.students%rowtype;
  rows_updated integer;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into l from public.guardian_links where id = p_link;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.is_school_admin(l.school_id) or (public.has_school_role(l.school_id, array['teacher']) and public.teaches_classroom(l.claimed_classroom_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_approve then
    target := coalesce(p_student, l.student_id);
    if target is null then raise exception 'student_required' using errcode = '22023'; end if;
    select * into stu from public.students where id = target and school_id = l.school_id and status = 'active';
    if not found then raise exception 'invalid_student' using errcode = '22023'; end if;
    if not public.is_school_admin(l.school_id) and not (stu.classroom_id is not null and public.teaches_classroom(stu.classroom_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    update public.guardian_links set status = 'approved', student_id = target, decided_by = uid, decided_at = now()
     where id = p_link and status = 'pending';
  else
    update public.guardian_links set status = 'rejected', decided_by = uid, decided_at = now()
     where id = p_link and status = 'pending';
  end if;
  get diagnostics rows_updated = row_count;
  if rows_updated <> 1 then raise exception 'already_decided' using errcode = '55000'; end if;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'student_id', target, 'school_id', l.school_id);
end;
$$;

-- รับคำเชิญ (รหัสครั้งเดียว): ผู้ใช้ต้องล็อกอินแล้ว; ใช้ได้ครั้งเดียวด้วย compare-and-set
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

do $$
declare f text;
begin
  foreach f in array array['kg_me()','classroom_options(uuid)','claim_student(uuid,uuid,text,text,text)','complete_onboarding()',
                           'school_claims(uuid,text)','decide_claim(uuid,boolean,uuid)','redeem_invite(text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

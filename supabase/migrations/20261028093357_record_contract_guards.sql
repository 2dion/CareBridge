-- 10/28 사용자 결정: 이유 번역 보존, needs_check + omitted, 제출 검사,
-- 서버 출처 판정, 개인·업무·서버 검사 프로필 조회 분리.
alter table public.record_items add column reason_native text not null default '';
alter table public.record_items drop constraint omitted_is_empty;
update public.record_items set status = 'needs_check', value_native = '' where resolution = 'omitted';
alter table public.record_items add constraint omitted_is_empty check (
  resolution is distinct from 'omitted'
  or (status = 'needs_check' and value_ko = '' and value_native = '')
);
-- 출처·근거·번역은 서버가 쓴다. 사람의 내용 수정 출처는 DB가 정한다.
revoke update (value_ko, value_native, status, evidence, reason, reason_native, source, confirmed, resolution, detail)
  on public.record_items from authenticated;
grant update (value_ko, status, confirmed, resolution, detail) on public.record_items to authenticated;

create or replace function private.records_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  unresolved int;
  unconfirmed int;
begin
  if old.status = 'approved' then
    raise exception 'record_locked';
  end if;
  if new.org_id <> old.org_id or new.resident_id <> old.resident_id
     or new.worker_id <> old.worker_id or new.form_type <> old.form_type
     or new.care_date <> old.care_date then
    raise exception 'invalid_transition';
  end if;

  if new.status is distinct from old.status then
    if old.status in ('draft', 'returned') and new.status = 'submitted' then
      if uid is null or uid <> old.worker_id then
        raise exception 'not_record_worker';
      end if;
      select count(*) into unconfirmed from public.record_items
        where record_id = old.id and not (confirmed or source = 'worker');
      if unconfirmed > 0 or (select count(*) from public.record_items where record_id = old.id) <> 9 then
        raise exception 'unconfirmed_items' using detail = unconfirmed::text;
      end if;
      new.submitted_at := now();

    elsif old.status = 'submitted' and new.status = 'returned' then
      if uid is null or not private.is_reviewer() then raise exception 'reviewer_only'; end if;
      if trim(new.return_reason) = '' then raise exception 'return_reason_required'; end if;

    elsif old.status = 'submitted' and new.status = 'approved' then
      if uid is null or not private.is_reviewer() then raise exception 'reviewer_only'; end if;
      select count(*) into unresolved from public.record_items
        where record_id = old.id and status = 'needs_check' and resolution is null;
      if unresolved > 0 then
        raise exception 'unresolved_needs_check' using detail = unresolved::text;
      end if;
      new.approved_at := now();
      new.approved_by := uid;

    else
      raise exception 'invalid_transition';
    end if;
  end if;

  -- 시각·승인자는 위 상태 변화에서만 바뀜
  if not (new.status = 'submitted' and old.status is distinct from 'submitted') then
    new.submitted_at := old.submitted_at;
  end if;
  if new.status <> 'approved' then
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end $$;

create or replace function private.record_items_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rec_status text;
  rec_worker uuid;
begin
  select status, worker_id into rec_status, rec_worker from public.records where id = old.record_id for update;
  if rec_status = 'approved' then
    raise exception 'record_locked';
  end if;

  if uid is not null and (old.org_id <> private.my_org_id()
     or (uid = rec_worker and rec_status not in ('draft', 'returned'))
     or (uid <> rec_worker and (not private.is_reviewer() or rec_status <> 'submitted'))) then
    raise exception 'invalid_transition';
  end if;

  if new.resolution is distinct from old.resolution
     and uid is not null and not private.is_reviewer() then
    raise exception 'reviewer_only';
  end if;

  -- 되돌린 기록에서 작성자가 고친 항목(음성 보태기로 AI가 바꾼 것 포함)은 담당자가 다시 확인
  -- 근거: 문서/결정/2026-10-21-되돌림재확인.md
  if rec_status = 'returned' and (uid is null or uid = rec_worker)
     and (new.value_ko, new.status, new.detail) is distinct from (old.value_ko, old.status, old.detail) then
    new.resolution := null;
  end if;

  if new.resolution = 'omitted' then
    new.status := 'needs_check';
    new.value_ko := '';
    new.value_native := '';
  elsif auth.uid() is not null and new.value_ko is distinct from old.value_ko then
    new.value_native := ''; -- 새 한국어와 다른 오래된 번역은 보여 주지 않음
  end if;

  -- 원칙 4: 사람이 쓴 값(source = worker / reviewer)은 AI가 덮어쓰지 않음
  if old.source <> 'ai' and new.source = 'ai' then
    raise exception 'human_value_protected';
  end if;

  -- 작성자가 아닌 사람이 고치면 확인이 풀리고, [맞아요]는 작성자만 누름
  if uid is not null and uid <> rec_worker then
    if new.value_ko is distinct from old.value_ko then
      new.confirmed := false;
    else
      new.confirmed := old.confirmed;
    end if;
  end if;
  return new;
end $$;

create or replace function private.record_items_guard_source() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.value_ko, new.status, new.detail)
     is distinct from (old.value_ko, old.status, old.detail) then
    new.source := case when auth.uid() = (
      select worker_id from public.records where id = old.record_id
    ) then 'worker' else 'reviewer' end;
  else
    new.source := old.source;
  end if;
  return new;
end $$;

create or replace function private.record_items_log_edit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  b jsonb;
  a jsonb;
  t text;
begin
  select coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb),
         coalesce(jsonb_object_agg(o.key, n.value), '{}'::jsonb)
    into b, a
  from jsonb_each(jsonb_build_object(
         'value_ko', old.value_ko, 'status', old.status, 'evidence', old.evidence,
         'reason', old.reason, 'reason_native', old.reason_native, 'value_native', old.value_native, 'source', old.source, 'confirmed', old.confirmed,
         'resolution', old.resolution, 'detail', old.detail)) o
  join jsonb_each(jsonb_build_object(
         'value_ko', new.value_ko, 'status', new.status, 'evidence', new.evidence,
         'reason', new.reason, 'reason_native', new.reason_native, 'value_native', new.value_native, 'source', new.source, 'confirmed', new.confirmed,
         'resolution', new.resolution, 'detail', new.detail)) n using (key)
  where o.value is distinct from n.value;

  if b = '{}'::jsonb then
    return new; -- 바뀐 것 없음
  end if;

  t := case
    when new.resolution is distinct from old.resolution and private.is_reviewer() then 'resolved'
    when new.source = 'ai' then 'ai_filled'
    else 'edited'
  end;

  insert into public.record_events (org_id, record_id, actor_id, type, item_key, before, after)
  values (new.org_id, new.record_id, auth.uid(), t, new.item_key, b, a);
  return new;
end $$;

-- 작성자는 자기 설정만. 담당자 명단은 업무 필드 전용 RPC로 조회한다.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create function private.org_staff_for_reviewer()
returns table (id uuid, name text, role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_reviewer() then raise exception 'reviewer_only'; end if;
  return query select p.id, p.name, p.role from public.profiles p
    where p.org_id = private.my_org_id() order by p.name, p.id;
end $$;
revoke all on function private.org_staff_for_reviewer() from public, anon, authenticated;
grant execute on function private.org_staff_for_reviewer() to authenticated;

create function public.list_org_staff()
returns table (id uuid, name text, role text)
language sql stable security invoker set search_path = ''
as $$ select * from private.org_staff_for_reviewer() $$;
revoke all on function public.list_org_staff() from public, anon;
grant execute on function public.list_org_staff() to authenticated;

-- 이름 목록은 브라우저에 반환하지 않는다. 서버가 검사 기록의 기관만 조회한다.
create function public.record_blocked_names(p_record_id uuid, p_worker_id uuid)
returns table (name text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.records r join public.profiles p on p.id = r.worker_id
    where r.id = p_record_id and r.worker_id = p_worker_id and p.role = 'worker'
      and p.org_id = r.org_id and r.status in ('draft', 'returned')
  ) then raise exception 'not_record_worker'; end if;
  return query select p.name from public.profiles p join public.records r on r.org_id = p.org_id
    where r.id = p_record_id;
end $$;
revoke all on function public.record_blocked_names(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_blocked_names(uuid, uuid) to service_role;

-- 검증된 AI 초안만 저장한다. 기존 사람 수정 항목은 갱신하지 않는다.
create function public.save_record_ai_draft(
  p_record_id uuid, p_worker_id uuid, p_expected_transcript text, p_draft jsonb
) returns setof public.record_items
language plpgsql security invoker set search_path = ''
as $$
declare
  rec public.records;
  item jsonb;
begin
  select * into rec from public.records where id = p_record_id for update;
  if not found or rec.worker_id <> p_worker_id or not exists (
    select 1 from public.profiles p where p.id = p_worker_id and p.org_id = rec.org_id and p.role = 'worker'
  ) then raise exception 'not_record_worker'; end if;
  if rec.status not in ('draft', 'returned') then raise exception 'record_locked'; end if;
  if rec.transcript is distinct from p_expected_transcript then raise exception 'stale_draft'; end if;
  if jsonb_typeof(p_draft->'items') is distinct from 'array' then raise exception 'invalid_draft'; end if;
  if jsonb_array_length(p_draft->'items') <> 9 or (
    select count(distinct e->>'item_key') from jsonb_array_elements(p_draft->'items') e
    where e->>'item_key' in ('visit_time','support','meal','sleep','discomfort','medication','cognition','notes','next_check')
  ) <> 9 then raise exception 'invalid_draft'; end if;
  update public.records set transcript_ko = coalesce(p_draft->>'transcript_ko', ''),
    form_fields = coalesce(p_draft->'form_fields', '{}'::jsonb) where id = p_record_id;
  for item in select * from jsonb_array_elements(p_draft->'items') loop
    update public.record_items set
      value_ko = coalesce(item->>'value_ko', ''), value_native = coalesce(item->>'value_native', ''),
      status = item->>'status', evidence = coalesce(item->>'evidence', ''),
      reason = coalesce(item->>'reason', ''), reason_native = coalesce(item->>'reason_native', ''),
      detail = coalesce(item->'detail', '{}'::jsonb), source = 'ai', confirmed = false, resolution = null
    where record_id = p_record_id and item_key = item->>'item_key' and source = 'ai';
  end loop;
  return query select * from public.record_items where record_id = p_record_id;
end $$;
revoke all on function public.save_record_ai_draft(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_record_ai_draft(uuid, uuid, text, jsonb) to service_role;

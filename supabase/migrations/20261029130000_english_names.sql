-- 영어 이름 맞추기: [맞아요] 칸과 Agent 도구 이름을 용어집과 같은 뜻으로 바꾼다.
-- 근거: 문서/결정/2026-10-29-영어이름.md, 문서/설계/용어집-v1.0.md
--
-- 1. record_items.confirmed → confirmed_by_worker (관리자 [확인함] confirmed_by_reviewer 와 짝)
-- 2. Agent 도구 search_terms → search_glossary (DB 함수·표 이름과 같게), submit_draft → return_draft ('초안 반환')
-- plpgsql 함수 몸통은 칸 이름을 글자로 들고 있어 이름을 바꾼 뒤 다시 만든다. 칸 권한·RLS·뷰는 이름을 따라간다.

-- 1. 칸 이름
alter table public.record_items rename column confirmed to confirmed_by_worker;

-- 2. Agent 도구 이름 (쌓인 단계 기록도 새 이름으로)
alter table public.agent_steps drop constraint agent_steps_tool_check;
update public.agent_steps set tool = 'search_glossary' where tool = 'search_terms';
update public.agent_steps set tool = 'return_draft' where tool = 'submit_draft';
alter table public.agent_steps add constraint agent_steps_tool_check
  check (tool in ('get_form_spec', 'search_glossary', 'validate_draft', 'return_draft'));

comment on function public.search_glossary(text, int) is 'Agent 도구 search_glossary와 표현 도우미가 부르는 용어 검색';

-- 3. 칸 이름을 쓰는 함수 다시 만들기 (몸통은 바로 앞 판과 같고 칸 이름·주석만 다름)
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

  if (new.resolution is distinct from old.resolution or new.resolution_note is distinct from old.resolution_note)
     and uid is not null and not private.is_reviewer() then
    raise exception 'reviewer_only';
  end if;

  -- 수정 필요 기록에서 작성자가 고친 항목(음성 보태기로 AI가 바꾼 것 포함)은 관리자가 다시 확인
  -- 근거: 문서/결정/2026-10-21-되돌림재확인.md
  if rec_status = 'returned' and (uid is null or uid = rec_worker)
     and (new.value_ko, new.status, new.detail) is distinct from (old.value_ko, old.status, old.detail) then
    new.resolution := null;
  end if;

  if new.resolution = 'omitted' then
    new.resolution_note := trim(new.resolution_note);
    if new.resolution_note = '' then
      raise exception 'note_required';
    end if;
    new.status := 'needs_check';
    new.value_ko := '';
    new.value_native := '';
  else
    new.resolution_note := ''; -- [확인함]·다시 정하기·되돌림 재확인이면 사유도 비움
    if auth.uid() is not null and new.value_ko is distinct from old.value_ko then
      new.value_native := ''; -- 새 한국어와 다른 오래된 번역은 보여 주지 않음
    end if;
  end if;

  -- 원칙 4: 사람이 쓴 값(source = worker / reviewer)은 AI가 덮어쓰지 않음
  if old.source <> 'ai' and new.source = 'ai' then
    raise exception 'human_value_protected';
  end if;

  -- 작성자가 아닌 사람이 고치면 확인이 풀리고, [맞아요]는 작성자만 누름
  if uid is not null and uid <> rec_worker then
    if new.value_ko is distinct from old.value_ko then
      new.confirmed_by_worker := false;
    else
      new.confirmed_by_worker := old.confirmed_by_worker;
    end if;
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
         'reason', old.reason, 'reason_native', old.reason_native, 'value_native', old.value_native, 'source', old.source, 'confirmed_by_worker', old.confirmed_by_worker,
         'resolution', old.resolution, 'resolution_note', old.resolution_note, 'detail', old.detail)) o
  join jsonb_each(jsonb_build_object(
         'value_ko', new.value_ko, 'status', new.status, 'evidence', new.evidence,
         'reason', new.reason, 'reason_native', new.reason_native, 'value_native', new.value_native, 'source', new.source, 'confirmed_by_worker', new.confirmed_by_worker,
         'resolution', new.resolution, 'resolution_note', new.resolution_note, 'detail', new.detail)) n using (key)
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
        where record_id = old.id and not (confirmed_by_worker or source = 'worker');
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

create or replace function public.save_ai_item(
  p_record_id uuid, p_item_key text, p_actor_id uuid, p_expected_value_ko text, p_mode text, p_item jsonb
) returns setof public.record_items
language plpgsql set search_path = ''
as $$
declare
  rec public.records;
  actor public.profiles;
  cur public.record_items;
begin
  select * into rec from public.records where id = p_record_id for update;
  if not found then raise exception 'not_found'; end if;
  if rec.status = 'approved' then raise exception 'record_locked'; end if;
  select * into actor from public.profiles where id = p_actor_id and org_id = rec.org_id;
  if not found then raise exception 'not_record_worker'; end if;

  select * into cur from public.record_items
    where record_id = p_record_id and item_key = p_item_key for update;
  if not found then raise exception 'invalid_item'; end if;
  if cur.value_ko is distinct from p_expected_value_ko then raise exception 'stale_item'; end if;

  if p_mode = 'translation' then
    -- PATCH와 같은 사람만: draft·returned면 작성자, submitted면 같은 기관 관리자
    if not ((p_actor_id = rec.worker_id and rec.status in ('draft', 'returned'))
            or (actor.role = 'reviewer' and rec.status = 'submitted')) then
      raise exception 'invalid_transition';
    end if;
    if cur.value_ko = '' then raise exception 'invalid_item'; end if;
    update public.record_items set value_native = coalesce(p_item->>'value_native', '')
      where id = cur.id;

  elsif p_mode = 'item' then
    -- 음성 보태기는 작성자의 수정이다(결정 2026-10-21-되돌림재확인). 출처는 worker, [맞아요]는 다시.
    if p_actor_id <> rec.worker_id or actor.role <> 'worker' or rec.status not in ('draft', 'returned') then
      raise exception 'not_record_worker';
    end if;
    update public.record_items set
      value_ko = coalesce(p_item->>'value_ko', ''), value_native = coalesce(p_item->>'value_native', ''),
      status = p_item->>'status', evidence = coalesce(p_item->>'evidence', ''),
      reason = coalesce(p_item->>'reason', ''), reason_native = coalesce(p_item->>'reason_native', ''),
      detail = coalesce(p_item->'detail', '{}'::jsonb), source = 'worker', confirmed_by_worker = false
      where id = cur.id;

  else
    raise exception 'invalid_mode';
  end if;

  return query select * from public.record_items where id = cur.id;
end $$;

create or replace function public.save_record_ai_draft(
  p_record_id uuid, p_worker_id uuid, p_expected_transcript text, p_draft jsonb
) returns setof public.record_items
language plpgsql set search_path = ''
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
      detail = coalesce(item->'detail', '{}'::jsonb), source = 'ai', confirmed_by_worker = false, resolution = null
    where record_id = p_record_id and item_key = item->>'item_key' and source = 'ai';
  end loop;
  return query select * from public.record_items where record_id = p_record_id;
end $$;

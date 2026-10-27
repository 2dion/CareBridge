-- 권한 정리: 화면(공개 키)으로 이력·AI 작업 기록·처리 상태를 꾸밀 수 없게 하고, 수정 이력은 DB가 남김
-- 근거: 문서/결정/2026-10-27-권한정리.md (QA 10/27 실제 DB 대조 5~10번), 문서/설계/데이터구조-v1.6.md '권한 규칙'
--
-- 새로 나오는 거절 (오류 키는 기존 것을 씀)
--   reviewer_only      작성자가 되돌린 사유를 고치거나, 항목 source 를 'reviewer'로 바꿈
--   not_record_worker  작성자가 아닌 사람이 원문(transcript·transcript_ko)을 고침
-- 화면 권한이 없는 쓰기(agent_steps·record_events 넣기, audio_jobs 고치기)는 permission denied.

-- ─────────────────────────────────────────────────────────
-- 1. 서버·DB만 쓰는 표 (5·7·8b)
-- ─────────────────────────────────────────────────────────

-- agent_steps: 서버가 Agent를 돌릴 때 service_role로 씀
drop policy agent_steps_worker_insert on public.agent_steps;
revoke insert on public.agent_steps from authenticated;

-- record_events: 상태 변화·항목·원문 수정 이력 모두 DB 트리거가 씀 (아래 4절)
drop policy record_events_insert on public.record_events;
revoke insert on public.record_events from authenticated;

-- audio_jobs: 만들기는 작성자 권한 그대로, 처리 상태·경로 바꾸기는 서버(service_role)만
drop policy audio_jobs_worker_update on public.audio_jobs;
revoke update on public.audio_jobs from authenticated;

-- ─────────────────────────────────────────────────────────
-- 2. records: 되돌린 사유는 담당자만, 원문은 기록의 작성자만 (6·9)
-- ─────────────────────────────────────────────────────────

create function private.records_guard_fields() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return new; -- 서버(service_role)
  end if;
  if (new.return_reason, new.return_reason_native)
     is distinct from (old.return_reason, old.return_reason_native)
     and not private.is_reviewer() then
    raise exception 'reviewer_only';
  end if;
  -- 원문은 받아쓰기 결과. 받아쓰기·[글로 쓰기]는 작성자 권한으로 돎
  if (new.transcript, new.transcript_ko) is distinct from (old.transcript, old.transcript_ko)
     and uid <> old.worker_id then
    raise exception 'not_record_worker';
  end if;
  return new;
end $$;

create trigger records_guard_fields before update on public.records
  for each row execute function private.records_guard_fields();

-- ─────────────────────────────────────────────────────────
-- 3. record_items.source: 작성자는 'reviewer'로 못 바꿈, 담당자가 고치면 자동 'reviewer' (8a)
-- ─────────────────────────────────────────────────────────

create function private.record_items_guard_source() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rec_worker uuid;
begin
  if uid is null then
    return new;
  end if;
  select worker_id into rec_worker from public.records where id = old.record_id;
  if uid = rec_worker then
    if new.source = 'reviewer' and old.source is distinct from 'reviewer' then
      raise exception 'reviewer_only';
    end if;
  elsif (new.value_ko, new.status, new.evidence, new.reason, new.detail)
        is distinct from (old.value_ko, old.status, old.evidence, old.reason, old.detail) then
    new.source := 'reviewer';
  else
    new.source := old.source;
  end if;
  return new;
end $$;

create trigger record_items_guard_source before update on public.record_items
  for each row execute function private.record_items_guard_source();

-- ─────────────────────────────────────────────────────────
-- 4. 수정 이력 자동 기록 (10). 바뀐 칸만 before/after 에 남김
-- ─────────────────────────────────────────────────────────

-- 항목: 담당자가 resolution 을 바꾸면 resolved, source = ai 면 ai_filled, 그 밖은 edited
create function private.record_items_log_edit() returns trigger
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
         'reason', old.reason, 'source', old.source, 'confirmed', old.confirmed,
         'resolution', old.resolution, 'detail', old.detail)) o
  join jsonb_each(jsonb_build_object(
         'value_ko', new.value_ko, 'status', new.status, 'evidence', new.evidence,
         'reason', new.reason, 'source', new.source, 'confirmed', new.confirmed,
         'resolution', new.resolution, 'detail', new.detail)) n using (key)
  where o.value is distinct from n.value;

  if b = '{}'::jsonb then
    return new; -- 번역(value_native)만 바뀌었거나 바뀐 것 없음
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

create trigger record_items_log_edit after update on public.record_items
  for each row execute function private.record_items_log_edit();

-- 기록: 원문·서식 칸·방문 시간이 바뀌면 edited (item_key 빈값). 상태 변화 이력은 records_after_update 가 씀
create function private.records_log_edit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  b jsonb;
  a jsonb;
begin
  select coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb),
         coalesce(jsonb_object_agg(o.key, n.value), '{}'::jsonb)
    into b, a
  from jsonb_each(jsonb_build_object(
         'transcript', old.transcript, 'transcript_ko', old.transcript_ko,
         'form_fields', old.form_fields, 'visit_start', old.visit_start,
         'visit_end', old.visit_end)) o
  join jsonb_each(jsonb_build_object(
         'transcript', new.transcript, 'transcript_ko', new.transcript_ko,
         'form_fields', new.form_fields, 'visit_start', new.visit_start,
         'visit_end', new.visit_end)) n using (key)
  where o.value is distinct from n.value;

  if b = '{}'::jsonb then
    return new;
  end if;

  insert into public.record_events (org_id, record_id, actor_id, type, before, after)
  values (new.org_id, new.id, auth.uid(), 'edited', b, a);
  return new;
end $$;

create trigger records_log_edit after update on public.records
  for each row execute function private.records_log_edit();

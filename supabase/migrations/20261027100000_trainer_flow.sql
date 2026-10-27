-- 강사흐름통일: 교육용 기관의 강사도 담당자와 같은 흐름 (수정·[확인함]/[기록 안 함]·되돌리기·승인)
-- 근거: 문서/결정/2026-10-25-강사흐름통일.md '영향 → DB(백엔드 담당)',
--       문서/설계/데이터구조-v1.6.md ('records.status', '기록 상태 변화', '권한 규칙', '상태 값 목록')
--
-- 바뀌는 것
--   records.status, record_events.type 에서 commented 뺌 (draft / submitted / returned / approved)
--   comments 표와 정책·트리거 뺌
--   강사를 막던 검사 정리: general_org_only, training_org_only, training_reviewer_read_only 없앰
--   record_items_reviewer_update 정책의 교육용 조건(not my_org_is_training) 뺌
--   record_locked 는 approved 만

-- ─────────────────────────────────────────────────────────
-- 1. 상태 값에서 commented 빼기, comments 표 빼기
-- ─────────────────────────────────────────────────────────

alter table public.records drop constraint records_status_check;
alter table public.records add constraint records_status_check
  check (status in ('draft', 'submitted', 'returned', 'approved'));

alter table public.record_events drop constraint record_events_type_check;
alter table public.record_events add constraint record_events_type_check
  check (type in ('created', 'ai_filled', 'edited', 'submitted', 'returned', 'approved', 'resolved'));

drop table public.comments;

-- ─────────────────────────────────────────────────────────
-- 2. 상태 변화 검사: 교육용 기관도 담당자와 같음
--    (20261025230000_missed_records.sql 판에서 commented·교육용 갈래만 뺌, care_date 고정은 그대로)
-- ─────────────────────────────────────────────────────────

create or replace function private.records_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  unresolved int;
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
      if uid is not null and uid <> old.worker_id then
        raise exception 'not_record_worker';
      end if;
      new.submitted_at := now();

    elsif old.status = 'submitted' and new.status = 'returned' then
      if uid is not null and not private.is_reviewer() then raise exception 'reviewer_only'; end if;
      if trim(new.return_reason) = '' then raise exception 'return_reason_required'; end if;

    elsif old.status = 'submitted' and new.status = 'approved' then
      if uid is not null and not private.is_reviewer() then raise exception 'reviewer_only'; end if;
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

create or replace function private.records_before_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'record_locked';
  end if;
  return old;
end $$;

-- 항목 고치기 (init 판에서 commented만 뺌)
create or replace function private.record_items_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rec_status text;
  rec_worker uuid;
begin
  select status, worker_id into rec_status, rec_worker from public.records where id = old.record_id;
  if rec_status = 'approved' then
    raise exception 'record_locked';
  end if;

  if new.resolution is distinct from old.resolution
     and uid is not null and not private.is_reviewer() then
    raise exception 'reviewer_only';
  end if;

  -- 원칙 4: 사람이 쓴 값(source = worker / reviewer)은 AI가 덮어쓰지 않음
  if old.source <> 'ai' and new.source = 'ai'
     and (new.value_ko, new.value_native, new.status, new.evidence, new.reason, new.detail)
         is distinct from
         (old.value_ko, old.value_native, old.status, old.evidence, old.reason, old.detail) then
    raise exception 'human_value_protected';
  end if;

  -- 되돌린 기록에서 작성자가 고친 항목(음성 보태기로 AI가 바꾼 것 포함)은 담당자가 다시 확인
  -- 근거: 문서/결정/2026-10-21-되돌림재확인.md
  if rec_status = 'returned' and (uid is null or uid = rec_worker)
     and (new.value_ko, new.status, new.detail) is distinct from (old.value_ko, old.status, old.detail) then
    new.resolution := null;
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

-- ─────────────────────────────────────────────────────────
-- 3. RLS: 강사도 submitted 기록의 항목을 고침
-- ─────────────────────────────────────────────────────────

drop policy record_items_reviewer_update on public.record_items;
create policy record_items_reviewer_update on public.record_items for update to authenticated
  using (
    org_id = private.my_org_id()
    and private.is_reviewer()
    and exists (
      select 1 from public.records r
      where r.id = record_items.record_id and r.status = 'submitted'
    )
  )
  with check (org_id = private.my_org_id());

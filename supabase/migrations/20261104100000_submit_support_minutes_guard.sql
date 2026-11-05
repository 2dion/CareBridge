-- 재가(제12호) 지원 시간 합 검사(검사 5)를 전송(submit) 때 DB에서도 한다 (이슈 #278).
-- 근거: 문서/결정/2026-11-04-재가시간합db검사.md, AGENTS.md '바꾸지 않는 원칙' 5번(시간 합 계산은 코드가 맡음),
--       문서/설계/ai규칙-v2.0.4.md '서버 검사와 예외 처리' 검사 5
--
-- 지금까지 검사 5는 서버 API(validate-draft.ts checkSupportMinutes, support-check.ts)에서만 돌았다.
-- 작성자가 화면을 거치지 않고 PostgREST로 records.status를 submitted로 직접 바꾸면 검사를 건너뛸 수 있었다(11/03 보안 점검).
-- 규칙은 서버와 같다: 지원별 분(detail.minutes 6칸, 0 이상 정수만 합산) 합 ≤ 방문 시간.
-- 방문 시간은 records.visit_start~visit_end → form_fields.total_minutes → visit_time detail.start·end 순으로 찾는다.
--   - 합 > 방문 시간                      → support_minutes_exceed_visit
--   - 방문 시간을 모르는데 합 > 0          → visit_minutes_missing
--   - 제공 지원 항목이 이미 '확인 필요'(needs_check)면 통과: 서버가 전송 직전 재검사로 이유를 붙인 정상 흐름(이슈 #116)이고,
--     관리자가 M2에서 [확인함]/[기록 안 함]을 고르기 전에는 승인되지 않는다(원칙 3).
-- 시설(제16호) 기록과 합이 0인 기록은 보지 않는다.

create or replace function private.support_minutes_problem(p_record_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  rec record;
  support record;
  visit_detail jsonb;
  entry record;
  total integer := 0;
  visit numeric := null;
  start_text text;
  end_text text;
  start_minutes integer;
  end_minutes integer;
begin
  select form_type, visit_start, visit_end, form_fields into rec
    from public.records where id = p_record_id;
  if not found or rec.form_type <> 12 then return null; end if;

  select status, detail into support
    from public.record_items where record_id = p_record_id and item_key = 'support';
  if not found or support.status = 'needs_check' then return null; end if;

  -- 지원별 분 합: 정해진 6칸의 0 이상 정수만 더한다(validate-draft.ts sumSupportMinutes와 같음)
  if jsonb_typeof(support.detail -> 'minutes') = 'object' then
    for entry in select key, value from jsonb_each(support.detail -> 'minutes') loop
      if entry.key in ('physical', 'cognitive_stimulation', 'daily_living_together',
                       'cognitive_management', 'emotional', 'housework')
         and jsonb_typeof(entry.value) = 'number'
         and (entry.value #>> '{}') ~ '^[0-9]+$' then
        total := total + (entry.value #>> '{}')::integer;
      end if;
    end loop;
  end if;
  if total = 0 then return null; end if;

  -- 방문 시간(분): records.visit_start~visit_end(종료가 앞서면 모름) → form_fields.total_minutes → visit_time detail
  if rec.visit_start is not null and rec.visit_end is not null and rec.visit_end >= rec.visit_start then
    visit := floor(extract(epoch from (rec.visit_end - rec.visit_start)) / 60);
  end if;
  if visit is null and jsonb_typeof(rec.form_fields -> 'total_minutes') = 'number' then
    visit := (rec.form_fields ->> 'total_minutes')::numeric;
  end if;
  if visit is null then
    select detail into visit_detail
      from public.record_items where record_id = p_record_id and item_key = 'visit_time';
    start_text := trim(coalesce(visit_detail ->> 'start', ''));
    end_text := trim(coalesce(visit_detail ->> 'end', ''));
    if start_text ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$' and end_text ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$' then
      start_minutes := split_part(start_text, ':', 1)::integer * 60 + split_part(start_text, ':', 2)::integer;
      end_minutes := split_part(end_text, ':', 1)::integer * 60 + split_part(end_text, ':', 2)::integer;
      if split_part(start_text, ':', 1)::integer <= 23 and split_part(start_text, ':', 2)::integer <= 59
         and split_part(end_text, ':', 1)::integer <= 23 and split_part(end_text, ':', 2)::integer <= 59
         and end_minutes >= start_minutes then
        visit := end_minutes - start_minutes;
      end if;
    end if;
  end if;

  if visit is null then return 'visit_minutes_missing'; end if;
  if total > visit then return 'support_minutes_exceed_visit'; end if;
  return null;
end $$;

revoke execute on function private.support_minutes_problem(uuid) from public, anon, authenticated;

-- 몸통은 20261103090000_submit_needs_worker_confirm.sql의 함수와 같고 전송 분기에 지원 시간 합 검사만 더했다.
create or replace function private.records_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  unresolved int;
  unconfirmed int;
  minutes_problem text;
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
        where record_id = old.id and not confirmed_by_worker;
      if unconfirmed > 0 or (select count(*) from public.record_items where record_id = old.id) <> 9 then
        raise exception 'unconfirmed_items' using detail = unconfirmed::text;
      end if;
      -- 재가 지원 시간 합(검사 5): 서버가 '확인 필요'로 표시하지 않은 채 합이 어긋나면 거절 (이슈 #278)
      minutes_problem := private.support_minutes_problem(old.id);
      if minutes_problem is not null then
        raise exception using message = minutes_problem, detail = 'support';
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

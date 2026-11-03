-- 전송 조건에서 source = 'worker'를 뺀다: AI가 다시 쓴 항목(save_ai_item item)도 작성자가 [확인 완료]를 눌러야 전송한다.
-- 근거: 문서/결정/2026-10-31-ai다시쓴항목확인.md, 이슈 #236 (11/03 유효), AGENTS.md 원칙 1
-- 작성자가 직접 고치면 W3가 confirmed_by_worker = true를 함께 보내므로 직접 고친 항목은 다시 묻지 않는다.
-- 몸통은 20261029130000_english_names.sql의 함수와 같고 전송 검사 조건만 다르다.

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
        where record_id = old.id and not confirmed_by_worker;
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

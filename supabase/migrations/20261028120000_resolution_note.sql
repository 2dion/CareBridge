-- [기록 안 함] 사유를 항목에 저장한다. 이력 트리거가 사유 변경을 resolved 줄에 함께 남긴다.
-- 근거: 문서/결정/2026-10-28-기록안함사유.md, 문서/설계/데이터구조-v1.6.2.md 'record_items'
--
-- 사용자는 record_events에 직접 쓰지 못하므로(10/27 권한정리) 사유를 둘 칸이 따로 필요했다.

alter table public.record_items add column resolution_note text not null default '';
-- 사유는 [기록 안 함]일 때만 있다.
alter table public.record_items add constraint resolution_note_only_omitted check (
  resolution_note = '' or resolution = 'omitted'
);
grant update (resolution_note) on public.record_items to authenticated;

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

  -- 되돌린 기록에서 작성자가 고친 항목(음성 보태기로 AI가 바꾼 것 포함)은 담당자가 다시 확인
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
      new.confirmed := false;
    else
      new.confirmed := old.confirmed;
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
         'reason', old.reason, 'reason_native', old.reason_native, 'value_native', old.value_native, 'source', old.source, 'confirmed', old.confirmed,
         'resolution', old.resolution, 'resolution_note', old.resolution_note, 'detail', old.detail)) o
  join jsonb_each(jsonb_build_object(
         'value_ko', new.value_ko, 'status', new.status, 'evidence', new.evidence,
         'reason', new.reason, 'reason_native', new.reason_native, 'value_native', new.value_native, 'source', new.source, 'confirmed', new.confirmed,
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

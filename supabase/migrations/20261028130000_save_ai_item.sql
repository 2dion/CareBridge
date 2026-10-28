-- 항목 하나의 재번역과 AI 항목 보태기를 저장하는 서버 전용 함수.
-- 근거: 문서/결정/2026-10-28-항목하나저장.md, 문서/결정/2026-10-28-기록계약보강.md 4번
--
-- 사용자는 value_native·reason_native·evidence·reason·source를 직접 쓰지 못한다(10/28 계약 보강).
-- save_record_ai_draft는 9개 전체만 저장하므로, 항목 하나를 바꾸는 두 경우를 이 함수가 맡는다.
--   p_mode = 'translation': 사람이 value_ko를 고친 뒤 서버가 다시 번역한 value_native만 저장
--   p_mode = 'item': 작성자가 W3에서 음성으로 항목을 보탠 뒤 Agent가 다시 쓴 항목 1개 저장
-- 두 경우 모두 p_expected_value_ko가 지금 값과 다르면(그사이 또 고침) stale_item으로 거절한다.

create function public.save_ai_item(
  p_record_id uuid, p_item_key text, p_actor_id uuid,
  p_expected_value_ko text, p_mode text, p_item jsonb
) returns setof public.record_items
language plpgsql security invoker set search_path = ''
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
    -- PATCH와 같은 사람만: draft·returned면 작성자, submitted면 같은 기관 담당자
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
      detail = coalesce(p_item->'detail', '{}'::jsonb), source = 'worker', confirmed = false
      where id = cur.id;

  else
    raise exception 'invalid_mode';
  end if;

  return query select * from public.record_items where id = cur.id;
end $$;
revoke all on function public.save_ai_item(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_ai_item(uuid, text, uuid, text, text, jsonb) to service_role;

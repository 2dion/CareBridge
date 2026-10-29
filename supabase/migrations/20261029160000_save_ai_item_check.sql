-- save_ai_item에 p_mode = 'check'를 더한다: 재가 제공 지원 재검사(검사 5) 결과 저장.
-- 근거: 문서/결정/2026-10-29-초안검사보강.md (이슈 #116), 문서/결정/2026-10-28-항목하나저장.md
--
-- 작성자가 W3에서 지원별 분이나 방문 시점을 고치면, 또 전송(submit) 직전에 서버가 검사 5(합 ≤ 방문 시간)를
-- 다시 한다. reason·reason_native는 로그인 사용자가 쓰지 못하는 칸(10/28 계약 보강)이라 이 모드가 맡는다.
--   p_mode = 'check': status·reason·reason_native만 바꾼다. value_ko·evidence·detail·source·confirmed_by_worker는 그대로.
--   작성자 본인이 draft·returned일 때만 된다(음성 보태기 'item'과 같은 조건). p_expected_value_ko가 다르면 stale_item.
-- 몸통은 20261029130000_english_names.sql의 함수와 같고 'check' 분기만 더했다.

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

  elsif p_mode = 'check' then
    -- 서버 검사(검사 5) 결과: 상태와 이유만. 사람이 쓴 내용·출처·[맞아요]는 건드리지 않는다.
    if p_actor_id <> rec.worker_id or actor.role <> 'worker' or rec.status not in ('draft', 'returned') then
      raise exception 'not_record_worker';
    end if;
    if p_item->>'status' not in ('observed', 'not_mentioned', 'needs_check') then
      raise exception 'invalid_item';
    end if;
    update public.record_items set
      status = p_item->>'status',
      reason = coalesce(p_item->>'reason', ''), reason_native = coalesce(p_item->>'reason_native', '')
      where id = cur.id;

  else
    raise exception 'invalid_mode';
  end if;

  return query select * from public.record_items where id = cur.id;
end $$;

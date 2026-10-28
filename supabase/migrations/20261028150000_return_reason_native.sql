-- 되돌린 사유의 작성자 모국어 번역을 서버가 저장하는 전용 함수.
-- 근거: 문서/결정/2026-10-28-되돌림사유번역.md, 2026-10-28-되돌림사유한국어.md 4번, 2026-10-27-권한정리.md 3번
--
-- return_reason_native 는 담당자만 쓸 수 있어(records_guard_fields) 작성자 권한으로는 번역을 저장할 수 없다.
-- 그래서 작성자가 되돌아온 기록을 열 때 서버가 번역하고, 이 함수(service_role 전용)로 번역 칸만 채운다.
-- 사유(return_reason)가 그사이 바뀌었으면 stale_reason 으로 거절해 옛 번역이 새 사유에 붙지 않게 한다.

create function public.save_return_reason_native(
  p_record_id uuid, p_worker_id uuid, p_expected_reason text, p_native text
) returns table (status text, return_reason text, return_reason_native text)
language plpgsql security invoker set search_path = ''
as $$
declare
  rec public.records;
begin
  select * into rec from public.records where id = p_record_id for update;
  if not found then raise exception 'not_found'; end if;
  if rec.worker_id <> p_worker_id then raise exception 'not_record_worker'; end if;
  if rec.status <> 'returned' then raise exception 'invalid_transition'; end if;
  if rec.return_reason is distinct from p_expected_reason then raise exception 'stale_reason'; end if;

  update public.records set return_reason_native = coalesce(p_native, '') where id = rec.id;

  return query select r.status, r.return_reason, r.return_reason_native
    from public.records r where r.id = rec.id;
end $$;
revoke all on function public.save_return_reason_native(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_return_reason_native(uuid, uuid, text, text) to service_role;

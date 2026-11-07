-- 담당 연결(assignments)의 짝(작성자·어르신·기관)은 만든 뒤 바꾸지 못하게 한다(이슈 #394 2번, 결정 2026-11-07-담당수정칸고정).
-- RLS 정책 assignments_reviewer_update는 같은 기관 관리자의 update를 칸 구분 없이 허용해서, API로 worker_id·resident_id를 바꾸면
-- 담당 끊기 전 검사(assignments_before_delete)를 건너뛰고 담당 이력(assignment_history)이 옛 짝을 못 찾아 열린 채 남았다.
-- 앱은 지우고 다시 넣기만 쓰므로 화면 경로는 바뀌지 않는다. 바꿀 수 있는 칸은 start_date·visit_days·schedule만 남는다.
-- 칸 권한(grant update (칸))으로 막지 않는 이유: PostgREST upsert(on conflict do update)가 보낸 칸을 모두 set에 넣어 worker_id·resident_id도 update 권한이 필요하다.
-- 코디세이 DB(fffgpgrnppxxqccncstf)에만 적용한다. 공모전 DB(CareBridge)에는 적용하지 않는다.

create function private.assignments_keep_keys() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.worker_id <> old.worker_id or new.resident_id <> old.resident_id or new.org_id <> old.org_id then
    raise exception 'assignment_key_locked';
  end if;
  return new;
end $$;

comment on function private.assignments_keep_keys() is
  '담당 연결의 worker_id·resident_id·org_id는 만든 뒤 바꾸지 못함(#394). 바꾸려면 지우고 다시 넣는다(끊기 전 검사·이력이 그 길만 봄)';

create trigger assignments_keep_keys before update on public.assignments
  for each row execute function private.assignments_keep_keys();

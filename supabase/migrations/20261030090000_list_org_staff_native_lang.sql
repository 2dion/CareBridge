-- 관리자 명단 list_org_staff()에 모국어(native_lang)를 더한다.
-- 화면 설계 v1.3 M4(어르신·작성자)는 '작성자: 이름, 모국어'인데 명단에 모국어가 없어 M4가 비워 두고 있었다.
-- 결정: 문서/결정/2026-10-30-명단모국어.md. 글자 크기·onboarded 같은 개인 설정은 그대로 빼 둔다.
-- 반환 칸이 바뀌면 create or replace가 안 되므로 지우고 다시 만든다.

drop function if exists public.list_org_staff();
drop function if exists private.org_staff_for_reviewer();

create function private.org_staff_for_reviewer()
returns table (id uuid, name text, role text, native_lang text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_reviewer() then raise exception 'reviewer_only'; end if;
  return query select p.id, p.name, p.role, p.native_lang from public.profiles p
    where p.org_id = private.my_org_id() order by p.name, p.id;
end $$;
revoke all on function private.org_staff_for_reviewer() from public, anon, authenticated;
grant execute on function private.org_staff_for_reviewer() to authenticated;

create function public.list_org_staff()
returns table (id uuid, name text, role text, native_lang text)
language sql stable security invoker set search_path = ''
as $$ select * from private.org_staff_for_reviewer() $$;
revoke all on function public.list_org_staff() from public, anon;
grant execute on function public.list_org_staff() to authenticated;
